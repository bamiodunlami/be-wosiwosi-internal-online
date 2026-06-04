import { useMemo, useState } from 'react';
import type { OrderReportRow } from '@shared';
import { ReportFilters } from '../../components/reports/ReportFilters';
import { resolveRange, type RangePreset } from '../../lib/reportRange';
import { useOrderReport } from '../../hooks/useReports';

type SortKey = keyof Pick<
  OrderReportRow,
  'completedAt' | 'orderNumber' | 'customerName' | 'itemCount' | 'total' | 'packerName'
>;

const COLUMNS: { key: SortKey; label: string; align?: 'center' | 'right' }[] = [
  { key: 'completedAt', label: 'Completed' },
  { key: 'orderNumber', label: 'Order' },
  { key: 'customerName', label: 'Customer' },
  { key: 'itemCount', label: 'Items', align: 'center' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'packerName', label: 'Packer' },
];

const NUMERIC: SortKey[] = ['orderNumber', 'itemCount', 'total'];

/**
 * Order report — orders fulfilled (completed) in a date range. Filterable by date
 * and by the packer who fulfilled them. Supervisor+.
 */
export default function OrderReport() {
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staff, setStaff] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('completedAt');
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
  const { data, isLoading, isError, error } = useOrderReport(from, to);

  const staffOptions = useMemo(
    () => [...new Set((data ?? []).map((r) => r.packerName).filter(Boolean))].sort(),
    [data],
  );

  const sorted = useMemo(() => {
    const base = staff ? (data ?? []).filter((r) => r.packerName === staff) : (data ?? []);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const cmp = NUMERIC.includes(sortKey)
        ? (Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)
        : String(a[sortKey]).localeCompare(String(b[sortKey]));
      return cmp * dir;
    });
  }, [data, staff, sortKey, sortDir]);

  const total = sorted.reduce((sum, r) => sum + (Number(r.total) || 0), 0);

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
          <span className="font-semibold text-slate-700">{sorted.length}</span> order
          {sorted.length === 1 ? '' : 's'} fulfilled · total{' '}
          <span className="font-semibold text-slate-700">£{total.toFixed(2)}</span>
          {staff && <span> · {staff}</span>}
        </p>
      )}

      {data && sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No orders fulfilled in this range.
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
                    }`}
                  >
                    {c.label}
                    {sortKey === c.key && <span aria-hidden> {sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-2.5 text-slate-500">
                    {new Date(r.completedAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap p-2.5 font-medium text-slate-900">#{r.orderNumber}</td>
                  <td className="p-2.5 text-slate-700">{r.customerName || '—'}</td>
                  <td className="p-2.5 text-center font-semibold text-slate-900">{r.itemCount}</td>
                  <td className="whitespace-nowrap p-2.5 text-right text-slate-700">£{r.total}</td>
                  <td className="whitespace-nowrap p-2.5 text-slate-600">{r.packerName || 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
