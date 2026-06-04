/**
 * Sentry error tracking — errors only (no performance tracing).
 *
 * This MUST be imported before anything else in the entry point (`server.ts`) so
 * the SDK can auto-instrument http/express. A no-op when `SENTRY_DSN` is unset, so
 * local dev needs no configuration. Keep this file's imports minimal — pulling in
 * instrumented modules (express, etc.) before `Sentry.init` runs would miss them.
 */
import * as Sentry from '@sentry/node';
import { env } from './util/env.js';
import { logger } from './util/logger.js';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0, // errors only — no performance/transaction sampling
    sendDefaultPii: false,
    // Captured errors are often axios failures from the Woo client, whose `config`
    // carries the WooCommerce key+secret in headers and customer PII in bodies.
    // captureException serialises those extra Error props, so scrub request/response
    // payloads and headers before anything leaves the process.
    beforeSend(event) {
      if (event.request) {
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
      }
      const extra = event.extra as Record<string, unknown> | undefined;
      if (extra) {
        for (const k of ['config', 'request', 'response', 'headers']) delete extra[k];
      }
      return event;
    },
  });
  logger.info({ environment: env.NODE_ENV }, 'Sentry error tracking enabled');
} else {
  logger.info('Sentry disabled (no SENTRY_DSN set)');
}
