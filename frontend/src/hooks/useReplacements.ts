import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as replacementsApi from '../api/replacements';
import { ApiError } from '../api/client';
import type { Replacement, ReplacementRequest } from '@shared';

/** Log a substitution on a product. Invalidates the live order detail. */
export function useLogReplacement(wooOrderId: number) {
  const qc = useQueryClient();
  return useMutation<Replacement, ApiError, ReplacementRequest>({
    mutationFn: replacementsApi.logReplacement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'detail-live', wooOrderId] });
    },
  });
}

/** Clear a logged substitution on a product. Invalidates the live order detail. */
export function useClearReplacement(wooOrderId: number) {
  const qc = useQueryClient();
  return useMutation<Replacement | null, ApiError, number>({
    mutationFn: (productId) => replacementsApi.clearReplacement(wooOrderId, productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'detail-live', wooOrderId] });
    },
  });
}
