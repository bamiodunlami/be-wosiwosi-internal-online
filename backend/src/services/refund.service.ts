import { Refund, type RefundDoc } from '../models/refund.model.js';
import { Order } from '../models/order.model.js';
import { RedoOrder, type RedoOrderDoc } from '../models/redo.model.js';
import { Redundant, type RedundantDoc } from '../models/redundant.model.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';
import { refundWooOrder, refundedAmount, type WooRefundLine } from '../util/woo.js';
import { sendMail } from '../util/mailer.js';
import { customerRefundHtml } from '../util/refundEmail.js';
import { logger } from '../util/logger.js';
import type { Refund as RefundDTO } from '../util/types/refund.js';
import * as settingsService from './settings.service.js';
import { notify } from './notification.service.js';

interface Actor {
  id: string;
  name: string;
  role: Role;
}

function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

export function toDTO(doc: RefundDoc): RefundDTO {
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    items: doc.items.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      amount: it.amount,
      status: it.status,
      approval: it.approval,
      requestedByName: it.requestedByName,
      requestedByRole: it.requestedByRole,
      requestedAt: it.requestedAt.toISOString(),
      resolvedByName: it.resolvedByName,
      resolvedAt: it.resolvedAt ? it.resolvedAt.toISOString() : null,
    })),
  };
}

/**
 * Mark a product for refund (create or update the request). Any role with access
 * to the order may request — packers only on their own assigned order. Also flags
 * the product on the order so the detail view shows the pending refund.
 */
export async function requestRefund(
  input: { orderId: number; productId: number; quantity: number; amount: string },
  actor: Actor,
): Promise<RefundDTO> {
  const order = await Order.findOne({ orderId: input.orderId });
  if (!order) {
    // The order may already be archived. Refunding it is a post-hoc correction:
    // issue the real refund immediately (there's no cron to do it).
    const archived = await Redundant.findOne({ orderId: input.orderId });
    if (archived) return requestArchivedRefund(archived, input, actor);
    throw httpError(404, 'Order not found');
  }
  if (actor.role === Roles.PACKER && String(order.assigned ?? '') !== actor.id) {
    throw httpError(403, 'Forbidden');
  }

  const product = order.products.find((p) => p.productId === input.productId);
  if (!product) throw httpError(404, 'Product not found on this order');
  if (input.quantity > product.quantity) {
    throw httpError(400, `Quantity exceeds the ${product.quantity} ordered`);
  }
  // One refund decision per product: can only request from a clean slate. Once
  // pending/approved it's in flight; once rejected it's final (no re-request).
  if (product.refundStatus !== 'none') {
    const msg =
      product.refundStatus === 'rejected'
        ? 'This refund was rejected and cannot be requested again'
        : `A refund is already ${product.refundStatus} for this product`;
    throw httpError(409, msg);
  }

  // An Admin/Super Admin requesting a refund needs no approval — it's approved
  // immediately. Packers/supervisors create a pending request.
  const autoApprove = hasAtLeast(actor.role, Roles.ADMIN);
  const now = new Date();

  // Flag on the order document for the detail view's Refund column.
  product.refund = true;
  product.refundStatus = autoApprove ? 'approved' : 'pending';
  product.refundQuantity = input.quantity;
  if (autoApprove) product.picked = true; // approved line is considered handled
  await order.save();

  let refund = await Refund.findOne({ orderId: input.orderId });
  if (!refund) {
    refund = new Refund({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      items: [],
    });
  }

  const entry = {
    productId: product.productId,
    productName: product.name,
    quantity: input.quantity,
    amount: input.amount,
    status: autoApprove, // resolved on creation when an admin requests
    approval: autoApprove,
    requestedById: actor.id,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    requestedAt: now,
    resolvedByName: autoApprove ? actor.name : '',
    resolvedAt: autoApprove ? now : null,
  };

  const idx = refund.items.findIndex((it) => it.productId === product.productId);
  if (idx >= 0) refund.items.set(idx, entry as never);
  else refund.items.push(entry as never);
  await refund.save();

  // A packer/supervisor request needs an admin's attention — notify admins+.
  if (!autoApprove) {
    await notify({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      kind: 'refund',
      senderName: actor.name,
      senderRole: actor.role,
      recipientRole: Roles.ADMIN,
      message: `Refund requested: ${product.name} ×${input.quantity} (£${input.amount})`,
    });
  }

  return toDTO(refund);
}

/**
 * Refund a product on an already-archived order (in `redundant`). The nightly cron
 * is gone for this order, so the real WooCommerce refund is issued **immediately**
 * against the original order and recorded on the archive doc (which the redundant-
 * only Refund report reads). Admin+ only — it's a post-hoc correction, not a queued
 * request.
 */
