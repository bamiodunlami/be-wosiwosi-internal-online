import {
  Notification,
  type NotificationDoc,
  type NotificationKind,
  type NotificationTarget,
} from '../models/notification.model.js';
import { ALL_ROLES, hasAtLeast, type Role } from '../util/roles.js';
import { notificationBus, type NotificationEvent } from '../util/notificationBus.js';
import type { Notification as NotificationDTO } from '../util/types/notification.js';

interface Actor {
  id: string;
  role: Role;
}

/** Whether a live notification event is addressed to this user (SSE filtering). */
export function eventTargetsUser(evt: NotificationEvent, user: Actor): boolean {
  if (evt.recipientId && evt.recipientId === user.id) return true;
  if (evt.recipientRole && hasAtLeast(user.role, evt.recipientRole as Role)) return true;
  return false;
}

// Order-scoped reads exclude redo notes. `$ne: 'redoOrder'` (rather than
// `'order'`) also matches legacy docs created before targetType existed.
const ORDER_ONLY = { targetType: { $ne: 'redoOrder' as NotificationTarget } };

function toDTO(doc: NotificationDoc): NotificationDTO {
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    kind: doc.kind,
    targetType: doc.targetType,
    redoId: doc.redoId,
    senderName: doc.senderName,
    senderRole: doc.senderRole,
    message: doc.message,
    read: doc.read,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Mongo filter matching every notification addressed to this user. */
function recipientFilter(user: Actor) {
  // A user qualifies for any role group at or below their own rank.
  const roles = ALL_ROLES.filter((r) => hasAtLeast(user.role, r));
  return { $or: [{ recipientId: user.id }, { recipientRole: { $in: roles } }] };
}

/** Create a notification (fire-and-forget from callers like the refund/redo service). */
export async function notify(input: {
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  senderName: string;
  senderRole: string;
  recipientId?: string | null;
  recipientRole?: string | null;
  message: string;
  targetType?: NotificationTarget;
  redoId?: string | null;
}): Promise<void> {
  await Notification.create({
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    kind: input.kind,
    senderName: input.senderName,
    senderRole: input.senderRole,
    recipientId: input.recipientId ?? null,
    recipientRole: input.recipientRole ?? null,
    message: input.message,
    targetType: input.targetType ?? 'order',
    redoId: input.redoId ?? null,
  });
  // Push to any connected SSE clients addressed by this notification.
  notificationBus.emit('notification', {
    recipientId: input.recipientId ?? null,
    recipientRole: input.recipientRole ?? null,
  });
}

/** Unread counts per kind — for the home-dashboard Notification/Refund card bells. */
export async function countsByKind(user: Actor): Promise<{ note: number; refund: number }> {
  const rows = await Notification.aggregate<{ _id: NotificationKind; count: number }>([
    { $match: { ...recipientFilter(user), read: false } },
    { $group: { _id: '$kind', count: { $sum: 1 } } },
  ]);
  const counts = { note: 0, refund: 0 };
  for (const r of rows) if (r._id in counts) counts[r._id] = r.count;
  return counts;
}

/** Unread counts grouped by order — for the per-order bell on order cards (orders only). */
export async function unreadByOrder(user: Actor): Promise<{ orderId: number; count: number }[]> {
  const rows = await Notification.aggregate<{ _id: number; count: number }>([
    { $match: { ...recipientFilter(user), read: false, ...ORDER_ONLY } },
    { $group: { _id: '$orderId', count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ orderId: r._id, count: r.count }));
}

/** Unread counts grouped by redo — for the per-redo bell on redo cards. */
export async function unreadByRedo(user: Actor): Promise<{ redoId: string; count: number }[]> {
  const rows = await Notification.aggregate<{ _id: string; count: number }>([
    { $match: { ...recipientFilter(user), read: false, targetType: 'redoOrder' } },
    { $group: { _id: '$redoId', count: { $sum: 1 } } },
  ]);
  return rows.filter((r) => r._id).map((r) => ({ redoId: r._id, count: r.count }));
}

/** All of this user's notifications for one order (for the open-order banner). */
export async function listForOrder(orderId: number, user: Actor): Promise<NotificationDTO[]> {
  const docs = await Notification.find({ ...recipientFilter(user), orderId, ...ORDER_ONLY }).sort({
    createdAt: -1,
  });
  return docs.map(toDTO);
}

/** Mark every notification this user has on an order as read. */
export async function markOrderRead(orderId: number, user: Actor): Promise<void> {
  await Notification.updateMany(
    { ...recipientFilter(user), orderId, read: false, ...ORDER_ONLY },
    { $set: { read: true } },
  );
}

/** All of this user's notifications for one redo (for the open-redo banner). */
export async function listForRedo(redoId: string, user: Actor): Promise<NotificationDTO[]> {
  const docs = await Notification.find({
    ...recipientFilter(user),
    redoId,
    targetType: 'redoOrder',
  }).sort({ createdAt: -1 });
  return docs.map(toDTO);
}

/** Mark every notification this user has on a redo as read. */
export async function markRedoRead(redoId: string, user: Actor): Promise<void> {
  await Notification.updateMany(
    { ...recipientFilter(user), redoId, targetType: 'redoOrder', read: false },
    { $set: { read: true } },
  );
}

/** This user's notifications of a given kind, newest first (for a list page). */
export async function listForUser(user: Actor, kind: NotificationKind): Promise<NotificationDTO[]> {
  const docs = await Notification.find({ ...recipientFilter(user), kind })
    .sort({ createdAt: -1 })
    .limit(100);
  return docs.map(toDTO);
}

export async function markKindRead(user: Actor, kind: NotificationKind): Promise<void> {
  await Notification.updateMany(
    { ...recipientFilter(user), kind, read: false },
    { $set: { read: true } },
  );
}
