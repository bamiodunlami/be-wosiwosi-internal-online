import rateLimit, { type Options } from 'express-rate-limit';
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
