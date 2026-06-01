/**
 * One-off cleanup: drop the orphan v2 collections that ended up in the
 * LEGACY `test` database during early scaffolding (when v2 briefly shared
 * the database with legacy). The collections are dead weight — nothing in
 * either app reads or writes them now.
 *
 * Targets ONLY these two collection names in the `test` database:
 *   - users_v2
 *   - sessions_v2
 *
 * Everything else in `test` (the actual legacy data: users, singleOrder,
 * redundant, refund, etc.) is listed but never touched.
 *
 * Connects to the `test` database explicitly, regardless of MONGO_DB env.
 *
 * Usage:
 *   npx tsx backend/src/scripts/cleanup-legacy-db-orphans.ts            (dry-run)
 *   npx tsx backend/src/scripts/cleanup-legacy-db-orphans.ts --apply    (drops)
 */

import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { logger } from '../util/logger.js';

const LEGACY_DB = 'test';
const ORPHAN_COLLECTIONS = ['users_v2', 'sessions_v2'] as const;

async function main() {
  const apply = process.argv.includes('--apply');

  await mongoose.connect(mongoUri(LEGACY_DB), { dbName: LEGACY_DB });
  logger.info({ db: LEGACY_DB }, 'Connected to legacy database (read-only intent)');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');

  // For visibility: enumerate every collection in `test`, so you can see the
  // legacy collections are untouched.
  const all = (await db.listCollections().toArray()).map((c) => c.name).sort();
  logger.info({ count: all.length, collections: all }, 'Collections currently in legacy `test` db');

  for (const name of ORPHAN_COLLECTIONS) {
    if (!all.includes(name)) {
      logger.info({ collection: name }, 'Not present — nothing to do');
      continue;
    }

    const count = await db.collection(name).countDocuments();
    if (apply) {
      await db.dropCollection(name);
      logger.info({ collection: name, hadDocuments: count }, 'DROPPED');
    } else {
      logger.info(
        { collection: name, hadDocuments: count },
        'Would drop (re-run with --apply)',
      );
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'Cleanup failed');
  process.exit(1);
});
