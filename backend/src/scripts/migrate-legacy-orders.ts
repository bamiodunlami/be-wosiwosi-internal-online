/**
 * One-off migration: bring the LEGACY processing leftovers (`test.singleorders`)
 * into the v2 `orders` collection. Run AFTER the legacy nightly cron, so only the
 * true leftovers remain (locked / unfulfilled-before-closing orders).
 *
 * Dry-run first (default — fetches from Woo read-only, prints the plan, writes nothing):
 *   cd backend && npx tsx src/scripts/migrate-legacy-orders.ts
 * Then commit for real:
 *   cd backend && npx tsx src/scripts/migrate-legacy-orders.ts --commit
 *
 * Why re-fetch from WooCommerce: the legacy order doc stores NO product line-items
 * (only picked/hidden product *names*). So we rebuild each order from Woo using v2's
 * OWN import logic (`mapWooOrder` + `classifyFrozen`) — full products, prices, skus,
 * images and the dry/frozen classification — then OVERLAY the legacy working state:
 *   - assigned / assignedName  (legacy `packer.id` is an email → v2 user `_id`)
 *   - lock                     (re-lock whatever the legacy had locked)
 *   - dryPicked / meatPicked   (from legacy dryPicker/meatPicker `.status`)
 *   - notes[]                  (legacy `note[]`; `userId` is an email → v2 user `_id`)
 *   - products[].hidden        (name-matched from legacy `hideProduct` → hidden:true;
 *                               functionally hides the line from packers, as legacy did)
 * Pick progress is deliberately NOT carried over (per decision 2026-06-04).
 *
 * Idempotent: an orderId already in `orders` or `redundant` is skipped for INSERT, but
 * orders already in `orders` get a hidden-flag BACKFILL (only promotes products to
 * hidden:true from legacy `hideProduct`; never unhides, never touches pick/other state).
 * Read-only on the legacy DB; never deletes anything.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { mongoUri } from '../util/db.js';
import { env } from '../util/env.js';
import { logger } from '../util/logger.js';
import { Order, type OrderDoc } from '../models/order.model.js';
import { Redundant } from '../models/redundant.model.js';
import { User } from '../models/user.model.js';
import { fetchWooOrders } from '../util/woo.js';
import { classifyFrozen, mapWooOrder } from '../services/order.service.js';

const COMMIT = process.argv.includes('--commit');
const LEGACY_DB = 'test';
// Placeholder author id for a legacy note whose author email isn't among the
// migrated v2 users (the note still shows its author name + text).
const UNKNOWN_AUTHOR = new mongoose.Types.ObjectId('000000000000000000000000');
// Normalise a product name for matching legacy `hideProduct` names against Woo lines.
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

interface LegacyPicker {
  id?: string; // an email in the legacy data
  fname?: string;
  status?: boolean;
}
interface LegacyNote {
  fname?: string;
  userId?: string; // an email
  note?: string;
}
interface LegacySingleOrder {
  orderNumber?: string;
  lock?: boolean;
  status?: boolean;
  date?: string;
  hideProduct?: string[];
  packer?: LegacyPicker;
  dryPicker?: LegacyPicker;
  meatPicker?: LegacyPicker;
  note?: LegacyNote[];
}

interface V2UserLite {
  _id: mongoose.Types.ObjectId;
  fname: string;
  lname: string;
  role: string;
}

async function main() {
  const conn = await mongoose.connect(mongoUri(), { dbName: env.MONGO_DB });
  const legacyColl = conn.connection.useDb(LEGACY_DB, { useCache: true }).collection('singleorders');

  // ── Load sources ──────────────────────────────────────────────────────────
  const legacy = (await legacyColl.find({}).toArray()) as unknown as LegacySingleOrder[];

  // email → v2 user, for mapping packers and note authors.
  const users = (await User.find({}).select('_id email fname lname role').lean()) as unknown as
    (V2UserLite & { email: string })[];
  const userByEmail = new Map<string, V2UserLite>(
    users.map((u) => [u.email.toLowerCase(), { _id: u._id, fname: u.fname, lname: u.lname, role: u.role }]),
  );

  // Parse + dedupe legacy ids; index legacy docs by orderId.
  const legacyByOrderId = new Map<number, LegacySingleOrder>();
  const badOrderNumbers: string[] = [];
  for (const lo of legacy) {
    const id = Number(lo.orderNumber);
    if (!Number.isInteger(id) || id <= 0) {
      badOrderNumbers.push(String(lo.orderNumber));
      continue;
    }
    legacyByOrderId.set(id, lo);
  }
  const allIds = [...legacyByOrderId.keys()];

  // Skip anything already handled in v2 (idempotent).
  const [inOrders, inRedundant] = await Promise.all([
    Order.find({ orderId: { $in: allIds } }).select('orderId').lean(),
    Redundant.find({ orderId: { $in: allIds } }).select('orderId').lean(),
  ]);
  const handled = new Set<number>([
    ...inOrders.map((o) => o.orderId),
    ...inRedundant.map((r) => r.orderId),
  ]);
  const toFetch = allIds.filter((id) => !handled.has(id));

  // ── Fetch from WooCommerce + classify (read-only) ─────────────────────────
  const wooOrders = toFetch.length
    ? await fetchWooOrders({ include: toFetch, perPage: toFetch.length })
    : [];
  const foundIds = new Set(wooOrders.map((w) => w.id));
  const notOnStore = toFetch.filter((id) => !foundIds.has(id));

  const productIds = wooOrders.flatMap((o) => (o.line_items ?? []).map((li) => li.product_id));
  const frozenByProduct = await classifyFrozen(productIds);

  // ── Build the v2 docs (base from Woo + legacy overlay) ────────────────────
  const unmappedPackers = new Set<string>();
  const unmappedAuthors = new Set<string>();
  let hiddenSetOnInsert = 0;
  let unmatchedHiddenNames = 0;
  const docs: Partial<OrderDoc>[] = [];
  const preview: Record<string, unknown>[] = [];

  for (const wo of wooOrders) {
    const lo = legacyByOrderId.get(wo.id)!;
    const base = mapWooOrder(wo, frozenByProduct);

    // Hidden products: name-match legacy `hideProduct` against the rebuilt Woo lines
    // and set hidden:true (functionally hides the line from packers, like legacy).
    // A hidden line is also auto-picked so it never blocks order completion.
    const hiddenNames = new Set((lo.hideProduct ?? []).map(norm));
    const matchedHidden = new Set<string>();
    base.products = (base.products ?? []).map((p) => {
      const hide = hiddenNames.has(norm(p.name));
      if (hide) {
        matchedHidden.add(norm(p.name));
        hiddenSetOnInsert += 1;
      }
      return { ...p, hidden: hide, picked: hide ? true : p.picked };
    }) as OrderDoc['products'];
    unmatchedHiddenNames += [...hiddenNames].filter((n) => !matchedHidden.has(n)).length;

    // Assignment (legacy packer.id is an email).
    const packerEmail = lo.packer?.id?.toLowerCase() ?? '';
    const packerUser = packerEmail ? userByEmail.get(packerEmail) : undefined;
    if (packerEmail && !packerUser) unmappedPackers.add(packerEmail);
    const assigned = packerUser ? packerUser._id : null;
    const assignedName = packerUser
      ? `${packerUser.fname} ${packerUser.lname}`.trim()
      : (lo.packer?.fname ?? '');

    // Notes (legacy note.userId is an email). No per-note timestamp in legacy →
    // fall back to the order's legacy date, else now.
    const noteDate = lo.date ? new Date(lo.date) : new Date();
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
          createdAt: noteDate,
        };
      });

    const doc: Partial<OrderDoc> = {
      ...base,
      assigned: assigned as OrderDoc['assigned'],
      assignedName,
      lock: lo.lock === true,
      status: false, // leftovers are unfulfilled
      dryPicked: lo.dryPicker?.status === true,
      meatPicked: false, // not carried over (decision 2026-06-04)
      notes: notes as OrderDoc['notes'],
    };
    docs.push(doc);
    preview.push({
      orderId: wo.id,
      products: (wo.line_items ?? []).length,
      assigned: packerUser ? assignedName : packerEmail ? `UNMAPPED(${packerEmail})` : 'none',
      lock: doc.lock,
      dryPicked: doc.dryPicked,
      meatPicked: doc.meatPicked,
      notes: notes.length,
    });
  }

  // ── Backfill: hidden flag on orders ALREADY in v2 `orders` ────────────────
  // The insert path above skips these (idempotent), but they predate the hidden
  // handling. Promote their products to hidden:true (+ picked:true, so a hidden line
  // never blocks completion) from legacy `hideProduct`. Only ever PROMOTES (never
  // unhides / un-picks) so a manual v2 change isn't clobbered; touches nothing else
  // (assignment, notes, lock all untouched).
  const existingDocs = await Order.find({ orderId: { $in: inOrders.map((o) => o.orderId) } });
  const backfill: { doc: (typeof existingDocs)[number]; changed: number }[] = [];
  for (const doc of existingDocs) {
    const lo = legacyByOrderId.get(doc.orderId);
    const hiddenNames = new Set((lo?.hideProduct ?? []).map(norm));
    if (!hiddenNames.size) continue;
    let changed = 0;
    for (const p of doc.products) {
      if (!hiddenNames.has(norm(p.name))) continue;
      if (!p.hidden) {
        p.hidden = true;
        changed += 1;
      }
      if (!p.picked) {
        p.picked = true;
        changed += 1;
      }
    }
    if (changed) backfill.push({ doc, changed });
  }
  const backfillItems = backfill.reduce((n, b) => n + b.changed, 0);

  // ── Report ────────────────────────────────────────────────────────────────
  logger.info({ mode: COMMIT ? 'COMMIT' : 'DRY-RUN', legacyDb: LEGACY_DB, targetDb: env.MONGO_DB }, 'Legacy processing-order migration');
  logger.info(
    {
      legacyTotal: legacy.length,
      alreadyInV2: handled.size,
      attemptedFetch: toFetch.length,
      builtFromWoo: docs.length,
      notOnStore: notOnStore.length,
      badOrderNumbers: badOrderNumbers.length,
      hiddenSetOnInsert,
      unmatchedHiddenNames,
      backfillOrders: backfill.length,
      backfillHiddenItems: backfillItems,
    },
    'Summary',
  );
  for (const p of preview) logger.info(p, 'WILL INSERT');
  for (const b of backfill)
    logger.info({ orderId: b.doc.orderId, hiddenSet: b.changed }, 'WILL BACKFILL hidden');
  if (handled.size) logger.info({ ids: [...handled] }, 'SKIP — already in v2');
  if (notOnStore.length) logger.info({ ids: notOnStore }, 'SKIP — not found on WooCommerce (cannot rebuild products)');
  if (badOrderNumbers.length) logger.info({ values: badOrderNumbers }, 'SKIP — non-numeric orderNumber');
  if (unmappedPackers.size) logger.info({ emails: [...unmappedPackers] }, 'WARN — packer email not a v2 user → assigned:null');
  if (unmappedAuthors.size) logger.info({ emails: [...unmappedAuthors] }, 'WARN — note author email not a v2 user → placeholder author id (name kept)');

  if (!COMMIT) {
    logger.info('DRY-RUN — no changes written. Re-run with --commit to apply.');
    await mongoose.disconnect();
    return;
  }

  if (docs.length) {
    const res = await Order.insertMany(docs, { ordered: false });
    logger.info({ inserted: res.length }, 'COMMIT complete — orders inserted');
  } else {
    logger.info('Nothing to insert.');
  }
  if (backfill.length) {
    for (const b of backfill) await b.doc.save();
    logger.info(
      { orders: backfill.length, hiddenItems: backfillItems },
      'COMMIT complete — hidden flag backfilled on existing orders',
    );
  }
  logger.info({ ordersTotal: await Order.countDocuments() }, 'v2 orders collection size after migration');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migrate-legacy-orders failed');
  process.exit(1);
});
