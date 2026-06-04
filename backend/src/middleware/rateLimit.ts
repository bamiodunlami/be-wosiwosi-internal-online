import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../util/env.js';

/**
 * Brute-force protection for auth endpoints. Keyed on client IP (accurate
 * because app.ts sets `trust proxy`). Disabled under NODE_ENV=test so the
 * suite isn't throttled.
 *
 * The 429 body matches the app-wide `{ error }` shape so the frontend's single
 * fetch wrapper surfaces it like any other failure.
 */
function authLimiter(max: number, windowMs: number) {
  const opts: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false, // no X-RateLimit-* headers
    skip: () => env.NODE_ENV === 'test',
    message: { error: 'Too many attempts, please try again later.' },
  };
  return rateLimit(opts);
}

// Login: 10 attempts per IP per 15 minutes.
export const loginLimiter = authLimiter(10, 15 * 60 * 1000);

// Other sensitive auth actions (e.g. change-password): same budget.
export const sensitiveLimiter = authLimiter(10, 15 * 60 * 1000);

/**
 * Coarse, app-wide backstop against runaway/scripted abuse — NOT brute-force
 * protection (that's the tight auth limiters above). Deliberately GENEROUS so a
 * warehouse behind a single NAT (many staff sharing one egress IP, all polling)
 * never trips it; only pathological volume does. The live SSE stream is skipped, and
 * it's off under NODE_ENV=test. Raise `max` if a large shared-IP site sees 429s.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) =>
    env.NODE_ENV === 'test' || req.originalUrl.includes('/notifications/stream'),
  message: { error: 'Too many requests, please slow down.' },
});