async function requestArchivedRefund(
  order: RedundantDoc,
  input: { orderId: number; productId: number; quantity: number; amount: string },
  actor: Actor,
): Promise<RefundDTO> {
  if (!hasAtLeast(actor.role, Roles.ADMIN)) {
    throw httpError(403, 'Only an admin can refund an archived order');
  }
  const product = order.products.find((p) => p.productId === input.productId);
  if (!product) throw httpError(404, 'Product not found on this order');
  if (input.quantity > product.quantity) {
    throw httpError(400, `Quantity exceeds the ${product.quantity} ordered`);
  }
  if (product.refundStatus !== 'none') {
    const msg =
      product.refundStatus === 'rejected'
        ? 'This refund was rejected and cannot be requested again'
        : `A refund is already ${product.refundStatus} for this product`;
    throw httpError(409, msg);
  }

  const now = new Date();
  // Issue the REAL refund first so a gateway failure aborts before we persist.
  const lines: WooRefundLine[] | undefined = product.lineItemId
    ? [{ id: product.lineItemId, quantity: input.quantity, refund_total: input.amount }]
    : undefined;
  try {
    const result = await refundWooOrder(order.orderId, {
      reason: `Order #${order.orderNumber} refund`,
      amount: input.amount,
      lineItems: lines,
      apiRefund: true,
    });
    if (result === null) throw new Error('the order was not found on the store');
    const expected = Number(input.amount);
    const actual = refundedAmount(result);
    if (actual + 0.01 < expected) {
      throw new Error(
        `only £${actual.toFixed(2)} of £${expected.toFixed(2)} could be refunded (the payment may already be refunded)`,
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'the refund could not be issued';
    throw httpError(422, `Couldn't refund: ${reason}`);
  }

  product.refund = true;
  product.refundStatus = 'approved';
  product.refundQuantity = input.quantity;
  product.picked = true;
  order.refundItems.push({
    productId: product.productId,
    productName: product.name,
    quantity: input.quantity,
    amount: input.amount,
    refundedAt: now,
  } as never);
  await order.save();

  // The real refund just went through — email the customer (best-effort, BCC the
  // refund-recipients setting), mirroring the cron's order-refund email.
  if (order.customerEmail) {
    try {
      await sendMail({
        to: order.customerEmail,
        bcc: await settingsService.refundBcc(),
        subject: `Your Wosiwosi refund — order #${order.orderNumber}`,
        html: customerRefundHtml(order.customerName, order.orderNumber, [
          { productName: product.name, quantity: input.quantity, amount: input.amount },
        ]),
      });
    } catch (err) {
      logger.error({ err, orderId: order.orderId }, 'Archived refund email to customer failed');
    }
  }

  // Response shape only (the client just refetches the order detail).
  return {
    id: String(order._id),
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: order.refundItems.map((it) => {
      const when = (it.refundedAt ?? order.archivedAt).toISOString();
      return {
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        amount: it.amount,
        status: true,
        approval: true,
        requestedByName: actor.name,
        requestedByRole: actor.role,
        requestedAt: when,
        resolvedByName: actor.name,
        resolvedAt: when,
      };
    }),
  };
}

/**
 * Every order with refund activity, newest first. Includes resolved items too, so
 * an Admin can re-open (cancel) an approval or a rejection from the review page.
 */
export async function listRefunds(): Promise<RefundDTO[]> {
  const docs = await Refund.find({ 'items.0': { $exists: true } }).sort({ updatedAt: -1 });
  const orderRefunds = docs.map(toDTO);

  // Pending redo refunds need an admin's decision too — surface them here, tagged
  // with `redoId` so the page routes approve/reject to the redo endpoint. Only
  // PENDING items appear; once resolved the refund is issued immediately and the
  // entry drops off the queue (redos are never archived, so nothing lingers).
  const redos = await RedoOrder.find({ 'refundItems.0': { $exists: true } }).sort({ updatedAt: -1 });
  const redoRefunds = redos
    .map((doc): RefundDTO => ({
      id: String(doc._id),
      redoId: String(doc._id),
      orderId: doc.originalOrderId,
      orderNumber: `${doc.originalOrderNumber} (redo)`,
      customerName: doc.customerName,
      customerEmail: doc.customerEmail,
      items: doc.refundItems
        .filter((it) => !it.status) // pending only
        .map((it) => ({
          productId: it.productId,
          productName: it.productName,
          quantity: it.quantity,
          amount: it.amount,
          status: it.status,
          approval: it.approval,
          requestedByName: it.requestedByName,
          requestedByRole: it.requestedByRole,
          requestedAt: it.requestedAt.toISOString(),
          resolvedByName: it.resolvedByName,
          resolvedAt: it.resolvedAt ? it.resolvedAt.toISOString() : null,
        })),
    }))
    .filter((dto) => dto.items.length > 0);

  return [...orderRefunds, ...redoRefunds];
}

/**
 * APPROVED refunds within a date range — the basis for the Reports page (the
 * refunds that actually happened). Filters each item on its `requestedAt` and keeps
 * only approved ones (status resolved + approval true). Returns orders with at
 * least one matching item.
 */
export async function reportInRange(range?: { from?: Date; to?: Date }): Promise<RefundDTO[]> {
  const from = range?.from?.getTime() ?? -Infinity;
  const to = range?.to?.getTime() ?? Infinity;
  const keepApprovedInRange = (it: { status: boolean; approval: boolean; requestedAt: string }) => {
    if (!(it.status && it.approval)) return false; // approved only
    const t = new Date(it.requestedAt).getTime();
    return t >= from && t <= to;
  };

  // Redundant-only (matching the Order report): a refund is reported once the cron
  // has issued it — it then lives in `redundant.refundItems` and the live `refunds`
  // doc is deleted. Approved-but-not-yet-issued refunds in the live `refunds`
  // collection are intentionally excluded.
  const archived = await Redundant.find({ 'refundItems.0': { $exists: true } }).sort({ archivedAt: -1 });
  const archivedRefunds = archived
    .map(redundantToRefundDTO)
    .map((dto) => ({ ...dto, items: dto.items.filter(keepApprovedInRange) }))
    .filter((dto) => dto.items.length > 0);

  // Redos carry their own refund records (issued against the original order at
  // approval) and are never archived — keep them as their own permanent source.
  const redos = await RedoOrder.find({ 'refundItems.0': { $exists: true } }).sort({ updatedAt: -1 });
  const redoRefunds = redos
    .map(redoToRefundDTO)
    .map((dto) => ({ ...dto, items: dto.items.filter(keepApprovedInRange) }))
    .filter((dto) => dto.items.length > 0);

  return [...archivedRefunds, ...redoRefunds];
}

/**
 * Map an archived order's refund payload into the shared Refund report DTO. The
 * archive only keeps approved snapshots (product/qty/amount), so they're treated as
 * approved and dated by `archivedAt` (when the cron actually issued the refund).
 */
function redundantToRefundDTO(doc: RedundantDoc): RefundDTO {
  const fallback = doc.archivedAt ?? doc.completedAt ?? doc.createdAt;
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    items: doc.refundItems.map((it) => {
      // Post-hoc refunds carry their own date; cron-issued ones fall back to archival.
      const when = (it.refundedAt ?? fallback).toISOString();
      return {
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        amount: it.amount,
        status: true,
        approval: true,
        requestedByName: '',
        requestedByRole: '',
        requestedAt: when,
        resolvedByName: '',
        resolvedAt: when,
      };
    }),
  };
}

/** Map a redo's refund records into the shared Refund report DTO (tagged as a redo). */
function redoToRefundDTO(doc: RedoOrderDoc): RefundDTO {
  return {
    id: String(doc._id),
    orderId: doc.originalOrderId,
    orderNumber: `${doc.originalOrderNumber} (redo)`,
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    items: doc.refundItems.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      quantity: it.quantity,
      amount: it.amount,
      status: it.status,
      approval: it.approval,
      requestedByName: it.requestedByName,
      requestedByRole: it.requestedByRole,
      requestedAt: it.requestedAt.toISOString(),
      resolvedByName: it.resolvedByName,
      resolvedAt: it.resolvedAt ? it.resolvedAt.toISOString() : null,
    })),
  };
}

