/**
 * Notification DTO. Keep in sync with the frontend copy in
 * frontend/src/shared/types.ts.
 */
export type NotificationKind = 'note' | 'refund';

export interface Notification {
  id: string;
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  senderName: string;
  senderRole: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO date
}
