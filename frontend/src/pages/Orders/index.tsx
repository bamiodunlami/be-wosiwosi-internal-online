import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type OrderView } from '@shared';
import { useOrders } from '../../hooks/useOrders';
import { useRedos } from '../../hooks/useRedos';
import { OrderTable, type OrderTableRow } from '../../components/orders/OrderTable';

const TITLES: Record<OrderView, string> = {
  all: 'Orders',
  processing: 'Processing',
  completed: 'Completed',
};

function rowNum(n: string): number {
  const v = Number(n);
  return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
}

/**
 * The Orders / Completed lists share this component, driven by the `view` prop
 * wired in the router. Reads `?q=` so the Home quick-search lands here. The list
 * is the shared 3-column orders table; completed redos sit alongside completed
 * orders (same as Processing).
 */
export default function OrdersPage({ view = 'all', title }: { view?: OrderView; title?: string }) {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() || undefined;
  const { data: orders, isLoading, isError, error } = useOrders(view, q);
  const { data: redos } = useRedos();

  const rows = useMemo<OrderTableRow[]>(() => {
    const orderRows: OrderTableRow[] = (orders ?? []).map((o) => ({
      kind: 'order',
      key: `o-${o.id}`,
      order: o,
    }));
    // Completed redos sit alongside completed orders (Processing handles the open ones).
    const redoRows: OrderTableRow[] =
      view === 'completed'
        ? (redos ?? [])
            .filter((r) => r.status)
            .map((r) => ({ kind: 'redo', key: `r-${r.id}`, redo: r }))
        : [];
    const numOf = (row: OrderTableRow) =>
      rowNum(row.kind === 'order' ? row.order.orderNumber : row.redo.originalOrderNumber);
    return [...orderRows, ...redoRows].sort((a, b) => numOf(a) - numOf(b));
  }, [orders, redos, view]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{title ?? TITLES[view]}</h1>
        {q ? (
          <p className="text-sm text-slate-500">
            Results for <span className="font-medium text-slate-700">"{q}"</span>
          </p>
        ) : (
          view === 'all' && (
            <p className="text-sm text-slate-500">Search by order # or customer name above.</p>
          )
        )}
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading orders…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No orders here{q ? ' matching your search' : ''}.
        </div>
      )}

      {rows.length > 0 && <OrderTable rows={rows} />}
    </div>
  );
}
