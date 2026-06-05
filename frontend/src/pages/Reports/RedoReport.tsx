import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RedoListItem, RedoReason } from '@shared';
import { REDO_REASONS } from '@shared';
import { ReportFilters } from '../../components/reports/ReportFilters';
import { Pagination, usePaged } from '../../components/reports/Pagination';
import { resolveRange, type RangePreset } from '../../lib/reportRange';
import { REASON_LABELS } from '../../lib/redo';
import { useRedoReport } from '../../hooks/useReports';
import { firstName } from '../../lib/staff';

type SortKey = keyof Pick<
  RedoListItem,
  'createdAt' | 'originalOrderNumber' | 'reason' | 'customerName' | 'productCount' | 'status'
>;

const COLUMNS: { key: SortKey; label: string; align?: 'center' }[] = [
  { key: 'createdAt', label: 'Raised' },
  { key: 'originalOrderNumber', label: 'Order' },
  { key: 'reason', label: 'Reason' },
  { key: 'customerName', label: 'Customer' },
  { key: 'productCount', label: 'Items', align: 'center' },
  { key: 'status', label: 'Status' },
];

const NUMERIC: SortKey[] = ['originalOrderNumber', 'productCount'];

/**
 * Redo report — redos raised in a date range, with a by-reason breakdown.
 * Filterable by date and by the assigned packer. Supervisor+.
 */
export default function RedoReport() {
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staff, setStaff] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
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
  const { data, isLoading, isError, error } = useRedoReport(from, to);

  const staffOptions = useMemo(
    () => [...new Set((data ?? []).map((r) => r.assigned?.name).filter((n): n is string => !!n))].sort(),
    [data],
  );

  const sorted = useMemo(() => {
    const base = staff ? (data ?? []).filter((r) => r.assigned?.name === staff) : (data ?? []);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const cmp = NUMERIC.includes(sortKey)
        ? (Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0)
        : String(a[sortKey]).localeCompare(String(b[sortKey]));
      return cmp * dir;
    });
  }, [data, staff, sortKey, sortDir]);

  // By-reason breakdown over the filtered set (the SPEC §9 "redos by reason" view).
  const byReason = useMemo(() => {
    const counts = Object.fromEntries(REDO_REASONS.map((r) => [r, 0])) as Record<RedoReason, number>;
    for (const r of sorted) counts[r.reason] += 1;
    return REDO_REASONS.filter((r) => counts[r] > 0).map((r) => ({ reason: r, count: counts[r] }));
  }, [sorted]);

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
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>
            <span className="font-semibold text-slate-700">{sorted.length}</span> redo
            {sorted.length === 1 ? '' : 's'}
            {staff && <span> · {staff}</span>}
          </span>
          {byReason.map((b) => (
            <span key={b.reason} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {REASON_LABELS[b.reason]}: {b.count}
            </span>
          ))}
        </div>
      )}

      {data && sorted.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No redos in this range.
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
                <th className="p-2.5">Packer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-2.5 text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap p-2.5 font-medium">
                    <Link to={`/redos/${r.id}`} className="text-brand-green hover:underline">
                      #{r.originalOrderNumber}
                    </Link>
                  </td>
                  <td className="p-2.5 text-slate-700">{REASON_LABELS[r.reason]}</td>
                  <td className="p-2.5 text-slate-700">{r.customerName || '—'}</td>
                  <td className="p-2.5 text-center font-semibold text-slate-900">{r.productCount}</td>
                  <td className="p-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status ? 'bg-brand-green-light text-brand-green' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {r.status ? 'Completed' : 'Pending'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-2.5 text-slate-600">{r.assigned?.name ? firstName(r.assigned.name) : 'Unassigned'}</td>
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
