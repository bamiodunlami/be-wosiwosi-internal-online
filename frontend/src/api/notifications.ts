import { api } from './client';
import type { Notification, NotificationKind } from '@shared';

const BASE = '/api/v1/notifications';

/** Per-kind unread counts for the home dashboard card bells. */
export function notificationCounts(): Promise<{ note: number; refund: number }> {
  return api<{ note: number; refund: number }>(`${BASE}/counts`);
}

/** Unread counts grouped by order — for the per-order bell. */
export function unreadByOrder(): Promise<{ orderId: number; count: number }[]> {
  return api<{ orderId: number; count: number }[]>(`${BASE}/by-order`);
}

export function listNotifications(kind: NotificationKind): Promise<Notification[]> {
  return api<Notification[]>(`${BASE}?kind=${kind}`);
}

export function markKindRead(kind: NotificationKind): Promise<void> {
  return api<void>(`${BASE}/read-all?kind=${kind}`, { method: 'POST' });
}

/** This user's notifications on one order — for the open-order banner. */
export function orderNotifications(orderId: number): Promise<Notification[]> {
  return api<Notification[]>(`${BASE}/order/${orderId}`);
}

export function markOrderNotificationsRead(orderId: number): Promise<void> {
  return api<void>(`${BASE}/order/${orderId}/read`, { method: 'POST' });
}

/** Unread counts grouped by redo — for the per-redo bell. */
export function unreadByRedo(): Promise<{ redoId: string; count: number }[]> {
  return api<{ redoId: string; count: number }[]>(`${BASE}/by-redo`);
}

/** This user's notifications on one redo — for the open-redo banner. */
export function redoNotifications(redoId: string): Promise<Notification[]> {
  return api<Notification[]>(`${BASE}/redo/${redoId}`);
}

export function markRedoNotificationsRead(redoId: string): Promise<void> {
  return api<void>(`${BASE}/redo/${redoId}/read`, { method: 'POST' });
}
