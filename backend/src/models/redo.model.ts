import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { productSchema, noteSchema, type OrderProductSub, type OrderNoteSub } from './order.model.js';
import { refundItemSchema, type RefundItemSub } from './refund.model.js';
import { replacementItemSchema, type ReplacementItemSub } from './replacement.model.js';

/**
 * A redo (SPEC §9) — a re-fulfilment of a previously completed order whose
 * delivery was damaged, lost, or wrong. A separate collection from `orders` so
 * redos are analysed independently and the packer working one is never confused
 * by the original order's history.
 *
 * Created from a completed order by an Admin/Super Admin, who picks a reason and
 * unticks any products that don't need redoing. The order's customer/delivery
 * details, the products being redone, and the original context (notes, packer,
 * completion date) are **snapshotted** at creation, so a redo stands alone and
 * doesn't depend on the original still existing in `orders`/`redundant`.
 *
 * `redoNotes` are the redo's own thread — kept separate from the original order's
 * notes (which live in `originalNotes` for supervisor/admin reference only).
 * Permanent: unlike orders, redos are never archived by the cron.
 */

export type RedoReason = 'damaged' | 'lost' | 'wrong-item' | 'customer-complaint' | 'other';

export const REDO_REASONS: RedoReason[] = [
  'damaged',
  'lost',
  'wrong-item',
  'customer-complaint',
  'other',
];

export interface RedoOrderDoc extends Document {
  originalOrderId: number; // WooCommerce id of the order being redone
  originalOrderNumber: string;
  originalCompletedAt: Date | null;
  reason: RedoReason;
  reasonDetail: string;

  // Customer / delivery snapshot.
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  postcode: string;
  address: string;
  customerNote: string;
  // Shipping snapshot (carried from the source order) so the detail shows it.
  shippingZone: string;
  shippingAmount: string;

  // The products being redone (a snapshot, already filtered to exclude unticked ones).
  products: Types.DocumentArray<OrderProductSub & Types.Subdocument>;

  // Refund + replacement records live ON the redo (it's self-contained and never
  // archived). Refunds carry their own approval lifecycle; the real WooCommerce
  // refund is issued against the ORIGINAL order at approval time. Replacements are
  // reference-only (no approval), mirroring the order subsystems.
  refundItems: Types.DocumentArray<RefundItemSub & Types.Subdocument>;
  replacementItems: Types.DocumentArray<ReplacementItemSub & Types.Subdocument>;

  // Original-order context, snapshotted for supervisor/admin view (never shown to packers).
  originalNotes: Types.DocumentArray<OrderNoteSub & Types.Subdocument>;
  originalPackerName: string;

  // Fulfilment state — same shape as an order.
  assigned: Types.ObjectId | null;
  assignedName: string;
  status: boolean; // false = pending, true = completed
  // Swept off the Processing/Completed working lists by the nightly cron once
  // completed. Purely a UI flag — the redo STAYS in `redos` (never moved to
  // `redundant`) and still appears in the Redo report.
  archived: boolean;
  dryPicked: boolean;
  meatPicked: boolean;
  lock: boolean;
  redoNotes: Types.DocumentArray<OrderNoteSub & Types.Subdocument>;

  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

const redoSchema = new Schema<RedoOrderDoc>(
  {
    originalOrderId: { type: Number, required: true, index: true },
    originalOrderNumber: { type: String, required: true },
    originalCompletedAt: { type: Date, default: null },
    reason: {
      type: String,
      enum: REDO_REASONS,
      required: true,
    },
    reasonDetail: { type: String, default: '' },

    customerName: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    postcode: { type: String, default: '' },
    address: { type: String, default: '' },
    customerNote: { type: String, default: '' },
    shippingZone: { type: String, default: '' },
    shippingAmount: { type: String, default: '' },

    products: { type: [productSchema], default: [] },
    refundItems: { type: [refundItemSchema], default: [] },
    replacementItems: { type: [replacementItemSchema], default: [] },

    originalNotes: { type: [noteSchema], default: [] },
    originalPackerName: { type: String, default: '' },

    assigned: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedName: { type: String, default: '' },
    status: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    dryPicked: { type: Boolean, default: false },
    meatPicked: { type: Boolean, default: false },
    lock: { type: Boolean, default: false },
    redoNotes: { type: [noteSchema], default: [] },

    createdById: { type: String, default: '' },
    createdByName: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { collection: 'redos', timestamps: true },
);

export const RedoOrder = mongoose.model<RedoOrderDoc>('RedoOrder', redoSchema);
