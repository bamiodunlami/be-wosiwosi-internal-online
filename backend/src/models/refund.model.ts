import mongoose, { Schema, type Document, type Types } from 'mongoose';

/**
 * A refund request, one document per order (keyed by the WooCommerce `orderId`),
 * with one entry per product. Packers/supervisors/admins create entries; an
 * Admin/Super Admin approves or rejects each. The 20:00 cron (a later slice)
 * emails the customer and archives orders that have at least one approved entry.
 *
 * Per-entry lifecycle: `status:false` = pending; `status:true` = resolved, where
 * `approval:true` = approved and `approval:false` = rejected.
 */

export interface RefundItemSub {
  productId: number;
  productName: string;
  quantity: number; // units being refunded
  amount: string; // refund amount in GBP
  status: boolean; // false = pending, true = resolved
  approval: boolean; // true = approved (only meaningful once status is true)
  requestedById: string; // user who requested — used to notify them of the outcome
  requestedByName: string;
  requestedByRole: string;
  requestedAt: Date;
  resolvedByName: string;
  resolvedAt: Date | null;
}

export interface RefundDoc extends Document {
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: Types.DocumentArray<RefundItemSub & Types.Subdocument>;
  createdAt: Date;
  updatedAt: Date;
}

const refundItemSchema = new Schema<RefundItemSub>(
  {
    productId: { type: Number, required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, required: true },
    amount: { type: String, default: '' },
    status: { type: Boolean, default: false },
    approval: { type: Boolean, default: false },
    requestedById: { type: String, default: '' },
    requestedByName: { type: String, default: '' },
    requestedByRole: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },
    resolvedByName: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
  },
  { _id: false },
);

const refundSchema = new Schema<RefundDoc>(
  {
    orderId: { type: Number, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    items: { type: [refundItemSchema], default: [] },
  },
  { collection: 'refunds', timestamps: true },
);

export const Refund = mongoose.model<RefundDoc>('Refund', refundSchema);
