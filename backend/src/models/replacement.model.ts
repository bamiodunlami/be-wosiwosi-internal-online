import mongoose, { Schema, type Document, type Types } from 'mongoose';

/**
 * Replacement (substitution) records — one document per order (keyed by the
 * WooCommerce `orderId`), one entry per substituted product. Reference data only:
 * a packer/supervisor/admin logs what they swapped, there is NO approval workflow
 * and NO notification (cf. refunds). Admin/Super Admin read this — directly or via
 * the date-ranged report — so each entry self-describes: the original product, what
 * it was replaced with, how many, when, and who did it.
 *
 * Order-level fields (orderNumber, customerName) are denormalised so a report never
 * has to join back to `orders` (which is short-lived and archived nightly).
 */

export interface ReplacementItemSub {
  productId: number; // the original WooCommerce product id
  originalProduct: string; // original product name
  originalPrice: string; // unit price of the original product (GBP), snapshotted
  replacementProduct: string; // what it was substituted with
  quantity: number; // units substituted
  note: string; // optional extra detail
  replacedById: string; // who logged the substitution
  replacedByName: string;
  replacedByRole: string;
  replacedAt: Date; // the date a report groups by
}

export interface ReplacementDoc extends Document {
  orderId: number;
  orderNumber: string;
  customerName: string;
  items: Types.DocumentArray<ReplacementItemSub & Types.Subdocument>;
  createdAt: Date;
  updatedAt: Date;
}

export const replacementItemSchema = new Schema<ReplacementItemSub>(
  {
    productId: { type: Number, required: true },
    originalProduct: { type: String, default: '' },
    originalPrice: { type: String, default: '' },
    replacementProduct: { type: String, required: true },
    quantity: { type: Number, required: true },
    note: { type: String, default: '' },
    replacedById: { type: String, default: '' },
    replacedByName: { type: String, default: '' },
    replacedByRole: { type: String, default: '' },
    replacedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const replacementSchema = new Schema<ReplacementDoc>(
  {
    orderId: { type: Number, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true },
    customerName: { type: String, default: '' },
    items: { type: [replacementItemSchema], default: [] },
  },
  { collection: 'replacements', timestamps: true },
);

export const Replacement = mongoose.model<ReplacementDoc>('Replacement', replacementSchema);
