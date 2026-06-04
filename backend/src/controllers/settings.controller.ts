import type { Request, Response } from 'express';
import * as settingsService from '../services/settings.service.js';

export async function get(_req: Request, res: Response): Promise<void> {
  res.json(await settingsService.get());
}

export async function update(req: Request, res: Response): Promise<void> {
  // Body validated by settingsUpdateSchema in the route.
  res.json(await settingsService.update(req.body));
}
