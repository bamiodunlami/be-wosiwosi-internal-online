import { api } from './client';
import type { Refund, RefundRequest } from '@shared';

const BASE = '/api/v1/refunds';

/** Mark a product for refund (create/update the request). */
export function requestRefund(body: RefundRequest): Promise<Refund> {
  return api<Refund>(BASE, { method: 'POST', body });
}

/** Orders with at least one pending refund item (Admin+). */
export function listRefunds(): Promise<Refund[]> {
  return api<Refund[]>(BASE);
}

export function approveRefundItem(refundId: string, productId: number): Promise<Refund> {
  return api<Refund>(`${BASE}/${refundId}/items/${productId}/approve`, { method: 'POST' });
}

export function rejectRefundItem(refundId: string, productId: number): Promise<Refund> {
  return api<Refund>(`${BASE}/${refundId}/items/${productId}/reject`, { method: 'POST' });
}

/** Re-open a resolved refund — cancels an approval (or rejection) back to pending. */
export function reopenRefundItem(refundId: string, productId: number): Promise<Refund> {
  return api<Refund>(`${BASE}/${refundId}/items/${productId}/reopen`, { method: 'POST' });
}
