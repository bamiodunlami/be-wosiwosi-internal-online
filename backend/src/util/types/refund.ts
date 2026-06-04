/**
 * Refund DTOs returned by the API. Keep in sync with the Joi schemas in
 * backend/src/util/schemas/refund.schema.ts and the frontend copy in
 * frontend/src/shared/types.ts.
 */

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
  id: string; // refund document _id (or the redo _id when redoId is set)
  orderId: number; // WooCommerce order id
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  // Set when this queue entry is a REDO refund — the Refunds page routes approve/
  // reject to the redo endpoint (and links to the redo) instead of the order one.
  redoId?: string | null;
  items: RefundItem[];
}

/** Body for requesting (marking) a refund on one product. */
export interface RefundRequest {
  orderId: number;
  productId: number;
  quantity: number;
  amount: string;
}
