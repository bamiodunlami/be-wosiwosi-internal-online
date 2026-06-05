import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

// The MongoDB connection string. Prefer a full SRV string from env (MONGO_URI —
// what Atlas gives you); otherwise build one from the user/host/pass parts
// (user/host/pass never hardcoded). Same cluster as the legacy app — isolation is
// at the database level (env.MONGO_DB, default 'wosiwosi_v2'); legacy uses the
// cluster default (`test`). The `dbName` arg only shapes the built-from-parts URI;
// it's ignored when MONGO_URI is set (the db is chosen via the dbName connect
// option / per-call `useDb`), so an Atlas string with no db still works.
export function mongoUri(dbName?: string): string {
  if (env.MONGO_URI) return env.MONGO_URI;
  if (!env.MONGO_HOST) {
    throw new Error(
      'No MongoDB connection configured — set MONGO_URI (preferred) or MONGO_USER/DBPASS/MONGO_HOST.',
    );
  }
  const path = dbName ? `/${dbName}` : '/';
  return `mongodb+srv://${env.MONGO_USER}:${env.DBPASS}@${env.MONGO_HOST}${path}?retryWrites=true&w=majority`;
}

export const MONGO_URI = mongoUri(env.MONGO_DB);

export async function connectDb(): Promise<void> {
  mongoose.connection.on('connected', () =>
    logger.info({ db: env.MONGO_DB }, 'MongoDB connected'),
  );
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(MONGO_URI, { dbName: env.MONGO_DB });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
