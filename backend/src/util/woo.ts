import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Minimal WooCommerce REST client. The store runs over HTTPS, so we authenticate
 * with HTTP Basic Auth (consumer key/secret) — verified working against the live
 * store, whereas query-string auth is rejected (401). Node 20 provides global
 * `fetch`. Reads dominate (pulling orders into the queue); the one write is
 * cancelling an order (`cancelWooOrder`), an Admin/Super-Admin action.
 *
 * NOTE: the write path needs a Read/Write API key — a read-only key 401s on PUT.
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

/**
 * Write to the store (PUT/POST). Same timeout + transient-retry policy as wooGet;
 * retrying is safe for our only write — cancelling — because setting status to
 * `cancelled` is idempotent. A 4xx (e.g. 401 read-only key, 404 missing order)
 * fails fast and surfaces `upstream` so the caller can react.
 */
async function wooWrite<T>(
  method: 'PUT' | 'POST',
  path: string,
  body: Record<string, unknown>,
  opts: WooGetOpts = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? WOO_TIMEOUT_MS;
  const maxAttempts = opts.maxAttempts ?? WOO_MAX_ATTEMPTS;
  const url = new URL(`${BASE}${path}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(timer);
      if (attempt < maxAttempts) {
        logger.warn({ path, attempt }, 'WooCommerce write failed — retrying');
        await delay(attempt * 400);
        continue;
      }
      logger.error({ cause, path }, 'WooCommerce write failed');
      throw wooError('Could not reach the WooCommerce store');
    }
    clearTimeout(timer);

    if (res.ok) return res.json() as Promise<T>;

    if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts) {
      logger.warn({ status: res.status, path, attempt }, 'WooCommerce transient error — retrying');
      await delay(attempt * 400);
      continue;
    }

    const text = await res.text().catch(() => '');
    logger.error({ status: res.status, path, body: text.slice(0, 500) }, 'WooCommerce write error');
    // Surface the store's own error message (e.g. "Refund amount is greater than
    // unrefunded amount") so callers can show the admin why it failed.
    let detail = '';
    try {
      detail = (JSON.parse(text) as { message?: string }).message ?? '';
    } catch {
      /* body wasn't JSON */
    }
    throw wooError(detail || `WooCommerce responded ${res.status}`, res.status);
  }

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
  subtotal?: string; // line subtotal BEFORE coupon discounts
  total?: string; // line total AFTER coupon discounts (can be 0 with a full coupon)
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

/**
 * Cancel an order on the store — sets its status to `cancelled`. Returns the
 * updated order, or null if it no longer exists (404). Requires a Read/Write key.
 */
export async function cancelWooOrder(id: number): Promise<WooOrder | null> {
  try {
    return await wooWrite<WooOrder>('PUT', `/orders/${id}`, { status: 'cancelled' });
  } catch (err) {
    if ((err as { upstream?: number }).upstream === 404) return null;
    throw err;
  }
}

export interface WooRefundLine {
  id: number; // the order line-item id
  quantity: number;
  refund_total: string; // amount to refund for this line (GBP)
}

/**
 * Create a refund on a WooCommerce order (`POST /orders/{id}/refunds`). Pass
 * `lineItems` to refund specific lines (with restock), or just `amount` for a
 * money-only refund. `apiRefund: true` asks the payment gateway to actually move
 * the money (requires a gateway that supports API refunds); false records the
 * refund without moving money. Requires a Read/Write key. Returns null on 404.
 */
export interface WooRefundResult {
  id: number;
  total?: string; // money actually refunded (WC returns it negative, e.g. "-0.99")
  amount?: string;
}

export async function refundWooOrder(
  orderId: number,
  body: { amount?: string; reason?: string; lineItems?: WooRefundLine[]; apiRefund?: boolean },
): Promise<WooRefundResult | null> {
  const payload: Record<string, unknown> = {
    reason: body.reason ?? '',
    api_refund: body.apiRefund ?? true,
  };
  if (body.lineItems && body.lineItems.length) {
    payload.line_items = body.lineItems.map((li) => ({
      id: li.id,
      quantity: li.quantity,
      refund_total: li.refund_total,
    }));
  }
  if (body.amount) payload.amount = body.amount;
  try {
    return await wooWrite<WooRefundResult>('POST', `/orders/${orderId}/refunds`, payload);
  } catch (err) {
    if ((err as { upstream?: number }).upstream === 404) return null;
    throw err;
  }
}

/** The money a refund actually moved (WC returns `total` negative) as a positive number. */
export function refundedAmount(result: WooRefundResult): number {
  return Math.abs(Number(result.total) || 0);
}

export interface WooProduct {
  id: number;
  categories?: { id: number; name: string; slug: string }[];
}

/**
 * Fetch products (id + categories) by id, batched in pages of 100. Used at order
 * import to classify line items as dry/frozen by their WooCommerce category.
 */
export async function fetchWooProducts(ids: number[]): Promise<WooProduct[]> {
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0);
  if (!unique.length) return [];
  const out: WooProduct[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const page = await wooGet<WooProduct[]>('/products', {
      include: chunk.join(','),
      per_page: chunk.length,
      _fields: 'id,categories',
    });
    out.push(...page);
  }
  return out;
}
