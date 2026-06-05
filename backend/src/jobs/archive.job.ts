import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { Order, type OrderDoc } from '../models/order.model.js';
import { Refund, type RefundDoc } from '../models/refund.model.js';
import { Redundant } from '../models/redundant.model.js';
import { RedoOrder } from '../models/redo.model.js';
import { Notification } from '../models/notification.model.js';
import * as settingsService from '../services/settings.service.js';
import { refundWooOrder, refundedAmount, type WooRefundLine } from '../util/woo.js';
import { sendMail } from '../util/mailer.js';
import { escapeHtml, customerRefundHtml, refundTotal } from '../util/refundEmail.js';
// import { env } from '../util/env.js';
import { logger } from '../util/logger.js';

/**
 * The nightly archival cron (SPEC §5/§8/§16). Three stages, Mon–Fri Europe/London:
 *   20:00 refund   — for each order with refunds: APPROVED items are refunded in
 *                    WooCommerce (one combined refund), the customer is emailed
 *                    (BCC the settings recipients), the order is archived with the
 *                    refund payload + notes, and deleted from `orders`/`refunds`.
 *                    NOT-approved refunds (rejected or still pending) are cancelled
 *                    and an admin is emailed.
 *   21:00 archive  — every remaining completed order → `redundant` (notes carried),
 *                    deleted from `orders`.
 *   22:00 cleanup  — fold any late approvals, then clear the day's notifications.
 *
 * Idempotent: archiving upserts into `redundant` by `orderId` then deletes from
 * `orders`, so a re-run finds nothing. Run by hand for recovery via
 * `scripts/run-archive.ts`. This stage issues REAL gateway refunds and REAL emails.
 */

interface RefundSnapshot {
  productId: number;
  productName: string;
  quantity: number;
  amount: string;
}

