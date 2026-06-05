import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { hasAtLeast, Roles } from '@shared';
import { useOrders } from '../../hooks/useOrders';
import { useRedos } from '../../hooks/useRedos';
import { useCurrentUser } from '../../hooks/useAuth';
import { firstName } from '../../lib/staff';
import { OrderTable, type OrderTableRow } from '../../components/orders/OrderTable';
import { BoxIcon, SnowflakeIcon } from '../../components/ui/icons';

function rowNum(n: string): number {
  const v = Number(n);
  return Number.isNaN(v) ? Number.POSITIVE_INFINITY : v;
}

/**
 * Processing — orders that have been sent for processing (status:false).
 * Role-scoped by the API: a Super Admin sees all (and assigns packers here), a
 * packer sees only their own assigned orders, a supervisor sees all assigned
 * orders. Tapping an order opens the shared detail page to work it; Quick view
 * previews its contents without leaving the queue.
 */
export default function ProcessingPage() {
  const { data: orders, isLoading, isError, error } = useOrders('processing');
  const { data: redos } = useRedos();
  const { data: me } = useCurrentUser();
  // The dry/frozen pick-list buttons: supervisors and up always; a packer only
  // when they actually have an order assigned (their list is non-empty).
  const showPickLists =
    (!!me && hasAtLeast(me.role, Roles.SUPERVISOR)) || (orders?.length ?? 0) > 0;
  // Supervisors+ see every assigned order, so the per-packer breakdown is meaningful
  // for them; a packer only sees their own queue (the total count is enough).
  const isSupervisor = !!me && hasAtLeast(me.role, Roles.SUPERVISOR);

  // Merge in-progress orders and pending redos into one queue, ascending by number.
  const rows = useMemo<OrderTableRow[]>(() => {
    const orderRows: OrderTableRow[] = (orders ?? []).map((o) => ({
      kind: 'order',
      key: `o-${o.id}`,
      order: o,
    }));
    const redoRows: OrderTableRow[] = (redos ?? [])
      .filter((r) => !r.status)
      .map((r) => ({ kind: 'redo', key: `r-${r.id}`, redo: r }));
    const numOf = (row: OrderTableRow) =>
      rowNum(row.kind === 'order' ? row.order.orderNumber : row.redo.originalOrderNumber);
    return [...orderRows, ...redoRows].sort((a, b) => numOf(a) - numOf(b));
  }, [orders, redos]);

  // How many orders each packer is carrying (orders + redos), plus the unassigned
  // count, for the summary at the top.
  const summary = useMemo(() => {
    const byPacker = new Map<string, number>();
    let unassigned = 0;
    for (const row of rows) {
      const assigned = row.kind === 'order' ? row.order.assigned : row.redo.assigned;
      if (assigned?.name) byPacker.set(assigned.name, (byPacker.get(assigned.name) ?? 0) + 1);
      else unassigned += 1;
    }
    return { packers: [...byPacker.entries()].sort((a, b) => b[1] - a[1]), unassigned };
  }, [rows]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Processing</h1>
        <p className="text-sm text-slate-500">Orders currently being packed.</p>
      </header>

      {rows.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            {rows.length} {rows.length === 1 ? 'order' : 'orders'} to process
          </p>
          {isSupervisor && (summary.packers.length > 0 || summary.unassigned > 0) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {summary.packers.map(([name, n]) => (
                <span key={name}>
                  {firstName(name)} <span className="font-semibold text-slate-900">{n}</span>
                </span>
              ))}
              {summary.unassigned > 0 && (
                <span className="text-amber-700">
                  Unassigned <span className="font-semibold">{summary.unassigned}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {showPickLists && (
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/processing/products/dry"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <BoxIcon className="h-4 w-4" /> All dry
          </Link>
          <Link
            to="/processing/products/frozen"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <SnowflakeIcon className="h-4 w-4" /> All frozen
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

      {rows.length > 0 && <OrderTable rows={rows} showQuickView={false} />}
    </div>
  );
}
