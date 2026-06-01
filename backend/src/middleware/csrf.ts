import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lightweight CSRF defense for the cookie-session API. A state-changing request
 * must carry a custom `X-Requested-With` header, which a cross-site <form> or
 * other "simple" request cannot set without triggering a CORS preflight — and
 * preflight is gated by the origin allowlist. The SPA's fetch wrapper always
 * sends it. This complements SameSite (which is None in prod for the
 * cross-origin frontend and so can't be relied on alone).
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || req.get('X-Requested-With')) {
    next();
    return;
  }
  res.status(403).json({ error: 'Missing required X-Requested-With header' });
}
