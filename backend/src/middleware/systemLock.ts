import type { Request, Response, NextFunction } from 'express';
import { Roles } from '../util/roles.js';
import { isSystemLocked } from '../services/settings.service.js';
import { logger } from '../util/logger.js';

/**
 * When the system is locked (`settings.lock == true`), Packers get a **423 Locked**
 * response so the SPA bounces them to the lock page. Supervisors/Admins/Super Admins
 * (and unauthenticated requests, handled by requireAuth) are unaffected (SPEC §7).
 *
 * Fails open: if the lock can't be read (e.g. a DB blip) we let the request through
 * rather than freeze the whole floor.
 */
export async function systemLockGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = (req.user as { role?: string } | undefined)?.role;
  if (role !== Roles.PACKER) {
    next();
    return;
  }
  let locked = false;
  try {
    locked = await isSystemLocked();
  } catch (err) {
    logger.warn({ err }, 'System-lock check failed — allowing request (fail-open)');
  }
  if (locked) {
    res.status(423).json({ error: 'System locked', systemLocked: true });
    return;
  }
  next();
}
