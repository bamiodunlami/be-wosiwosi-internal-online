import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { type OrderView, type Order, type RedoListItem } from '@shared';
import { useOrders } from '../../hooks/useOrders';
import { useRedos } from '../../hooks/useRedos';
import { RedoCard } from '../../components/redos/RedoCard';

const TITLES: Record<OrderView, string> = {
  all: 'Orders',
  processing: 'Processing',
  completed: 'Completed',
};

/**
 * The Orders / Processing / Completed lists share this component, driven by the
 * `view` prop wired in the router. Reads `?q=` so the Home quick-search lands
 * here. Mobile-first: a single column of tappable order cards.
 */
export default function OrdersPage({ view = 'all', title }: { view?: OrderView; title?: string }) {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() || undefined;
  const { data: orders, isLoading, isError, error } = useOrders(view, q);
  // Completed redos sit alongside completed orders (same as Processing does).
  const { data: redos } = useRedos();
  const completedRedos = useMemo<RedoListItem[]>(
    () => (view === 'completed' ? (redos ?? []).filter((r) => r.status) : []),
    [view, redos],
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{title ?? TITLES[view]}</h1>
        {q ? (
          <p className="text-sm text-slate-500">
            Results for <span className="font-medium text-slate-700">"{q}"</span>
          </p>
        ) : (
          view === 'all' && <p className="text-sm text-slate-500">Search by order # or customer name above.</p>
        )}
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading orders…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && orders.length === 0 && completedRedos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No orders here{q ? ' matching your search' : ''}.
        </div>
      )}

      {((orders && orders.length > 0) || completedRedos.length > 0) && (
        <ul className="space-y-3">
          {orders?.map((order) => (
            <li key={`o-${order.id}`}>
              <OrderCard order={order} />
            </li>
          ))}
          {completedRedos.map((redo) => (
            <li key={`r-${redo.id}`}>
              <RedoCard redo={redo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const visible = order.products.filter((p) => !p.hidden);
  const picked = visible.filter((p) => p.picked).length;

  return (
    <Link
      to={`/orders/${order.orderId}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-green hover:bg-brand-green-light"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">#{order.orderNumber}</span>
          {order.lock && <span title="Locked" aria-label="Locked">🔒</span>}
        </div>
        <p className="truncate text-sm text-slate-600">{order.customerName || 'Unknown customer'}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {order.assigned ? `Packer: ${order.assigned.name}` : 'Unassigned'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge status={order.status} />
        <span className="text-xs text-slate-500">
          {picked}/{visible.length} picked
        </span>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: boolean }) {
  return status ? (
    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      Completed
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      In progress
    </span>
  );
}
