import { useQuery } from '@tanstack/react-query';
import * as reportsApi from '../api/reports';
import { ApiError } from '../api/client';
import type {
  Replacement,
  Refund,
  OrderReportRow,
  RedoListItem,
  StaffPerformanceRow,
} from '@shared';

export function useReplacementReport(from: string, to: string) {
  return useQuery<Replacement[], ApiError>({
    queryKey: ['reports', 'replacements', from, to],
    queryFn: () => reportsApi.replacementReport(from, to),
    enabled: !!from && !!to,
  });
}

export function useRefundReport(from: string, to: string) {
  return useQuery<Refund[], ApiError>({
    queryKey: ['reports', 'refunds', from, to],
    queryFn: () => reportsApi.refundReport(from, to),
    enabled: !!from && !!to,
  });
}

export function useOrderReport(from: string, to: string) {
  return useQuery<OrderReportRow[], ApiError>({
    queryKey: ['reports', 'orders', from, to],
    queryFn: () => reportsApi.orderReport(from, to),
    enabled: !!from && !!to,
  });
}

export function useRedoReport(from: string, to: string) {
  return useQuery<RedoListItem[], ApiError>({
    queryKey: ['reports', 'redos', from, to],
    queryFn: () => reportsApi.redoReport(from, to),
    enabled: !!from && !!to,
  });
}

export function useStaffPerformance(from: string, to: string) {
  return useQuery<StaffPerformanceRow[], ApiError>({
    queryKey: ['reports', 'staff', from, to],
    queryFn: () => reportsApi.staffPerformance(from, to),
    enabled: !!from && !!to,
  });
}
