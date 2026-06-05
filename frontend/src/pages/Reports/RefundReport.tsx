import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReportFilters } from '../../components/reports/ReportFilters';
import { Pagination, usePaged } from '../../components/reports/Pagination';
import { resolveRange, type RangePreset } from '../../lib/reportRange';
import { useRefundReport } from '../../hooks/useReports';

interface Row {
  key: string;
  date: string;
  orderId: number;
  redoId?: string | null;
  orderNumber: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount: string;
  by: string;
}

type SortKey = keyof Pick<Row, 'date' | 'orderNumber' | 'productName' | 'quantity' | 'amount' | 'by'>;

const COLUMNS: { key: SortKey; label: string; align?: 'center' | 'right' }[] = [
  { key: 'date', label: 'Date' },
  { key: 'orderNumber', label: 'Order' },
  { key: 'productName', label: 'Product' },
  { key: 'quantity', label: 'Qty', align: 'center' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'by', label: 'By' },
];

// Columns sorted as numbers; the rest fall back to locale string compare.
const NUMERIC: SortKey[] = ['orderNumber', 'quantity', 'amount'];

/**
 * Refund report — APPROVED refunds in a date range (the report endpoint returns
 * approved only). Filterable by date and by the staff member who requested it.
 * Supervisor+.
 */
export default function RefundReport() {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staff, setStaff] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Memoised so `to` (= now) is stable per filter change (avoids refetch loops).
  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const { data, isLoading, isError, error } = useRefundReport(from, to);

  const rows = useMemo<Row[]>(() => {
    return (data ?? [])
      .flatMap((r) =>
        r.items.map((it) => ({
          key: `${r.id}-${it.productId}-${it.requestedAt}`,
          date: it.requestedAt,
          orderId: r.orderId,
          redoId: r.redoId,
          orderNumber: r.orderNumber,
          customerName: r.customerName,
          productName: it.productName,
          quantity: it.quantity,
          amount: it.amount,
          by: it.requestedByName,
        })),
      );
  }, [data]);

  const staffOptions = useMemo(
    () => [...new Set(rows.map((r) => r.by).filter(Boolean))].sort(),
    [rows],
  );

  const sorted = useMemo(() => {
    const base = staff ? rows.filter((r) => r.by === staff) : rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const cmp = NUMERIC.includes(sortKey)
        ? (Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)
        : String(a[sortKey]).localeCompare(String(b[sortKey]));
      return cmp * dir;
    });
  }, [rows, staff, sortKey, sortDir]);

  const total = sorted.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const { paged, page, pageCount, setPage } = usePaged(
    sorted,
    `${staff}|${sortKey}|${sortDir}|${from}|${to}`,
  );

  return (
    <div className="space-y-4">
      <ReportFilters
        preset={preset}
        onPreset={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustom={(f, t) => {
          setCustomFrom(f);
          setCustomTo(t);
        }}
        staff={staff}
        onStaff={setStaff}
        staffOptions={staffOptions}
      />

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {data && (
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{sorted.length}</span> approved refund
          {sorted.length === 1 ? '' : 's'} in range · total{' '}
          <span className="font-semibold text-slate-700">£{total.toFixed(2)}</span>
          {staff && <span> · {staff}</span>}
        </p>
      )}

      {data && sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No approved refunds in this range.
        </div>
      )}

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`cursor-pointer select-none p-2.5 hover:text-slate-600 ${
                      c.align === 'center' ? 'text-center' : c.align === 'right' ? 'text-right' : ''
                    } ${c.key === 'quantity' ? 'w-10' : ''}`}
                  >
                    {c.label}
                    {sortKey === c.key && <span aria-hidden> {sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="whitespace-nowrap p-2.5 text-slate-500">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap p-2.5">
                    <Link
                      to={r.redoId ? `/redos/${r.redoId}` : `/orders/${r.orderId}`}
                      className="font-medium text-brand-green hover:underline"
                    >
                      #{r.orderNumber}
                    </Link>
                    <span className="block text-xs text-slate-400">{r.customerName}</span>
                  </td>
                  <td className="p-2.5 text-slate-700">{r.productName}</td>
                  <td className="p-2.5 text-center font-semibold text-slate-900">{r.quantity}</td>
                  <td className="whitespace-nowrap p-2.5 text-right text-slate-700">£{r.amount}</td>
                  <td className="whitespace-nowrap p-2.5 text-slate-600">{r.by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} total={sorted.length} onPage={setPage} />
    </div>
  );
}
