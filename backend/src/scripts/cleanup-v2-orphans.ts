/**
 * One-off cleanup: drop the empty `users_v2` and `sessions_v2` collections
 * that Mongoose/connect-mongo created in the wosiwosi_v2 database between
 * edits during the database-rename pivot.
 *
 * Hardcoded target: database `wosiwosi_v2`, collections `users_v2` and
 * `sessions_v2`. Will refuse to drop if either collection contains any
 * documents (defence in depth — they should be empty).
 *
 * Usage:
 *   npx tsx backend/src/scripts/cleanup-v2-orphans.ts            (dry-run)
 *   npx tsx backend/src/scripts/cleanup-v2-orphans.ts --apply    (drops)
 */

import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { logger } from '../util/logger.js';

const TARGET_DB = 'wosiwosi_v2';
const ORPHAN_COLLECTIONS = ['users_v2', 'sessions_v2'] as const;

async function main() {
  const apply = process.argv.includes('--apply');

  await mongoose.connect(mongoUri(TARGET_DB), { dbName: TARGET_DB });
  logger.info({ db: TARGET_DB }, 'Connected');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database handle');

  const all = (await db.listCollections().toArray()).map((c) => c.name).sort();
  logger.info({ collections: all }, `Collections in ${TARGET_DB}`);

  for (const name of ORPHAN_COLLECTIONS) {
    if (!all.includes(name)) {
      logger.info({ collection: name }, 'Not present — nothing to do');
      continue;
    }
    const count = await db.collection(name).countDocuments();
    if (count > 0) {
      logger.warn(
        { collection: name, count },
        'Refusing to drop — collection is non-empty. Inspect before manual drop.',
      );
      continue;
    }
    if (apply) {
      await db.dropCollection(name);
      logger.info({ collection: name }, 'DROPPED');
    } else {
      logger.info({ collection: name }, 'Would drop (0 docs)');
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'Cleanup failed');
  process.exit(1);
});
