import { useMemo, useState } from 'react';
import type { StaffPerformanceRow } from '@shared';
import { ReportFilters } from '../../components/reports/ReportFilters';
import { resolveRange, type RangePreset } from '../../lib/reportRange';
import { useStaffPerformance } from '../../hooks/useReports';

type SortKey = 'packerName' | 'ordersCompleted' | 'redosCompleted' | 'total';

const COLUMNS: { key: SortKey; label: string; align?: 'center' }[] = [
  { key: 'packerName', label: 'Packer' },
  { key: 'ordersCompleted', label: 'Orders', align: 'center' },
  { key: 'redosCompleted', label: 'Redos', align: 'center' },
  { key: 'total', label: 'Total', align: 'center' },
];

const rowTotal = (r: StaffPerformanceRow) => r.ordersCompleted + r.redosCompleted;

/**
 * Staff performance (SPEC §9) — per-packer counts of orders completed and redos
 * completed in a date range. Visible to Supervisor and Super Admin.
 */
export default function StaffReport() {
  const [preset, setPreset] = useState<RangePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staff, setStaff] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ordersCompleted');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  // Memoised so `to` (= now) is stable per filter change (avoids refetch loops).
  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const { data, isLoading, isError, error } = useStaffPerformance(from, to);

  const staffOptions = useMemo(
    () => [...new Set((data ?? []).map((r) => r.packerName).filter(Boolean))].sort(),
    [data],
  );

  const sorted = useMemo(() => {
    const base = staff ? (data ?? []).filter((r) => r.packerName === staff) : (data ?? []);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const cmp =
        sortKey === 'packerName'
          ? a.packerName.localeCompare(b.packerName)
          : sortKey === 'total'
            ? rowTotal(a) - rowTotal(b)
            : a[sortKey] - b[sortKey];
      return cmp * dir;
    });
  }, [data, staff, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      orders: sorted.reduce((n, r) => n + r.ordersCompleted, 0),
      redos: sorted.reduce((n, r) => n + r.redosCompleted, 0),
    }),
    [sorted],
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

      {data && sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No completed work in this range.
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
                      c.align === 'center' ? 'text-center' : ''
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
                <tr key={r.packerId}>
                  <td className="p-2.5 font-medium text-slate-900">{r.packerName || '—'}</td>
                  <td className="p-2.5 text-center text-slate-700">{r.ordersCompleted}</td>
                  <td className="p-2.5 text-center text-slate-700">{r.redosCompleted}</td>
                  <td className="p-2.5 text-center font-semibold text-slate-900">{rowTotal(r)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 text-slate-600">
              <tr>
                <td className="p-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Total</td>
                <td className="p-2.5 text-center font-semibold text-slate-900">{totals.orders}</td>
                <td className="p-2.5 text-center font-semibold text-slate-900">{totals.redos}</td>
                <td className="p-2.5 text-center font-semibold text-slate-900">
                  {totals.orders + totals.redos}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
