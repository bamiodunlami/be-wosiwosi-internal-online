import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import * as orderService from '../services/order.service.js';
import type { ActingUser } from '../services/order.service.js';

/**
 * Thin HTTP wrappers. Validation runs in middleware, business logic in the
 * service; these just translate req → service call → JSON response.
 */

type IdParams = { id: string };
type IndexParams = { id: string; index: string };

function acting(req: Request): ActingUser {
  const user = req.user as UserDoc;
  return { id: String(user._id), role: user.role };
}

function notFound(res: Response): void {
  res.status(404).json({ error: 'Order not found' });
}

function parseIndex(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    const err = new Error('Invalid product index') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  return n;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response): Promise<void> {
  const view = req.query.view === 'processing' || req.query.view === 'completed'
    ? req.query.view
    : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const orders = await orderService.list({ view, q, user: acting(req) });
  res.json(orders);
}

export async function getOne(req: Request<IdParams>, res: Response): Promise<void> {
  const order = await orderService.getById(req.params.id, acting(req));
  if (!order) return notFound(res);
  res.json(order);
}

// ── WooCommerce pull (Super Admin) ─────────────────────────────────────────────

export async function storeOrders(req: Request, res: Response): Promise<void> {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const orders = await orderService.listStoreOrders({
    status: str(req.query.status),
    after: str(req.query.after),
    before: str(req.query.before),
    search: str(req.query.search),
  });
  res.json(orders);
}

/** GET /orders/store/search?q= — search live WooCommerce orders (all roles). */
export async function storeSearch(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) {
    res.json([]);
    return;
  }
  res.json(await orderService.searchStoreOrders(q));
}

export async function save(req: Request, res: Response): Promise<void> {
  const { orderIds } = req.body as { orderIds: number[] };
  const result = await orderService.saveForProcessing(orderIds);
  res.status(201).json(result);
}

// ── Shared order detail (live from WooCommerce by order id) ─────────────────────

export async function storeDetail(req: Request<{ orderId: string }>, res: Response): Promise<void> {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }
  const detail = await orderService.getStoreOrderDetail(orderId, acting(req));
  if (!detail) return notFound(res);
  res.json(detail);
}

/** GET /orders/store/:orderId/status — live WooCommerce status only (lightweight). */
export async function storeStatus(req: Request<{ orderId: string }>, res: Response): Promise<void> {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }
  res.json(await orderService.getLiveStatus(orderId, acting(req)));
}

/** DELETE /orders/store/:orderId — take a saved order back out of processing. */
export async function removeFromStore(req: Request<{ orderId: string }>, res: Response): Promise<void> {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'Invalid order id' });
    return;
  }
  await orderService.removeByOrderId(orderId);
  res.status(204).end();
}

// ── Packer / shared mutations ───────────────────────────────────────────────────

export async function pick(req: Request<IndexParams>, res: Response): Promise<void> {
  const { picked } = req.body as { picked: boolean };
  const order = await orderService.setPicked(
    req.params.id,
    parseIndex(req.params.index),
    picked,
    acting(req),
  );
  res.json(order);
}

export async function dryPicked(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.setStage(req.params.id, 'dry', acting(req)));
}

export async function meatPicked(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.setStage(req.params.id, 'meat', acting(req)));
}

export async function complete(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.complete(req.params.id, acting(req)));
}

export async function addNote(req: Request<IdParams>, res: Response): Promise<void> {
  const user = req.user as UserDoc;
  const { message } = req.body as { message: string };
  const author = {
    id: String(user._id),
    name: `${user.fname} ${user.lname}`.trim() || user.email,
    role: user.role,
  };
  const notes = await orderService.addNote(req.params.id, author, message);
  res.status(201).json(notes);
}

export async function clearNotes(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.clearNotes(req.params.id));
}

// ── Super Admin mutations ───────────────────────────────────────────────────────

export async function assign(req: Request<IdParams>, res: Response): Promise<void> {
  const { packerId } = req.body as { packerId: string };
  res.json(await orderService.assign(req.params.id, packerId));
}

export async function lock(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.toggleLock(req.params.id));
}

export async function reset(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.resetWorker(req.params.id));
}

export async function hide(req: Request<IndexParams>, res: Response): Promise<void> {
  res.json(await orderService.toggleHide(req.params.id, parseIndex(req.params.index)));
}

export async function undo(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await orderService.undo(req.params.id));
}

export async function remove(req: Request<IdParams>, res: Response): Promise<void> {
  await orderService.remove(req.params.id);
  res.status(204).end();
}
