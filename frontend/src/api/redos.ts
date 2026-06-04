import { api } from './client';
import type {
  RedoListItem,
  RedoDetail,
  RedoNote,
  CreateRedoRequest,
  RedoRefundRequest,
  RedoReplacementRequest,
  AssignRequest,
} from '@shared';

type RefundDecision = 'approved' | 'rejected' | 'pending';

const BASE = '/api/v1/redos';

export function listRedos(): Promise<RedoListItem[]> {
  return api<RedoListItem[]>(BASE);
}

export function getRedo(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}`);
}

export function createRedo(body: CreateRedoRequest): Promise<RedoDetail> {
  return api<RedoDetail>(BASE, { method: 'POST', body });
}

export function setRedoPicked(id: string, index: number, picked: boolean): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/products/${index}/pick`, { method: 'POST', body: { picked } });
}

export function setRedoDryPicked(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/dry-picked`, { method: 'POST' });
}

export function setRedoMeatPicked(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/meat-picked`, { method: 'POST' });
}

export function completeRedo(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/complete`, { method: 'POST' });
}

export function addRedoNote(id: string, message: string): Promise<RedoNote[]> {
  return api<RedoNote[]>(`${BASE}/${id}/notes`, { method: 'POST', body: { message } });
}

export function clearRedoNotes(id: string): Promise<RedoNote[]> {
  return api<RedoNote[]>(`${BASE}/${id}/notes`, { method: 'DELETE' });
}

export function assignRedo(id: string, body: AssignRequest): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/assign`, { method: 'POST', body });
}

export function toggleRedoLock(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/lock`, { method: 'POST' });
}

export function resetRedoWorker(id: string): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/reset`, { method: 'POST' });
}

export function requestRedoRefund(id: string, body: RedoRefundRequest): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/refunds`, { method: 'POST', body });
}

export function resolveRedoRefund(
  id: string,
  productId: number,
  decision: RefundDecision,
): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/refunds/${productId}/resolve`, {
    method: 'POST',
    body: { decision },
  });
}

export function logRedoReplacement(id: string, body: RedoReplacementRequest): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/replacements`, { method: 'POST', body });
}

export function clearRedoReplacement(id: string, productId: number): Promise<RedoDetail> {
  return api<RedoDetail>(`${BASE}/${id}/replacements/${productId}`, { method: 'DELETE' });
}

export function removeRedo(id: string): Promise<void> {
  return api<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
