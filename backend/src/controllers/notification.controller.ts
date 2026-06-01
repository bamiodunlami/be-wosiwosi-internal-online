import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import type { NotificationKind } from '../models/notification.model.js';
import * as notificationService from '../services/notification.service.js';

function actor(req: Request) {
  const user = req.user as UserDoc;
  return { id: String(user._id), role: user.role };
}

function parseKind(raw: unknown): NotificationKind {
  return raw === 'refund' ? 'refund' : 'note';
}

/** Per-kind unread counts for the home dashboard card bells. */
export async function counts(req: Request, res: Response): Promise<void> {
  res.json(await notificationService.countsByKind(actor(req)));
}

/** Unread counts grouped by order — for the per-order bells. */
export async function byOrder(req: Request, res: Response): Promise<void> {
  res.json(await notificationService.unreadByOrder(actor(req)));
}

/** A list page of one kind (e.g. the Notifications page = notes). */
export async function list(req: Request, res: Response): Promise<void> {
  res.json(await notificationService.listForUser(actor(req), parseKind(req.query.kind)));
}

export async function markKindRead(req: Request, res: Response): Promise<void> {
  await notificationService.markKindRead(actor(req), parseKind(req.query.kind));
  res.status(204).end();
}

/** This user's notifications on one order — for the open-order banner. */
export async function forOrder(req: Request<{ orderId: string }>, res: Response): Promise<void> {
  res.json(await notificationService.listForOrder(Number(req.params.orderId), actor(req)));
}

export async function markOrderRead(req: Request<{ orderId: string }>, res: Response): Promise<void> {
  await notificationService.markOrderRead(Number(req.params.orderId), actor(req));
  res.status(204).end();
}
