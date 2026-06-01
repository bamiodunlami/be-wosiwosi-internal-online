import type { Request, Response, NextFunction } from 'express';
import { Roles } from '../util/roles.js';

/**
 * When the system is locked (settings.lock == true), Packers get a 423 Locked
 * response. Supervisors and Super Admins are unaffected (see SPEC §7).
 *
 * Settings module isn't wired yet (lands in Slice 4). For now this is a stub
 * that always lets requests through — apply it now so the routes carry the
 * shape they'll have once settings exists.
 */
export function systemLockGuard(req: Request, res: Response, next: NextFunction): void {
  const role = (req.user as { role?: string } | undefined)?.role;
  if (role && role !== Roles.PACKER) return next();

  // TODO (Slice 4): read settings.lock from cache, bounce if true
  next();
}
