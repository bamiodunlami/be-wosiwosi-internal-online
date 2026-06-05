import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  hasAtLeast,
  Roles,
  type Notification,
  type RedoDetail,
  type RedoNote,
  type RedoProduct,
} from '@shared';
import { useCurrentUser } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/toast';
import { useConfirm } from '../../components/ui/confirm';
import { Modal } from '../../components/ui/modal';
import { useRedoNotifications, useMarkRedoRead } from '../../hooks/useNotifications';
import { ProductThumb } from '../../components/ui/ProductThumb';
import {
  AlertIcon,
  BellIcon,
  CheckIcon,
  LockIcon,
  RefundIcon,
  ReplaceIcon,
  ResetIcon,
  TrashIcon,
  UnlockIcon,
  UserIcon,
} from '../../components/ui/icons';
import { lineTotal } from '../../lib/money';
import { REASON_LABELS } from '../../lib/redo';
import { firstName } from '../../lib/staff';
import {
  useRedo,
  useRedoPick,
  useRedoDryPicked,
  useRedoMeatPicked,
  useCompleteRedo,
  useAddRedoNote,
  useAssignRedo,
  useToggleRedoLock,
  useResetRedoWorker,
  useRedoPackers,
  useRequestRedoRefund,
  useLogRedoReplacement,
  useClearRedoReplacement,
  useClearRedoNotes,
  useRemoveRedo,
} from '../../hooks/useRedos';

/**
 * Redo detail (SPEC §9). A packer works it like an order (pick → dry/meat →
 * complete) and sees only the redo's own data. Supervisors/super-admins also see
 * the snapshotted original-order context (sent only to them by the server).
 *
 * Refund/replace work just like a normal order: any role with access can request a
 * refund (Admin+ auto-approves and fires the REAL WooCommerce refund against the
 * original order immediately; otherwise an admin approves it here). Replacements are
 * reference-only. Admins can also remove the redo entirely.
 */
