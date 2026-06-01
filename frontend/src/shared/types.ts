import type { Role } from './roles';

/**
 * Frontend copy of the API contract types. The backend owns the canonical
 * shapes (backend/src/util/types/) and the Joi schemas that enforce them;
 * this is a hand-kept duplicate — update both sides together.
 */

export interface User {
  id: string; // ObjectId hex string — the client's handle for this user
  email: string; // login identifier
  fname: string;
  lname: string;
  role: Role;
  active: boolean;
  passChange: boolean; // false = must change password on next login
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ── Orders ───────────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/order.ts + the Joi schemas. Update together.

export interface OrderProduct {
  productId: number;
  name: string;
  quantity: number;
  price: string;
  sku: string;
  image: string;
  picked: boolean;
  hidden: boolean;
  refund: boolean;
  refundQuantity: number;
  replacement: boolean;
  replacementNote: string;
}

export interface Order {
  id: string;
  orderId: number;
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
  completedAt: string | null;
  createdAt: string;
}

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
  // Refund state, driven by the refunds subsystem.
  refundStatus: RefundStatus;
  refundQuantity: number;
  replacement: boolean;
}

export interface OrderNote {
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string;
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
  shippingZone: string;
  shippingAmount: string;
  dateCreated: string;
  wooStatus: string;
  products: OrderDetailProduct[];
  saved: boolean;
  status: boolean;
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: { id: string; name: string } | null;
  lock: boolean;
  notes: OrderNote[];
}

export type OrderView = 'all' | 'processing' | 'completed';

export interface AssignRequest {
  packerId: string;
}

export interface SaveRequest {
  orderIds: number[];
}

export interface SaveResult {
  saved: number;
  skipped: number;
}

// ── Refunds ──────────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/refund.ts — keep in sync by hand.

export interface RefundItem {
  productId: number;
  productName: string;
  quantity: number;
  amount: string; // GBP
  status: boolean; // false = pending, true = resolved
  approval: boolean; // true = approved
  requestedByName: string;
  requestedByRole: string;
  requestedAt: string; // ISO date
  resolvedByName: string;
  resolvedAt: string | null; // ISO date
}

export interface Refund {
  id: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: RefundItem[];
}

export interface RefundRequest {
  orderId: number;
  productId: number;
  quantity: number;
  amount: string;
}

// ── Notifications ────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/notification.ts.

export type NotificationKind = 'note' | 'refund';

export interface Notification {
  id: string;
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  senderName: string;
  senderRole: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO date
}
