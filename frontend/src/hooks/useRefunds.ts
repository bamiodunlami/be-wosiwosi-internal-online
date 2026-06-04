import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as refundsApi from '../api/refunds';
import * as redosApi from '../api/redos';
import { ApiError } from '../api/client';
import type { Refund, RefundRequest, RedoDetail } from '@shared';

const refundsKey = ['refunds'] as const;

/** Pending refund requests — for the Refunds review page (Admin+). */
export function useRefunds() {
  return useQuery<Refund[], ApiError>({ queryKey: refundsKey, queryFn: refundsApi.listRefunds });
}

/** Request a refund on a product. Invalidates the live order detail + refunds list. */
export function useRequestRefund(wooOrderId: number) {
  const qc = useQueryClient();
  return useMutation<Refund, ApiError, RefundRequest>({
    mutationFn: refundsApi.requestRefund,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'detail-live', wooOrderId] });
      qc.invalidateQueries({ queryKey: refundsKey });
    },
  });
}

type RefundDecision = 'approved' | 'rejected' | 'pending';

export function useResolveRefund() {
  const qc = useQueryClient();
  return useMutation<
    Refund | RedoDetail,
    ApiError,
    { refundId: string; productId: number; decision: RefundDecision; redoId?: string | null }
  >({
    mutationFn: ({ refundId, productId, decision, redoId }) => {
      // Redo refunds resolve through the redo endpoint (which issues the real refund
      // immediately on approval); order refunds go through the refund endpoint.
      if (redoId) return redosApi.resolveRedoRefund(redoId, productId, decision);
      if (decision === 'approved') return refundsApi.approveRefundItem(refundId, productId);
      if (decision === 'rejected') return refundsApi.rejectRefundItem(refundId, productId);
      return refundsApi.reopenRefundItem(refundId, productId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refundsKey });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['redos'] });
    },
  });
}