export type RefundDecision = 'approved' | 'rejected' | 'pending';

/**
 * Set one product's refund decision (Admin and above):
 *  - 'approved' — resolved/approved; the order product is flagged and ticked picked.
 *  - 'rejected' — resolved/rejected; the order product's refund is cleared (pick &
 *     replace become available again), and it can't be re-requested.
 *  - 'pending'  — re-open: cancels an approval (or a rejection) back to pending.
 */
export async function resolveItem(
  refundId: string,
  productId: number,
  decision: RefundDecision,
  actor: Actor,
): Promise<RefundDTO> {
  const refund = await Refund.findById(refundId);
  if (!refund) throw httpError(404, 'Refund not found');

  const item = refund.items.find((it) => it.productId === productId);
  if (!item) throw httpError(404, 'Refund item not found');

  if (decision === 'pending') {
    item.status = false;
    item.approval = false;
    item.resolvedByName = '';
    item.resolvedAt = null;
  } else {
    item.status = true;
    item.approval = decision === 'approved';
    item.resolvedByName = actor.name;
    item.resolvedAt = new Date();
  }
  await refund.save();

  // Mirror onto the order product so the detail view gates pick/replace/refund.
  const order = await Order.findOne({ orderId: refund.orderId });
  if (order) {
    const product = order.products.find((p) => p.productId === productId);
    if (product) {
      product.refundStatus = decision;
      if (decision === 'rejected') {
        product.refund = false;
        product.refundQuantity = 0;
      } else {
        // approved or re-opened (pending): restore the requested quantity from the
        // refund item (it may have been zeroed by a prior rejection).
        product.refund = true;
        product.refundQuantity = item.quantity;
        if (decision === 'approved') product.picked = true; // refunded line is handled
      }
      await order.save();
    }
  }

  // Tell the requester the outcome (skip a plain re-open, which has no verdict).
  if (decision !== 'pending' && item.requestedById) {
    await notify({
      orderId: refund.orderId,
      orderNumber: refund.orderNumber,
      kind: 'refund',
      senderName: actor.name,
      senderRole: actor.role,
      recipientId: item.requestedById,
      message: `Refund ${decision}: ${item.productName} ×${item.quantity} (£${item.amount})`,
    });
  }

  return toDTO(refund);
}
