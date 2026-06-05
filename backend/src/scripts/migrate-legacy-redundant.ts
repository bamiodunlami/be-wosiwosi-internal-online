/**
 * One-off migration: bring the LEGACY permanent archive (`test.redundants`) into
 * the v2 `redundant` collection — SCOPED to April–June 2026 (the freshest ~2 months;
 * ~2,068 docs). Reports read `redundant` only, so this back-fills the v2 Order /
 * Staff-performance / Refund reports for that window.
 *
 * Dry-run first (default — fetches from Woo read-only, prints the plan, writes nothing):
 *   cd backend && npx tsx src/scripts/migrate-legacy-redundant.ts
 * Then commit for real:
 *   cd backend && npx tsx src/scripts/migrate-legacy-redundant.ts --commit
 *
 * Why re-fetch from WooCommerce: the legacy redundant doc stores NO product
 * line-items (only picked/hidden product *names*), no order total, and no customer
 * email. So we rebuild each order from Woo with v2's OWN import logic
 * (`mapWooOrder` + `classifyFrozen`) — full products, prices, total, email, frozen
 * flags — then OVERLAY the legacy archive state:
 *   - status:true, completedAt + archivedAt  (from legacy `date`)
 *   - assigned / assignedName                (legacy `packer.id` is an email → v2 _id)
 *   - dryPicked / meatPicked                 (from legacy dryPicker/meatPicker `.status`)
 *   - lock                                   (carried)
 *   - notes[]                                (legacy `note[]`; userId email → v2 _id)
 *   - products[].picked / .hidden            (name-matched from `productPicked` / `hideProduct`)
 *   - refundItems[]                          (legacy `refund.product`, APPROVED only;
 *                                             legacy `productPrice` IS the refund line
 *                                             total → used verbatim as `amount`)
 *
 * Woo is queried in batches of 100 ids with a short delay between batches; `wooGet`
 * already backs off on 429/5xx. Orders missing on Woo (404) fall back to a
 * names-only reconstruction so they still archive (blank total, approximate counts).
 *
 * Idempotent: an orderId already in `redundant` is skipped. Read-only on the legacy
 * DB; never deletes anything.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { env } from '../util/env.js';
import { logger } from '../util/logger.js';
import { Redundant, type RedundantDoc } from '../models/redundant.model.js';
import { User } from '../models/user.model.js';
import { fetchWooOrders, type WooOrder } from '../util/woo.js';
import { classifyFrozen, mapWooOrder } from '../services/order.service.js';

const COMMIT = process.argv.includes('--commit');
const LEGACY_DB = 'test';
// Apr–Jun 2026 window (UTC). `date` is an ISO string, but we filter on parsed Dates.
const FROM = new Date('2026-04-01T00:00:00.000Z');
const TO = new Date('2026-07-01T00:00:00.000Z'); // exclusive
// Woo batching.
const BATCH = 100;
const BATCH_DELAY_MS = 300;
// Placeholder author id for a legacy note whose author email isn't a migrated v2 user.
const UNKNOWN_AUTHOR = new mongoose.Types.ObjectId('000000000000000000000000');

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

interface LegacyPicker {
  id?: string; // an email
  fname?: string;
  status?: boolean;
}
interface LegacyNote {
  fname?: string;
  userId?: string; // an email
  note?: string;
}
interface LegacyRefundProduct {
  productName?: string;
  productQuantity?: string | number;
  productPrice?: number;
  status?: boolean;
  approval?: boolean;
}
interface LegacyCustomer {
  fname?: string;
  lname?: string;
  phone?: string;
  address?: string;
  city?: string;
  postcode?: string;
  state?: string;
  shipping_amount?: number;
  shipping_method?: string;
}
interface LegacyRedundant {
  orderNumber?: string;
  status?: boolean;
  lock?: boolean;
  date?: string;
  customer?: LegacyCustomer;
  productPicked?: string[];
  hideProduct?: string[];
  packer?: LegacyPicker;
  dryPicker?: LegacyPicker;
  meatPicker?: LegacyPicker;
  note?: LegacyNote[];
  refund?: {
    date?: string;
    product?: LegacyRefundProduct[];
    customer_details?: { email?: string };
  };
}

interface V2UserLite {
  _id: mongoose.Types.ObjectId;
  fname: string;
  lname: string;
  role: string;
  email: string;
}

async function main() {
  const conn = await mongoose.connect(mongoUri(), { dbName: env.MONGO_DB });
  const legacyColl = conn.connection.useDb(LEGACY_DB, { useCache: true }).collection('redundants');

  // ── Load + scope the legacy archive ────────────────────────────────────────
  const legacyAll = (await legacyColl.find({}).toArray()) as unknown as LegacyRedundant[];
  const inWindow = legacyAll.filter((d) => {
    if (!d.date) return false;
    const t = new Date(d.date).getTime();
    return !Number.isNaN(t) && t >= FROM.getTime() && t < TO.getTime();
  });

  // Parse + dedupe legacy ids; index by orderId.
  const legacyByOrderId = new Map<number, LegacyRedundant>();
  const badOrderNumbers: string[] = [];
  for (const lo of inWindow) {
    const id = Number(lo.orderNumber);
    if (!Number.isInteger(id) || id <= 0) {
      badOrderNumbers.push(String(lo.orderNumber));
      continue;
    }
    // Keep the first; legacy shouldn't duplicate an order in the archive.
    if (!legacyByOrderId.has(id)) legacyByOrderId.set(id, lo);
  }
  const allIds = [...legacyByOrderId.keys()];

  // email → v2 user, for packers and note authors.
  const users = (await User.find({})
    .select('_id email fname lname role')
    .lean()) as unknown as V2UserLite[];
  const userByEmail = new Map<string, V2UserLite>(users.map((u) => [u.email.toLowerCase(), u]));

  // Idempotent: skip ids already archived in v2.
  const inRedundant = await Redundant.find({ orderId: { $in: allIds } })
    .select('orderId')
    .lean();
  const handled = new Set<number>(inRedundant.map((r) => r.orderId));
  const toFetch = allIds.filter((id) => !handled.has(id));

  // ── Fetch from WooCommerce in batches of 100 (read-only) ───────────────────
  const wooById = new Map<number, WooOrder>();
  for (let i = 0; i < toFetch.length; i += BATCH) {
    const chunk = toFetch.slice(i, i + BATCH);
    const orders = await fetchWooOrders({ include: chunk, perPage: chunk.length });
    for (const o of orders) wooById.set(o.id, o);
    logger.info(
      { batch: i / BATCH + 1, fetched: orders.length, soFar: wooById.size, of: toFetch.length },
      'Woo batch',
    );
    if (i + BATCH < toFetch.length) await delay(BATCH_DELAY_MS);
  }
  const notOnStore = toFetch.filter((id) => !wooById.has(id));

  // Classify dry/frozen for every product across the fetched orders.
  const productIds = [...wooById.values()].flatMap((o) =>
    (o.line_items ?? []).map((li) => li.product_id),
  );
  const frozenByProduct = await classifyFrozen(productIds);

  // ── Build the v2 redundant docs ────────────────────────────────────────────
  const unmappedPackers = new Set<string>();
  const unmappedAuthors = new Set<string>();
  let unmatchedPickedNames = 0;
  let unmatchedHiddenNames = 0;
  let totalApprovedRefundItems = 0;
  let namesOnlyFallbacks = 0;
  const docs: Partial<RedundantDoc>[] = [];
  const preview: Record<string, unknown>[] = [];

  for (const id of toFetch) {
    const lo = legacyByOrderId.get(id)!;
    const wo = wooById.get(id);
    const when = lo.date ? new Date(lo.date) : new Date();

    // Assignment (legacy packer.id is an email).
    const packerEmail = lo.packer?.id?.toLowerCase() ?? '';
    const packerUser = packerEmail ? userByEmail.get(packerEmail) : undefined;
    if (packerEmail && !packerUser) unmappedPackers.add(packerEmail);
    const assigned = packerUser ? packerUser._id : null;
    const assignedName = packerUser
      ? `${packerUser.fname} ${packerUser.lname}`.trim()
      : (lo.packer?.fname ?? '');

    // Notes (legacy note.userId is an email; no per-note timestamp → use order date).
    const notes = (lo.note ?? [])
      .filter((n) => (n.note ?? '').trim().length > 0)
      .map((n) => {
        const email = n.userId?.toLowerCase() ?? '';
        const author = email ? userByEmail.get(email) : undefined;
        if (email && !author) unmappedAuthors.add(email);
        return {
          authorId: author ? author._id : UNKNOWN_AUTHOR,
          authorName: n.fname ?? (author ? `${author.fname} ${author.lname}`.trim() : ''),
          authorRole: author?.role ?? '',
          message: n.note ?? '',
          createdAt: when,
        };
      });

    // Picked / hidden name sets (legacy stored names; match against rebuilt products).
    const pickedNames = new Set((lo.productPicked ?? []).map(norm));
    const hiddenNames = new Set((lo.hideProduct ?? []).map(norm));

    // Base products: from Woo if available, else a names-only reconstruction.
    let base: Partial<RedundantDoc>;
    if (wo) {
      const mapped = mapWooOrder(wo, frozenByProduct) as Partial<RedundantDoc>;
      const matchedPicked = new Set<string>();
      const matchedHidden = new Set<string>();
      mapped.products = (mapped.products ?? []).map((p) => {
        const key = norm(p.name);
        const picked = pickedNames.has(key);
        const hidden = hiddenNames.has(key);
        if (picked) matchedPicked.add(key);
        if (hidden) matchedHidden.add(key);
        return { ...p, picked, hidden };
      }) as RedundantDoc['products'];
      unmatchedPickedNames += [...pickedNames].filter((n) => !matchedPicked.has(n)).length;
      unmatchedHiddenNames += [...hiddenNames].filter((n) => !matchedHidden.has(n)).length;
      base = mapped;
    } else {
      namesOnlyFallbacks++;
      const c = lo.customer ?? {};
      const names = lo.productPicked ?? [];
      base = {
        orderId: id,
        orderNumber: String(lo.orderNumber),
        customerName: `${c.fname ?? ''} ${c.lname ?? ''}`.trim(),
        customerEmail: lo.refund?.customer_details?.email ?? '',
        customerPhone: c.phone ?? '',
        postcode: c.postcode ?? '',
        address: [c.address, c.city, c.state, c.postcode].filter((x) => x && x.trim()).join(', '),
        customerNote: '',
        total: '', // unknown without Woo
        shippingZone: c.shipping_method ?? '',
        shippingAmount: c.shipping_amount != null ? String(c.shipping_amount) : '',
        wooStatus: '',
        dateCreated: lo.date ? new Date(lo.date) : null,
        products: names.map((name) => ({
          productId: 0,
          lineItemId: 0,
          name,
          quantity: 1, // legacy keeps no qty → 1 per picked line (approximate)
          price: '',
          sku: '',
          image: '',
          picked: true,
          hidden: hiddenNames.has(norm(name)),
          frozen: false,
          cut: '',
          refund: false,
          refundStatus: 'none',
          refundQuantity: 0,
          replacement: false,
          replacementProduct: '',
          replacementQuantity: 0,
          replacementNote: '',
        })) as RedundantDoc['products'],
      };
    }

    // Refund items — APPROVED only. Legacy `productPrice` is already the refund line
    // total (verified), so it maps straight to `amount`. Match name → productId.
    const productIdByName = new Map<string, number>();
    if (wo) for (const li of wo.line_items ?? []) productIdByName.set(norm(li.name), li.product_id);
    const refundItems = (lo.refund?.product ?? [])
      .filter((p) => p.status === true && p.approval === true)
      .map((p) => ({
        productId: productIdByName.get(norm(p.productName)) ?? 0,
        productName: p.productName ?? '',
        quantity: Number(p.productQuantity) || 0,
        amount: p.productPrice != null ? Number(p.productPrice).toFixed(2) : '',
        refundedAt: lo.refund?.date ? new Date(lo.refund.date) : when,
      }));
    totalApprovedRefundItems += refundItems.length;

    const doc: Partial<RedundantDoc> = {
      ...base,
      status: true,
      dryPicked: lo.dryPicker?.status === true,
      meatPicked: lo.meatPicker?.status === true,
      assigned: assigned as RedundantDoc['assigned'],
      assignedName,
      lock: lo.lock === true,
      notes: notes as RedundantDoc['notes'],
      completedAt: when,
      archivedAt: when,
      refundItems: refundItems as RedundantDoc['refundItems'],
    };
    docs.push(doc);
    preview.push({
      orderId: id,
      source: wo ? 'woo' : 'names-only',
      products: base.products?.length ?? 0,
      assigned: packerUser ? assignedName : packerEmail ? `UNMAPPED(${packerEmail})` : 'none',
      notes: notes.length,
      refundItems: refundItems.length,
      lock: doc.lock,
    });
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  logger.info(
    { mode: COMMIT ? 'COMMIT' : 'DRY-RUN', legacyDb: LEGACY_DB, targetDb: env.MONGO_DB, window: 'Apr–Jun 2026' },
    'Legacy redundant (archive) migration',
  );
  logger.info(
    {
      legacyTotal: legacyAll.length,
      inWindow: inWindow.length,
      uniqueIds: allIds.length,
      alreadyInV2: handled.size,
      attemptedFetch: toFetch.length,
      builtFromWoo: toFetch.length - namesOnlyFallbacks,
      namesOnlyFallbacks,
      notOnStore: notOnStore.length,
      badOrderNumbers: badOrderNumbers.length,
      totalApprovedRefundItems,
      unmatchedPickedNames,
      unmatchedHiddenNames,
    },
    'Summary',
  );
  for (const p of preview.slice(0, 25)) logger.info(p, 'WILL INSERT (first 25)');
  if (handled.size) logger.info({ count: handled.size }, 'SKIP — already in v2 redundant');
  if (notOnStore.length)
    logger.info({ ids: notOnStore }, 'NOTE — not on WooCommerce → names-only fallback');
  if (badOrderNumbers.length)
    logger.info({ values: badOrderNumbers }, 'SKIP — non-numeric orderNumber');
  if (unmappedPackers.size)
    logger.info({ emails: [...unmappedPackers] }, 'WARN — packer email not a v2 user → assigned:null (excluded from staff report)');
  if (unmappedAuthors.size)
    logger.info({ emails: [...unmappedAuthors] }, 'WARN — note author email not a v2 user → placeholder id (name kept)');

  if (!COMMIT) {
    logger.info('DRY-RUN — no changes written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  if (docs.length) {
    const res = await Redundant.insertMany(docs, { ordered: false });
    logger.info({ inserted: res.length }, 'COMMIT complete — redundant docs inserted');
  } else {
    logger.info('Nothing to insert.');
  }
  logger.info({ redundantTotal: await Redundant.countDocuments() }, 'v2 redundant size after migration');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migrate-legacy-redundant failed');
  process.exit(1);
});
