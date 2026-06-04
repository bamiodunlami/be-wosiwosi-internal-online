import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import * as redoService from '../services/redo.service.js';

type IdParams = { id: string };
type IndexParams = { id: string; index: string };

function actor(req: Request) {
  const user = req.user as UserDoc;
  return {
    id: String(user._id),
    name: `${user.fname} ${user.lname}`.trim() || user.email,
    role: user.role,
  };
}

function notFound(res: Response): void {
  res.status(404).json({ error: 'Redo not found' });
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

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await redoService.list(actor(req)));
}

export async function getOne(req: Request<IdParams>, res: Response): Promise<void> {
  const redo = await redoService.getById(req.params.id, actor(req));
  if (!redo) return notFound(res);
  res.json(redo);
}

/** GET /redos/report?from=&to= — the date-ranged redo report (Supervisor+). */
export async function report(req: Request, res: Response): Promise<void> {
  const parse = (v: unknown): Date | undefined => {
    if (typeof v !== 'string' || !v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  res.json(await redoService.reportInRange({ from: parse(req.query.from), to: parse(req.query.to) }));
}

export async function create(req: Request, res: Response): Promise<void> {
  // Body validated by createRedoSchema in the route.
  const redo = await redoService.createRedo(req.body, actor(req));
  res.status(201).json(redo);
}

export async function pick(req: Request<IndexParams>, res: Response): Promise<void> {
  const { picked } = req.body as { picked: boolean };
  res.json(await redoService.setPicked(req.params.id, parseIndex(req.params.index), picked, actor(req)));
}

export async function dryPicked(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.setStage(req.params.id, 'dry', actor(req)));
}

export async function meatPicked(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.setStage(req.params.id, 'meat', actor(req)));
}

export async function complete(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.complete(req.params.id, actor(req)));
}

export async function addNote(req: Request<IdParams>, res: Response): Promise<void> {
  const { message } = req.body as { message: string };
  res.status(201).json(await redoService.addNote(req.params.id, actor(req), message));
}

type ProductParams = { id: string; productId: string };

function parseProductId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error('Invalid product id') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  return n;
}

export async function requestRefund(req: Request<IdParams>, res: Response): Promise<void> {
  res.status(201).json(await redoService.requestRefund(req.params.id, req.body, actor(req)));
}

export async function resolveRefund(req: Request<ProductParams>, res: Response): Promise<void> {
  const { decision } = req.body as { decision: redoService.RedoRefundDecision };
  res.json(
    await redoService.resolveRefund(req.params.id, parseProductId(req.params.productId), decision, actor(req)),
  );
}

export async function logReplacement(req: Request<IdParams>, res: Response): Promise<void> {
  res.status(201).json(await redoService.logReplacement(req.params.id, req.body, actor(req)));
}

export async function clearReplacement(req: Request<ProductParams>, res: Response): Promise<void> {
  res.json(
    await redoService.clearReplacement(req.params.id, parseProductId(req.params.productId), actor(req)),
  );
}

export async function remove(req: Request<IdParams>, res: Response): Promise<void> {
  await redoService.remove(req.params.id);
  res.status(204).end();
}

export async function clearNotes(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.clearNotes(req.params.id, actor(req)));
}

export async function assign(req: Request<IdParams>, res: Response): Promise<void> {
  const { packerId } = req.body as { packerId: string };
  res.json(await redoService.assign(req.params.id, packerId, actor(req)));
}

export async function lock(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.toggleLock(req.params.id, actor(req)));
}

export async function reset(req: Request<IdParams>, res: Response): Promise<void> {
  res.json(await redoService.resetWorker(req.params.id, actor(req)));
}
