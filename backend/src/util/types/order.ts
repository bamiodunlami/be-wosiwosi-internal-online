/**
 * Shape of an order returned by the API to the web client — the warehouse
 * working-set document, not the raw WooCommerce order.
 *
 * Keep this in sync with backend/src/util/schemas/order.schema.ts (Joi doesn't
 * auto-derive — code review must catch drift) and the frontend's copy at
 * frontend/src/shared/types.ts.
 */

export interface OrderProduct {
  productId: number; // WooCommerce product id
  name: string;
  quantity: number;
  price: string; // GBP, as a string (matches Woo)
  sku: string;
  image: string; // image URL, '' when none
  picked: boolean;
  hidden: boolean; // Super Admin hid this line from packers
  frozen: boolean; // Meat/Seafood WooCommerce category → frozen; else dry
  // Reserved for the refunds/replacements slice — present so the document shape
  // is stable, but no endpoints act on these yet.
  refund: boolean;
  refundQuantity: number;
  replacement: boolean;
  replacementNote: string;
}

export interface Order {
  id: string; // Mongo ObjectId hex — the client's handle
  orderId: number; // WooCommerce order id
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  postcode: string;
  address: string;
  customerNote: string;
  total: string;
  products: OrderProduct[];
  status: boolean; // false = in queue / processing, true = completed
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: { id: string; name: string } | null;
  lock: boolean;
  completedAt: string | null; // ISO date
  createdAt: string; // ISO date
}

/**
 * The shared order-detail view, keyed by the WooCommerce order number and loaded
 * live from the store. Opens for any order; when the order has also been saved
 * for processing (`saved: true`) it carries the warehouse state too.
 */
/** Per-product refund lifecycle. */
export type RefundStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface OrderDetailProduct {
  productId: number;
  name: string;
  quantity: number;
  price: string;
  // Line subtotal BEFORE coupon discounts; shown per product ('' on older orders
  // saved before this was captured → the UI falls back to price×quantity).
  subtotal: string;
  sku: string;
  image: string;
  picked: boolean;
  // True when the line was hidden. In practice only set by the legacy-redundant
  // migration (v2's live hide toggle is unused) — the detail view labels these
  // "legacy (hidden)" under the name.
  hidden: boolean;
  // The product's "cut" add-on choice (WCPA), read live from the Woo line item's
  // meta_data; '' when the product has no cut option. Shown under the name.
  cutOption: string;
  // Refund state, driven by the refunds subsystem (see refund.service).
  refundStatus: RefundStatus;
  refundQuantity: number;
  // Replacement (substitution) state, driven by the replacement subsystem.
  replacement: boolean;
  replacementProduct: string; // what the original was substituted with
  replacementQuantity: number;
  replacementNote: string;
}

export interface OrderNote {
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string; // ISO date
}

export interface OrderDetail {
  id: string | null; // Mongo _id once saved for processing, else null
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  postcode: string;
  address: string;
  customerNote: string;
  total: string;
  shippingZone: string; // WooCommerce shipping method/zone title
  shippingAmount: string; // shipping cost
  dateCreated: string;
  wooStatus: string; // raw WooCommerce status
  products: OrderDetailProduct[];
  // Warehouse state — meaningful only once `saved` is true.
  saved: boolean;
  archived: boolean; // true = served from the `redundant` archive (Redo, not Undo)
  // How many redos have been raised from this order (an order can be redone more
  // than once — mistakes recur). Shown on the archived order detail.
  redoCount: number;
  // The id of an *in-progress* (not yet completed) redo, if any. A new redo is
  // blocked while one exists — the UI links to it instead of offering Create. null
  // when every redo is complete (or none exist) → a new redo can be created.
  activeRedoId: string | null;
  status: boolean; // completed
  completedAt: string | null; // ISO date the order was completed; cleared on Undo
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: { id: string; name: string } | null;
  lock: boolean;
  notes: OrderNote[];
}

/**
 * Where a search/listing result was found. The global order search resolves an
 * order number in priority order — local working set first, then the permanent
 * archive, then the live store — and tags each result with its origin so the UI
 * can label it. The Order page only ever produces `'store'`.
 */
export type StoreOrderSource = 'processing' | 'completed' | 'archive' | 'store';

/**
 * An order's handled-state, used by the Order page to decide selectability:
 * `new` = not in our system (can be sent for processing); `processing`/`completed`
 * = in the live `orders` queue (removable); `archived` = in `redundant` (permanent,
 * never re-addable, never removable).
 */
export type StoreOrderState = 'new' | 'processing' | 'completed' | 'archived';

/**
 * A live WooCommerce order shown on the Super-Admin Order page for selection.
 * `alreadySaved` flags orders already saved to the local `orders` collection
 * (i.e. already sent for processing). `source` records which tier the result
 * came from (see StoreOrderSource).
 */
export interface StoreOrder {
  orderId: number;
  orderNumber: string;
  customerName: string;
  postcode: string;
  total: string;
  customerNote: string;
  itemCount: number;
  dateCreated: string;
  alreadySaved: boolean; // true unless state is 'new'
  state: StoreOrderState;
  source: StoreOrderSource;
}

/** A completed order as shown in the Order report (Reports page). */
export interface OrderReportRow {
  id: string;
  orderId: number; // WooCommerce id — for linking to the order detail
  orderNumber: string;
  customerName: string;
  total: string;
  itemCount: number;
  packerName: string;
  completedAt: string; // ISO date
}

/** Per-packer tally for the Staff Performance report (SPEC §9). */
export interface StaffPerformanceRow {
  packerId: string;
  packerName: string;
  ordersCompleted: number;
  redosCompleted: number;
}
