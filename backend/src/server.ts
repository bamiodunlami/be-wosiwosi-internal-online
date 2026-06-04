import { env } from './util/env.js';
import { connectDb } from './util/db.js';
import { logger } from './util/logger.js';
import { createApp } from './app.js';
import { scheduleArchiveCron } from './jobs/archive.job.js';

async function main() {
  await connectDb();
  const app = createApp();

  // Register the nightly archival cron (production only). Schedules timers; runs
  // nothing now — so this is not an on-boot side effect.
  scheduleArchiveCron();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  // Graceful shutdown — give in-flight requests a chance to finish
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Process-level safety nets for errors that escape request handlers (e.g. a stray
  // rejection in a timer or cron stage). A rejection is logged and the process keeps
  // running; an uncaught exception leaves the process in an unknown state, so we log
  // and exit — the platform (Heroku) restarts the dyno clean.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    server.close(() => process.exit(1));
    // Hard-stop if close() hangs.
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start API');
  process.exit(1);
});
