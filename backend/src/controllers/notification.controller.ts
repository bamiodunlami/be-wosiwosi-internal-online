import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import type { NotificationKind } from '../models/notification.model.js';
import * as notificationService from '../services/notification.service.js';
import { notificationBus, type NotificationEvent } from '../util/notificationBus.js';

function actor(req: Request) {
  const user = req.user as UserDoc;
  return { id: String(user._id), role: user.role };
}

/**
 * Live notification stream (SSE). Holds the connection open and pushes a tiny
 * `notification` event whenever one addressed to this user is created — the client
 * then refetches its notification queries. A periodic ping keeps the connection
 * alive through proxies; the listener is removed when the client disconnects.
 */
export function stream(req: Request, res: Response): void {
  const user = actor(req);
  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // don't let a proxy buffer the stream
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n'); // tell EventSource to reconnect after 5s on drop
  res.write(': connected\n\n');

  const onNotification = (evt: NotificationEvent) => {
    if (!res.writableEnded && notificationService.eventTargetsUser(evt, user)) {
      res.write('event: notification\ndata: 1\n\n');
    }
  };
  notificationBus.on('notification', onNotification);

  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    notificationBus.off('notification', onNotification);
    res.end();
  });
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

/** Unread counts grouped by redo — for the per-redo bell on redo cards. */
export async function byRedo(req: Request, res: Response): Promise<void> {
  res.json(await notificationService.unreadByRedo(actor(req)));
}

/** This user's notifications on one redo — for the open-redo banner. */
export async function forRedo(req: Request<{ redoId: string }>, res: Response): Promise<void> {
  res.json(await notificationService.listForRedo(req.params.redoId, actor(req)));
}

export async function markRedoRead(req: Request<{ redoId: string }>, res: Response): Promise<void> {
  await notificationService.markRedoRead(req.params.redoId, actor(req));
  res.status(204).end();
}
