import { PRESET_LABELS, type RangePreset } from '../../lib/reportRange';

/**
 * Shared report filter bar: a date-range preset (Today / This week / This month /
 * Custom) plus a staff selector. Controlled — the parent report owns the state and
 * does the fetching/filtering. `staffOptions` are derived from the report's own
 * results (so it works for every role without a global user list).
 */
export function ReportFilters({
  preset,
  onPreset,
  customFrom,
  customTo,
  onCustom,
  staff,
  onStaff,
  staffOptions,
}: {
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustom: (from: string, to: string) => void;
  staff: string;
  onStaff: (s: string) => void;
  staffOptions: string[];
}) {
  const presets: RangePreset[] = ['today', 'week', 'month', 'custom'];
  const date = 'rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPreset(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              preset === p
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label className="flex items-center gap-1.5">
            From
            <input type="date" value={customFrom} onChange={(e) => onCustom(e.target.value, customTo)} className={date} />
          </label>
          <label className="flex items-center gap-1.5">
            To
            <input type="date" value={customTo} onChange={(e) => onCustom(customFrom, e.target.value)} className={date} />
          </label>
        </div>
      )}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Staff</span>
        <select
          value={staff}
          onChange={(e) => onStaff(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green"
        >
          <option value="">All staff</option>
          {staffOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
