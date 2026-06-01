import { Order, type OrderDoc, type OrderProductSub } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import {
  fetchWooOrders,
  fetchWooOrder,
  fetchWooOrderStatus,
  type WooOrder,
  type WooAddress,
  type WooLineItem,
} from '../util/woo.js';
import { notify } from './notification.service.js';
import { Roles, hasAtLeast, type Role } from '../util/roles.js';
import type {
  Order as OrderDTO,
  OrderProduct,
  OrderDetail,
  OrderNote,
  StoreOrder,
} from '../util/types/order.js';

/**
 * Business logic for the order working set. Controllers call these; so will the
 * archival cron later. Nothing here touches Express req/res.
 *
 * The current user is passed in as a small `{ id, role }` so packer scoping
 * (a packer may only see and work on orders assigned to them) lives in one place.
 */

export interface ActingUser {
  id: string;
  role: Role;
}

type OrderListView = 'all' | 'processing' | 'completed';

// ── DTO mapping ──────────────────────────────────────────────────────────────

function productToDTO(p: OrderProductSub): OrderProduct {
  return {
    productId: p.productId,
    name: p.name,
    quantity: p.quantity,
    price: p.price,
    sku: p.sku,
    image: p.image,
    picked: p.picked,
    hidden: p.hidden,
    refund: p.refund,
    refundQuantity: p.refundQuantity,
    replacement: p.replacement,
    replacementNote: p.replacementNote,
  };
}

