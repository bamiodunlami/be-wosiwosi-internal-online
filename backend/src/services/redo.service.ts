import { RedoOrder, type RedoOrderDoc } from '../models/redo.model.js';
import { Order } from '../models/order.model.js';
import { Redundant } from '../models/redundant.model.js';
import { User } from '../models/user.model.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';
import { refundWooOrder, refundedAmount, type WooRefundLine } from '../util/woo.js';
import { sendMail } from '../util/mailer.js';
import { customerRefundHtml } from '../util/refundEmail.js';
import { refundAmountError } from '../util/money.js';
import { logger } from '../util/logger.js';
import * as settingsService from './settings.service.js';
import { notify } from './notification.service.js';
import type {
  RedoListItem,
  RedoDetail,
  RedoNote,
  RedoProduct,
  CreateRedoRequest,
  RedoRefundRequest,
  RedoReplacementRequest,
} from '../util/types/redo.js';

/**
 * Redo business logic (SPEC §9). A redo is created from a completed order — the
 * customer/delivery details, the products being redone, and the original context
 * (notes, packer, completion date) are snapshotted at creation, so the redo never
 * depends on the original order still existing.
 *
 * View segregation is the important rule: a packer only ever receives the redo's
 * own data; supervisors/super-admins also get the original context.
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

// ── DTO mapping ──────────────────────────────────────────────────────────────

function noteToDTO(n: { authorName: string; authorRole: string; message: string; createdAt: Date }): RedoNote {
  return {
    authorName: n.authorName,
    authorRole: n.authorRole,
    message: n.message,
    createdAt: n.createdAt.toISOString(),
  };
}

function toListItem(doc: RedoOrderDoc): RedoListItem {
  const total = doc.products.reduce((sum, p) => sum + (Number(p.price) || 0) * p.quantity, 0);
  return {
    id: String(doc._id),
    originalOrderNumber: doc.originalOrderNumber,
    reason: doc.reason,
    customerName: doc.customerName,
    postcode: doc.postcode,
    total: total.toFixed(2),
    productCount: doc.products.length,
    pickedCount: doc.products.filter((p) => p.picked).length,
    products: doc.products.map(productToDTO),
    dryPicked: doc.dryPicked,
    meatPicked: doc.meatPicked,
    lock: doc.lock,
    assigned: doc.assigned ? { id: String(doc.assigned), name: doc.assignedName } : null,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
  };
}

function productToDTO(p: RedoOrderDoc['products'][number]): RedoProduct {
  return {
    productId: p.productId,
    name: p.name,
    quantity: p.quantity,
    price: p.price,
    sku: p.sku,
    image: p.image,
    cutOption: p.cut,
    frozen: p.frozen,
    picked: p.picked,
    refundStatus: p.refundStatus,
    refundQuantity: p.refundQuantity,
    replacement: p.replacement,
    replacementProduct: p.replacementProduct,
    replacementQuantity: p.replacementQuantity,
    replacementNote: p.replacementNote,
  };
}

/** Build the detail view, filtering the original context out for packers (SPEC §9). */
function toDetail(doc: RedoOrderDoc, user: Actor): RedoDetail {
  const isPacker = user.role === Roles.PACKER;
  const detail: RedoDetail = {
    id: String(doc._id),
    originalOrderId: doc.originalOrderId,
    originalOrderNumber: doc.originalOrderNumber,
    reason: doc.reason,
    reasonDetail: doc.reasonDetail,
    customerName: doc.customerName,
    customerEmail: isPacker ? '' : doc.customerEmail,
    customerPhone: isPacker ? '' : doc.customerPhone,
    postcode: doc.postcode,
    address: doc.address,
    customerNote: doc.customerNote,
    shippingZone: doc.shippingZone,
    shippingAmount: doc.shippingAmount,
    products: doc.products.map(productToDTO),
    status: doc.status,
    dryPicked: doc.dryPicked,
    meatPicked: doc.meatPicked,
    assigned: doc.assigned ? { id: String(doc.assigned), name: doc.assignedName } : null,
    lock: doc.lock,
    redoNotes: doc.redoNotes.map(noteToDTO),
    createdByName: doc.createdByName,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
  };

  // Supervisors and above also see the snapshotted original-order context.
  if (hasAtLeast(user.role, Roles.SUPERVISOR)) {
    detail.original = {
      packerName: doc.originalPackerName,
      completedAt: doc.originalCompletedAt ? doc.originalCompletedAt.toISOString() : null,
      notes: doc.originalNotes.map(noteToDTO),
    };
  }
  return detail;
}

