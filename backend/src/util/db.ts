import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

// Build an Atlas connection string from env (user/host/pass never hardcoded).
// Same cluster as the legacy app — isolation is at the database level (env.MONGO_DB,
// default 'wosiwosi_v2'); legacy uses the cluster default (`test`). Pass a dbName for
// scripts targeting another database, or omit it to connect at the cluster level.
export function mongoUri(dbName?: string): string {
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
