import { api } from './client';
import type { Replacement, ReplacementRequest } from '@shared';

const BASE = '/api/v1/replacements';

/** Log (or update) a substitution on a product. */
export function logReplacement(body: ReplacementRequest): Promise<Replacement> {
  return api<Replacement>(BASE, { method: 'POST', body });
}

/** Clear a logged substitution on a product. */
export function clearReplacement(orderId: number, productId: number): Promise<Replacement | null> {
  return api<Replacement | null>(`${BASE}/${orderId}/items/${productId}`, { method: 'DELETE' });
}
