import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasAtLeast, Roles, type Order, type RedoListItem } from '@shared';
import { useOrders, useOrderDetail } from '../../hooks/useOrders';
import { useRedos, useRedo } from '../../hooks/useRedos';
import { useCurrentUser } from '../../hooks/useAuth';
import { useUnreadByOrder, useUnreadByRedo } from '../../hooks/useNotifications';
import { Modal } from '../../components/ui/modal';
import { lineTotal } from '../../lib/money';
import { OrderBell } from '../../components/notifications/OrderBell';
import { RedoCard } from '../../components/redos/RedoCard';

// A processing row is either a normal order or a redo; both work the same flow.
type Row = { kind: 'order'; key: string; num: string; order: Order } | { kind: 'redo'; key: string; num: string; redo: RedoListItem };

function rowNum(n: string): number {
  const v = Number(n);
  return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
}

/**
 * Processing — orders that have been sent for processing (status:false).
 * Role-scoped by the API: a Super Admin sees all (and assigns packers here), a
 * packer sees only their own assigned orders, a supervisor sees all assigned
 * orders. Tapping an order opens the shared detail page to work it. Admins get a
 * "Quick view" to preview an order's contents without leaving the queue.
 */
export default function ProcessingPage() {
  const { data: orders, isLoading, isError, error } = useOrders('processing');
  const { data: redos } = useRedos();
  const { data: me } = useCurrentUser();
  const { data: unread } = useUnreadByOrder();
  const { data: redoUnread } = useUnreadByRedo();
  const isManager = !!me && hasAtLeast(me.role, Roles.ADMIN);
  // The dry/frozen pick-list buttons: supervisors and up always; a packer only
  // when they actually have an order assigned (their list is non-empty).
  const showPickLists =
    (!!me && hasAtLeast(me.role, Roles.SUPERVISOR)) || (orders?.length ?? 0) > 0;

  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewRedoId, setPreviewRedoId] = useState<string | null>(null);

  // Merge in-progress orders and pending redos into one queue, ascending by number.
  const rows = useMemo<Row[]>(() => {
    const orderRows: Row[] = (orders ?? []).map((o) => ({
      kind: 'order',
      key: `o-${o.id}`,
      num: o.orderNumber,
      order: o,
    }));
    const redoRows: Row[] = (redos ?? [])
      .filter((r) => !r.status)
      .map((r) => ({ kind: 'redo', key: `r-${r.id}`, num: r.originalOrderNumber, redo: r }));
    return [...orderRows, ...redoRows].sort((a, b) => rowNum(a.num) - rowNum(b.num));
  }, [orders, redos]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Processing</h1>
        <p className="text-sm text-slate-500">Orders currently being packed.</p>
      </header>

      {showPickLists && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/processing/products/dry"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            📦 All dry products
          </Link>
          <Link
            to="/processing/products/frozen"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            ❄️ All frozen products
          </Link>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing in processing.
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) =>
            row.kind === 'order' ? (
              <li key={row.key}>
                <ProcessingCard
                  order={row.order}
                  isManager={isManager}
                  unreadCount={unread?.get(row.order.orderId) ?? 0}
                  onPreview={() => setPreviewId(row.order.orderId)}
                />
              </li>
            ) : (
              <li key={row.key}>
                <RedoCard
                  redo={row.redo}
                  isManager={isManager}
                  unreadCount={redoUnread?.get(row.redo.id) ?? 0}
                  onPreview={() => setPreviewRedoId(row.redo.id)}
                />
              </li>
            ),
          )}
        </ul>
      )}

      {previewId !== null && (
        <OrderPreviewModal orderId={previewId} onClose={() => setPreviewId(null)} />
      )}

      {previewRedoId !== null && (
        <RedoPreviewModal redoId={previewRedoId} onClose={() => setPreviewRedoId(null)} />
      )}
    </div>
  );
}

