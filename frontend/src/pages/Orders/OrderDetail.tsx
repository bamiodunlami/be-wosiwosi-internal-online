import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  hasAtLeast,
  Roles,
  REDO_REASONS,
  type Notification,
  type OrderDetail,
  type OrderDetailProduct,
  type OrderNote,
  type RedoReason,
} from '@shared';
import { useCurrentUser } from '../../hooks/useAuth';
import { useConfirm } from '../../components/ui/confirm';
import { useToast } from '../../components/ui/toast';
import { Modal } from '../../components/ui/modal';
import { ProductThumb } from '../../components/ui/ProductThumb';
import { useRequestRefund } from '../../hooks/useRefunds';
import { useLogReplacement, useClearReplacement } from '../../hooks/useReplacements';
import { useCreateRedo } from '../../hooks/useRedos';
import { REASON_LABELS } from '../../lib/redo';
import { useOrderNotifications, useMarkOrderRead } from '../../hooks/useNotifications';
import { lineTotal } from '../../lib/money';
import { firstName } from '../../lib/staff';
import {
  useOrderDetail,
  useOrderLiveStatus,
  useSaveOrders,
  usePickInDetail,
  useDryPickedInDetail,
  useMeatPickedInDetail,
  useCompleteInDetail,
  useAssignInDetail,
  useUndoInDetail,
  useToggleLockInDetail,
  useResetWorkerInDetail,
  useClearNotesInDetail,
  useRemoveSavedOrder,
  useCancelRefundOrder,
  useAddNote,
  usePackers,
} from '../../hooks/useOrders';

/**
 * The one shared order-detail page. Reached from the Order page (Super Admin),
 * Processing (packer), or anywhere else — same page, same URL shape
 * (`/orders/:orderId`, keyed by the WooCommerce order id). It loads the order
 * live from the store; once the order is in processing it also shows warehouse
 * state. Layout: a status summary up top, the order details, then the actions
 * each role is allowed to take at the bottom.
 */
// A store order is only workable while it's in one of these statuses.
const WORKABLE_STATUSES = ['processing', 'completed'];

