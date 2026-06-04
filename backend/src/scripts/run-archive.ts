/**
 * Run an archival-cron stage by hand (for recovery, or to re-run a missed night).
 *
 *   cd backend && npx tsx src/scripts/run-archive.ts <stage>
 *
 * <stage> = refund | archive | cleanup | all
 *
 * ⚠️ This runs for REAL — the refund stage issues WooCommerce refunds, emails
 * customers, and deletes orders. There is no dry-run. The scheduled cron only fires
 * in production (NODE_ENV=production); this script works in any environment.
 */

import 'dotenv/config';
import { connectDb, disconnectDb } from '../util/db.js';
import { logger } from '../util/logger.js';
import {
  runRefundStage,
  runArchiveStage,
  runCleanupStage,
  runAllStages,
} from '../jobs/archive.job.js';

const STAGES = ['refund', 'archive', 'cleanup', 'all'] as const;
type Stage = (typeof STAGES)[number];

async function main(): Promise<void> {
  const stage = process.argv[2] as Stage | undefined;

  if (!stage || !STAGES.includes(stage)) {
    logger.error(`Usage: run-archive.ts <${STAGES.join('|')}>`);
    process.exitCode = 1;
    return;
  }

  await connectDb();
  logger.info({ stage }, 'Running archival stage');
  try {
    if (stage === 'refund') await runRefundStage();
    else if (stage === 'archive') await runArchiveStage();
    else if (stage === 'cleanup') await runCleanupStage();
    else await runAllStages();
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  logger.error({ err }, 'Archival run failed');
  process.exit(1);
});
