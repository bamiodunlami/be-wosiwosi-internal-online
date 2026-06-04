import { api } from './client';
import type {
  Replacement,
  Refund,
  OrderReportRow,
  RedoListItem,
  StaffPerformanceRow,
} from '@shared';

/** Date-ranged replacement report (Supervisor+). `from`/`to` are ISO datetimes. */
export function replacementReport(from: string, to: string): Promise<Replacement[]> {
  const params = new URLSearchParams({ from, to });
  return api<Replacement[]>(`/api/v1/replacements/report?${params.toString()}`);
}

/** Date-ranged refund report (Supervisor+). */
export function refundReport(from: string, to: string): Promise<Refund[]> {
  const params = new URLSearchParams({ from, to });
  return api<Refund[]>(`/api/v1/refunds/report?${params.toString()}`);
}

/** Date-ranged completed-orders report (Supervisor+). */
export function orderReport(from: string, to: string): Promise<OrderReportRow[]> {
  const params = new URLSearchParams({ from, to });
  return api<OrderReportRow[]>(`/api/v1/orders/report?${params.toString()}`);
}

/** Date-ranged redo report (Supervisor+). */
export function redoReport(from: string, to: string): Promise<RedoListItem[]> {
  const params = new URLSearchParams({ from, to });
  return api<RedoListItem[]>(`/api/v1/redos/report?${params.toString()}`);
}

/** Date-ranged staff performance — per-packer completed counts (Supervisor+). */
export function staffPerformance(from: string, to: string): Promise<StaffPerformanceRow[]> {
  const params = new URLSearchParams({ from, to });
  return api<StaffPerformanceRow[]>(`/api/v1/orders/staff-performance?${params.toString()}`);
}
