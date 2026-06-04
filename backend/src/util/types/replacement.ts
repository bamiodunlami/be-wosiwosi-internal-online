/**
 * Replacement DTOs returned by the API. Keep in sync with the Joi schema in
 * backend/src/util/schemas/replacement.schema.ts and the frontend copy in
 * frontend/src/shared/types.ts.
 */

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
  id: string; // replacement document _id
  orderId: number; // WooCommerce order id
  orderNumber: string;
  customerName: string;
  items: ReplacementItem[];
}

/** Body for logging (marking) a replacement on one product. */
export interface ReplacementRequest {
  orderId: number;
  productId: number;
  quantity: number;
  replacementProduct: string;
  note?: string;
}
