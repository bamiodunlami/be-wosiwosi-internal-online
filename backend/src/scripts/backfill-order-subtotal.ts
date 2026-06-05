/**
 * Backfill the per-product `subtotal` (pre-coupon line subtotal) on orders that
 * were saved BEFORE that field was captured at import. Without it, coupon orders
 * show £0 per line on the detail (price×qty = 0 once a full coupon applies), which
 * is useless to packers/admins. Re-fetches each affected order from WooCommerce and
 * fills `subtotal` from the live `line_items[].subtotal`, matched by line-item id
 * (falling back to product id). Only fills MISSING subtotals; never overwrites.
 *
 * Dry-run first (default — reads Woo, writes nothing):
 *   cd backend && npx tsx src/scripts/backfill-order-subtotal.ts [orders|redundant|all]
 * Commit:
 *   cd backend && npx tsx src/scripts/backfill-order-subtotal.ts [orders|redundant|all] --commit
 *
 * Default target is `orders` (the live working set). Read-only on WooCommerce.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { env } from '../util/env.js';
import { logger } from '../util/logger.js';
import { Order, type OrderDoc } from '../models/order.model.js';
import { Redundant, type RedundantDoc } from '../models/redundant.model.js';
import { fetchWooOrders, type WooOrder } from '../util/woo.js';

const COMMIT = process.argv.includes('--commit');
const arg = process.argv.find((a) => ['orders', 'redundant', 'all'].includes(a)) ?? 'orders';
const BATCH = 100;
const BATCH_DELAY_MS = 300;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type AnyOrderDoc = OrderDoc | RedundantDoc;

async function backfill(label: string, docs: AnyOrderDoc[]) {
  // Orders with at least one product missing a subtotal.
  const need = docs.filter((d) => d.products.some((p) => !p.subtotal));
  logger.info({ label, total: docs.length, needingBackfill: need.length }, 'scanned');
  if (!need.length) return;

  const ids = need.map((d) => d.orderId);
  const wooById = new Map<number, WooOrder>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const orders = await fetchWooOrders({ include: chunk, perPage: chunk.length });
    for (const o of orders) wooById.set(o.id, o);
    if (i + BATCH < ids.length) await delay(BATCH_DELAY_MS);
  }

  let changedDocs = 0;
  let filled = 0;
  const notOnStore: number[] = [];
  for (const doc of need) {
    const wo = wooById.get(doc.orderId);
    if (!wo) {
      notOnStore.push(doc.orderId);
      continue;
    }
    const byLineItem = new Map<number, string>();
    const byProduct = new Map<number, string>();
    for (const li of wo.line_items ?? []) {
      if (li.subtotal != null) {
        byLineItem.set(li.id, li.subtotal);
        byProduct.set(li.product_id, li.subtotal);
      }
    }
    let changed = 0;
    for (const p of doc.products) {
      if (p.subtotal) continue;
      const sub = byLineItem.get(p.lineItemId) ?? byProduct.get(p.productId);
      if (sub != null) {
        p.subtotal = sub;
        changed += 1;
      }
    }
    if (changed) {
      changedDocs += 1;
      filled += changed;
      if (COMMIT) await doc.save();
    }
  }

  logger.info({ label, changedDocs, filledProducts: filled, notOnStore }, COMMIT ? 'COMMITTED' : 'WOULD CHANGE');
}

async function main() {
  await mongoose.connect(mongoUri(), { dbName: env.MONGO_DB });
  logger.info({ mode: COMMIT ? 'COMMIT' : 'DRY-RUN', target: arg }, 'Backfill order subtotal');

  if (arg === 'orders' || arg === 'all') {
    await backfill('orders', await Order.find({}));
  }
  if (arg === 'redundant' || arg === 'all') {
    await backfill('redundant', await Redundant.find({}));
  }

  if (!COMMIT) logger.info('DRY-RUN — no changes written. Re-run with --commit to apply.');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'backfill-order-subtotal failed');
  process.exit(1);
});
