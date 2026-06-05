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
  // Preferred: a full MongoDB SRV connection string (e.g. the one Atlas hands you,
  // `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority`).
  // When set it's used as-is and the user/host/pass parts below are ignored. The
  // database is still chosen by MONGO_DB (Atlas strings carry no db name).
  MONGO_URI: Joi.string().allow('').default(''),
  // Legacy fallback parts — only used when MONGO_URI is empty. Optional now.
  DBPASS: Joi.string().allow('').default(''),
  MONGO_USER: Joi.string().allow('').default(''),
  MONGO_HOST: Joi.string().allow('').default(''), // e.g. <cluster>.mongodb.net
  MONGO_DB: Joi.string().default('wosiwosi_v2'),
  WOOKEY: Joi.string().required(),
  WOOSEC: Joi.string().required(),
  WOO_URL: Joi.string().uri().required(),
  // Session-cookie signing secret. Min 32 chars — use a long random value (e.g.
  // `openssl rand -hex 32`). Changing it invalidates all existing sessions.
  SESSION_KEY: Joi.string().min(32).required(),
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
  // Sentry error tracking — OPTIONAL. Unset/empty = Sentry disabled (a no-op), so
  // local dev needs no DSN. Set the project DSN in production to capture errors.
  SENTRY_DSN: Joi.string().uri().allow('').default(''),
  // Shared secret sent as the `X-Wosi-Key` header on WooCommerce calls so they
  // skip the store's Cloudflare bot challenge (a WAF rule there matches this
  // header). Empty in local dev (header omitted). Set in prod to a long random
  // value that matches the Cloudflare rule.
  WOO_WAF_SECRET: Joi.string().allow('').default(''),
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
  MONGO_URI: string;
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
  SENTRY_DSN: string;
  WOO_WAF_SECRET: string;
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