/** Small inline spinner used while the live order status is being verified. */
function Spinner({ className = 'h-4 w-4 border-slate-300 border-t-slate-600' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 ${className}`}
    />
  );
}

/**
 * "What's new on this order" — on open, snapshots the unread notifications, marks
 * them read (clearing the order's bell), and fades the banner after a few seconds.
 */
function OrderNotificationsBanner({ orderId }: { orderId: number }) {
  const { data } = useOrderNotifications(orderId);
  const { mutate: markOrderRead } = useMarkOrderRead();
  const [items, setItems] = useState<Notification[] | null>(null);
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (fired.current || !data) return;
    const unread = data.filter((n) => !n.read);
    fired.current = true;
    if (!unread.length) return;
    setItems(unread);
    markOrderRead(orderId);
    // Timer lives in a ref so the refetch triggered by markOrderRead (which changes
    // `data`) can't cancel it — it's cleared only on unmount.
    timer.current = setTimeout(() => setItems(null), 4000);
  }, [data, markOrderRead, orderId]);

  // Clear the dismiss timer only when the page unmounts.
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-3 text-base font-extrabold uppercase tracking-wide text-amber-800">
          <span className="animate-bounce text-3xl" aria-hidden>
            🔔
          </span>
          New on this order
        </p>
        <button
          type="button"
          onClick={() => setItems(null)}
          aria-label="Dismiss"
          className="text-xl text-slate-400 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((n) => (
          <li key={n.id} className="text-base font-semibold text-slate-900">
            {n.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const id = Number(orderId);
  const { data: user } = useCurrentUser();
  const { data: order, isLoading, isError, error } = useOrderDetail(id);
  // Verify the order is still workable on the store — runs in parallel, never
  // blocks the (DB-served) page render. Only meaningful for saved orders.
  const liveStatus = useOrderLiveStatus(id, order?.saved ?? false);
  const pick = usePickInDetail(id);
  const clearReplacement = useClearReplacement(id);
  const confirm = useConfirm();
  const toast = useToast();
  const [refundProduct, setRefundProduct] = useState<OrderDetailProduct | null>(null);
  const [replaceProduct, setReplaceProduct] = useState<OrderDetailProduct | null>(null);

  const isAdmin = !!user && hasAtLeast(user.role, Roles.ADMIN);
  // Customer contact details are for supervisors and admins only — not packers.
  const showContact = !!user && hasAtLeast(user.role, Roles.SUPERVISOR);

  if (isLoading) return <p className="text-sm text-slate-500">Loading order…</p>;
  if (isError) return <p className="text-sm text-rose-600">{error.message}</p>;
  if (!order) return null;

  // Live status gate. An order is workable only while its store status is
  // processing/completed. Until the check resolves we hold the fulfilment actions
  // (the brief wait), but a failed check must NOT freeze the floor.
  const live = liveStatus.data?.status ?? null;
  const statusWorkable = liveStatus.isSuccess && !!live && WORKABLE_STATUSES.includes(live);
  const statusBlocked = order.saved && liveStatus.isSuccess && !statusWorkable;
  const actionsAllowed = !order.saved
    ? true
    : liveStatus.isError
      ? true // couldn't verify — don't block work over a connectivity blip
      : liveStatus.isSuccess
        ? statusWorkable
        : false; // still checking
  // The live status check is in flight — show the fulfilment controls as loading.
  const statusChecking = order.saved && liveStatus.isLoading;

  // A packer may open ANY order, but can only *work* one assigned to them. On
  // someone else's order they're read-only (a banner says so) — notes still OK.
  const blockedPacker =
    !!user && user.role === Roles.PACKER && order.saved && order.assigned?.id !== user.id;
  // Legacy-hidden lines are kept from packers entirely (they're auto-picked); only
  // supervisors/admins see them, tagged "legacy (hidden)".
  const isPacker = user?.role === Roles.PACKER;

  // Packers (and admins) tick products as they pick them, while the order is in
  // processing and not yet completed. Supervisors view only. A locked order is
  // frozen for everyone below admin — no picking, no stage actions (notes still OK).
  const canPick =
    order.saved &&
    !order.status &&
    !!order.id &&
    user?.role !== Roles.SUPERVISOR &&
    !blockedPacker &&
    (!order.lock || isAdmin);
  const mongoId = order.id;
  const onTogglePick =
    canPick && actionsAllowed && mongoId
      ? (index: number, picked: boolean) => pick.mutate({ id: mongoId, index, picked })
      : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">#{order.orderNumber}</h1>

      {/* Transient "what's new on this order" banner — fades after a few seconds. */}
      {order.saved && <OrderNotificationsBanner orderId={id} />}

      {/* Completed (and possibly archived) — show it up top with the date/time. */}
      {order.saved && order.status && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-brand-green/40 bg-brand-green-light p-4">
          <span className="text-2xl" aria-hidden>
            ✅
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-green">
              {order.archived ? 'Completed & archived' : 'Completed'}
            </p>
            {order.completedAt && (
              <p className="text-sm text-slate-700">{new Date(order.completedAt).toLocaleString()}</p>
            )}
            {order.redoCount > 0 && (
              <p className="mt-1 text-sm font-medium text-slate-700">
                🔁 Redone {order.redoCount} time{order.redoCount === 1 ? '' : 's'}
              </p>
            )}
            {/* Refund/replace are locked on a completed order until it's undone. */}
            {!order.archived && (
              <p className="mt-1 text-sm text-slate-600">
                Refunds and replacements are locked while this order is completed — undo the
                completion below to refund or replace an item.
              </p>
            )}
          </div>
        </div>
      )}

      {/* A locked order is frozen for packers/supervisors — shout it at the top. */}
      {order.saved && order.lock && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
          <span className="text-2xl" aria-hidden>
            🔒
          </span>
          <div>
            <p className="text-sm font-semibold text-rose-800">Order locked</p>
            <p className="text-sm text-rose-700">
              Packers and supervisors can&apos;t change this order — only notes can be added.
            </p>
          </div>
        </div>
      )}

      {/* A packer viewing an order that isn't theirs — read-only, but can add notes. */}
      {blockedPacker && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
          <span className="text-2xl" aria-hidden>
            ⚠️
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Not assigned to you</p>
            <p className="text-sm text-amber-700">
              You can view this order and add notes, but only the assigned packer can work it.
            </p>
          </div>
        </div>
      )}

      {/* Live store status says this order can't be worked on — block fulfilment. */}
      {statusBlocked && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
          <span className="text-2xl" aria-hidden>
            🚫
          </span>
          <div>
            <p className="text-sm font-semibold text-rose-800">Order can&apos;t be worked on</p>
            <p className="text-sm text-rose-700">
              The store shows this order as{' '}
              <span className="font-semibold capitalize">
                {live ? live.replace(/[-_]/g, ' ') : 'no longer present'}
              </span>
              . Picking and completing are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Assignee headline sits above the order details. */}
      {order.saved && <StatusPanel order={order} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <CustomerCard order={order} showContact={showContact} />
        <OrderCard order={order} />
      </div>

      {order.customerNote && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">Customer note: </span>
          {order.customerNote}
        </div>
      )}

      {/* Staff note thread — any role with access can post and read. */}
      {order.saved && mongoId && (
        <NotesSection notes={order.notes} mongoId={mongoId} wooId={id} canAdd={!order.archived} />
      )}

      <Products
        products={order.products}
        hideHiddenRows={isPacker}
        showPicked={order.saved}
        onTogglePick={onTogglePick}
        checking={statusChecking}
        onRequestRefund={
          // In progress: refund freely. Completed-but-not-archived: locked until
          // undone. Archived: Admin-only immediate refund (see requestArchivedRefund).
          order.saved && mongoId && !blockedPacker && (!order.status || (order.archived && isAdmin))
            ? setRefundProduct
            : undefined
        }
        onRequestReplacement={
          order.saved && mongoId && !blockedPacker && !order.status ? setReplaceProduct : undefined
        }
        onClearReplacement={
          order.saved && mongoId && isAdmin
            ? async (productId: number) => {
                const ok = await confirm({
                  title: 'Cancel replacement',
                  message: 'Remove this logged replacement? The line goes back to needing handling.',
                  confirmLabel: 'Cancel replacement',
                });
                if (ok)
                  clearReplacement.mutate(productId, {
                    onSuccess: () => toast('Replacement cancelled'),
                  });
              }
            : undefined
        }
      />

      {refundProduct && (
        <RefundModal wooId={id} product={refundProduct} onClose={() => setRefundProduct(null)} />
      )}

      {replaceProduct && (
        <ReplacementModal wooId={id} product={replaceProduct} onClose={() => setReplaceProduct(null)} />
      )}

      <ActionsPanel
        order={order}
        wooId={id}
        isAdmin={isAdmin}
        canPick={!!canPick && !!mongoId}
        fulfilmentDisabled={!actionsAllowed}
        statusChecking={statusChecking}
      />
    </div>
  );
}

/** The assignee headline — the thing a packer/supervisor needs at a glance. */
function StatusPanel({ order }: { order: OrderDetail }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 ${
        order.assigned ? 'border-brand-green/40 bg-brand-green-light' : 'border-slate-200 bg-white'
      }`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
        <p
          className={`text-lg font-semibold ${
            order.assigned ? 'text-slate-900' : 'text-slate-500'
          }`}
        >
          {order.assigned ? firstName(order.assigned.name) : 'Unassigned'}
        </p>
      </div>
    </div>
  );
}

