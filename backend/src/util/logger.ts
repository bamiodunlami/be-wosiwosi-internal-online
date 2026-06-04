import winston from 'winston';
import { env } from './env.js';

/**
 * Application logger — backed by Winston, but exposed through a **Pino-compatible
 * facade** so every existing call site keeps the `logger.level(obj, message)` (and
 * `logger.level(message)`) shape. Only this file knows it's Winston.
 *
 * Levels mirror Pino's set (incl. `fatal`/`trace`) so `LOG_LEVEL` values map straight
 * through and `logger.fatal` still works. Errors passed in metadata (e.g.
 * `logger.error({ err }, '…')`) are serialised with their stack — Winston would
 * otherwise stringify an Error to `{}`.
 */

const levels = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
type Level = keyof typeof levels;

winston.addColors({
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  trace: 'gray',
});

const isDev = env.NODE_ENV === 'development';

// Replace Error values anywhere in the log metadata with a plain object that keeps
// the useful diagnostic fields. We deliberately WHITELIST rather than spread the
// whole Error: upstream errors (axios from the Woo client, Mongo) attach `config`/
// `request`/`response` carrying the WooCommerce API key+secret in headers and
// customer PII in bodies — spreading those would leak them into the logs and Sentry.
const ERROR_FIELDS = ['name', 'message', 'stack', 'status', 'code'] as const;
const serializeErrors = winston.format((info) => {
  for (const key of Object.keys(info)) {
    const v = (info as Record<string, unknown>)[key];
    if (v instanceof Error) {
      const safe: Record<string, unknown> = {};
      for (const f of ERROR_FIELDS) {
        const val = (v as unknown as Record<string, unknown>)[f];
        if (val !== undefined) safe[f] = val;
      }
      (info as Record<string, unknown>)[key] = safe;
    }
  }
  return info;
});

const devFormat = winston.format.combine(
  serializeErrors(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ level: true }),
  winston.format.printf((info) => {
    const { level, message, timestamp, ...rest } = info as Record<string, unknown>;
    const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp as string} ${level as string}: ${message as string}${meta}`;
  }),
);

const prodFormat = winston.format.combine(
  serializeErrors(),
  winston.format.timestamp(),
  winston.format.json(),
);

const base = winston.createLogger({
  levels,
  level: env.LOG_LEVEL,
  format: isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});

// Pino-style call: `logger.info(objOrMessage, message?)`.
type LogArg = string | Record<string, unknown>;
function emit(level: Level, a?: LogArg, b?: string): void {
  if (typeof a === 'string') base.log(level, a);
  else if (a && typeof a === 'object') base.log(level, b ?? '', a);
  else base.log(level, b ?? '');
}

export const logger = {
  fatal: (a?: LogArg, b?: string) => emit('fatal', a, b),
  error: (a?: LogArg, b?: string) => emit('error', a, b),
  warn: (a?: LogArg, b?: string) => emit('warn', a, b),
  info: (a?: LogArg, b?: string) => emit('info', a, b),
  debug: (a?: LogArg, b?: string) => emit('debug', a, b),
  trace: (a?: LogArg, b?: string) => emit('trace', a, b),
};
