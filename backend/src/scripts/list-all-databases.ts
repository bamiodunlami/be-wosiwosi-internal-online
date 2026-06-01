/**
 * Diagnostic: list every database in the cluster and every collection in
 * each one (plus document counts), so we have a complete authoritative
 * picture of what's actually stored.
 *
 * Read-only.
 */

import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { logger } from '../util/logger.js';

async function main() {
  await mongoose.connect(mongoUri());

  const admin = mongoose.connection.db?.admin();
  if (!admin) throw new Error('No admin handle');

  const { databases } = await admin.listDatabases();
  for (const dbInfo of databases) {
    if (['admin', 'config', 'local'].includes(dbInfo.name)) continue;
    const dbConn = mongoose.connection.useDb(dbInfo.name);
    const collections = await dbConn.db?.listCollections().toArray();
    const summary: Record<string, number> = {};
    for (const c of collections ?? []) {
      summary[c.name] = await dbConn.collection(c.name).countDocuments();
    }
    logger.info({ db: dbInfo.name, collections: summary }, 'database contents');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'List failed');
  process.exit(1);
});
