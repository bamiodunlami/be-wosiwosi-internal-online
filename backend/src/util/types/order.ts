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
  sku: string;
  image: string;
  picked: boolean;
  // The product's "cut" add-on choice (WCPA), read live from the Woo line item's
  // meta_data; '' when the product has no cut option. Shown under the name.
  cutOption: string;
  // Refund state, driven by the refunds subsystem (see refund.service).
  refundStatus: RefundStatus;
  refundQuantity: number;
  replacement: boolean;
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
  status: boolean; // completed
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: { id: string; name: string } | null;
  lock: boolean;
  notes: OrderNote[];
}

/**
 * A live WooCommerce order shown on the Super-Admin Order page for selection.
 * `alreadySaved` flags orders already saved to the local `orders` collection
 * (i.e. already sent for processing).
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
  alreadySaved: boolean;
}
