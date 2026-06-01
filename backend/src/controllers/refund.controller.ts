import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import * as refundService from '../services/refund.service.js';

type ItemParams = { id: string; productId: string };

function actor(req: Request) {
  const user = req.user as UserDoc;
  return {
    id: String(user._id),
    name: `${user.fname} ${user.lname}`.trim() || user.email,
    role: user.role,
  };
}

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await refundService.listRefunds());
}

export async function request(req: Request, res: Response): Promise<void> {
  // Body validated by refundRequestSchema in the route.
  const created = await refundService.requestRefund(req.body, actor(req));
  res.status(201).json(created);
}

export async function approve(req: Request<ItemParams>, res: Response): Promise<void> {
  const refund = await refundService.resolveItem(req.params.id, Number(req.params.productId), 'approved', actor(req));
  res.json(refund);
}

export async function reject(req: Request<ItemParams>, res: Response): Promise<void> {
  const refund = await refundService.resolveItem(req.params.id, Number(req.params.productId), 'rejected', actor(req));
  res.json(refund);
}

// Re-open a resolved refund — cancels an approval (or a rejection) back to pending.
export async function reopen(req: Request<ItemParams>, res: Response): Promise<void> {
  const refund = await refundService.resolveItem(req.params.id, Number(req.params.productId), 'pending', actor(req));
  res.json(refund);
}
