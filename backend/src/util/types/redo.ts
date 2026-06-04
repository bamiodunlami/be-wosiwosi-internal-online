/**
 * Redo DTOs returned by the API (SPEC §9). Keep in sync with the Joi schema in
 * backend/src/util/schemas/redo.schema.ts and the frontend copy in
 * frontend/src/shared/types.ts.
 */

export type RedoReason = 'damaged' | 'lost' | 'wrong-item' | 'customer-complaint' | 'other';

export interface RedoNote {
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: string; // ISO date
}

/** Per-product refund lifecycle (mirrors the order's). */
export type RedoRefundStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface RedoProduct {
  productId: number;
  name: string;
  quantity: number;
  price: string;
  sku: string;
  image: string;
  cutOption: string;
  frozen: boolean; // Meat/Seafood WooCommerce category → frozen; else dry (snapshot from original)
  picked: boolean;
  // Refund state — the redo carries its own refund records; the real WooCommerce
  // refund is issued against the original order at approval.
  refundStatus: RedoRefundStatus;
  refundQuantity: number;
  // Replacement (substitution) state — reference-only, no approval.
  replacement: boolean;
  replacementProduct: string;
  replacementQuantity: number;
  replacementNote: string;
}

/** A redo as shown in the queue list. */
export interface RedoListItem {
  id: string;
  originalOrderNumber: string;
  reason: RedoReason;
  customerName: string;
  postcode: string;
  total: string;
  productCount: number;
  pickedCount: number;
  // The redo's product snapshot (carries the `frozen` flag) — lets the Processing
  // dry/frozen pick lists fold redos in alongside orders without an extra fetch.
  products: RedoProduct[];
  dryPicked: boolean;
  meatPicked: boolean;
  lock: boolean;
  assigned: { id: string; name: string } | null;
  status: boolean; // false = pending, true = completed
  createdAt: string;
  completedAt: string | null;
}

/**
 * The redo detail view. Packers receive only the redo's own data; supervisors and
 * super-admins also get the snapshotted `original` context (notes, packer, when it
 * was completed) — filtered server-side so a packer never sees it.
 */
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
  // Supervisor / super-admin only — absent in a packer's response.
  original?: {
    packerName: string;
    completedAt: string | null;
    notes: RedoNote[];
  };
}

/** Body for creating a redo from a completed order. */
export interface CreateRedoRequest {
  originalOrderId: number;
  reason: RedoReason;
  reasonDetail?: string;
  // Products to leave OUT of the redo (everything else on the order gets redone).
  excludedProductIds: number[];
}

/** Body for requesting a refund on one redo product (POST /redos/:id/refunds). */
export interface RedoRefundRequest {
  productId: number;
  quantity: number;
  amount: string; // GBP
}

/** Body for logging a replacement on one redo product (POST /redos/:id/replacements). */
export interface RedoReplacementRequest {
  productId: number;
  quantity: number;
  replacementProduct: string;
  note?: string;
}
