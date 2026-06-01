import type { Request, Response, NextFunction } from 'express';

/**
 * Block unauthenticated requests. Always pair with requireRole for role enforcement.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}
