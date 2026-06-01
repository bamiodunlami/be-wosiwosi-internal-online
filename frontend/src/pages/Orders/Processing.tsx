import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasAtLeast, Roles, type Order } from '@shared';
import { useOrders, useOrderDetail } from '../../hooks/useOrders';
import { useCurrentUser } from '../../hooks/useAuth';
import { useUnreadByOrder } from '../../hooks/useNotifications';
import { Modal } from '../../components/ui/modal';
import { lineTotal } from '../../lib/money';
import { OrderBell } from '../../components/notifications/OrderBell';

/**
 * Processing — orders that have been sent for processing (status:false).
 * Role-scoped by the API: a Super Admin sees all (and assigns packers here), a
 * packer sees only their own assigned orders, a supervisor sees all assigned
 * orders. Tapping an order opens the shared detail page to work it. Admins get a
 * "Quick view" to preview an order's contents without leaving the queue.
 */
export default function ProcessingPage() {
  const { data: orders, isLoading, isError, error } = useOrders('processing');
  const { data: me } = useCurrentUser();
  const { data: unread } = useUnreadByOrder();
  const isManager = !!me && hasAtLeast(me.role, Roles.ADMIN);

  const [previewId, setPreviewId] = useState<number | null>(null);

  // Show the queue in ascending order number.
  const sorted = useMemo(() => {
    if (!orders) return orders;
    return [...orders].sort((a, b) => {
      const na = Number(a.orderNumber);
      const nb = Number(b.orderNumber);
      if (Number.isNaN(na) || Number.isNaN(nb)) return a.orderNumber.localeCompare(b.orderNumber);
      return na - nb;
    });
  }, [orders]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Processing</h1>
        <p className="text-sm text-slate-500">Orders currently being packed.</p>
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing in processing.
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <ul className="space-y-3">
          {sorted.map((order) => (
            <li key={order.id}>
              <ProcessingCard
                order={order}
                isManager={isManager}
                unreadCount={unread?.get(order.orderId) ?? 0}
                onPreview={() => setPreviewId(order.orderId)}
              />
            </li>
          ))}
        </ul>
      )}

      {previewId !== null && (
        <OrderPreviewModal orderId={previewId} onClose={() => setPreviewId(null)} />
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
