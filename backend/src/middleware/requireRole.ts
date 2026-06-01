import type { Request, Response, NextFunction } from 'express';
import { hasAtLeast, type Role } from '../util/roles.js';

/**
 * Allow request if user holds one of the listed roles OR a role that's
 * higher in the hierarchy (Packer ⊂ Supervisor ⊂ Super Admin).
 *
 * Example:
 *   router.post('/lock-system', requireAuth, requireRole('super-admin'), handler)
 *   router.get('/all-orders',  requireAuth, requireRole('supervisor'),  handler)  // also lets super-admin in
 */
export function requireRole(...allowed: Role[]) {
  if (allowed.length === 0) {
    throw new Error('requireRole called with no roles');
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as { role?: Role } | undefined;
    if (!user?.role) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const ok = allowed.some((min) => hasAtLeast(user.role!, min));
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
