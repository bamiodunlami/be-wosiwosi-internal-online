import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Joi from 'joi';

// The .env lives at the backend project root. Load it from an absolute path
// computed from this file's location so it works for both `tsx watch
// src/server.ts` and the built `node dist/server.js` — the relative depth is
// the same in src/ and dist/ (backend/{src,dist}/util/env -> backend/.env).
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../.env') });
// Also try cwd (harmless if file missing) so a local override still works.
loadEnv();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DBPASS: Joi.string().required(),
  MONGO_USER: Joi.string().required(),
  MONGO_HOST: Joi.string().required(), // e.g. <cluster>.mongodb.net
  MONGO_DB: Joi.string().default('wosiwosi_v2'),
  WOOKEY: Joi.string().required(),
  WOOSEC: Joi.string().required(),
  WOO_URL: Joi.string().uri().required(),
  SESSION_KEY: Joi.string().min(16).required(),
  // Comma-separated allowlist of browser origins permitted to call the API with
  // credentials (the separately-deployed frontend). Empty in local dev — the Vite
  // proxy makes requests same-origin, so no CORS entry is needed. REQUIRED in
  // production, where the frontend is a different origin.
  CORS_ORIGIN: Joi.string().allow('').default(''),
  MAILER_HOST: Joi.string().required(),
  MAILER_PORT: Joi.number().default(465),
  MAILER_USERNAME: Joi.string().required(),
  MAILER_PASS: Joi.string().required(),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
}).unknown(true);

const { value, error } = envSchema.validate(process.env);

if (error) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', error.message);
  process.exit(1);
}

export interface Env {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DBPASS: string;
  MONGO_USER: string;
  MONGO_HOST: string;
  MONGO_DB: string;
  WOOKEY: string;
  WOOSEC: string;
  WOO_URL: string;
  SESSION_KEY: string;
  CORS_ORIGIN: string;
  MAILER_HOST: string;
  MAILER_PORT: number;
  MAILER_USERNAME: string;
  MAILER_PASS: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
}

export const env = value as Env;

/**
 * Parsed CORS allowlist — the single source of truth for which browser origins
 * may call the API. Empty array = no cross-origin browsers allowed (local dev,
 * where requests are same-origin via the Vite proxy).
 */
export const corsOrigins: string[] = env.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
