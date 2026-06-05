import 'express-async-errors';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/node';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import cors from 'cors';
import { env, corsOrigins } from './util/env.js';
import { logger } from './util/logger.js';
import { MONGO_URI } from './util/db.js';
import { passport } from './services/auth.service.js';
import { authRouter } from './routes/auth.route.js';
import { usersRouter } from './routes/user.route.js';
import { ordersRouter } from './routes/order.route.js';
import { refundsRouter } from './routes/refund.route.js';
import { replacementsRouter } from './routes/replacement.route.js';
import { redosRouter } from './routes/redo.route.js';
import { settingsRouter } from './routes/settings.route.js';
import { notificationsRouter } from './routes/notification.route.js';
import { requireCsrfHeader } from './middleware/csrf.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { systemLockGuard } from './middleware/systemLock.js';

export function createApp(): express.Express {
  const app = express();
  const isProd = env.NODE_ENV === 'production';

  // Behind Heroku's proxy: trust the first hop so req.secure / req.ip reflect the
  // real client. Required for `secure` session cookies to be set and for the
  // rate limiter to key on the true client IP rather than the proxy's.
  app.set('trust proxy', 1);

  // Security response headers (HSTS, X-Content-Type-Options, frameguard, etc.).
  // The API returns JSON only, so helmet's defaults need no asset-CSP tuning.
  app.use(helmet());

  // CORS: the frontend deploys to a separate origin and sends the session cookie,
  // so we allow credentials and reflect only allowlisted origins (env.CORS_ORIGIN).
  // An empty allowlist (local dev, same-origin via Vite proxy) means no cross-origin
  // browser is permitted — which is the safe default. This preflight + credentials
  // gating is also what protects state-changing JSON routes from CSRF: a foreign
  // origin can't complete the preflight, so the cookie-bearing request never lands.
  app.use(
    cors({
      origin: corsOrigins.length > 0 ? corsOrigins : false,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Sessions stored in Mongo so they survive dyno restarts.
  // Lives in the v2 database, fully isolated from legacy.
  app.use(
    session({
      secret: env.SESSION_KEY,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // The backend now serves the SPA same-origin (in.mywosiwosi.co.uk), where
        // a Lax cookie would be ideal. But the legacy Vercel frontend
        // (app.mywosiwosi.co.uk) still calls this API cross-origin and needs
        // SameSite=None. Keep None until Vercel is retired, then harden to Lax.
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 12, // 12h
      },
      store: MongoStore.create({
        mongoUrl: MONGO_URI,
        dbName: env.MONGO_DB,
        collectionName: 'sessions',
        ttl: 60 * 60 * 12,
      }),
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Healthcheck (used by uptime monitors)
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // CSRF defense on every API route — state-changing requests need the custom
  // X-Requested-With header (see middleware/csrf.ts).
  app.use('/api/v1', requireCsrfHeader);

  // Coarse global rate limit on the API as a runaway-abuse backstop (per IP). Tight
  // brute-force limits stay on the auth routes; this just caps egregious volume.
  app.use('/api/v1', apiLimiter);

  // API routes. Auth, user management and settings are exempt from the system lock
  // (a packer can't reach them anyway, and an admin must be able to unlock); the
  // lock guard then gates the work routes so a locked packer gets 423'd (SPEC §7).
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/settings', settingsRouter);
  app.use('/api/v1', systemLockGuard);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/refunds', refundsRouter);
  app.use('/api/v1/replacements', replacementsRouter);
  app.use('/api/v1/redos', redosRouter);
  app.use('/api/v1/notifications', notificationsRouter);

  // Serve the built React SPA from this same origin. The bundle lives at
  // frontend/dist (sibling project); __dirname is backend/{src,dist} at runtime,
  // so it resolves the same in dev (tsx) and the built slug.
  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  app.use(express.static(clientDist));

  // Unmatched API route → JSON 404 (must not fall through to the SPA shell).
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // SPA fallback: any other GET returns index.html so client-side routing,
  // deep-links and refreshes resolve. Sits after all API routes and static.
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });

  // Central error handler — every async route flows here via express-async-errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    // A malformed ObjectId in a route param (e.g. /users/xyz) surfaces as a
    // Mongoose CastError — answer 400, don't log it as an unhandled 500.
    if (err.name === 'CastError') {
      res.status(400).json({ error: 'Invalid id' });
      return;
    }
    const status = err.status ?? 500;
    if (status >= 500) {
      // Log the full error server-side, but never leak internals (stack, DB
      // messages) to the client — respond with a generic message. Only real server
      // errors (5xx) go to Sentry; expected 4xx (validation, 423, etc.) don't.
      logger.error({ err }, 'Unhandled error');
      Sentry.captureException(err);
      res.status(status).json({ error: 'Internal server error' });
      return;
    }
    res.status(status).json({ error: err.message || 'Request failed' });
  });

  return app;
}
