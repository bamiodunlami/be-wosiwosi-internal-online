import mongoose, { Schema, type Document } from 'mongoose';

/**
 * An order-scoped notification (SPEC §6). Routed to either a specific user
 * (`recipientId`) or a role group (`recipientRole` — a user qualifies when their
 * role is at least that rank, so 'admin' reaches admins + super-admins). System
 * events (e.g. refund decisions) create these too. The 22:00 cron clears them
 * (a later slice); the inline order note thread is the durable record.
 */

export type NotificationKind = 'note' | 'refund';
export type NotificationTarget = 'order' | 'redoOrder';

export interface NotificationDoc extends Document {
  orderId: number; // for redoOrder notes this is the original order id (display only)
  orderNumber: string;
  kind: NotificationKind; // feeds the matching home-dashboard card's bell
  // What the notification is about. Order-scoped bells filter to 'order'; redo
  // bells/banners use 'redoOrder' + redoId (SPEC §6/§9).
  targetType: NotificationTarget;
  redoId: string | null; // the redo _id when targetType is 'redoOrder'
  senderName: string;
  senderRole: string;
  recipientId: string | null; // a specific user id, or null for a role group
  recipientRole: string | null; // a role group, or null for a specific user
  message: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<NotificationDoc>(
  {
    orderId: { type: Number, required: true, index: true },
    orderNumber: { type: String, default: '' },
    kind: { type: String, enum: ['note', 'refund'], default: 'note', index: true },
    targetType: { type: String, enum: ['order', 'redoOrder'], default: 'order', index: true },
    redoId: { type: String, default: null, index: true },
    senderName: { type: String, default: '' },
    senderRole: { type: String, default: '' },
    recipientId: { type: String, default: null, index: true },
    recipientRole: { type: String, default: null, index: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { collection: 'notifications', timestamps: true },
);

export const Notification = mongoose.model<NotificationDoc>('Notification', notificationSchema);
