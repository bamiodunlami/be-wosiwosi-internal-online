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
  systemLocked?: boolean; // only set on /auth/me — the system-lock flag (SPEC §7)
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
  frozen: boolean; // Meat/Seafood category → frozen; else dry
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

// Which tier a global-search result came from (working set → archive → store).
// The Order page only ever produces 'store'. Keep in sync with backend.
export type StoreOrderSource = 'processing' | 'completed' | 'archive' | 'store';

// An order's handled-state, used by the Order page to decide selectability.
export type StoreOrderState = 'new' | 'processing' | 'completed' | 'archived';

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

export interface OrderReportRow {
  id: string;
  orderNumber: string;
  customerName: string;
  total: string;
  itemCount: number;
  packerName: string;
  completedAt: string;
}

export interface StaffPerformanceRow {
  packerId: string;
  packerName: string;
  ordersCompleted: number;
  redosCompleted: number;
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
  // Replacement (substitution) state, driven by the replacement subsystem.
  replacement: boolean;
  replacementProduct: string;
  replacementQuantity: number;
  replacementNote: string;
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
  archived: boolean; // true = from the archive → Redo (not Undo)
  redoCount: number; // how many redos have been raised from this order
  activeRedoId: string | null; // an in-progress redo blocks a new one; null if all complete/none
  status: boolean;
  completedAt: string | null; // ISO date completed; cleared on Undo
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
  redoId?: string | null; // set when this queue entry is a redo refund
  items: RefundItem[];
}

export interface RefundRequest {
  orderId: number;
  productId: number;
  quantity: number;
  amount: string;
}

// ── Replacements ─────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/replacement.ts — keep in sync by hand.

export interface ReplacementItem {
  productId: number;
  originalProduct: string;
  originalPrice: string; // unit price of the original product (GBP)
  replacementProduct: string;
  quantity: number;
  note: string;
  replacedByName: string;
  replacedByRole: string;
  replacedAt: string; // ISO date
}

export interface Replacement {
  id: string;
  orderId: number;
  orderNumber: string;
  customerName: string;
  items: ReplacementItem[];
}

export interface ReplacementRequest {
  orderId: number;
  productId: number;
  quantity: number;
  replacementProduct: string;
  note?: string;
}

// ── Redos ────────────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/redo.ts — keep in sync by hand.

export type RedoReason = 'damaged' | 'lost' | 'wrong-item' | 'customer-complaint' | 'other';

export const REDO_REASONS: RedoReason[] = [
  'damaged',
  'lost',
  'wrong-item',
  'customer-complaint',
  'other',
];

export interface RedoNote {
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string;
}

export type RedoRefundStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface RedoProduct {
  productId: number;
  name: string;
  quantity: number;
  price: string;
  sku: string;
  image: string;
  cutOption: string;
  frozen: boolean; // Meat/Seafood category → frozen; else dry (snapshot from original)
  picked: boolean;
  refundStatus: RedoRefundStatus;
  refundQuantity: number;
  replacement: boolean;
  replacementProduct: string;
  replacementQuantity: number;
  replacementNote: string;
}

export interface RedoListItem {
  id: string;
  originalOrderNumber: string;
  reason: RedoReason;
  customerName: string;
  postcode: string;
  total: string;
  productCount: number;
  pickedCount: number;
  // Product snapshot (carries `frozen`) so the dry/frozen pick lists include redos.
  products: RedoProduct[];
  dryPicked: boolean;
  meatPicked: boolean;
  lock: boolean;
  assigned: { id: string; name: string } | null;
  status: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface RedoDetail {
  id: string;
  originalOrderId: number;
  originalOrderNumber: string;
  reason: RedoReason;
  reasonDetail: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  postcode: string;
  address: string;
  customerNote: string;
  shippingZone: string;
  shippingAmount: string;
  products: RedoProduct[];
  status: boolean;
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: { id: string; name: string } | null;
  lock: boolean;
  redoNotes: RedoNote[];
  createdByName: string;
  createdAt: string;
  completedAt: string | null;
  original?: {
    packerName: string;
    completedAt: string | null;
    notes: RedoNote[];
  };
}

export interface CreateRedoRequest {
  originalOrderId: number;
  reason: RedoReason;
  reasonDetail?: string;
  excludedProductIds: number[];
}

export interface RedoRefundRequest {
  productId: number;
  quantity: number;
  amount: string;
}

export interface RedoReplacementRequest {
  productId: number;
  quantity: number;
  replacementProduct: string;
  note?: string;
}

// ── Settings ─────────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/settings.ts.

export interface Settings {
  refundBcc: string[];
  lock: boolean;
}

export interface SettingsUpdate {
  refundBcc?: string[];
  lock?: boolean;
}

// ── Notifications ────────────────────────────────────────────────────────────
// Mirror of backend/src/util/types/notification.ts.

export type NotificationKind = 'note' | 'refund';
export type NotificationTarget = 'order' | 'redoOrder';

export interface Notification {
  id: string;
  orderId: number;
  orderNumber: string;
  kind: NotificationKind;
  targetType: NotificationTarget;
  redoId: string | null;
  senderName: string;
  senderRole: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO date
}