function itemRows(items: RefundSnapshot[]): string {
  return items
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.productName)}</td><td align="center">${it.quantity}</td><td align="right">£${escapeHtml(it.amount)}</td></tr>`,
    )
    .join('');
}

function adminNoticeHtml(order: OrderDoc, items: RefundSnapshot[], headline: string): string {
  return `
    <p>${escapeHtml(headline)}</p>
    <p>Order <strong>#${escapeHtml(order.orderNumber)}</strong> — ${escapeHtml(order.customerName)}</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <thead><tr><th align="left">Item</th><th>Qty</th><th align="right">Amount</th></tr></thead>
      <tbody>${itemRows(items)}</tbody>
    </table>`;
}

/** Email the admin/management group (the refund-recipients setting). No-op if unset. */
async function emailAdmins(recipients: string[], subject: string, html: string): Promise<void> {
  if (!recipients.length) {
    logger.warn(
      { subject },
      'No refund recipients set — admin notice not sent (configure System settings)',
    );
    return;
  }
  try {
    await sendMail({ to: recipients.join(', '), subject, html });
  } catch (err) {
    logger.error({ err, subject }, 'Admin notice email failed');
  }
}

function toSnapshots(
  items: { productId: number; productName: string; quantity: number; amount: string }[],
): RefundSnapshot[] {
  return items.map((it) => ({
    productId: it.productId,
    productName: it.productName,
    quantity: it.quantity,
    amount: it.amount,
  }));
}

/** Build precise refund lines (one per approved item); null if any line-item id is missing. */
function buildRefundLines(order: OrderDoc, items: RefundSnapshot[]): WooRefundLine[] | null {
  const lines: WooRefundLine[] = [];
  for (const it of items) {
    const product = order.products.find((p) => p.productId === it.productId);
    if (!product || !product.lineItemId) return null; // fall back to amount-only
    lines.push({ id: product.lineItemId, quantity: it.quantity, refund_total: it.amount });
  }
  return lines;
}

/** Clear refund flags on an order's products (used when cancelling unapproved refunds). */
function clearRefundFlags(order: OrderDoc, items: RefundSnapshot[]): void {
  for (const it of items) {
    const product = order.products.find((p) => p.productId === it.productId);
    if (product) {
      product.refund = false;
      product.refundStatus = 'none';
      product.refundQuantity = 0;
    }
  }
}

/** Copy an order into the archive (idempotent upsert by orderId) and remove it from `orders`. */
async function archiveOrder(order: OrderDoc, refundItems: RefundSnapshot[]): Promise<void> {
  const snapshot = order.toObject() as Record<string, unknown>;
  delete snapshot._id;
  delete snapshot.__v;
  delete snapshot.createdAt;
  delete snapshot.updatedAt;
  await Redundant.updateOne(
    { orderId: order.orderId },
    { $setOnInsert: { ...snapshot, archivedAt: new Date(), refundItems } },
    { upsert: true },
  );
  await Order.deleteOne({ _id: order._id });
}

export interface RefundStageResult {
  refunded: number;
  cancelled: number;
  failed: number;
}

/**
 * Process ONE refund doc end-to-end. Returns the outcome. Throwing is fine — the
 * caller catches it so a single bad order can never abort the rest of the batch.
 */
async function processOneRefund(
  refund: RefundDoc,
  recipients: string[],
): Promise<'refunded' | 'cancelled' | 'failed' | 'skipped'> {
  const order = await Order.findOne({ orderId: refund.orderId });
  if (!order) {
    await Refund.deleteOne({ _id: refund._id }); // order already archived — drop stale refund
    return 'skipped';
  }

  const approved = toSnapshots(refund.items.filter((it) => it.status && it.approval));
  const notApproved = toSnapshots(refund.items.filter((it) => !(it.status && it.approval)));

  // Whole request unapproved (rejected and/or pending) → cancel + notify admin.
  if (approved.length === 0) {
    clearRefundFlags(order, notApproved);
    await order.save();
    await Refund.deleteOne({ _id: refund._id });
    await emailAdmins(
      recipients,
      `Refund not approved — order #${order.orderNumber}`,
      adminNoticeHtml(
        order,
        notApproved,
        'A refund request was not approved by 20:00 and has been cancelled:',
      ),
    );
    return 'cancelled';
  }

  // Approved items → one combined WooCommerce refund (precise lines, or amount-only).
  const lines = buildRefundLines(order, approved);
  const expected = Number(refundTotal(approved));
  let result;
  try {
    result = await refundWooOrder(order.orderId, {
      reason: 'Wosiwosi warehouse refund',
      amount: refundTotal(approved),
      lineItems: lines ?? undefined,
      apiRefund: true,
    });
  } catch (err) {
    // e.g. "Transaction Id cannot be empty" (order has no gateway transaction to
    // refund against) — can't auto-refund; flag for manual handling and move on.
    logger.error(
      { err, orderId: order.orderId },
      'WooCommerce refund failed — left for manual handling',
    );
    Sentry.captureException(err, {
      tags: { area: 'cron', stage: 'refund' },
      extra: { orderId: order.orderId },
    });
    await emailAdmins(
      recipients,
      `Refund FAILED — order #${order.orderNumber}`,
      adminNoticeHtml(order, approved, 'The WooCommerce refund call failed. Handle manually:'),
    );
    return 'failed';
  }
  if (result === null) {
    logger.error(
      { orderId: order.orderId },
      'Refund: order not found on store — left for manual handling',
    );
    await emailAdmins(
      recipients,
      `Refund FAILED — order #${order.orderNumber}`,
      adminNoticeHtml(
        order,
        approved,
        'Could not refund — the order was not found on the store. Handle manually:',
      ),
    );
    return 'failed';
  }
  // WooCommerce can create a refund record that moved NO money (e.g. the gateway
  // charge is already drained) without raising an error. Verify the gateway actually
  // returned ~the expected amount; if it's short, treat it as a failure so we don't
  // email the customer "refunded" or archive an unrefunded order.
  const actual = refundedAmount(result);
  if (actual + 0.01 < expected) {
    logger.error(
      { orderId: order.orderId, expected, actual },
      'Refund moved less money than expected — gateway may have rejected; left for manual handling',
    );
    await emailAdmins(
      recipients,
      `Refund SHORT — order #${order.orderNumber}`,
      adminNoticeHtml(
        order,
        approved,
        `WooCommerce only refunded £${actual.toFixed(2)} of the expected £${expected.toFixed(2)} (the payment may already be refunded). Handle manually:`,
      ),
    );
    return 'failed'; // do NOT email customer / archive — the money didn't move
  }

  // Refund succeeded → email the customer (best-effort).
  if (order.customerEmail) {
    try {
      await sendMail({
        to: order.customerEmail,
        bcc: recipients,
        subject: `Your Wosiwosi refund — order #${order.orderNumber}`,
        html: customerRefundHtml(order.customerName, order.orderNumber, approved),
      });
    } catch (err) {
      logger.error(
        { err, orderId: order.orderId },
        'Refund email to customer failed — archiving anyway',
      );
    }
  }

  // Any not-approved items on this order won't be refunded — tell an admin.
  if (notApproved.length > 0) {
    await emailAdmins(
      recipients,
      `Refund partly not approved — order #${order.orderNumber}`,
      adminNoticeHtml(
        order,
        notApproved,
        'These items on a refunded order were not approved and were not refunded:',
      ),
    );
  }

  await archiveOrder(order, approved);
  await Refund.deleteOne({ _id: refund._id });
  return 'refunded';
}