// ── Access ───────────────────────────────────────────────────────────────────

/** Packers may only touch redos assigned to them; supervisors/admins, any. */
function assertCanAccess(doc: RedoOrderDoc, user: Actor): void {
  if (user.role === Roles.PACKER && String(doc.assigned ?? '') !== user.id) {
    throw httpError(403, 'Forbidden');
  }
}

async function loadForWrite(
  id: string,
  user: Actor,
  opts: { allowLocked?: boolean } = {},
): Promise<RedoOrderDoc> {
  const doc = await RedoOrder.findById(id);
  if (!doc) throw httpError(404, 'Redo not found');
  assertCanAccess(doc, user);
  if (doc.lock && !opts.allowLocked && !hasAtLeast(user.role, Roles.ADMIN)) {
    throw httpError(423, 'Redo is locked');
  }
  return doc;
}

async function loadAdmin(id: string): Promise<RedoOrderDoc> {
  const doc = await RedoOrder.findById(id);
  if (!doc) throw httpError(404, 'Redo not found');
  return doc;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Redos in the queue — packers see only their own; supervisors and up see all. */
export async function list(user: Actor): Promise<RedoListItem[]> {
  // Exclude redos the nightly cron has swept off the working board (completed +
  // archived). They stay in `redos` for the Redo report, just not the Processing/
  // Completed lists.
  const filter: Record<string, unknown> = { archived: { $ne: true } };
  // A packer works only their own open redos (Processing), but the Completed list
  // is a pure VIEW open to everyone — so let packers see any completed redo too.
  if (user.role === Roles.PACKER) {
    filter.$or = [{ assigned: user.id }, { status: true }];
  }
  const docs = await RedoOrder.find(filter).sort({ createdAt: -1 });
  return docs.map(toListItem);
}

export async function getById(id: string, user: Actor): Promise<RedoDetail | null> {
  const doc = await RedoOrder.findById(id);
  if (!doc) return null;
  assertCanAccess(doc, user);
  return toDetail(doc, user);
}

/**
 * Redos raised within a date range — the Redo report (Reports page). Filters on
 * `createdAt` (when the redo was raised); reuses the list shape, which already
 * carries reason, packer and status. Supervisor+.
 */
export async function reportInRange(range?: { from?: Date; to?: Date }): Promise<RedoListItem[]> {
  const filter: Record<string, unknown> = {};
  if (range?.from || range?.to) {
    const createdAt: Record<string, Date> = {};
    if (range.from) createdAt.$gte = range.from;
    if (range.to) createdAt.$lte = range.to;
    filter.createdAt = createdAt;
  }
  const docs = await RedoOrder.find(filter).sort({ createdAt: -1 });
  return docs.map(toListItem);
}

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a redo from a completed order (Admin+). Snapshots the customer/delivery
 * details, the products being redone (everything not in `excludedProductIds`), and
 * the original context. Looks the source order up in the working set, then the
 * archive.
 */
export async function createRedo(input: CreateRedoRequest, actor: Actor): Promise<RedoDetail> {
  // An order CAN be redone more than once (mistakes recur), but only one redo may be
  // in progress at a time — block a new one while a previous redo is still open.
  const active = await RedoOrder.findOne({
    originalOrderId: input.originalOrderId,
    status: false,
  }).select('_id');
  if (active) {
    throw httpError(409, 'A redo for this order is still in progress — complete it before starting another');
  }

  const source =
    (await Order.findOne({ orderId: input.originalOrderId })) ??
    (await Redundant.findOne({ orderId: input.originalOrderId }));
  if (!source) throw httpError(404, 'Original order not found');

  const excluded = new Set(input.excludedProductIds);
  const products = source.products
    .filter((p) => !excluded.has(p.productId))
    .map((p) => ({
      productId: p.productId,
      // Carry the Woo line-item id so a redo refund can be line-item precise.
      lineItemId: p.lineItemId,
      name: p.name,
      quantity: p.quantity,
      price: p.price,
      sku: p.sku,
      image: p.image,
      frozen: p.frozen,
      cut: p.cut,
      picked: false,
    }));
  if (products.length === 0) throw httpError(400, 'A redo needs at least one product');

  const redo = await RedoOrder.create({
    originalOrderId: source.orderId,
    originalOrderNumber: source.orderNumber,
    originalCompletedAt: source.completedAt ?? null,
    reason: input.reason,
    reasonDetail: input.reasonDetail ?? '',
    customerName: source.customerName,
    customerEmail: source.customerEmail,
    customerPhone: source.customerPhone,
    postcode: source.postcode,
    address: source.address,
    customerNote: source.customerNote,
    shippingZone: source.shippingZone,
    shippingAmount: source.shippingAmount,
    products,
    originalNotes: source.notes.map((n) => ({
      authorId: n.authorId,
      authorName: n.authorName,
      authorRole: n.authorRole,
      message: n.message,
      createdAt: n.createdAt,
    })),
    originalPackerName: source.assignedName,
    createdById: actor.id,
    createdByName: actor.name,
  });

  return toDetail(redo, actor);
}

// ── Fulfilment (packer / shared) ─────────────────────────────────────────────

export async function setPicked(
  id: string,
  index: number,
  picked: boolean,
  user: Actor,
): Promise<RedoDetail> {
  const doc = await loadForWrite(id, user);
  const product = doc.products[index];
  if (!product) throw httpError(404, 'Product not found');
  product.picked = picked;
  await doc.save();
  return toDetail(doc, user);
}

export async function setStage(id: string, stage: 'dry' | 'meat', user: Actor): Promise<RedoDetail> {
  const doc = await loadForWrite(id, user);
  if (stage === 'dry') doc.dryPicked = !doc.dryPicked;
  else doc.meatPicked = !doc.meatPicked;
  await doc.save();
  return toDetail(doc, user);
}

export async function complete(id: string, user: Actor): Promise<RedoDetail> {
  const doc = await loadForWrite(id, user);
  doc.status = true;
  doc.completedAt = new Date();
  await doc.save();
  return toDetail(doc, user);
}

/** Append a note to the redo's own thread (kept separate from the original order's). */
export async function addNote(id: string, author: Actor, message: string): Promise<RedoNote[]> {
  const doc = await loadForWrite(id, author, { allowLocked: true });
  doc.redoNotes.push({
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role,
    message,
    createdAt: new Date(),
  } as never);
  await doc.save();

  // Notify per SPEC §6 routing, scoped to the redo (targetType 'redoOrder'): packer
  // → admins; supervisor → assigned packer + admins; admin/super → assigned packer.
  const base = {
    orderId: doc.originalOrderId,
    orderNumber: doc.originalOrderNumber,
    kind: 'note' as const,
    senderName: author.name,
    senderRole: author.role,
    message: `Redo #${doc.originalOrderNumber} — ${author.name}: ${message}`,
    targetType: 'redoOrder' as const,
    redoId: String(doc._id),
  };
  const assignedId = doc.assigned ? String(doc.assigned) : null;
  if (author.role === Roles.PACKER) {
    await notify({ ...base, recipientRole: Roles.ADMIN });
  } else if (author.role === Roles.SUPERVISOR) {
    if (assignedId) await notify({ ...base, recipientId: assignedId });
    await notify({ ...base, recipientRole: Roles.ADMIN });
  } else if (assignedId) {
    await notify({ ...base, recipientId: assignedId });
  }

  return doc.redoNotes.map(noteToDTO);
}

// ── Refunds (real refund issued against the ORIGINAL order at approval) ──────

/** Build precise Woo refund lines for one redo product; null → amount-only fallback. */
function refundLinesForProduct(
  doc: RedoOrderDoc,
  productId: number,
  quantity: number,
  amount: string,
): WooRefundLine[] | null {
  const product = doc.products.find((p) => p.productId === productId);
  if (!product || !product.lineItemId) return null;
  return [{ id: product.lineItemId, quantity, refund_total: amount }];
}

/**
 * Issue the real WooCommerce refund for one redo line against the ORIGINAL order's
 * payment. Line-item precise when the original line id is known, amount-only
 * otherwise. Throws on gateway failure so the caller can abort before persisting.
 */
async function issueRedoRefund(
  doc: RedoOrderDoc,
  productId: number,
  quantity: number,
  amount: string,
): Promise<void> {
  const lines = refundLinesForProduct(doc, productId, quantity, amount);
  const result = await refundWooOrder(doc.originalOrderId, {
    reason: `Redo #${doc.originalOrderNumber} refund`,
    amount,
    lineItems: lines ?? undefined,
    apiRefund: true,
  });
  if (result === null) throw httpError(502, 'the original order was not found on the store');
  // Make sure the gateway actually moved the money (a record with £0 total means it
  // didn't — e.g. the original payment is already refunded).
  const expected = Number(amount);
  const actual = refundedAmount(result);
  if (actual + 0.01 < expected) {
    throw httpError(
      422,
      `only £${actual.toFixed(2)} of £${expected.toFixed(2)} could be refunded (the original payment may already be refunded)`,
    );
  }
}

/**
 * Request a refund on one redo product. Always creates a **pending** request that
 * surfaces on the central Refunds page for an Admin to approve/reject — there's no
 * auto-approve and no money moves here (the real refund fires on approval, see
 * `resolveRefund`). One decision per product.
 */
export async function requestRefund(
  id: string,
  input: RedoRefundRequest,
  actor: Actor,
): Promise<RedoDetail> {
  const doc = await loadForWrite(id, actor);
  const product = doc.products.find((p) => p.productId === input.productId);
  if (!product) throw httpError(404, 'Product not found on this redo');
  if (input.quantity > product.quantity) {
    throw httpError(400, `Quantity exceeds the ${product.quantity} on this redo`);
  }
  const amountErr = refundAmountError(input.amount, product.price, input.quantity);
  if (amountErr) throw httpError(400, amountErr);
  if (product.refundStatus !== 'none') {
    const msg =
      product.refundStatus === 'rejected'
        ? 'This refund was rejected and cannot be requested again'
        : `A refund is already ${product.refundStatus} for this product`;
    throw httpError(409, msg);
  }
  if (product.replacement) throw httpError(409, 'This line was replaced — clear it first');

  product.refund = true;
  product.refundStatus = 'pending';
  product.refundQuantity = input.quantity;

  doc.refundItems.push({
    productId: input.productId,
    productName: product.name,
    quantity: input.quantity,
    amount: input.amount,
    status: false,
    approval: false,
    requestedById: actor.id,
    requestedByName: actor.name,
    requestedByRole: actor.role,
    requestedAt: new Date(),
    resolvedByName: '',
    resolvedAt: null,
  } as never);
  await doc.save();

  // Ping admins to review it on the Refunds page (skip self-notify for admins).
  if (!hasAtLeast(actor.role, Roles.ADMIN)) {
    await notify({
      orderId: doc.originalOrderId,
      orderNumber: doc.originalOrderNumber,
      kind: 'refund',
      senderName: actor.name,
      senderRole: actor.role,
      recipientRole: Roles.ADMIN,
      message: `Redo #${doc.originalOrderNumber} refund requested: ${product.name} ×${input.quantity} (£${input.amount})`,
      targetType: 'redoOrder',
      redoId: String(doc._id),
    });
  }
  return toDetail(doc, actor);
}

export type RedoRefundDecision = 'approved' | 'rejected' | 'pending';

/**
 * Resolve a pending redo refund (Admin+). On 'approved' the real WooCommerce
 * refund is issued against the original order before the record is committed.
 */
export async function resolveRefund(
  id: string,
  productId: number,
  decision: RedoRefundDecision,
  actor: Actor,
): Promise<RedoDetail> {
  const doc = await loadAdmin(id);
  const item = doc.refundItems.find((it) => it.productId === productId);
  if (!item) throw httpError(404, 'Refund item not found');
  const product = doc.products.find((p) => p.productId === productId);

  if (decision === 'approved') {
    // Issue the real refund first — if WooCommerce rejects it (e.g. the original
    // order has less left to refund than this amount), surface that reason and keep
    // the request pending (nothing persisted) so the admin can reject or handle it.
    try {
      await issueRedoRefund(doc, productId, item.quantity, item.amount);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'the refund could not be issued';
      throw httpError(422, `Couldn't refund: ${reason}`);
    }
    item.status = true;
    item.approval = true;
    item.resolvedByName = actor.name;
    item.resolvedAt = new Date();
    if (product) {
      product.refund = true;
      product.refundStatus = 'approved';
      product.refundQuantity = item.quantity;
      product.picked = true;
    }
  } else if (decision === 'rejected') {
    item.status = true;
    item.approval = false;
    item.resolvedByName = actor.name;
    item.resolvedAt = new Date();
    if (product) {
      product.refund = false;
      product.refundStatus = 'rejected';
      product.refundQuantity = 0;
    }
  } else {
    item.status = false;
    item.approval = false;
    item.resolvedByName = '';
    item.resolvedAt = null;
    if (product) {
      product.refund = true;
      product.refundStatus = 'pending';
      product.refundQuantity = item.quantity;
    }
  }
  await doc.save();

  // On approval the real refund just went through — email the customer (best-effort,
  // BCC the refund-recipients setting), mirroring the cron's order-refund email.
  if (decision === 'approved' && doc.customerEmail) {
    try {
      await sendMail({
        to: doc.customerEmail,
        bcc: await settingsService.refundBcc(),
        subject: `Your Wosiwosi refund — order #${doc.originalOrderNumber}`,
        html: customerRefundHtml(doc.customerName, doc.originalOrderNumber, [
          { productName: item.productName, quantity: item.quantity, amount: item.amount },
        ]),
      });
    } catch (err) {
      logger.error({ err, redoId: String(doc._id) }, 'Redo refund email to customer failed');
    }
  }

  if (decision !== 'pending' && item.requestedById) {
    await notify({
      orderId: doc.originalOrderId,
      orderNumber: doc.originalOrderNumber,
      kind: 'refund',
      senderName: actor.name,
      senderRole: actor.role,
      recipientId: item.requestedById,
      message: `Redo #${doc.originalOrderNumber} refund ${decision}: ${item.productName} ×${item.quantity} (£${item.amount})`,
      targetType: 'redoOrder',
      redoId: String(doc._id),
    });
  }
  return toDetail(doc, actor);
}

// ── Replacements (reference-only, no approval) ───────────────────────────────

export async function logReplacement(
  id: string,
  input: RedoReplacementRequest,
  actor: Actor,
): Promise<RedoDetail> {
  const doc = await loadForWrite(id, actor);
  const product = doc.products.find((p) => p.productId === input.productId);
  if (!product) throw httpError(404, 'Product not found on this redo');
  if (product.refundStatus === 'pending' || product.refundStatus === 'approved') {
    throw httpError(409, 'A refund is in flight for this product');
  }
  if (input.quantity > product.quantity) {
    throw httpError(400, `Quantity exceeds the ${product.quantity} on this redo`);
  }

  product.replacement = true;
  product.replacementProduct = input.replacementProduct;
  product.replacementQuantity = input.quantity;
  product.replacementNote = input.note ?? '';

  doc.replacementItems.push({
    productId: input.productId,
    originalProduct: product.name,
    originalPrice: product.price,
    replacementProduct: input.replacementProduct,
    quantity: input.quantity,
    note: input.note ?? '',
    replacedById: actor.id,
    replacedByName: actor.name,
    replacedByRole: actor.role,
    replacedAt: new Date(),
  } as never);
  await doc.save();
  return toDetail(doc, actor);
}

/** Cancel a logged replacement (Admin+) — the line goes back to needing handling. */
export async function clearReplacement(
  id: string,
  productId: number,
  actor: Actor,
): Promise<RedoDetail> {
  const doc = await loadAdmin(id);
  const product = doc.products.find((p) => p.productId === productId);
  if (product) {
    product.replacement = false;
    product.replacementProduct = '';
    product.replacementQuantity = 0;
    product.replacementNote = '';
    product.picked = false;
  }
  const idx = doc.replacementItems.findIndex((it) => it.productId === productId);
  if (idx >= 0) doc.replacementItems.splice(idx, 1);
  await doc.save();
  return toDetail(doc, actor);
}

/** Remove a redo entirely (Admin+) — deletes it from the redos collection. */
export async function remove(id: string): Promise<void> {
  const res = await RedoOrder.deleteOne({ _id: id });
  if (res.deletedCount === 0) throw httpError(404, 'Redo not found');
}

/** Clear the redo's staff-note thread (Admin+). Returns the (now empty) thread. */
export async function clearNotes(id: string, _actor: Actor): Promise<RedoNote[]> {
  const doc = await loadAdmin(id);
  doc.redoNotes.splice(0, doc.redoNotes.length);
  await doc.save();
  return doc.redoNotes.map(noteToDTO);
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function assign(id: string, packerId: string, actor: Actor): Promise<RedoDetail> {
  const doc = await loadAdmin(id);
  const packer = await User.findById(packerId);
  if (!packer || packer.role !== Roles.PACKER) throw httpError(400, 'Packer not found');
  doc.assigned = packer._id as RedoOrderDoc['assigned'];
  doc.assignedName = `${packer.fname} ${packer.lname}`.trim();
  await doc.save();
  return toDetail(doc, actor);
}

export async function toggleLock(id: string, actor: Actor): Promise<RedoDetail> {
  const doc = await loadAdmin(id);
  doc.lock = !doc.lock;
  await doc.save();
  return toDetail(doc, actor);
}

export async function resetWorker(id: string, actor: Actor): Promise<RedoDetail> {
  const doc = await loadAdmin(id);
  doc.assigned = null;
  doc.assignedName = '';
  await doc.save();
  return toDetail(doc, actor);
}
