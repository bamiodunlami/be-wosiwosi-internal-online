import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Minimal read-only WooCommerce REST client. The store runs over HTTPS, so we
 * authenticate with HTTP Basic Auth (consumer key/secret) — verified working
 * against the live store, whereas query-string auth is rejected (401). Node 20
 * provides global `fetch`. We only ever GET orders; pulling them into the local
 * queue is a Super-Admin action (see order.service.pullOrders).
 *
 * Env vars: WOO_URL, WOOKEY, WOOSEC (validated in util/env.ts).
 */

const BASE = `${env.WOO_URL.replace(/\/+$/, '')}/wp-json/wc/v3`;
const AUTH = `Basic ${Buffer.from(`${env.WOOKEY}:${env.WOOSEC}`).toString('base64')}`;

type QueryValue = string | number | boolean | string[] | undefined;

function wooError(message: string, upstream?: number): Error & { status: number; upstream?: number } {
  // Surface upstream store failures as 502 so the client knows it's not their fault.
  const err = new Error(message) as Error & { status: number; upstream?: number };
  err.status = 502;
  err.upstream = upstream;
  return err;
}

// The store occasionally drops a connection or responds slowly. Rather than fail
// a whole page on one blip, time each request out and retry transient failures
// (network errors, 5xx, 429) a couple of times with a short backoff.
const WOO_TIMEOUT_MS = 12_000;
const WOO_MAX_ATTEMPTS = 3;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface WooGetOpts {
  timeoutMs?: number; // per-attempt timeout
  maxAttempts?: number; // total attempts (1 = no retry)
}

async function wooGet<T>(
  path: string,
  params: Record<string, QueryValue> = {},
  opts: WooGetOpts = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? WOO_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? WOO_MAX_ATTEMPTS;

  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      // WooCommerce expects repeated `key[]` params for array filters (e.g. status).
      for (const v of value) url.searchParams.append(`${key}[]`, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: AUTH },
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(timer);
      if (attempt < maxAttempts) {
        logger.warn({ path, attempt }, 'WooCommerce request failed — retrying');
        await delay(attempt * 400);
        continue;
      }
      logger.error({ cause, path }, 'WooCommerce request failed');
      throw wooError('Could not reach the WooCommerce store');
    }
    clearTimeout(timer);

    if (res.ok) return res.json() as Promise<T>;

    // Retry transient upstream errors; fail fast on 4xx (e.g. 404 — order missing).
    if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts) {
      logger.warn({ status: res.status, path, attempt }, 'WooCommerce transient error — retrying');
      await delay(attempt * 400);
      continue;
    }

    const body = await res.text().catch(() => '');
    logger.error({ status: res.status, path, body: body.slice(0, 500) }, 'WooCommerce error');
    throw wooError(`WooCommerce responded ${res.status}`, res.status);
  }

  // Loop only exits via return/throw above; this satisfies the type checker.
  throw wooError('Could not reach the WooCommerce store');
}

// ── Shape of the subset of a WooCommerce order we consume ────────────────────

export interface WooAddress {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

/**
 * A line-item meta entry. WooCommerce returns both the raw `key`/`value` and a
 * human-facing `display_key`/`display_value`. Product Add-Ons (WCPA) options like
 * the "cut" choice land here — their position/shape differs between orders created
 * via the REST API (`key`=field label) and the storefront (formatted `display_*`).
 */
export interface WooMetaData {
  key?: string;
  value?: unknown;
  display_key?: string;
  display_value?: unknown;
}

export interface WooLineItem {
  id: number;
  product_id: number;
  name: string;
  quantity: number;
  sku?: string;
  price?: number;
  total?: string;
  image?: { src?: string };
  meta_data?: WooMetaData[];
}

export interface WooShippingLine {
  method_title?: string;
  total?: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  shipping_total: string;
  customer_note: string;
  billing: WooAddress;
  shipping: WooAddress;
  shipping_lines: WooShippingLine[];
  line_items: WooLineItem[];
}

/**
 * Fetch orders from the store. `after`/`before` are ISO8601 datetimes that bound
 * the order-created date (the Order page defaults to "today"); `status`, paging,
 * search and explicit ids are all optional.
 */
export function fetchWooOrders(opts: {
  status?: string | string[];
  after?: string;
  before?: string;
  page?: number;
  perPage?: number;
  search?: string;
  include?: number[];
}): Promise<WooOrder[]> {
  return wooGet<WooOrder[]>('/orders', {
    status: opts.status,
    after: opts.after,
    before: opts.before,
    page: opts.page,
    per_page: opts.perPage,
    search: opts.search,
    include: opts.include?.length ? opts.include.join(',') : undefined,
  });
}

/** Fetch a single order by its WooCommerce id, or null if it doesn't exist (404). */
export async function fetchWooOrder(id: number): Promise<WooOrder | null> {
  try {
    return await wooGet<WooOrder>(`/orders/${id}`);
  } catch (err) {
    if ((err as { upstream?: number }).upstream === 404) return null;
    throw err;
  }
}

/**
 * Fetch ONLY the live status of an order — a deliberately tiny request
 * (`_fields=status`) used to verify a saved order is still workable. Returns null
 * if the order no longer exists on the store.
 */
export async function fetchWooOrderStatus(id: number): Promise<string | null> {
  try {
    // Best-effort gate, not a critical read — fail fast (short timeout, no retry)
    // so a flaky store can't hang the detail page. The caller treats failure as
    // "couldn't verify" and lets work proceed.
    const wo = await wooGet<{ status?: string }>(
      `/orders/${id}`,
      { _fields: 'status' },
      { timeoutMs: 6000, maxAttempts: 1 },
    );
    return wo?.status ?? null;
  } catch (err) {
    if ((err as { upstream?: number }).upstream === 404) return null;
    throw err;
  }
}
