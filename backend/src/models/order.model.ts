import mongoose, { Schema, type Document, type Types } from 'mongoose';

/**
 * The warehouse working-set order. Pulled from WooCommerce by a Super Admin,
 * worked on locally (assign → pick → dry/meat → complete), and archived to
 * `redundant` by the nightly cron (a later slice). Short-lived by design.
 *
 * `orderId` (the WooCommerce id) is unique so re-pulling the same store order
 * never duplicates the in-progress document.
 */

export interface OrderProductSub {
  productId: number;
  lineItemId: number; // WooCommerce order line-item id — needed for precise refunds
  name: string;
  quantity: number;
  price: string;
  sku: string;
  image: string;
  picked: boolean;
  hidden: boolean;
  // Frozen (Meat/Seafood WooCommerce category) vs dry, classified at import time.
  frozen: boolean;
  // The "cut" add-on choice (WCPA), snapshotted from the Woo meta at save time so
  // the detail view never has to re-fetch the live order.
  cut: string;
  refund: boolean;
  refundStatus: 'none' | 'pending' | 'approved' | 'rejected';
  refundQuantity: number;
  // Replacement (substitution) state, snapshotted here so the detail view shows it
  // without a join. The full reference record lives in the `replacements` collection.
  replacement: boolean;
  replacementProduct: string; // what the original was substituted with
  replacementQuantity: number; // units substituted
  replacementNote: string; // optional extra detail
}

export interface OrderNoteSub {
  authorId: Types.ObjectId;
  authorName: string;
  authorRole: string;
  message: string;
  createdAt: Date;
}

export interface OrderDoc extends Document {
  orderId: number;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  postcode: string;
  address: string;
  customerNote: string;
  total: string;
  // WooCommerce snapshot fields, captured at save so the detail view is DB-only.
  shippingZone: string;
  shippingAmount: string;
  wooStatus: string; // store status at save time (a snapshot, not kept live)
  dateCreated: Date | null; // WooCommerce order-created date
  products: Types.DocumentArray<OrderProductSub & Types.Subdocument>;
  status: boolean;
  dryPicked: boolean;
  meatPicked: boolean;
  assigned: Types.ObjectId | null;
  assignedName: string;
  lock: boolean;
  notes: Types.DocumentArray<OrderNoteSub & Types.Subdocument>;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Exported so the `redundant` archive model can reuse the exact same subdocument
// shapes — archived orders are order-shaped, and sharing the schema keeps the two
// from drifting. (Reusing a *sub*-schema instance across parent schemas is safe.)
export const productSchema = new Schema<OrderProductSub>(
  {
    productId: { type: Number, required: true },
    lineItemId: { type: Number, default: 0 },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: String, default: '' },
    sku: { type: String, default: '' },
    image: { type: String, default: '' },
    picked: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    frozen: { type: Boolean, default: false },
    cut: { type: String, default: '' },
    refund: { type: Boolean, default: false },
    refundStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
    },
    refundQuantity: { type: Number, default: 0 },
    replacement: { type: Boolean, default: false },
    replacementProduct: { type: String, default: '' },
    replacementQuantity: { type: Number, default: 0 },
    replacementNote: { type: String, default: '' },
  },
  { _id: false },
);

export const noteSchema = new Schema<OrderNoteSub>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    authorRole: { type: String, default: '' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDoc>(
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
    status: { type: Boolean, default: false },
    dryPicked: { type: Boolean, default: false },
    meatPicked: { type: Boolean, default: false },
    assigned: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedName: { type: String, default: '' },
    lock: { type: Boolean, default: false },
    // Inline note thread — any staff with access can post; copied to `redundant`
    // on archival (later slice).
    notes: { type: [noteSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { collection: 'orders', timestamps: true },
);

export const Order = mongoose.model<OrderDoc>('Order', orderSchema);
