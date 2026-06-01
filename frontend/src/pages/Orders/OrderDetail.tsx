import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  hasAtLeast,
  Roles,
  type Notification,
  type OrderDetail,
  type OrderDetailProduct,
  type OrderNote,
} from '@shared';
import { useCurrentUser } from '../../hooks/useAuth';
import { useConfirm } from '../../components/ui/confirm';
import { useToast } from '../../components/ui/toast';
import { Modal } from '../../components/ui/modal';
import { useRequestRefund } from '../../hooks/useRefunds';
import { useOrderNotifications, useMarkOrderRead } from '../../hooks/useNotifications';
import { lineTotal } from '../../lib/money';
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
  const [refundProduct, setRefundProduct] = useState<OrderDetailProduct | null>(null);

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

  // Packers (and admins) tick products as they pick them, while the order is in
  // processing and not yet completed. Supervisors view only. A locked order is
  // frozen for everyone below admin — no picking, no stage actions (notes still OK).
  const canPick =
    order.saved &&
    !order.status &&
    !!order.id &&
    user?.role !== Roles.SUPERVISOR &&
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
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <span className="font-semibold">Customer note: </span>
          {order.customerNote}
        </div>
      )}

      {/* Staff note thread — any role with access can post and read. */}
      {order.saved && mongoId && <NotesSection notes={order.notes} mongoId={mongoId} wooId={id} />}

      <Products
        products={order.products}
        showPicked={order.saved}
        onTogglePick={onTogglePick}
        checking={statusChecking}
        onRequestRefund={order.saved && mongoId ? setRefundProduct : undefined}
      />

      {refundProduct && (
        <RefundModal
          wooId={id}
          product={refundProduct}
          onClose={() => setRefundProduct(null)}
        />
      )}

      {/* Actions sit below the order details. */}
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
        order.assigned ? 'border-brand-green/40 bg-brand-green-light' : 'border-amber-300 bg-amber-50'
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {order.assigned ? '👤' : '⚠️'}
      </span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
        <p
          className={`text-lg font-semibold ${
            order.assigned ? 'text-slate-900' : 'text-amber-700'
          }`}
        >
          {order.assigned ? order.assigned.name : 'Unassigned'}
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
  showPicked,
  onTogglePick,
  checking,
  onRequestRefund,
}: {
  products: OrderDetailProduct[];
  showPicked: boolean;
  onTogglePick?: (index: number, picked: boolean) => void; // defined = picking enabled
  checking?: boolean; // live status check in flight — show the pick cell as loading
  onRequestRefund?: (product: OrderDetailProduct) => void; // defined = refund button enabled
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Products ({products.length})
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
            {products.map((p, i) => (
              <tr key={`${p.productId}-${i}`} className={p.picked ? 'bg-brand-green-light/40' : ''}>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    {p.image ? (
                      <img src={p.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
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
                    </div>
                  </div>
                </td>
                <td className="p-2 text-center">
                  <span className="font-extrabold text-slate-900">{p.quantity}</span>
                </td>
                <td className="whitespace-nowrap p-2 text-right text-slate-700">
                  £{lineTotal(p.price, p.quantity)}
                </td>
                {showPicked && (
                  <td className="p-2 text-center">
                    {checking ? (
                      <Spinner />
                    ) : p.refundStatus === 'pending' || p.refundStatus === 'approved' ? (
                      // Locked while a refund is pending/approved (approved = ticked).
                      <input
                        type="checkbox"
                        checked={p.picked}
                        disabled
                        aria-label={`${p.name} picked (locked by refund)`}
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
                      <span className={p.picked ? 'text-brand-green' : 'text-slate-300'}>
                        {p.picked ? '✓' : '—'}
                      </span>
                    )}
                  </td>
                )}
                {showPicked && (
                  <td className="p-2 text-center">
                    {checking ? (
                      <Spinner />
                    ) : onRequestRefund && p.refundStatus === 'none' ? (
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
                    {/* Replace is display-only for now; refund pending/approved blocks it. */}
                    <FlagChip
                      active={p.replacement && p.refundStatus !== 'pending' && p.refundStatus !== 'approved'}
                      icon="🔄"
                      label="Replace"
                      tone="amber"
                    />
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

/** Staff note thread on an order — anyone with access can read and post. */
function NotesSection({
  notes,
  mongoId,
  wooId,
}: {
  notes: OrderNote[];
  mongoId: string;
  wooId: number;
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
    <section className="rounded-xl border border-slate-300 bg-slate-50">
      <h2 className="rounded-t-[11px] bg-slate-700 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white">
        Staff note
      </h2>

      <div className="space-y-3 p-4">
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n, i) => {
              // Single slate palette (matches the header). Admin/super-admin notes
              // get a strong dark-slate left accent; packer/supervisor a faint one —
              // distinction by shade, not by clashing colours.
              const fromAdmin =
                n.authorRole === Roles.ADMIN || n.authorRole === Roles.SUPER_ADMIN;
              return (
                <li
                  key={i}
                  className={`rounded-lg border border-slate-200 border-l-4 bg-white p-3 shadow-sm ${
                    fromAdmin ? 'border-l-slate-700' : 'border-l-slate-300'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {n.authorName.split(' ')[0]}
                    </span>
                    <span
                      className={`text-xs font-medium capitalize ${
                        fromAdmin ? 'text-slate-700' : 'text-slate-400'
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

        {adding ? (
          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={80}
              autoFocus
              placeholder="Add a note…"
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-700"
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
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
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
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
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
  const showUndo = order.status && isAdmin && !!order.id;
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

  // Bootstrap-style "light" buttons — light grey, dark text, subtle border. No
  // per-action colour coding; Remove gets a light-danger variant as the cue.
  const base =
    'rounded-lg border py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';
  const lightBtn = `${base} border-slate-400 bg-slate-200 text-slate-900 hover:bg-slate-300`;
  const lockBtn = lightBtn;
  const resetBtn = lightBtn;
  const clearBtn = lightBtn;
  const removeBtn = `${base} border-rose-400 bg-rose-100 text-rose-800 hover:bg-rose-200`;

  return (
    <div className="space-y-3 border-t border-slate-100 p-4">
      <p className="text-sm font-medium text-slate-700">Admin controls</p>
      <AssignPacker order={order} wooId={wooId} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onLock}
          disabled={lock.isPending}
          className={lockBtn}
        >
          {order.lock ? '🔓 Unlock' : '🔒 Lock'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={!order.assigned || reset.isPending}
          className={resetBtn}
        >
          Reset packer
        </button>
        <button
          type="button"
          onClick={onClearNotes}
          disabled={order.notes.length === 0 || clearNotes.isPending}
          className={clearBtn}
        >
          Clear notes
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={remove.isPending}
          title="Remove from processing"
          className={removeBtn}
        >
          {remove.isPending ? 'Removing…' : 'Remove'}
        </button>
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

  // Every product must be handled before completing: picked manually, or set
  // aside via a refund (requested/approved) or a replacement.
  const allHandled = order.products.every(
    (p) => p.picked || p.refundStatus === 'pending' || p.refundStatus === 'approved' || p.replacement,
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
          onClick={() => complete.mutate(mongoId, { onSuccess: () => toast('Order completed') })}
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
      {checking ? (
        <p className="text-center text-xs text-slate-400">Verifying the order with the store…</p>
      ) : !allHandled ? (
        <p className="text-center text-xs text-slate-400">
          Every product must be picked, refunded, or marked for replacement to enable Complete.
        </p>
      ) : !stagesDone ? (
        <p className="text-center text-xs text-slate-400">
          Mark Dry picked and Meat picked to enable Complete.
        </p>
      ) : null}
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
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green disabled:opacity-50"
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
