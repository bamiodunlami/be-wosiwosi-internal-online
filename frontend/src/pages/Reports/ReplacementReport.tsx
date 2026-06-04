import { useMemo, useState } from 'react';
import { ReportFilters } from '../../components/reports/ReportFilters';
import { resolveRange, type RangePreset } from '../../lib/reportRange';
import { useReplacementReport } from '../../hooks/useReports';

interface Row {
  key: string;
  date: string;
  orderNumber: string;
  customerName: string;
  originalProduct: string;
  originalPrice: string;
  replacementProduct: string;
  quantity: number;
  note: string;
  by: string;
}

/**
 * Replacement report — every logged substitution in a date range (SPEC §2: the
 * replacement records are reference data). Filterable by date and by the staff
 * member who logged it. Supervisor+ only (gated server-side + by the route).
 */
export default function ReplacementReport() {
  const [preset, setPreset] = useState<RangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [staff, setStaff] = useState('');

  // Memoise so `to` (= now) is fixed per filter change, not recomputed every
  // render — otherwise the query key changes constantly and refetches forever.
  const { from, to } = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );
  const { data, isLoading, isError, error } = useReplacementReport(from, to);

  // Flatten the per-order docs into one row per substituted product.
  const rows = useMemo<Row[]>(() => {
    return (data ?? [])
      .flatMap((r) =>
        r.items.map((it) => ({
          key: `${r.id}-${it.productId}-${it.replacedAt}`,
          date: it.replacedAt,
          orderNumber: r.orderNumber,
          customerName: r.customerName,
          originalProduct: it.originalProduct,
          originalPrice: it.originalPrice,
          replacementProduct: it.replacementProduct,
          quantity: it.quantity,
          note: it.note,
          by: it.replacedByName,
        })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data]);

  const staffOptions = useMemo(
    () => [...new Set(rows.map((r) => r.by).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = staff ? rows.filter((r) => r.by === staff) : rows;

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
          <span className="font-semibold text-slate-700">{filtered.length}</span> replacement
          {filtered.length === 1 ? '' : 's'} in range
          {staff && <span> · {staff}</span>}
        </p>
      )}

      {data && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No replacements logged in this range.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="p-2.5">Date</th>
                <th className="p-2.5">Order</th>
                <th className="p-2.5">Original</th>
                <th className="p-2.5">Replaced with</th>
                <th className="w-10 p-2.5 text-center">Qty</th>
                <th className="p-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="whitespace-nowrap p-2.5 text-slate-500">
                    {new Date(r.date).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap p-2.5">
                    <span className="font-medium text-slate-900">#{r.orderNumber}</span>
                    <span className="block text-xs text-slate-400">{r.customerName}</span>
                  </td>
                  <td className="p-2.5 text-slate-700">
                    {r.originalProduct}
                    {r.originalPrice && <span className="block text-xs text-slate-400">£{r.originalPrice}</span>}
                  </td>
                  <td className="p-2.5 text-slate-700">
                    {r.replacementProduct}
                    {r.note && <span className="block text-xs text-slate-400">{r.note}</span>}
                  </td>
                  <td className="p-2.5 text-center font-semibold text-slate-900">{r.quantity}</td>
                  <td className="whitespace-nowrap p-2.5 text-slate-600">{r.by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
