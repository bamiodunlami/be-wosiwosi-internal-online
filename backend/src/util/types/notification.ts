/**
 * Notification DTO. Keep in sync with the frontend copy in
 * frontend/src/shared/types.ts.
 */
export type NotificationKind = 'note' | 'refund';
export type NotificationTarget = 'order' | 'redoOrder';

export interface Notification {
  id: string;
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  targetType: NotificationTarget; // 'redoOrder' notifications link to /redos/:redoId
  redoId: string | null;
  senderName: string;
  senderRole: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO date
}
