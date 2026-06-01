import { Link, useSearchParams } from 'react-router-dom';
import type { StoreOrder } from '@shared';
import { useStoreSearch } from '../../hooks/useOrders';

/**
 * Global order search — pulls live from WooCommerce (order number or customer
 * name), available to every role. Reached from the Home quick-search (`/search?q=`).
 * Tapping a result opens the shared order detail.
 */
export default function SearchOrdersPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const { data: orders, isLoading, isError, error, isFetching } = useStoreSearch(q);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Search</h1>
        {q ? (
          <p className="text-sm text-slate-500">
            WooCommerce results for <span className="font-medium text-slate-700">"{q}"</span>
            {isFetching && <span className="text-slate-400"> · searching…</span>}
          </p>
        ) : (
          <p className="text-sm text-slate-500">Search by order number from the dashboard.</p>
        )}
      </header>

      {isLoading && <p className="text-sm text-slate-500">Searching the store…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && orders.length === 0 && q && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No order found with number "{q}".
        </div>
      )}

      {orders && orders.length > 0 && (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.orderId}>
              <ResultCard order={o} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultCard({ order }: { order: StoreOrder }) {
  const when = new Date(order.dateCreated);
  return (
    <Link
      to={`/orders/${order.orderId}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-green hover:bg-brand-green-light"
    >
      <div className="min-w-0">
        <span className="font-semibold text-slate-900">#{order.orderNumber}</span>
        <p className="truncate text-sm text-slate-600">{order.customerName || 'Unknown customer'}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {order.postcode || 'No postcode'} · {when.toLocaleDateString()}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-medium text-slate-700">£{order.total}</span>
        {order.alreadySaved && (
          <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-xs font-medium text-slate-700">
            In processing
          </span>
        )}
      </div>
    </Link>
  );
}
