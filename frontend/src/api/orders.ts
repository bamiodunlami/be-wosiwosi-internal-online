import { api } from './client';
import type {
  Order,
  OrderDetail,
  OrderNote,
  OrderView,
  StoreOrder,
  AssignRequest,
  SaveRequest,
  SaveResult,
} from '@shared';

export interface StoreQuery {
  after?: string;
  before?: string;
  status?: string;
  search?: string;
}

const BASE = '/api/v1/orders';

export function listOrders(view: OrderView, q?: string): Promise<Order[]> {
  const params = new URLSearchParams({ view });
  if (q) params.set('q', q);
  return api<Order[]>(`${BASE}?${params.toString()}`);
}

export function getOrder(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}`);
}

/** Shared detail, keyed by WooCommerce order id, loaded live from the store. */
/** Live WooCommerce status of an order (lightweight) — to verify it's still workable. */
export function getOrderLiveStatus(orderId: number): Promise<{ status: string | null }> {
  return api<{ status: string | null }>(`${BASE}/store/${orderId}/status`);
}

export function getOrderDetail(orderId: number): Promise<OrderDetail> {
  return api<OrderDetail>(`${BASE}/store/${orderId}`);
}

/** Add a note to an order's thread; returns the updated thread. */
export function addNote(id: string, message: string): Promise<OrderNote[]> {
  return api<OrderNote[]>(`${BASE}/${id}/notes`, { method: 'POST', body: { message } });
}

/** Clear an order's whole note thread (Admin+); returns the now-empty thread. */
export function clearNotes(id: string): Promise<OrderNote[]> {
  return api<OrderNote[]>(`${BASE}/${id}/notes`, { method: 'DELETE' });
}

// ── Live store list + save-for-processing (Super Admin) ─────────────────────

/** Search live WooCommerce orders by term (order # or customer). All roles. */
export function searchStoreOrders(q: string): Promise<StoreOrder[]> {
  return api<StoreOrder[]>(`${BASE}/store/search?q=${encodeURIComponent(q)}`);
}

export function listStoreOrders(query: StoreQuery = {}): Promise<StoreOrder[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return api<StoreOrder[]>(`${BASE}/store${qs ? `?${qs}` : ''}`);
}

export function saveOrders(body: SaveRequest): Promise<SaveResult> {
  return api<SaveResult>(`${BASE}/save`, { method: 'POST', body });
}

/** Take a saved order back out of processing, by WooCommerce order id. */
export function removeStoreOrder(orderId: number): Promise<void> {
  return api<void>(`${BASE}/store/${orderId}`, { method: 'DELETE' });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function setPicked(id: string, index: number, picked: boolean): Promise<Order> {
  return api<Order>(`${BASE}/${id}/products/${index}/pick`, {
    method: 'POST',
    body: { picked },
  });
}

export function setDryPicked(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/dry-picked`, { method: 'POST' });
}

export function setMeatPicked(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/meat-picked`, { method: 'POST' });
}

export function completeOrder(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/complete`, { method: 'POST' });
}

export function assignOrder(id: string, body: AssignRequest): Promise<Order> {
  return api<Order>(`${BASE}/${id}/assign`, { method: 'POST', body });
}

export function toggleLock(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/lock`, { method: 'POST' });
}

export function resetWorker(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/reset`, { method: 'POST' });
}

export function toggleHide(id: string, index: number): Promise<Order> {
  return api<Order>(`${BASE}/${id}/products/${index}/hide`, { method: 'POST' });
}

export function undoComplete(id: string): Promise<Order> {
  return api<Order>(`${BASE}/${id}/undo`, { method: 'POST' });
}

export function removeOrder(id: string): Promise<void> {
  return api<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
