import { Notification, type NotificationDoc, type NotificationKind } from '../models/notification.model.js';
import { ALL_ROLES, hasAtLeast, type Role } from '../util/roles.js';
import type { Notification as NotificationDTO } from '../util/types/notification.js';

interface Actor {
  id: string;
  role: Role;
}

function toDTO(doc: NotificationDoc): NotificationDTO {
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    kind: doc.kind,
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

/** Create a notification (fire-and-forget from callers like the refund service). */
export async function notify(input: {
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  senderName: string;
  senderRole: string;
  recipientId?: string | null;
  recipientRole?: string | null;
  message: string;
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

/** Unread counts grouped by order — for the per-order bell on order cards. */
export async function unreadByOrder(user: Actor): Promise<{ orderId: number; count: number }[]> {
  const rows = await Notification.aggregate<{ _id: number; count: number }>([
    { $match: { ...recipientFilter(user), read: false } },
    { $group: { _id: '$orderId', count: { $sum: 1 } } },
  ]);
  return rows.map((r) => ({ orderId: r._id, count: r.count }));
}

/** All of this user's notifications for one order (for the open-order banner). */
export async function listForOrder(orderId: number, user: Actor): Promise<NotificationDTO[]> {
  const docs = await Notification.find({ ...recipientFilter(user), orderId }).sort({ createdAt: -1 });
  return docs.map(toDTO);
}

/** Mark every notification this user has on an order as read. */
export async function markOrderRead(orderId: number, user: Actor): Promise<void> {
  await Notification.updateMany(
    { ...recipientFilter(user), orderId, read: false },
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