export function toDTO(doc: OrderDoc): OrderDTO {
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    customerName: doc.customerName,
    customerEmail: doc.customerEmail,
    customerPhone: doc.customerPhone,
    postcode: doc.postcode,
    address: doc.address,
    customerNote: doc.customerNote,
    total: doc.total,
    products: doc.products.map(productToDTO),
    status: doc.status,
    dryPicked: doc.dryPicked,
    meatPicked: doc.meatPicked,
    assigned: doc.assigned ? { id: String(doc.assigned), name: doc.assignedName } : null,
    lock: doc.lock,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

// ── Access guard ─────────────────────────────────────────────────────────────

function forbidden(): Error & { status: number } {
  const err = new Error('Forbidden') as Error & { status: number };
  err.status = 403;
  return err;
}

/** Packers may only touch their own assigned orders; supervisors/admins, any. */
function assertCanAccess(doc: OrderDoc, user: ActingUser): void {
  if (user.role === Roles.PACKER && String(doc.assigned ?? '') !== user.id) {
    throw forbidden();
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function list(opts: {
  view: OrderListView;
  q?: string;
  user: ActingUser;
}): Promise<OrderDTO[]> {
  const filter: Record<string, unknown> = {};

  // 'all' (used by global search) spans both processing and completed.
  if (opts.view === 'processing') filter.status = false;
  else if (opts.view === 'completed') filter.status = true;

  // Role scoping: a packer sees only their own orders; a supervisor sees every
  // assigned order (but not unassigned ones); an Admin / Super Admin sees
  // everything — including unassigned orders, to assign from the Processing page.
  if (opts.user.role === Roles.PACKER) {
    filter.assigned = opts.user.id;
  } else if (opts.user.role === Roles.SUPERVISOR) {
    filter.assigned = { $ne: null };
  }

  const q = opts.q?.trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const or: Record<string, unknown>[] = [{ orderNumber: rx }, { customerName: rx }];
    if (/^\d+$/.test(q)) or.push({ orderId: Number(q) });
    filter.$or = or;
  }

  const docs = await Order.find(filter).sort({ createdAt: -1 });
  return docs.map(toDTO);
}

export async function getById(id: string, user: ActingUser): Promise<OrderDTO | null> {
  const doc = await Order.findById(id);
  if (!doc) return null;
  assertCanAccess(doc, user);
  return toDTO(doc);
}

// ── WooCommerce pull (Super Admin) ───────────────────────────────────────────

function fullName(a: WooAddress): string {
  return `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
}

function formatAddress(a: WooAddress): string {
  return [a.address_1, a.address_2, a.city, a.state, a.postcode, a.country]
    .filter((part) => part && part.trim())
    .join(', ');
}

/**
 * Pull the product's cut/"Option" add-on (WCPA) out of a Woo line item. The shape
 * differs by how the order was created:
 *  - REST-API orders carry a plain `{ key:<field label>, value:<choice> }` entry.
 *  - Storefront/web orders carry a readable copy (`display_key:"Option"`,
 *    `display_value:"Cut"`) PLUS a hidden `_WCPA_order_meta_data` JSON blob.
 * So we (1) scan the readable, non-underscore entries for the option/cut field,
 * then (2) fall back to parsing the WCPA blob. Never trust a fixed position.
 */
function lineItemCutOption(li: WooLineItem): string {
  const metas = li.meta_data ?? [];

  // 1) Readable entry — present on REST orders and as WCPA's display copy on web.
  for (const m of metas) {
    if (String(m.key ?? '').startsWith('_')) continue; // skip _reduced_stock, _WCPA_*, …
    const label = String(m.display_key ?? m.key ?? '').trim();
    if (!isCutLabel(label)) continue;
    const value = cleanMetaText(m.display_value ?? m.value);
    if (value) return value;
  }

  // 2) Fallback: dig the choice out of the web order's _WCPA_order_meta_data blob.
  for (const m of metas) {
    if (String(m.key ?? '').toLowerCase() === '_wcpa_order_meta_data') {
      const value = cutFromWcpaBlob(m.value);
      if (value) return value;
    }
  }
  return '';
}

/** The cut add-on is labelled "Option" on the storefront, or contains "cut". */
function isCutLabel(label: string): boolean {
  return /cut/i.test(label) || label.toLowerCase() === 'option';
}

function cleanMetaText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, ' ') // display_value may be HTML
    .replace(/\s+/g, ' ')
    .trim();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Walk the WCPA `_WCPA_order_meta_data` blob: sections → field rows → fields. */
function cutFromWcpaBlob(blob: unknown): string {
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

function mapWooOrder(wo: WooOrder): Partial<OrderDoc> {
  const shipping = wo.shipping?.address_1 ? wo.shipping : wo.billing;
  return {
    orderId: wo.id,
    orderNumber: wo.number,
    customerName: fullName(wo.billing) || fullName(wo.shipping),
    customerEmail: wo.billing?.email ?? '',
    customerPhone: wo.billing?.phone ?? '',
    postcode: shipping?.postcode ?? wo.billing?.postcode ?? '',
    address: formatAddress(shipping),
    customerNote: wo.customer_note ?? '',
    total: wo.total,
    // Snapshot the live-only fields so the detail view is served from the DB.
    shippingZone: wo.shipping_lines?.[0]?.method_title ?? '',
    shippingAmount: wo.shipping_total ?? '',
    wooStatus: wo.status,
    dateCreated: wo.date_created ? new Date(wo.date_created) : null,
    products: (wo.line_items ?? []).map((li) => ({
      productId: li.product_id,
      name: li.name,
      quantity: li.quantity,
      price: li.price != null ? String(li.price) : (li.total ?? ''),
      sku: li.sku ?? '',
      image: li.image?.src ?? '',
      picked: false,
      hidden: false,
      cut: lineItemCutOption(li),
      refund: false,
      refundStatus: 'none',
      refundQuantity: 0,
      replacement: false,
      replacementNote: '',
    })) as OrderDoc['products'],
  };
}

/**
 * Live store orders for the Order page, bounded by date (default = today),
 * each flagged with whether it's already been saved for processing.
 */
export async function listStoreOrders(opts: {
  status?: string;
  after?: string;
  before?: string;
  search?: string;
}): Promise<StoreOrder[]> {
  const wooOrders = await fetchWooOrders({
    // The Order page shows only the statuses worth processing.
    status: opts.status ?? ['processing', 'completed'],
    after: opts.after,
    before: opts.before,
    search: opts.search,
    perPage: 100,
  });

  return toStoreOrderDTOs(wooOrders);
}

function toStoreOrderDTO(o: WooOrder, saved: Set<number>): StoreOrder {
  const shipping = o.shipping?.address_1 ? o.shipping : o.billing;
  return {
    orderId: o.id,
    orderNumber: o.number,
    customerName: fullName(o.billing) || fullName(o.shipping),
    postcode: shipping?.postcode ?? o.billing?.postcode ?? '',
    total: o.total,
    customerNote: o.customer_note ?? '',
    itemCount: (o.line_items ?? []).reduce((n, li) => n + li.quantity, 0),
    dateCreated: o.date_created,
    alreadySaved: saved.has(o.id),
  };
}

/** Map a batch of Woo orders to StoreOrder DTOs, flagging the ones already saved. */
async function toStoreOrderDTOs(wooOrders: WooOrder[]): Promise<StoreOrder[]> {
  const ids = wooOrders.map((o) => o.id);
  const existing = await Order.find({ orderId: { $in: ids } }).select('orderId').lean();
  const saved = new Set(existing.map((e) => e.orderId));
  return wooOrders.map((o) => toStoreOrderDTO(o, saved));
}

/**
 * Look up a live WooCommerce order by its order number. Available to every role
 * (raw store orders carry no warehouse assignment to scope by). Returns an empty
 * list for a non-numeric term or when no such order exists.
 */
export async function searchStoreOrders(term: string): Promise<StoreOrder[]> {
  if (!/^\d+$/.test(term)) return [];
  const order = await fetchWooOrder(Number(term));
  return order ? toStoreOrderDTOs([order]) : [];
}

/** Save the selected store orders for processing. Idempotent: existing ones are skipped. */
export async function saveForProcessing(
  orderIds: number[],
): Promise<{ saved: number; skipped: number }> {
  const wooOrders = await fetchWooOrders({ include: orderIds, perPage: orderIds.length });

  if (wooOrders.length === 0) return { saved: 0, skipped: orderIds.length };

  const result = await Order.bulkWrite(
    wooOrders.map((wo) => ({
      updateOne: {
        filter: { orderId: wo.id },
        update: { $setOnInsert: mapWooOrder(wo) },
        upsert: true,
      },
    })),
  );

  const saved = result.upsertedCount ?? 0;
  return { saved, skipped: orderIds.length - saved };
}

/**
 * The shared order-detail view. Loads the order live from WooCommerce by id and,
 * if it's already been saved for processing, overlays the warehouse state.
 *
 * Access: an unsaved store order is Admin-and-above territory; once saved, the
 * usual packer-owns-their-order rule applies.
 */
export async function getStoreOrderDetail(
  orderId: number,
  user: ActingUser,
): Promise<OrderDetail | null> {
  const doc = await Order.findOne({ orderId });

  // Saved → serve entirely from the DB (no WooCommerce round-trip). Everything the
  // detail view needs was snapshotted at save time (see mapWooOrder).
  if (doc) {
    assertCanAccess(doc, user);
    return docToOrderDetail(doc, user);
  }

  // Not yet saved → an Admin/Super-Admin previewing from the Order page. This is
  // the only case that needs live data, so we fetch WooCommerce here.
  if (!hasAtLeast(user.role, Roles.ADMIN)) throw forbidden();
  const wo = await fetchWooOrder(orderId);
  if (!wo) return null;
  return wooToOrderDetail(wo, user);
}

/**
 * The live WooCommerce status of an order — used by the detail page to verify a
 * (DB-served) order is still workable. Kept separate from the detail load so it
 * never blocks rendering. `status` is null if the order isn't on the store.
 */
export async function getLiveStatus(
  orderId: number,
  user: ActingUser,
): Promise<{ status: string | null }> {
  // Anyone who can see the order may verify its status; reuse the access rule.
  const doc = await Order.findOne({ orderId });
  if (doc) assertCanAccess(doc, user);
  else if (!hasAtLeast(user.role, Roles.ADMIN)) throw forbidden();

  return { status: await fetchWooOrderStatus(orderId) };
}

/** Build the detail view from a saved order document — no WooCommerce call. */
function docToOrderDetail(doc: OrderDoc, user: ActingUser): OrderDetail {
  // Contact details (email/phone) are for supervisors+ only.
  const showContact = user.role !== Roles.PACKER;
  return {
    id: String(doc._id),
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    customerName: doc.customerName,
    customerEmail: showContact ? doc.customerEmail : '',
    customerPhone: showContact ? doc.customerPhone : '',
    postcode: doc.postcode,
    address: doc.address,
    customerNote: doc.customerNote,
    total: doc.total,
    shippingZone: doc.shippingZone,
    shippingAmount: doc.shippingAmount,
    dateCreated: (doc.dateCreated ?? doc.createdAt).toISOString(),
    wooStatus: doc.wooStatus, // snapshot; the page verifies the live status separately
    products: doc.products.map((p) => ({
      productId: p.productId,
      name: p.name,
      quantity: p.quantity,
      price: p.price,
      sku: p.sku,
      image: p.image,
      picked: p.picked,
      cutOption: p.cut,
      refundStatus: p.refundStatus,
      refundQuantity: p.refundQuantity,
      replacement: p.replacement,
    })),
    saved: true,
    status: doc.status,
    dryPicked: doc.dryPicked,
    meatPicked: doc.meatPicked,
    assigned: doc.assigned ? { id: String(doc.assigned), name: doc.assignedName } : null,
    lock: doc.lock,
    notes: doc.notes.map(noteToDTO),
  };
}

/** Build the detail view from a live WooCommerce order (an unsaved store order). */
function wooToOrderDetail(wo: WooOrder, user: ActingUser): OrderDetail {
  // The customer block is the delivery recipient — use the shipping address,
  // falling back to billing only when no separate shipping address was given.
  const ship = wo.shipping?.address_1 ? wo.shipping : wo.billing;
  const showContact = user.role !== Roles.PACKER;
  return {
    id: null,
    orderId: wo.id,
    orderNumber: wo.number,
    customerName: fullName(ship) || fullName(wo.billing),
    customerEmail: showContact ? (wo.billing?.email ?? '') : '',
    customerPhone: showContact ? (wo.billing?.phone ?? wo.shipping?.phone ?? '') : '',
    postcode: ship?.postcode ?? '',
    address: formatAddress(ship),
    customerNote: wo.customer_note ?? '',
    total: wo.total,
    shippingZone: wo.shipping_lines?.[0]?.method_title ?? '',
    shippingAmount: wo.shipping_total ?? '',
    dateCreated: wo.date_created,
    wooStatus: wo.status,
    products: (wo.line_items ?? []).map((li) => ({
      productId: li.product_id,
      name: li.name,
      quantity: li.quantity,
      price: li.price != null ? String(li.price) : (li.total ?? ''),
      sku: li.sku ?? '',
      image: li.image?.src ?? '',
      picked: false,
      cutOption: lineItemCutOption(li),
      refundStatus: 'none',
      refundQuantity: 0,
      replacement: false,
    })),
    saved: false,
    status: false,
    dryPicked: false,
    meatPicked: false,
    assigned: null,
    lock: false,
    notes: [],
  };
}

function noteToDTO(n: { authorName: string; authorRole: string; message: string; createdAt: Date }): OrderNote {
  return {
    authorName: n.authorName,
    authorRole: n.authorRole,
    message: n.message,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Append a note to an order's thread. Any staff with access to the order may
 * post (packers only on their own order — enforced by loadForWrite). Returns the
 * updated thread.
 */
export async function addNote(
  id: string,
  author: { id: string; name: string; role: Role },
  message: string,
): Promise<OrderNote[]> {
  const doc = await loadForWrite(id, { id: author.id, role: author.role }, { allowLocked: true });
  doc.notes.push({
    authorId: author.id,
    authorName: author.name,
    authorRole: author.role,
    message,
    createdAt: new Date(),
  } as never);
  await doc.save();

  // Notify per SPEC §6 routing: packer → admins; supervisor → assigned packer +
  // admins; admin/super-admin → assigned packer. Never the author themselves.
  const base = {
    orderId: doc.orderId,
    orderNumber: doc.orderNumber,
    kind: 'note' as const,
    senderName: author.name,
    senderRole: author.role,
    message: `${author.name}: ${message}`,
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

  return doc.notes.map(noteToDTO);
}

/** Clear an order's entire staff-note thread (Admin and above). */
export async function clearNotes(id: string): Promise<OrderNote[]> {
  const doc = await loadAdmin(id);
  doc.notes.splice(0, doc.notes.length);
  await doc.save();
  return doc.notes.map(noteToDTO);
}

// ── Packer / shared mutations ────────────────────────────────────────────────

async function loadForWrite(
  id: string,
  user: ActingUser,
  opts: { allowLocked?: boolean } = {},
): Promise<OrderDoc> {
  const doc = await Order.findById(id);
  if (!doc) {
    const err = new Error('Order not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  assertCanAccess(doc, user);
  // A locked order is frozen for packers/supervisors — they can still drop a note
  // (allowLocked), but not mark products or run any stage action. Admins override.
  if (doc.lock && !opts.allowLocked && !hasAtLeast(user.role, Roles.ADMIN)) {
    const err = new Error('Order is locked') as Error & { status: number };
    err.status = 423;
    throw err;
  }
  return doc;
}

export async function setPicked(
  id: string,
  index: number,
  picked: boolean,
  user: ActingUser,
): Promise<OrderDTO> {
  const doc = await loadForWrite(id, user);
  const product = doc.products[index];
  if (!product) {
    const err = new Error('Product not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  // Idempotent: set the explicit value rather than toggling, so a lost/duplicated
  // request can never leave the UI and DB out of sync.
  product.picked = picked;
  await doc.save();
  return toDTO(doc);
}

export async function setStage(
  id: string,
  stage: 'dry' | 'meat',
  user: ActingUser,
): Promise<OrderDTO> {
  const doc = await loadForWrite(id, user);
  if (stage === 'dry') doc.dryPicked = !doc.dryPicked;
  else doc.meatPicked = !doc.meatPicked;
  await doc.save();
  return toDTO(doc);
}

export async function complete(id: string, user: ActingUser): Promise<OrderDTO> {
  const doc = await loadForWrite(id, user);
  doc.status = true;
  doc.completedAt = new Date();
  await doc.save();
  return toDTO(doc);
}

// ── Super Admin mutations ────────────────────────────────────────────────────

async function loadAdmin(id: string): Promise<OrderDoc> {
  const doc = await Order.findById(id);
  if (!doc) {
    const err = new Error('Order not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return doc;
}

export async function assign(id: string, packerId: string): Promise<OrderDTO> {
  const doc = await loadAdmin(id);
  const packer = await User.findById(packerId);
  if (!packer || packer.role !== Roles.PACKER) {
    const err = new Error('Packer not found') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  doc.assigned = packer._id as OrderDoc['assigned'];
  doc.assignedName = `${packer.fname} ${packer.lname}`.trim();
  await doc.save();
  return toDTO(doc);
}

export async function toggleLock(id: string): Promise<OrderDTO> {
  const doc = await loadAdmin(id);
  doc.lock = !doc.lock;
  await doc.save();
  return toDTO(doc);
}

export async function resetWorker(id: string): Promise<OrderDTO> {
  const doc = await loadAdmin(id);
  doc.assigned = null;
  doc.assignedName = '';
  await doc.save();
  return toDTO(doc);
}

export async function toggleHide(id: string, index: number): Promise<OrderDTO> {
  const doc = await loadAdmin(id);
  const product = doc.products[index];
  if (!product) {
    const err = new Error('Product not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  product.hidden = !product.hidden;
  await doc.save();
  return toDTO(doc);
}

export async function undo(id: string): Promise<OrderDTO> {
  const doc = await loadAdmin(id);
  doc.status = false;
  doc.completedAt = null;
  await doc.save();
  return toDTO(doc);
}

export async function remove(id: string): Promise<void> {
  const res = await Order.deleteOne({ _id: id });
  if (res.deletedCount === 0) {
    const err = new Error('Order not found') as Error & { status: number };
    err.status = 404;
    throw err;
  }
}

/** Remove a saved order from processing by its WooCommerce order id (Order page). */
export async function removeByOrderId(orderId: number): Promise<void> {
  const res = await Order.deleteOne({ orderId });
  if (res.deletedCount === 0) {
    const err = new Error('Order not in processing') as Error & { status: number };
    err.status = 404;
    throw err;
  }
}
