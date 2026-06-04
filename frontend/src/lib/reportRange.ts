export type RangePreset = 'today' | 'week' | 'month' | 'custom';

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  custom: 'Custom',
};

/**
 * Resolve a preset (or custom YYYY-MM-DD strings) to an ISO from/to range used by
 * the report endpoints. Shared by every report's filter bar.
 */
export function resolveRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { from: string; to: string } {
  const now = new Date();
  if (preset === 'custom') {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(0);
    const to = customTo ? new Date(`${customTo}T23:59:59`) : now;
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const start = new Date(now);
  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (preset === 'week') {
    const day = (now.getDay() + 6) % 7; // Monday = 0
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { from: start.toISOString(), to: now.toISOString() };
}