/** Order facts beside the customer: status, shipping zone and shipping amount. */
function OrderCard({ order }: { order: OrderDetail }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Order</h2>
      <dl className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Status</dt>
          <dd>
            {/* Always the WooCommerce order status. */}
            <WooStatusBadge status={order.wooStatus} />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Shipping zone</dt>
          <dd className="text-right font-medium text-slate-800">{order.shippingZone || '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Shipping amount</dt>
          <dd className="font-medium text-slate-800">£{order.shippingAmount || '0.00'}</dd>
        </div>
      </dl>
    </section>
  );
}

function CustomerCard({ order, showContact }: { order: OrderDetail; showContact: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</h2>
      <p className="text-base font-medium text-slate-900">{order.customerName || 'Unknown customer'}</p>
      {order.address && <p className="text-slate-600">{order.address}</p>}
      {order.postcode && <p className="text-slate-600">{order.postcode}</p>}
      <div className="mt-2 space-y-0.5 text-slate-500">
        {showContact && order.customerEmail && <p>{order.customerEmail}</p>}
        {showContact && order.customerPhone && <p>{order.customerPhone}</p>}
        <p className="font-medium text-slate-700">Total: £{order.total}</p>
        <p className="text-xs text-slate-400">{new Date(order.dateCreated).toLocaleString()}</p>
      </div>
    </section>
  );
}

