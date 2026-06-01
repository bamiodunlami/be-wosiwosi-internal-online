import { Refund, type RefundDoc } from '../models/refund.model.js';
import { Order } from '../models/order.model.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';
import type { Refund as RefundDTO } from '../util/types/refund.js';
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
  if (!order) throw httpError(404, 'Order is not in processing');
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
 * Every order with refund activity, newest first. Includes resolved items too, so
 * an Admin can re-open (cancel) an approval or a rejection from the review page.
 */
export async function listRefunds(): Promise<RefundDTO[]> {
  const docs = await Refund.find({ 'items.0': { $exists: true } }).sort({ updatedAt: -1 });
  return docs.map(toDTO);
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
