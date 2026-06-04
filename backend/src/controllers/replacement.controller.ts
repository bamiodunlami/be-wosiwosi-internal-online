import type { Request, Response } from 'express';
import type { UserDoc } from '../models/user.model.js';
import * as replacementService from '../services/replacement.service.js';

function actor(req: Request) {
  const user = req.user as UserDoc;
  return {
    id: String(user._id),
    name: `${user.fname} ${user.lname}`.trim() || user.email,
    role: user.role,
  };
}

export async function log(req: Request, res: Response): Promise<void> {
  // Body validated by replacementRequestSchema in the route.
  const created = await replacementService.logReplacement(req.body, actor(req));
  res.status(201).json(created);
}

export async function clear(
  req: Request<{ orderId: string; productId: string }>,
  res: Response,
): Promise<void> {
  const result = await replacementService.clearReplacement(
    Number(req.params.orderId),
    Number(req.params.productId),
    actor(req),
  );
  res.json(result);
}

/** GET /replacements/report?from=&to= — the date-ranged replacement report (Supervisor+). */
export async function report(req: Request, res: Response): Promise<void> {
  const parse = (v: unknown): Date | undefined => {
    if (typeof v !== 'string' || !v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  res.json(await replacementService.listReplacements({ from: parse(req.query.from), to: parse(req.query.to) }));
}
