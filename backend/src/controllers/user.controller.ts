import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import * as userService from '../services/user.service.js';

// Routes carry an :id path param (the user's ObjectId); type it so it isn't
// `string | undefined`.
type IdParams = { id: string };

export async function list(_req: Request, res: Response): Promise<void> {
  const users = await userService.listAll();
  res.json(users);
}

export async function create(req: Request, res: Response): Promise<void> {
  const created = await userService.create(req.body);
  res.status(201).json(created);
}

export async function update(req: Request<IdParams>, res: Response): Promise<void> {
  // Body validated by updateUserSchema in the route.
  const updated = await userService.update(req.params.id, req.body);
  res.json(updated);
}

export async function remove(req: Request<IdParams>, res: Response): Promise<void> {
  const actingUser = req.user as UserDoc;
  await userService.remove(req.params.id, { id: String(actingUser._id), role: actingUser.role });
  res.status(204).end();
}

export async function enable(req: Request<IdParams>, res: Response): Promise<void> {
  await userService.setActive(req.params.id, true);
  res.status(204).end();
}

export async function disable(req: Request<IdParams>, res: Response): Promise<void> {
  await userService.setActive(req.params.id, false);
  res.status(204).end();
}

export async function resetPassword(req: Request<IdParams>, res: Response): Promise<void> {
  // Body is validated by resetPasswordSchema in the route.
  const { newPassword } = req.body as { newPassword: string };
  await userService.resetPasswordTo(req.params.id, newPassword);
  res.status(204).end();
}
