import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as notificationsApi from '../api/notifications';
import { ApiError } from '../api/client';
import type { Notification, NotificationKind } from '@shared';

/** Per-kind unread counts (home Notification/Refund card bells). Polled. */
export function useNotificationCounts() {
  return useQuery<{ note: number; refund: number }, ApiError>({
    queryKey: ['notifications', 'counts'],
    queryFn: notificationsApi.notificationCounts,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** orderId → unread count, for the per-order bell on order cards. Polled. */
export function useUnreadByOrder() {
  return useQuery<Map<number, number>, ApiError>({
    queryKey: ['notifications', 'by-order'],
    queryFn: () =>
      notificationsApi.unreadByOrder().then((rows) => new Map(rows.map((r) => [r.orderId, r.count]))),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}

/** A list page of one kind (Notifications page = notes). */
export function useNotificationList(kind: NotificationKind) {
  return useQuery<Notification[], ApiError>({
    queryKey: ['notifications', 'list', kind],
    queryFn: () => notificationsApi.listNotifications(kind),
  });
}

export function useOrderNotifications(orderId: number, enabled = true) {
  return useQuery<Notification[], ApiError>({
    queryKey: ['notifications', 'order', orderId],
    queryFn: () => notificationsApi.orderNotifications(orderId),
    enabled: enabled && Number.isFinite(orderId) && orderId > 0,
  });
}

export function useMarkKindRead() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, NotificationKind>({
    mutationFn: notificationsApi.markKindRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkOrderRead() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, number>({
    mutationFn: notificationsApi.markOrderNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