function ProcessingCard({
  order,
  isManager,
  unreadCount,
  onPreview,
}: {
  order: Order;
  isManager: boolean;
  unreadCount: number;
  onPreview: () => void;
}) {
  const visible = order.products.filter((p) => !p.hidden);
  const picked = visible.filter((p) => p.picked).length;

  return (
    <div className={`rounded-xl border bg-white p-4 ${order.lock ? 'border-rose-300' : 'border-slate-200'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to={`/orders/${order.orderId}`} className="font-semibold text-brand-green hover:underline">
            #{order.orderNumber}
          </Link>
          <OrderBell count={unreadCount} />
          {order.lock && (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              🔒 Locked
            </span>
          )}
        </div>
        <span className="shrink-0 font-medium text-slate-700">£{order.total}</span>
      </div>

      <Link to={`/orders/${order.orderId}`} className="block">
        <p className="truncate text-sm text-slate-700">{order.customerName || 'Unknown customer'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{order.postcode || 'No postcode'}</span>
          <span>
            {picked}/{visible.length} picked
          </span>
          {order.dryPicked && <span className="text-brand-green">✓ Dry</span>}
          {order.meatPicked && <span className="text-brand-green">✓ Meat</span>}
        </div>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {order.assigned ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-light px-3 py-1 text-sm font-semibold text-slate-800">
            <span aria-hidden>👤</span> {order.assigned.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            <span aria-hidden>⚠️</span> Unassigned
          </span>
        )}

        {/* Admin / Super Admin only — peek at the order without opening it. */}
        {isManager && (
          <button
            type="button"
            onClick={onPreview}
            className="shrink-0 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Quick view
          </button>
        )}
      </div>
    </div>
  );
}

/** Admin quick-preview of an order's contents, fetched live, without navigating. */
function OrderPreviewModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { data: order, isLoading, isError, error } = useOrderDetail(orderId);

  return (
    <Modal onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-500">Loading order…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {order && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">#{order.orderNumber}</h2>
              <p className="truncate text-sm text-slate-500">{order.customerName || 'Unknown customer'}</p>
            </div>
            <span className="shrink-0 font-semibold text-slate-700">£{order.total}</span>
          </div>

          {order.assigned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-light px-3 py-1 text-sm font-semibold text-slate-800">
              <span aria-hidden>👤</span> {order.assigned.name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              <span aria-hidden>⚠️</span> Unassigned
            </span>
          )}

          {order.customerNote && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <span className="font-semibold">Customer note: </span>
              {order.customerNote}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Products ({order.products.length})
            </h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {order.products.map((p, i) => (
                <li key={`${p.productId}-${i}`} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <span className="text-sm text-slate-900">{p.name}</span>
                    {p.cutOption && (
                      <span className="mt-0.5 block text-sm font-bold text-orange-600">{p.cutOption}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {order.saved && (
                      <span className={p.picked ? 'text-brand-green' : 'text-slate-300'}>
                        {p.picked ? '✓' : '—'}
                      </span>
                    )}
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <Link
              to={`/orders/${order.orderId}`}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              Open full page
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Admin quick-preview of a redo's contents — mirrors OrderPreviewModal. */
function RedoPreviewModal({ redoId, onClose }: { redoId: string; onClose: () => void }) {
  const { data: redo, isLoading, isError, error } = useRedo(redoId);

  return (
    <Modal onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-500">Loading redo…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {redo && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">#{redo.originalOrderNumber}</h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  🔁 Redo
                </span>
              </div>
              <p className="truncate text-sm text-slate-500">{redo.customerName || 'Unknown customer'}</p>
            </div>
          </div>

          {redo.assigned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-light px-3 py-1 text-sm font-semibold text-slate-800">
              <span aria-hidden>👤</span> {redo.assigned.name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              <span aria-hidden>⚠️</span> Unassigned
            </span>
          )}

          {redo.customerNote && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <span className="font-semibold">Customer note: </span>
              {redo.customerNote}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Products ({redo.products.length})
            </h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {redo.products.map((p, i) => (
                <li key={`${p.productId}-${i}`} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <span className="text-sm text-slate-900">{p.name}</span>
                    {p.cutOption && (
                      <span className="mt-0.5 block text-sm font-bold text-orange-600">{p.cutOption}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={p.picked ? 'text-brand-green' : 'text-slate-300'}>
                      {p.picked ? '✓' : '—'}
                    </span>
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <Link
              to={`/redos/${redo.id}`}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              Open full page
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