export default function RedoDetailPage() {
  const { id = '' } = useParams();
  const { data: user } = useCurrentUser();
  const { data: redo, isLoading, isError, error } = useRedo(id);
  const [refundProduct, setRefundProduct] = useState<RedoProduct | null>(null);
  const [replaceProduct, setReplaceProduct] = useState<RedoProduct | null>(null);

  if (isLoading) return <p className="text-sm text-slate-500">Loading redo…</p>;
  if (isError) return <p className="text-sm text-rose-600">{error.message}</p>;
  if (!redo) return null;

  const isAdmin = !!user && hasAtLeast(user.role, Roles.ADMIN);
  const isSupervisor = !!user && hasAtLeast(user.role, Roles.SUPERVISOR);
  // Packers (and admins) pick while the redo is pending and unlocked. Supervisors
  // view only. A locked redo is frozen for everyone below admin.
  const unlocked = !redo.lock || isAdmin;
  const canPick = !redo.status && user?.role !== Roles.SUPERVISOR && unlocked;
  // Refund/replace mirror an order: anyone with access can flag (a packer only ever
  // opens their own redo). Locked redos are frozen below admin.
  const canRefund = unlocked;
  const canReplace = !redo.status && unlocked;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Redo · #{redo.originalOrderNumber}</h1>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800">
          {REASON_LABELS[redo.reason]}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
            redo.status ? 'bg-brand-green-light text-brand-green' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {redo.status ? 'Completed' : 'Pending'}
        </span>
      </div>

      <RedoNotificationsBanner redoId={redo.id} />

      {redo.lock && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
          <LockIcon className="h-6 w-6 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-800">Redo locked</p>
            <p className="text-sm text-rose-700">Packers and supervisors can&apos;t change this redo.</p>
          </div>
        </div>
      )}

      {/* Assignee headline. */}
      <div
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          redo.assigned ? 'border-brand-green/40 bg-brand-green-light' : 'border-slate-200 bg-white'
        }`}
      >
        {redo.assigned ? (
          <UserIcon className="h-6 w-6 shrink-0 text-slate-700" />
        ) : (
          <AlertIcon className="h-6 w-6 shrink-0 text-amber-600" />
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned to</p>
          <p className={`text-lg font-semibold ${redo.assigned ? 'text-slate-900' : 'text-slate-500'}`}>
            {redo.assigned ? firstName(redo.assigned.name) : 'Unassigned'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CustomerCard redo={redo} showContact={isSupervisor} />
        <ReasonCard redo={redo} />
      </div>

      {redo.customerNote && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">Customer note: </span>
          {redo.customerNote}
        </div>
      )}

      {/* Staff notes sit above the product table, like the order detail. */}
      <RedoNotes notes={redo.redoNotes} redoId={redo.id} />

      <Products
        products={redo.products}
        canPick={canPick}
        redoId={redo.id}
        isAdmin={isAdmin}
        onRequestRefund={canRefund ? setRefundProduct : undefined}
        onRequestReplacement={canReplace ? setReplaceProduct : undefined}
        redoStatus={redo.status}
      />

      {refundProduct && (
        <RefundModal redoId={redo.id} product={refundProduct} onClose={() => setRefundProduct(null)} />
      )}
      {replaceProduct && (
        <ReplacementModal redoId={redo.id} product={replaceProduct} onClose={() => setReplaceProduct(null)} />
      )}

      {/* Original-order context — supervisor/super-admin only (server-filtered). */}
      {redo.original && <OriginalContext original={redo.original} />}

      {/* Fulfilment + admin actions. */}
      <ActionsPanel redo={redo} canPick={canPick} isAdmin={isAdmin} />
    </div>
  );
}

/**
 * "What's new on this redo" — on open, snapshots unread redo notifications, marks
 * them read (clearing the bell), and fades after a few seconds. Mirrors the order
 * detail's banner.
 */
function RedoNotificationsBanner({ redoId }: { redoId: string }) {
  const { data } = useRedoNotifications(redoId);
  const { mutate: markRead } = useMarkRedoRead();
  const [items, setItems] = useState<Notification[] | null>(null);
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (fired.current || !data) return;
    const unread = data.filter((n) => !n.read);
    fired.current = true;
    if (!unread.length) return;
    setItems(unread);
    markRead(redoId);
    timer.current = setTimeout(() => setItems(null), 4000);
  }, [data, markRead, redoId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 shadow-lg">
      <p className="flex items-center gap-3 text-base font-extrabold uppercase tracking-wide text-amber-800">
        <span className="animate-bounce" aria-hidden>
          <BellIcon className="h-7 w-7 text-amber-600" />
        </span>
        New on this redo
      </p>
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

function CustomerCard({ redo, showContact }: { redo: RedoDetail; showContact: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Customer</h2>
      <p className="text-base font-medium text-slate-900">{redo.customerName || 'Unknown customer'}</p>
      {redo.address && <p className="text-slate-600">{redo.address}</p>}
      {redo.postcode && <p className="text-slate-600">{redo.postcode}</p>}
      <div className="mt-2 space-y-0.5 text-slate-500">
        {showContact && redo.customerEmail && <p>{redo.customerEmail}</p>}
        {showContact && redo.customerPhone && <p>{redo.customerPhone}</p>}
      </div>
    </section>
  );
}

function ReasonCard({ redo }: { redo: RedoDetail }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Redo reason</h2>
      <p className="text-base font-medium text-slate-900">{REASON_LABELS[redo.reason]}</p>
      {redo.reasonDetail && <p className="mt-1 text-slate-600">{redo.reasonDetail}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Created by {redo.createdByName || 'unknown'} · {new Date(redo.createdAt).toLocaleString()}
      </p>
      <dl className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-slate-500">
        <div className="flex items-center justify-between gap-3">
          <dt>Shipping zone</dt>
          <dd className="text-right font-medium text-slate-800">{redo.shippingZone || '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Shipping amount</dt>
          <dd className="font-medium text-slate-800">£{redo.shippingAmount || '0.00'}</dd>
        </div>
      </dl>
    </section>
  );
}

function Products({
  products,
  canPick,
  redoId,
  isAdmin,
  onRequestRefund,
  onRequestReplacement,
  redoStatus,
}: {
  products: RedoProduct[];
  canPick: boolean;
  redoId: string;
  isAdmin: boolean;
  onRequestRefund?: (product: RedoProduct) => void;
  onRequestReplacement?: (product: RedoProduct) => void;
  redoStatus: boolean;
}) {
  const pick = useRedoPick(redoId);
  const clearReplace = useClearRedoReplacement(redoId);
  const confirm = useConfirm();
  const toast = useToast();

  async function onClearReplace(productId: number) {
    const ok = await confirm({
      title: 'Cancel replacement',
      message: 'Remove this logged replacement? The line goes back to needing handling.',
      confirmLabel: 'Cancel replacement',
    });
    if (ok) clearReplace.mutate(productId, { onSuccess: () => toast('Replacement cancelled') });
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Products ({products.length})
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="p-2 lg:w-1/2">Product</th>
              <th className="w-7 px-0 py-2 text-center lg:w-[10%]">Qty</th>
              <th className="w-12 px-0.5 py-2 text-right lg:w-[10%]">£</th>
              <th className="w-9 px-1 py-2 text-center lg:w-[10%]" title="Picked">Pic</th>
              <th className="w-9 px-1 py-2 text-center lg:w-[10%]" title="Refund">Ref</th>
              <th className="w-9 px-1 py-2 text-center lg:w-[10%]" title="Replace">Rep</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p, i) => {
              const refundLocked =
                p.refundStatus === 'pending' || p.refundStatus === 'approved' || p.replacement;
              return (
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
                          <span className="mt-0.5 block text-sm font-bold text-orange-600">{p.cutOption}</span>
                        )}
                        {p.refundStatus === 'pending' && (
                          <span className="mt-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                            Refund sent for approval · qty {p.refundQuantity}
                          </span>
                        )}
                        {/* Approval happens on the Refunds page, not here. */}
                        {p.refundStatus === 'approved' && (
                          <span className="mt-1 inline-block rounded bg-brand-green-light px-1.5 py-0.5 text-xs font-semibold text-brand-green">
                            Refunded · qty {p.refundQuantity}
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
                  <td className="px-0 py-2 text-center">
                    <span className="font-extrabold text-slate-900">{p.quantity}</span>
                  </td>
                  <td className="whitespace-nowrap px-0.5 py-2 text-right text-xs text-slate-700 sm:text-sm">
                    £{lineTotal(p.price, p.quantity)}
                  </td>
                  <td className="px-1 py-2 text-center">
                    {canPick && !refundLocked ? (
                      <input
                        type="checkbox"
                        checked={p.picked}
                        onChange={(e) => pick.mutate({ index: i, picked: e.target.checked })}
                        aria-label={`Mark ${p.name} picked`}
                        className="h-5 w-5 accent-brand-green"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={p.picked}
                        disabled
                        aria-label={`${p.name} picked`}
                        className="h-5 w-5 accent-brand-green opacity-60"
                      />
                    )}
                  </td>
                  <td className="px-1 py-2 text-center">
                    {onRequestRefund && p.refundStatus === 'none' && !p.replacement ? (
                      <button
                        type="button"
                        onClick={() => onRequestRefund(p)}
                        title="Request refund"
                        aria-label={`Refund ${p.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50"
                      >
                        <RefundIcon />
                      </button>
                    ) : (
                      <FlagChip
                        active={p.refundStatus === 'pending' || p.refundStatus === 'approved'}
                        icon={<RefundIcon />}
                        label="Refund"
                        tone="rose"
                      />
                    )}
                  </td>
                  <td className="px-1 py-2 text-center">
                    {p.replacement ? (
                      isAdmin ? (
                        <button
                          type="button"
                          onClick={() => onClearReplace(p.productId)}
                          title="Cancel replacement"
                          aria-label={`Cancel replacement on ${p.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                          <ReplaceIcon />
                        </button>
                      ) : (
                        <FlagChip active icon={<ReplaceIcon />} label="Replace" tone="amber" />
                      )
                    ) : onRequestReplacement && p.refundStatus === 'none' && !redoStatus ? (
                      <button
                        type="button"
                        onClick={() => onRequestReplacement(p)}
                        title="Mark for replacement"
                        aria-label={`Replace ${p.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-amber-700 hover:bg-amber-50"
                      >
                        <ReplaceIcon />
                      </button>
                    ) : (
                      <FlagChip active={false} icon={<ReplaceIcon />} label="Replace" tone="amber" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Refund / replacement state shown as a button-style icon chip (display-only). */
function FlagChip({
  active,
  icon,
  label,
  tone,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  tone: 'rose' | 'amber';
}) {
  const toneCls = active
    ? tone === 'rose'
      ? 'border-rose-300 bg-rose-50 text-rose-600'
      : 'border-amber-300 bg-amber-50 text-amber-700'
    : 'border-slate-200 bg-white text-slate-400 opacity-30';
  return (
    <span
      title={active ? label : `No ${label.toLowerCase()}`}
      aria-label={active ? label : `No ${label.toLowerCase()}`}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${toneCls}`}
    >
      {icon}
    </span>
  );
}

/** Request a refund on one redo product — quantity + amount. */
function RefundModal({
  redoId,
  product,
  onClose,
}: {
  redoId: string;
  product: RedoProduct;
  onClose: () => void;
}) {
  const request = useRequestRedoRefund(redoId);
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const unitPrice = Number(product.price) || 0;
  const amount = (unitPrice * quantity).toFixed(2);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    request.mutate(
      { productId: product.productId, quantity, amount },
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
        <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          Issued against the original order&apos;s payment. This goes to the Refunds page for an
          admin to approve — the money is refunded immediately on approval.
        </p>

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
            disabled={request.isPending || quantity < 1}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {request.isPending ? 'Requesting…' : 'Request refund'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Log a substitution on one redo product — quantity, what it was replaced with, note. */
function ReplacementModal({
  redoId,
  product,
  onClose,
}: {
  redoId: string;
  product: RedoProduct;
  onClose: () => void;
}) {
  const log = useLogRedoReplacement(redoId);
  const toast = useToast();
  const [quantity, setQuantity] = useState(product.quantity);
  const [replacementProduct, setReplacementProduct] = useState('');
  const [note, setNote] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const swap = replacementProduct.trim();
    if (!swap) return;
    log.mutate(
      { productId: product.productId, quantity, replacementProduct: swap, note: note.trim() },
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

function RedoNotes({ notes, redoId }: { notes: RedoNote[]; redoId: string }) {
  const addNote = useAddRedoNote(redoId);
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    addNote.mutate(text, {
      onSuccess: () => {
        setMessage('');
        setAdding(false);
        toast('Note added');
      },
    });
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
              const fromAdmin = n.authorRole === Roles.ADMIN || n.authorRole === Roles.SUPER_ADMIN;
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

        {adding ? (
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

function OriginalContext({ original }: { original: NonNullable<RedoDetail['original']> }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Original order (supervisor view)
      </h2>
      <p className="text-sm text-slate-600">
        Packed by <span className="font-medium text-slate-800">{original.packerName ? firstName(original.packerName) : 'unknown'}</span>
        {original.completedAt && ` · ${new Date(original.completedAt).toLocaleString()}`}
      </p>
    </section>
  );
}

function ActionsPanel({
  redo,
  canPick,
  isAdmin,
}: {
  redo: RedoDetail;
  canPick: boolean;
  isAdmin: boolean;
}) {
  const showStages = canPick && !redo.status;
  if (!isAdmin && !showStages) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Actions
      </h2>
      {showStages && <StageActions redo={redo} />}
      {isAdmin && <AdminControls redo={redo} />}
    </section>
  );
}

function StageActions({ redo }: { redo: RedoDetail }) {
  const dry = useRedoDryPicked(redo.id);
  const meat = useRedoMeatPicked(redo.id);
  const complete = useCompleteRedo(redo.id);
  const toast = useToast();
  const navigate = useNavigate();

  // Every product must be handled before completing: picked, or set aside via a
  // refund (pending/approved) or a replacement.
  const allHandled = redo.products.every(
    (p) => p.picked || p.refundStatus === 'pending' || p.refundStatus === 'approved' || p.replacement,
  );
  const canComplete = redo.dryPicked && redo.meatPicked && allHandled;

  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      <StageButton
        active={redo.dryPicked}
        label="Dry picked"
        onClick={() => dry.mutate(undefined, { onSuccess: () => toast(redo.dryPicked ? 'Dry pick cleared' : 'Marked dry picked') })}
      />
      <StageButton
        active={redo.meatPicked}
        label="Meat picked"
        onClick={() => meat.mutate(undefined, { onSuccess: () => toast(redo.meatPicked ? 'Meat pick cleared' : 'Marked meat picked') })}
      />
      <button
        type="button"
        onClick={() =>
          complete.mutate(undefined, {
            onSuccess: () => {
              toast('Redo completed');
              navigate('/processing');
            },
          })
        }
        disabled={!canComplete || complete.isPending}
        className="flex items-center justify-center rounded-lg bg-brand-green px-2 py-3 text-sm font-medium text-white hover:bg-brand-green-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {complete.isPending ? 'Completing…' : 'Complete'}
      </button>
    </div>
  );
}

function StageButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-1.5 rounded-lg border py-3 text-sm font-medium transition-colors ${
        active
          ? 'border-brand-green bg-brand-green-light text-brand-green'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {active ? (
        <>
          <CheckIcon className="h-4 w-4" /> {label}
        </>
      ) : (
        label
      )}
    </button>
  );
}

function AdminControls({ redo }: { redo: RedoDetail }) {
  const { data: packers } = useRedoPackers();
  const assign = useAssignRedo(redo.id);
  const lock = useToggleRedoLock(redo.id);
  const reset = useResetRedoWorker(redo.id);
  const clearNotes = useClearRedoNotes(redo.id);
  const remove = useRemoveRedo();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const base =
    'flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const neutralBtn = `${base} bg-slate-200 text-slate-800 hover:bg-slate-300`;

  async function onReset() {
    const ok = await confirm({
      title: 'Reset packer',
      message: 'Unassign the packer from this redo?',
      confirmLabel: 'Unassign',
    });
    if (ok) reset.mutate(undefined, { onSuccess: () => toast('Packer reset') });
  }

  async function onClearNotes() {
    const ok = await confirm({
      title: 'Clear notes',
      message: 'Delete every staff note on this redo? This cannot be undone.',
      confirmLabel: 'Clear notes',
    });
    if (ok) clearNotes.mutate(undefined, { onSuccess: () => toast('Notes cleared') });
  }

  async function onRemove() {
    const ok = await confirm({
      title: 'Remove redo',
      message: 'Delete this redo entirely? Its progress and records are discarded. This cannot be undone.',
      confirmLabel: 'Remove redo',
    });
    if (ok)
      remove.mutate(redo.id, {
        onSuccess: () => {
          toast('Redo removed');
          navigate('/processing');
        },
      });
  }

  return (
    <div className="space-y-4 border-t border-slate-100 p-4">
      <p className="text-sm font-semibold text-slate-800">Admin controls</p>
      {!redo.status && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={redo.assigned?.id ?? ''}
            disabled={assign.isPending}
            onChange={(e) =>
              e.target.value &&
              assign.mutate({ packerId: e.target.value }, { onSuccess: () => toast('Packer assigned') })
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
          <button
            type="button"
            onClick={() => lock.mutate(undefined, { onSuccess: () => toast(redo.lock ? 'Redo unlocked' : 'Redo locked') })}
            disabled={lock.isPending}
            className={neutralBtn}
          >
            {redo.lock ? (
              <>
                <UnlockIcon className="h-4 w-4" /> Unlock
              </>
            ) : (
              <>
                <LockIcon className="h-4 w-4" /> Lock
              </>
            )}
          </button>
          <button type="button" onClick={onReset} disabled={!redo.assigned || reset.isPending} className={neutralBtn}>
            <ResetIcon className="h-4 w-4" /> Reset worker
          </button>
          <button
            type="button"
            onClick={onClearNotes}
            disabled={redo.redoNotes.length === 0 || clearNotes.isPending}
            className={neutralBtn}
          >
            <TrashIcon className="h-4 w-4" /> Clear notes
          </button>
        </div>
      )}

      {/* Danger zone — removing the redo deletes it from the system. */}
      <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Danger zone</p>
        <button
          type="button"
          onClick={onRemove}
          disabled={remove.isPending}
          className={`${base} w-full border border-rose-300 bg-white text-rose-700 hover:bg-rose-100`}
        >
          {remove.isPending ? 'Removing…' : 'Remove redo'}
        </button>
        <p className="text-xs text-rose-600/80">Deletes this redo and its records. This cannot be undone.</p>
      </div>
    </div>
  );
}