function Products({
  products,
  hideHiddenRows,
  showPicked,
  onTogglePick,
  checking,
  onRequestRefund,
  onRequestReplacement,
  onClearReplacement,
}: {
  products: OrderDetailProduct[];
  hideHiddenRows?: boolean; // packers don't see legacy-hidden lines at all
  showPicked: boolean;
  onTogglePick?: (index: number, picked: boolean) => void; // defined = picking enabled
  checking?: boolean; // live status check in flight — show the pick cell as loading
  onRequestRefund?: (product: OrderDetailProduct) => void; // defined = refund button enabled
  onRequestReplacement?: (product: OrderDetailProduct) => void; // defined = replace enabled
  onClearReplacement?: (productId: number) => void; // defined = clear-replace enabled
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Products ({hideHiddenRows ? products.filter((p) => !p.hidden).length : products.length})
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-2">Product</th>
              <th className="w-10 p-2 text-center">Qty</th>
              <th className="w-12 p-2 text-right" title="Amount">£</th>
              {showPicked && <th className="w-12 p-2 text-center" title="Picked">Pic</th>}
              {showPicked && <th className="w-12 p-2 text-center" title="Refund">Ref</th>}
              {showPicked && <th className="w-12 p-2 text-center" title="Replace">Rep</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p, i) =>
              hideHiddenRows && p.hidden ? null : (
              <tr key={`${p.productId}-${i}`} className={p.picked ? 'bg-brand-green-light/40' : ''}>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    {p.image ? (
                      <ProductThumb src={p.image} alt={p.name} />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <span className="block break-words text-slate-900">{p.name}</span>
                      {p.cutOption && (
                        <span className="mt-0.5 block text-sm font-bold text-orange-600">
                          {p.cutOption}
                        </span>
                      )}
                      {p.hidden && (
                        <span className="mt-0.5 block text-xs text-slate-500">legacy (hidden)</span>
                      )}
                      {p.refundStatus === 'pending' && (
                        <span className="mt-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                          Refund sent for approval · qty {p.refundQuantity}
                        </span>
                      )}
                      {p.refundStatus === 'approved' && (
                        <span className="mt-1 inline-block rounded bg-brand-green-light px-1.5 py-0.5 text-xs font-semibold text-brand-green">
                          Refund approved · qty {p.refundQuantity}
                        </span>
                      )}
                      {p.refundStatus === 'rejected' && (
                        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">
                          Refund rejected
                        </span>
                      )}
                      {p.replacement && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          Replaced with {p.replacementProduct} · qty {p.replacementQuantity}
                          {p.replacementNote ? ` · ${p.replacementNote}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-2 text-center">
                  <span className="font-extrabold text-slate-900">{p.quantity}</span>
                </td>
                <td className="whitespace-nowrap p-2 text-right text-slate-700">
                  {/* Pre-coupon line subtotal — price×qty can be £0 once a coupon applies.
                      Older orders have no stored subtotal, so fall back to price×qty. */}
                  £{p.subtotal || lineTotal(p.price, p.quantity)}
                </td>
                {showPicked && (
                  <td className="p-2 text-center">
                    {checking ? (
                      <Spinner />
                    ) : p.hidden ? (
                      // Legacy-hidden lines are auto-picked and locked — they're hidden
                      // from packers, so they never need to be picked by hand.
                      <input
                        type="checkbox"
                        checked
                        disabled
                        aria-label={`${p.name} hidden — auto-picked`}
                        className="h-5 w-5 accent-brand-green opacity-60"
                      />
                    ) : p.refundStatus === 'pending' || p.refundStatus === 'approved' || p.replacement ? (
                      // Locked while a refund is pending/approved, or the line was
                      // replaced (handled via substitution).
                      <input
                        type="checkbox"
                        checked={p.picked}
                        disabled
                        aria-label={`${p.name} picked (locked)`}
                        className="h-5 w-5 accent-brand-green opacity-60"
                      />
                    ) : onTogglePick ? (
                      <input
                        type="checkbox"
                        checked={p.picked}
                        onChange={(e) => onTogglePick(i, e.target.checked)}
                        aria-label={`Mark ${p.name} picked`}
                        className="h-5 w-5 accent-brand-green"
                      />
                    ) : (
                      // Read-only (e.g. completed order, supervisor view) — show the
                      // pick state as a checked, disabled checkbox rather than a mark.
                      <input
                        type="checkbox"
                        checked={p.picked}
                        disabled
                        aria-label={`${p.name} picked`}
                        className="h-5 w-5 accent-brand-green opacity-60"
                      />
                    )}
                  </td>
                )}
                {showPicked && (
                  <td className="p-2 text-center">
                    {checking ? (
                      <Spinner />
                    ) : onRequestRefund && p.refundStatus === 'none' && !p.replacement ? (
                      <button
                        type="button"
                        onClick={() => onRequestRefund(p)}
                        title="Request refund"
                        aria-label={`Refund ${p.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-sm hover:bg-rose-50"
                      >
                        ❌
                      </button>
                    ) : (
                      // pending/approved show the active chip; rejected & none are muted.
                      <FlagChip
                        active={p.refundStatus === 'pending' || p.refundStatus === 'approved'}
                        icon="❌"
                        label="Refund"
                        tone="rose"
                      />
                    )}
                  </td>
                )}
                {showPicked && (
                  <td className="p-2 text-center">
                    {checking ? (
                      <Spinner />
                    ) : p.replacement ? (
                      // Logged → Admin/Super Admin can cancel it (change of mind);
                      // everyone else just sees the active chip.
                      onClearReplacement ? (
                        <button
                          type="button"
                          onClick={() => {
                            onClearReplacement(p.productId);
                          }}
                          title="Cancel replacement"
                          aria-label={`Cancel replacement on ${p.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-sm hover:bg-amber-100"
                        >
                          🔄
                        </button>
                      ) : (
                        <FlagChip active icon="🔄" label="Replace" tone="amber" />
                      )
                    ) : onRequestReplacement && p.refundStatus === 'none' ? (
                      // No refund in flight → tap to log a substitution.
                      <button
                        type="button"
                        onClick={() => onRequestReplacement(p)}
                        title="Mark for replacement"
                        aria-label={`Replace ${p.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-sm hover:bg-amber-50"
                      >
                        🔄
                      </button>
                    ) : (
                      // Refund in flight (or read-only) → muted, can't replace.
                      <FlagChip active={false} icon="🔄" label="Replace" tone="amber" />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Staff note thread on an order — anyone with access can read; posting is gated by
 *  `canAdd` (off once the order is archived, since the archive is read-only). */
function NotesSection({
  notes,
  mongoId,
  wooId,
  canAdd,
}: {
  notes: OrderNote[];
  mongoId: string;
  wooId: number;
  canAdd: boolean;
}) {
  const addNote = useAddNote(wooId);
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    addNote.mutate(
      { id: mongoId, message: text },
      {
        onSuccess: () => {
          setMessage('');
          setAdding(false);
          toast('Note added');
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-white">
      <h2 className="rounded-t-[11px] bg-rose-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
        Staff note
      </h2>

      <div className="space-y-2 p-3">
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n, i) => {
              // Admin/super-admin notes stay rose (the ones to pay attention to);
              // packer/supervisor notes are neutral gray.
              const fromAdmin =
                n.authorRole === Roles.ADMIN || n.authorRole === Roles.SUPER_ADMIN;
              const cardCls = fromAdmin
                ? 'border-rose-100 bg-rose-50/60 border-l-rose-400'
                : 'border-slate-200 bg-slate-50 border-l-slate-300';
              return (
                <li key={i} className={`rounded-lg border border-l-4 p-2.5 ${cardCls}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {firstName(n.authorName)}
                    </span>
                    <span
                      className={`text-xs font-medium capitalize ${
                        fromAdmin ? 'text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {n.authorRole.replace('-', ' ')} · {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.message}</p>
                </li>
              );
            })}
          </ul>
        )}

        {!canAdd ? (
          // Archived orders are read-only — show why notes can't be added.
          <p className="text-xs text-slate-400">Notes are locked once an order is archived.</p>
        ) : adding ? (
          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={80}
              autoFocus
              placeholder="Add a note…"
              className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            {addNote.isError && <p className="text-sm text-rose-600">{addNote.error.message}</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{message.length}/80</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMessage('');
                    setAdding(false);
                  }}
                  disabled={addNote.isPending}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!message.trim() || addNote.isPending}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  {addNote.isPending ? 'Posting…' : 'Add note'}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-sm font-medium text-rose-600 hover:text-rose-700"
          >
            + Add note
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Refund / replacement state shown as a button-style icon chip. Display-only for
 * now (the refunds slice will make it a tappable toggle); muted when the flag is
 * off, tinted in its tone when on.
 */
function FlagChip({
  active,
  icon,
  label,
  tone,
}: {
  active: boolean;
  icon: string;
  label: string;
  tone: 'rose' | 'amber';
}) {
  const toneCls = active
    ? tone === 'rose'
      ? 'border-rose-300 bg-rose-50'
      : 'border-amber-300 bg-amber-50'
    : 'border-slate-200 bg-white opacity-30';
  return (
    <span
      title={active ? label : `No ${label.toLowerCase()}`}
      aria-label={active ? label : `No ${label.toLowerCase()}`}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm ${toneCls}`}
    >
      {icon}
    </span>
  );
}

/** Request (or update) a refund on one product — quantity + amount. */
function RefundModal({
  wooId,
  product,
  onClose,
}: {
  wooId: number;
  product: OrderDetailProduct;
  onClose: () => void;
}) {
  const request = useRequestRefund(wooId);
  const toast = useToast();
  // Default to a single unit; amount is derived from the unit price, not editable.
  const [quantity, setQuantity] = useState(1);
  const unitPrice = Number(product.price) || 0;
  const amount = (unitPrice * quantity).toFixed(2);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    request.mutate(
      { orderId: wooId, productId: product.productId, quantity, amount },
      {
        onSuccess: () => {
          toast('Refund requested');
          onClose();
        },
      },
    );
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <Modal onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Request refund</h2>
        <p className="text-sm text-slate-600">{product.name}</p>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Quantity (of {product.quantity})</span>
          <input
            type="number"
            min={1}
            max={product.quantity}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.min(product.quantity, Math.max(1, Number(e.target.value) || 1)))
            }
            required
            className={field}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Refund amount (£) — auto from price</span>
          <input
            type="text"
            value={amount}
            disabled
            className={`${field} cursor-not-allowed bg-slate-100 text-slate-600`}
          />
        </label>

        {request.isError && <p className="text-sm text-rose-600">{request.error.message}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={request.isPending || quantity < 1 || !amount.trim()}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {request.isPending ? 'Requesting…' : 'Request refund'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Log a substitution on one product — quantity, what it was replaced with, note. */
function ReplacementModal({
  wooId,
  product,
  onClose,
}: {
  wooId: number;
  product: OrderDetailProduct;
  onClose: () => void;
}) {
  const log = useLogReplacement(wooId);
  const toast = useToast();
  // Default to substituting the whole line — that's the common case.
  const [quantity, setQuantity] = useState(product.quantity);
  const [replacementProduct, setReplacementProduct] = useState('');
  const [note, setNote] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const swap = replacementProduct.trim();
    if (!swap) return;
    log.mutate(
      { orderId: wooId, productId: product.productId, quantity, replacementProduct: swap, note: note.trim() },
      {
        onSuccess: () => {
          toast('Replacement logged');
          onClose();
        },
      },
    );
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <Modal onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Mark for replacement</h2>
        <p className="text-sm text-slate-600">{product.name}</p>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Quantity (of {product.quantity})</span>
          <input
            type="number"
            min={1}
            max={product.quantity}
            value={quantity}
            onChange={(e) =>
              setQuantity(Math.min(product.quantity, Math.max(1, Number(e.target.value) || 1)))
            }
            required
            className={field}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Replaced with</span>
          <input
            type="text"
            value={replacementProduct}
            onChange={(e) => setReplacementProduct(e.target.value)}
            maxLength={120}
            autoFocus
            placeholder="e.g. 2× sirloin steak"
            required
            className={field}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Why the swap, any detail…"
            className={field}
          />
        </label>

        {log.isError && <p className="text-sm text-rose-600">{log.error.message}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={log.isPending || !replacementProduct.trim() || quantity < 1}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {log.isPending ? 'Saving…' : 'Log replacement'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The controls each role may use — shown below the order details. */
function ActionsPanel({
  order,
  wooId,
  isAdmin,
  canPick,
  fulfilmentDisabled,
  statusChecking,
}: {
  order: OrderDetail;
  wooId: number;
  isAdmin: boolean;
  canPick: boolean;
  fulfilmentDisabled: boolean; // live status not yet confirmed, or order not workable
  statusChecking: boolean; // the live status check is still in flight
}) {
  // Pre-processing: the only action is for the Super Admin to send it in.
  if (!order.saved) {
    if (!isAdmin) return null;
    return (
      <section className="rounded-xl border border-slate-200 bg-white">
        <SectionHeader title="Actions" />
        <div className="p-4">
          <AddToProcessing orderId={order.orderId} />
        </div>
      </section>
    );
  }

  const showStages = canPick && !!order.id;
  // Undo is for a completed order still in the live queue (not yet archived).
  const showUndo = order.status && isAdmin && !!order.id && !order.archived;
  // Redo only once the order has been archived (the nightly cron moved it to the
  // permanent archive) — at that point it can no longer be undone. An order can be
  // redone more than once, but only one redo at a time: while one is in progress,
  // link to it instead of offering to create another.
  const showCreateRedo = order.archived && isAdmin && !order.activeRedoId;
  const showViewRedo = order.archived && isAdmin && !!order.activeRedoId;
  if (!isAdmin && !showStages && !showUndo) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <SectionHeader title="Actions" />

      {showStages && order.id && (
        <StageActions
          order={order}
          mongoId={order.id}
          wooId={wooId}
          disabled={fulfilmentDisabled}
          checking={statusChecking}
        />
      )}

      {showUndo && order.id && <UndoComplete mongoId={order.id} wooId={wooId} />}

      {/* An archived order (damaged / lost / wrong on delivery) can be redone — Admin+. */}
      {showCreateRedo && <CreateRedo order={order} redoCount={order.redoCount} />}

      {/* A redo is in progress — link to it; a new one is blocked until it's done. */}
      {showViewRedo && order.activeRedoId && (
        <div className="space-y-2 p-4">
          <Link
            to={`/redos/${order.activeRedoId}`}
            className="flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            🔁 View redo in progress
          </Link>
          <p className="text-center text-xs text-slate-400">
            A redo for this order is still in progress
            {order.redoCount > 1 ? ` (${order.redoCount} redos so far)` : ''}. Finish it before
            starting another.
          </p>
        </div>
      )}

      {/* Once completed, the only action is Undo (above) — admin controls return
          after an admin undoes the completion. */}
      {isAdmin && order.id && !order.status && (
        <AdminControls order={order} mongoId={order.id} wooId={wooId} />
      )}
    </section>
  );
}

/**
 * Admin-and-above order-management controls: lock the order, unassign the packer,
 * clear the staff-note thread, or pull the order out of processing entirely.
 */
function AdminControls({
  order,
  mongoId,
  wooId,
}: {
  order: OrderDetail;
  mongoId: string;
  wooId: number;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const lock = useToggleLockInDetail(wooId);
  const reset = useResetWorkerInDetail(wooId);
  const clearNotes = useClearNotesInDetail(wooId);
  const remove = useRemoveSavedOrder();
  const cancelRefund = useCancelRefundOrder();

  function onLock() {
    lock.mutate(mongoId, { onSuccess: () => toast(order.lock ? 'Order unlocked' : 'Order locked') });
  }

  async function onReset() {
    const ok = await confirm({
      title: 'Reset packer',
      message: 'Unassign the packer from this order?',
      confirmLabel: 'Unassign',
    });
    if (ok) reset.mutate(mongoId, { onSuccess: () => toast('Packer reset') });
  }

  async function onClearNotes() {
    const ok = await confirm({
      title: 'Clear notes',
      message: 'Delete every staff note on this order? This cannot be undone.',
      confirmLabel: 'Clear notes',
    });
    if (ok) clearNotes.mutate(mongoId, { onSuccess: () => toast('Notes cleared') });
  }

  async function onRemove() {
    const ok = await confirm({
      title: 'Remove from processing',
      message: 'Take this order back out of processing? Its warehouse progress will be discarded.',
      confirmLabel: 'Remove',
    });
    if (ok)
      remove.mutate(wooId, {
        onSuccess: () => {
          toast('Removed from processing');
          navigate('/processing');
        },
      });
  }

  async function onCancelRefund() {
    const ok = await confirm({
      title: 'Cancel & refund',
      message:
        'This refunds the customer the full paid amount in WooCommerce, then cancels the order. If the refund cannot go through in full, the order is NOT cancelled. This cannot be undone. Continue?',
      confirmLabel: 'Yes, cancel & refund',
    });
    if (ok)
      cancelRefund.mutate(wooId, {
        onSuccess: (r) => {
          toast(`Refunded £${r.refunded} and cancelled`);
          navigate('/processing');
        },
        onError: (e) => toast(e.message, 'error'),
      });
  }

  // Clean white/slate neutral for non-destructive actions; the destructive ones
  // live in the fenced "Danger zone" below, told apart by red weight (outline
  // Remove vs solid Cancel) per the palette rule — colour only for destructive.
  const base =
    'rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const neutralBtn = `${base} bg-slate-200 text-slate-800 hover:bg-slate-300`;

  return (
    <div className="space-y-4 border-t border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-800">Admin controls</p>

      {/* Two columns: assign / lock, then reset worker / clear notes. */}
      <div className="grid grid-cols-2 gap-2">
        <AssignPacker order={order} wooId={wooId} />
        <button type="button" onClick={onLock} disabled={lock.isPending} className={neutralBtn}>
          {order.lock ? '🔓 Unlock' : '🔒 Lock'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!order.assigned || reset.isPending}
          className={neutralBtn}
        >
          ♻️ Reset worker
        </button>
        <button
          type="button"
          onClick={onClearNotes}
          disabled={order.notes.length === 0 || clearNotes.isPending}
          className={neutralBtn}
        >
          🗑 Clear notes
        </button>
      </div>

      {/* Danger zone — destructive actions fenced off so they can't be hit by accident. */}
      <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Danger zone</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRemove}
            disabled={remove.isPending}
            title="Remove from processing"
            className={`${base} border border-rose-300 bg-white text-rose-700 hover:bg-rose-100`}
          >
            {remove.isPending ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={onCancelRefund}
            disabled={cancelRefund.isPending}
            title="Refund the customer in full, then cancel the order"
            className={`${base} border border-rose-600 bg-rose-600 text-white hover:bg-rose-700`}
          >
            {cancelRefund.isPending ? 'Refunding…' : 'Cancel & refund'}
          </button>
        </div>
        <p className="text-xs text-rose-600/80">
          Remove just drops it from processing. Cancel &amp; refund returns the full paid amount in
          WooCommerce first, then cancels the order — neither can be undone.
        </p>
      </div>
    </div>
  );
}

function StageActions({
  order,
  mongoId,
  wooId,
  disabled,
  checking,
}: {
  order: OrderDetail;
  mongoId: string;
  wooId: number;
  disabled: boolean;
  checking: boolean;
}) {
  const dry = useDryPickedInDetail(wooId);
  const meat = useMeatPickedInDetail(wooId);
  const complete = useCompleteInDetail(wooId);
  const toast = useToast();
  const navigate = useNavigate();

  // Every product must be handled before completing: picked manually, or set
  // aside via a refund (requested/approved) or a replacement. Legacy-hidden lines
  // are auto-handled — they're hidden from packers, so they never need picking.
  const allHandled = order.products.every(
    (p) =>
      p.picked ||
      p.hidden ||
      p.refundStatus === 'pending' ||
      p.refundStatus === 'approved' ||
      p.replacement,
  );
  const stagesDone = order.dryPicked && order.meatPicked;
  const canComplete = stagesDone && allHandled;

  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-3 gap-2">
        <StageButton
          active={order.dryPicked}
          label="Dry picked"
          disabled={disabled}
          loading={checking}
          onClick={() =>
            dry.mutate(mongoId, {
              onSuccess: () => toast(order.dryPicked ? 'Dry pick cleared' : 'Marked dry picked'),
            })
          }
        />
        <StageButton
          active={order.meatPicked}
          label="Meat picked"
          disabled={disabled}
          loading={checking}
          onClick={() =>
            meat.mutate(mongoId, {
              onSuccess: () => toast(order.meatPicked ? 'Meat pick cleared' : 'Marked meat picked'),
            })
          }
        />
        <button
          type="button"
          onClick={() =>
            complete.mutate(mongoId, {
              onSuccess: () => {
                toast('Order completed');
                navigate('/processing');
              },
            })
          }
          disabled={disabled || !canComplete || complete.isPending}
          className="flex items-center justify-center rounded-lg bg-brand-green px-2 py-3 text-sm font-medium text-white hover:bg-brand-green-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? (
            <Spinner className="h-4 w-4 border-white/40 border-t-white" />
          ) : complete.isPending ? (
            'Completing…'
          ) : (
            'Complete'
          )}
        </button>
      </div>
    </div>
  );
}

function StageButton({
  active,
  label,
  onClick,
  disabled,
  loading,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center justify-center rounded-lg border py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-brand-green bg-brand-green-light text-brand-green'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {loading ? <Spinner /> : active ? `✓ ${label}` : label}
    </button>
  );
}

function UndoComplete({ mongoId, wooId }: { mongoId: string; wooId: number }) {
  const undo = useUndoInDetail(wooId);
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <div className="space-y-2 p-4">
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: 'Undo completion',
            message: 'Move this order back to processing?',
            confirmLabel: 'Undo',
          });
          if (ok) undo.mutate(mongoId, { onSuccess: () => toast('Moved back to processing') });
        }}
        disabled={undo.isPending}
        className="w-full rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {undo.isPending ? 'Undoing…' : 'Undo completion'}
      </button>
      <p className="text-center text-xs text-slate-400">
        Returns the order to processing. Unavailable once it's archived.
      </p>
    </div>
  );
}

/** Create a redo of a completed order (Admin+). Opens a reason + product-checklist modal. */
function CreateRedo({ order, redoCount }: { order: OrderDetail; redoCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2 p-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-slate-300 bg-white py-3 font-medium text-slate-700 hover:bg-slate-50"
      >
        🔁 {redoCount > 0 ? 'Redo again' : 'Create redo'}
      </button>
      <p className="text-center text-xs text-slate-400">
        {redoCount > 0
          ? `This order has been redone ${redoCount} time${redoCount === 1 ? '' : 's'} already — create another if needed.`
          : 'Re-fulfil this order (damaged, lost, or wrong item) as a separate redo.'}
      </p>
      {open && <CreateRedoModal order={order} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CreateRedoModal({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const create = useCreateRedo();
  const toast = useToast();
  const navigate = useNavigate();
  const [reason, setReason] = useState<RedoReason>('damaged');
  const [reasonDetail, setReasonDetail] = useState('');
  // Every product is included by default; unticking one excludes it from the redo.
  const [included, setIncluded] = useState<Set<number>>(
    () => new Set(order.products.map((p) => p.productId)),
  );

  function toggle(productId: number) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const excludedProductIds = order.products
      .map((p) => p.productId)
      .filter((pid) => !included.has(pid));
    create.mutate(
      { originalOrderId: order.orderId, reason, reasonDetail: reasonDetail.trim(), excludedProductIds },
      {
        onSuccess: (redo) => {
          toast('Redo created');
          onClose();
          navigate(`/redos/${redo.id}`);
        },
      },
    );
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <Modal onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Create redo · #{order.orderNumber}</h2>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as RedoReason)}
            className={field}
          >
            {REDO_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Details (optional)</span>
          <input
            type="text"
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            maxLength={300}
            placeholder="What went wrong…"
            className={field}
          />
        </label>

        <div className="text-sm">
          <span className="mb-1 block text-slate-600">
            Products to redo — untick anything that doesn&apos;t need redoing
          </span>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {order.products.map((p, idx) => (
              <li key={`${p.productId}-${idx}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={included.has(p.productId)}
                  onChange={() => toggle(p.productId)}
                  className="h-4 w-4 accent-brand-green"
                  id={`redo-p-${idx}`}
                />
                <label htmlFor={`redo-p-${idx}`} className="min-w-0 flex-1 truncate text-slate-700">
                  {p.name} <span className="text-slate-400">×{p.quantity}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {create.isError && <p className="text-sm text-rose-600">{create.error.message}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending || included.size === 0}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create redo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddToProcessing({ orderId }: { orderId: number }) {
  const save = useSaveOrders();
  const toast = useToast();
  return (
    <>
      {save.isError && <p className="mb-2 text-sm text-rose-600">{save.error.message}</p>}
      <button
        type="button"
        onClick={() => save.mutate([orderId], { onSuccess: () => toast('Added to processing') })}
        disabled={save.isPending}
        className="w-full rounded-lg bg-brand-green py-3 font-medium text-white hover:bg-brand-green-hover disabled:opacity-50 sm:w-auto sm:px-8"
      >
        {save.isPending ? 'Adding…' : 'Add to processing'}
      </button>
    </>
  );
}

function AssignPacker({ order, wooId }: { order: OrderDetail; wooId: number }) {
  const { data: packers } = usePackers();
  const assign = useAssignInDetail(wooId);
  const toast = useToast();

  return (
    <select
      value={order.assigned?.id ?? ''}
      disabled={assign.isPending || !order.id}
      onChange={(e) =>
        order.id &&
        e.target.value &&
        assign.mutate(
          { id: order.id, packerId: e.target.value },
          { onSuccess: () => toast('Packer assigned') },
        )
      }
      className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green disabled:opacity-50"
    >
      <option value="">Assign packer</option>
      {packers?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.fname} {p.lname}
        </option>
      ))}
    </select>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {title}
    </h2>
  );
}

function WooStatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const tone =
    status === 'completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'processing'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}>
      {children ?? status.replace(/-/g, ' ')}
    </span>
  );
}