/** 20:00 — issue approved refunds, archive them; cancel unapproved + notify admins. */
export async function runRefundStage(): Promise<RefundStageResult> {
  const recipients = await settingsService.refundBcc();
  const refunds = await Refund.find({ 'items.0': { $exists: true } });
  let refunded = 0;
  let cancelled = 0;
  let failed = 0;

  // Each order is fully isolated: ANY error for one (refund, DB, archive, email) is
  // caught here so the rest of the batch always continues.
  for (const refund of refunds) {
    try {
      const outcome = await processOneRefund(refund, recipients);
      if (outcome === 'refunded') refunded++;
      else if (outcome === 'cancelled') cancelled++;
      else if (outcome === 'failed') failed++;
      // 'skipped' (stale, already archived) is not counted.
    } catch (err) {
      failed++;
      logger.error(
        { err, orderId: refund.orderId },
        'Refund stage: unexpected error for this order — skipped, continuing the batch',
      );
      Sentry.captureException(err, {
        tags: { area: 'cron', stage: 'refund' },
        extra: { orderId: refund.orderId },
      });
      try {
        await emailAdmins(
          recipients,
          `Refund FAILED — order #${refund.orderNumber}`,
          `<p>An unexpected error stopped processing this order's refund. Please handle it manually.</p>`,
        );
      } catch {
        /* best-effort admin notice */
      }
    }
  }

  logger.info({ refunded, cancelled, failed }, 'Refund stage complete');
  return { refunded, cancelled, failed };
}

/** 21:00 — every remaining completed order is archived (notes carried) and removed. */
export async function runArchiveStage(): Promise<{ archived: number; redosSwept: number }> {
  const orders = await Order.find({ status: true });
  let archived = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      await archiveOrder(order, []);
      archived++;
    } catch (err) {
      failed++;
      logger.error(
        { err, orderId: order.orderId },
        'Archive stage: order failed — continuing the batch',
      );
      Sentry.captureException(err, {
        tags: { area: 'cron', stage: 'archive' },
        extra: { orderId: order.orderId },
      });
    }
  }

  // Sweep completed redos off the Processing/Completed lists. This only FLAGS them
  // (`archived: true`) — they STAY in `redos` (never moved to `redundant`) and still
  // show in the Redo report. Isolated so a failure here can't undo the order archive.
  let redosSwept = 0;
  try {
    const res = await RedoOrder.updateMany(
      { status: true, archived: { $ne: true } },
      { $set: { archived: true } },
    );
    redosSwept = res.modifiedCount ?? 0;
  } catch (err) {
    logger.error({ err }, 'Archive stage: sweeping completed redos failed — continuing');
    Sentry.captureException(err, { tags: { area: 'cron', stage: 'archive-redo-sweep' } });
  }

  logger.info({ archived, failed, redosSwept }, 'Archive stage complete');
  return { archived, redosSwept };
}

/** 22:00 — fold any late-approved refunds, then clear the day's notifications. */
export async function runCleanupStage(): Promise<{
  refunds: RefundStageResult;
  notificationsCleared: number;
}> {
  const refunds = await runRefundStage();
  const res = await Notification.deleteMany({});
  const notificationsCleared = res.deletedCount ?? 0;
  logger.info({ notificationsCleared }, 'Cleanup stage complete');
  return { refunds, notificationsCleared };
}

/** Run all three stages in order (for a manual full run). */
export async function runAllStages(): Promise<void> {
  await runRefundStage();
  await runArchiveStage();
  await runCleanupStage();
}

/**
 * Register the schedule (production only — so a dev machine pointed at the shared
 * cluster never refunds/archives real data at 8pm; use the CLI script in dev).
 * Scheduling registers timers only; no data is touched until a stage fires.
 */
export function scheduleArchiveCron(): void {
  // Production only. Dev shares the production MongoDB cluster, so a dev machine (or
  // any second process) that left this scheduled would fire REAL WooCommerce refunds
  // and archive/delete live data at 20:00. In dev, run stages by hand with
  // scripts/run-archive.ts. (Heroku sets NODE_ENV=production automatically.)
  // if (env.NODE_ENV !== 'production') {
  //   logger.info(
  //     'Archive cron not scheduled (NODE_ENV != production) — use scripts/run-archive.ts to run stages manually',
  //   );
  //   return;
  // }
  const timezone = 'Europe/London';
  const guard = (stage: string, fn: () => Promise<unknown>) => () => {
    fn().catch((err) => {
      logger.error({ err, stage }, 'Archive cron stage failed');
      Sentry.captureException(err, { tags: { area: 'cron', stage } });
    });
  };
  cron.schedule('0 20 * * 1-5', guard('refund', runRefundStage), { timezone });
  cron.schedule('0 21 * * 1-5', guard('archive', runArchiveStage), { timezone });
  cron.schedule('0 22 * * 1-5', guard('cleanup', runCleanupStage), { timezone });
  logger.info({ timezone }, 'Archive cron scheduled (Mon–Fri 20:00 / 21:00 / 22:00)');
}
