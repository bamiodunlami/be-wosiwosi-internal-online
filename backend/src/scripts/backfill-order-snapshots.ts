/**
 * Backfill the WooCommerce snapshot fields (shippingZone, shippingAmount,
 * wooStatus, dateCreated, and per-product `cut`) onto orders that were saved
 * before those fields existed — so the detail view can serve them from the DB
 * without a live fetch.
 *
 * Idempotent and safe to re-run. Run: `cd backend && npx tsx src/scripts/backfill-order-snapshots.ts`
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from '../util/db.js';
import { Order } from '../models/order.model.js';
import { fetchWooOrder } from '../util/woo.js';
import { logger } from '../util/logger.js';

// Mirror of order.service.lineItemCutOption (kept local so the script is standalone).
function isCutLabel(label: string): boolean {
  return /cut/i.test(label) || label.toLowerCase() === 'option';
}
function cleanMetaText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function cutFromBlob(blob: unknown): string {
  const sections = asRecord(blob);
  if (!sections) return '';
  for (const section of Object.values(sections)) {
    const rows = asRecord(section)?.fields;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const fieldRaw of row) {
        const field = asRecord(fieldRaw);
        if (!field || !isCutLabel(String(field.label ?? '').trim())) continue;
        const fv = field.value;
        if (Array.isArray(fv)) {
          const labels = fv
            .map((x) => {
              const o = asRecord(x);
              return o ? cleanMetaText(o.label ?? o.value) : '';
            })
            .filter(Boolean);
          if (labels.length) return labels.join(', ');
        } else if (fv) {
          return cleanMetaText(fv);
        }
      }
    }
  }
  return '';
}
function lineItemCut(li: {
  meta_data?: { key?: string; value?: unknown; display_key?: string; display_value?: unknown }[];
}): string {
  const metas = li.meta_data ?? [];
  for (const m of metas) {
    if (String(m.key ?? '').startsWith('_')) continue;
    const label = String(m.display_key ?? m.key ?? '').trim();
    if (!isCutLabel(label)) continue;
    const v = cleanMetaText(m.display_value ?? m.value);
    if (v) return v;
  }
  for (const m of metas) {
    if (String(m.key ?? '').toLowerCase() === '_wcpa_order_meta_data') {
      const v = cutFromBlob(m.value);
      if (v) return v;
    }
  }
  return '';
}

await connectDb();

const docs = await Order.find({});
logger.info(`Backfilling ${docs.length} order(s)…`);

let updated = 0;
let missing = 0;
for (const doc of docs) {
  const wo = await fetchWooOrder(doc.orderId);
  if (!wo) {
    missing++;
    logger.warn({ orderId: doc.orderId }, 'order not found on store — skipped');
    continue;
  }

  doc.shippingZone = wo.shipping_lines?.[0]?.method_title ?? '';
  doc.shippingAmount = wo.shipping_total ?? '';
  doc.wooStatus = wo.status;
  doc.dateCreated = wo.date_created ? new Date(wo.date_created) : null;

  const cutByProduct = new Map<number, string>();
  for (const li of wo.line_items ?? []) {
    const cut = lineItemCut(li);
    if (cut && !cutByProduct.has(li.product_id)) cutByProduct.set(li.product_id, cut);
  }
  for (const p of doc.products) {
    p.cut = cutByProduct.get(p.productId) ?? '';
  }

  await doc.save();
  updated++;
  logger.info({ orderId: doc.orderId, status: doc.wooStatus }, 'backfilled');
}

logger.info(`Done. Updated ${updated}, missing-on-store ${missing}.`);
await disconnectDb();
