import mongoose, { Schema, type Types } from 'mongoose';
import { type OrderDoc, productSchema, noteSchema } from './order.model.js';

/**
 * The permanent order archive (SPEC §5/§6). A completed working-set order is copied
 * here by the nightly cron, with its notes and (for refunded orders) the refund
 * payload attached, and the `orders` document is removed. Reports and the redo flow
 * read from here.
 *
 * Append-only: never written by user-facing code, only by the archival cron.
 * Archived orders are order-shaped, so this reuses the order's product/note
 * subschemas verbatim, plus two archive-only fields (`archivedAt`, `refundItems`).
 *
 * `orderId` (the WooCommerce id) stays unique so an order can only be archived once.
 */

export interface RedundantRefundItemSub {
  productId: number;
  productName: string;
  quantity: number;
  amount: string; // GBP
  // When the refund was actually issued. Cron-issued refunds leave this unset (they
  // happened at archival → fall back to `archivedAt`); a post-hoc refund on an
  // already-archived order stamps the real moment so the report dates it correctly.
  refundedAt?: Date | null;
}

export interface RedundantDoc extends OrderDoc {
  archivedAt: Date;
  refundItems: Types.DocumentArray<RedundantRefundItemSub & Types.Subdocument>;
}

const refundItemSchema = new Schema<RedundantRefundItemSub>(
  {
    productId: { type: Number, required: true },
    productName: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    amount: { type: String, default: '' },
    refundedAt: { type: Date, default: null },
  },
  { _id: false },
);

const redundantSchema = new Schema<RedundantDoc>(
  {
    orderId: { type: Number, required: true, unique: true },
    orderNumber: { type: String, required: true },
    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    postcode: { type: String, default: '' },
    address: { type: String, default: '' },
    customerNote: { type: String, default: '' },
    total: { type: String, default: '' },
    shippingZone: { type: String, default: '' },
    shippingAmount: { type: String, default: '' },
    wooStatus: { type: String, default: '' },
    dateCreated: { type: Date, default: null },
    products: { type: [productSchema], default: [] },
    status: { type: Boolean, default: true }, // archived orders are completed
    dryPicked: { type: Boolean, default: false },
    meatPicked: { type: Boolean, default: false },
    assigned: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedName: { type: String, default: '' },
    lock: { type: Boolean, default: false },
    notes: { type: [noteSchema], default: [] },
    completedAt: { type: Date, default: null },
    // Archive-only fields, set by the cron.
    archivedAt: { type: Date, default: Date.now },
    refundItems: { type: [refundItemSchema], default: [] },
  },
  { collection: 'redundant', timestamps: true },
);

export const Redundant = mongoose.model<RedundantDoc>('Redundant', redundantSchema);
