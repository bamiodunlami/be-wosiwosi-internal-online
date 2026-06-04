import { Replacement, type ReplacementDoc } from '../models/replacement.model.js';
import { Order } from '../models/order.model.js';
import { RedoOrder, type RedoOrderDoc } from '../models/redo.model.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';
import type { Replacement as ReplacementDTO } from '../util/types/replacement.js';

/**
 * Replacement (substitution) logging. Reference data only — no approval, no
 * notification. Any role with access to the order may log a substitution; packers
 * are scoped to their own assigned order. Each logged entry is mirrored onto the
 * order product (for the detail view) and into the `replacements` collection (for
 * the date-ranged report).
 */

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

export function toDTO(doc: ReplacementDoc): ReplacementDTO {
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    customerName: doc.customerName,
    items: doc.items.map((it) => ({
      productId: it.productId,
      originalProduct: it.originalProduct,
      originalPrice: it.originalPrice,
      replacementProduct: it.replacementProduct,
      quantity: it.quantity,
      note: it.note,
      replacedByName: it.replacedByName,
      replacedByRole: it.replacedByRole,
      replacedAt: it.replacedAt.toISOString(),
    })),
  };
}

/**
 * Log (or update) a substitution on one product. Flags the product on the order so
 * the detail view shows it, and records the reference entry. A product with an
 * in-flight refund (pending/approved) can't also be replaced — the two are
 * mutually exclusive.
 */
export async function logReplacement(
  input: { orderId: number; productId: number; quantity: number; replacementProduct: string; note?: string },
  actor: Actor,
): Promise<ReplacementDTO> {
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
  if (product.refundStatus === 'pending' || product.refundStatus === 'approved') {
    throw httpError(409, 'This product has a refund in progress and cannot be replaced');
  }

  const now = new Date();
  const replacementProduct = input.replacementProduct.trim();
  const note = (input.note ?? '').trim();

  // Snapshot onto the order product for the detail view's Replace column. A
  // replaced line is handled, so it's marked picked (and the refund path is closed
  // off in the UI). Only an Admin/Super Admin can later cancel the replacement.
  product.replacement = true;
  product.replacementProduct = replacementProduct;
  product.replacementQuantity = input.quantity;
  product.replacementNote = note;
  product.picked = true;
  await order.save();

  let replacement = await Replacement.findOne({ orderId: input.orderId });
  if (!replacement) {
    replacement = new Replacement({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: [],
    });
  }

  const entry = {
    productId: product.productId,
    originalProduct: product.name,
    originalPrice: product.price,
    replacementProduct,
    quantity: input.quantity,
    note,
    replacedById: actor.id,
    replacedByName: actor.name,
    replacedByRole: actor.role,
    replacedAt: now,
  };

  const idx = replacement.items.findIndex((it) => it.productId === product.productId);
  if (idx >= 0) replacement.items.set(idx, entry as never);
  else replacement.items.push(entry as never);
  await replacement.save();

  return toDTO(replacement);
}

/**
 * Cancel a logged substitution on one product (Admin and above — a change-of-mind
 * undo). Clears the reference entry and un-marks the pick, so the line is back to
 * needing handling.
 */
export async function clearReplacement(
  orderId: number,
  productId: number,
  actor: Actor,
): Promise<ReplacementDTO | null> {
  if (!hasAtLeast(actor.role, Roles.ADMIN)) throw httpError(403, 'Forbidden');

  const order = await Order.findOne({ orderId });
  if (!order) throw httpError(404, 'Order is not in processing');

  const product = order.products.find((p) => p.productId === productId);
  if (product) {
    product.replacement = false;
    product.replacementProduct = '';
    product.replacementQuantity = 0;
    product.replacementNote = '';
    product.picked = false; // back to unhandled — the swap was undone
    await order.save();
  }

  const replacement = await Replacement.findOne({ orderId });
  if (!replacement) return null;
  const idx = replacement.items.findIndex((it) => it.productId === productId);
  if (idx >= 0) replacement.items.splice(idx, 1);
  await replacement.save();
  return toDTO(replacement);
}

/**
 * Replacements logged within a date range, newest first — the basis for the
 * Admin/Super Admin report. Filters on each entry's `replacedAt`, returning only
 * orders that have at least one matching entry. (Wired for the Reports slice.)
 */
export async function listReplacements(range?: { from?: Date; to?: Date }): Promise<ReplacementDTO[]> {
  const docs = await Replacement.find({ 'items.0': { $exists: true } }).sort({ updatedAt: -1 });
  // Redos carry their own replacement records — fold them into the same report.
  const redos = await RedoOrder.find({ 'replacementItems.0': { $exists: true } }).sort({ updatedAt: -1 });
  const all = [...docs.map(toDTO), ...redos.map(redoToReplacementDTO)];
  if (!range?.from && !range?.to) return all;

  const from = range.from?.getTime() ?? -Infinity;
  const to = range.to?.getTime() ?? Infinity;
  return all
    .map((dto) => ({
      ...dto,
      items: dto.items.filter((it) => {
        const t = new Date(it.replacedAt).getTime();
        return t >= from && t <= to;
      }),
    }))
    .filter((dto) => dto.items.length > 0);
}

/** Map a redo's replacement records into the shared Replacement report DTO. */
function redoToReplacementDTO(doc: RedoOrderDoc): ReplacementDTO {
  return {
    id: String(doc._id),
    orderId: doc.originalOrderId,
    orderNumber: `${doc.originalOrderNumber} (redo)`,
    customerName: doc.customerName,
    items: doc.replacementItems.map((it) => ({
      productId: it.productId,
      originalProduct: it.originalProduct,
      originalPrice: it.originalPrice,
      replacementProduct: it.replacementProduct,
      quantity: it.quantity,
      note: it.note,
      replacedByName: it.replacedByName,
      replacedByRole: it.replacedByRole,
      replacedAt: it.replacedAt.toISOString(),
    })),
  };
}
