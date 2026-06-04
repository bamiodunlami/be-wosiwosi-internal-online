/**
 * Read-only WooCommerce order inspector — for diagnosing refund issues.
 *
 *   cd backend && npx tsx src/scripts/inspect-order.ts <orderId>
 *
 * Dumps the order total/tax/payment, every line item's price/subtotal/total/tax,
 * and the FULL existing-refund history (amount + per-line). Purely GETs — it never
 * writes. Use it to see how much of a charge is actually still refundable and
 * whether a refund already exists.
 */
import { env } from '../util/env.js';

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error('Usage: npx tsx src/scripts/inspect-order.ts <orderId>');
  process.exit(1);
}

const BASE = `${env.WOO_URL.replace(/\/+$/, '')}/wp-json/wc/v3`;
const AUTH = `Basic ${Buffer.from(`${env.WOOKEY}:${env.WOOSEC}`).toString('base64')}`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: AUTH } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

interface Line {
  id: number;
  name: string;
  quantity: number;
  price?: number;
  subtotal?: string;
  total?: string;
  total_tax?: string;
}
interface Order {
  id: number;
  number: string;
  status: string;
  total: string;
  total_tax?: string;
  prices_include_tax?: boolean;
  payment_method_title?: string;
  transaction_id?: string;
  line_items: Line[];
  refunds?: { id: number; total: string }[];
}
interface Refund {
  id: number;
  total: string;
  date_created: string;
  reason?: string;
  line_items?: { id: number; name?: string; quantity: number; total?: string }[];
}

const order = await get<Order>(`/orders/${id}`);
const refunds = await get<Refund[]>(`/orders/${id}/refunds`);

console.log(`\n=== Order #${order.number} (id ${order.id}) — ${order.status} ===`);
console.log(
  `total=£${order.total}  total_tax=£${order.total_tax ?? '?'}  prices_include_tax=${order.prices_include_tax}`,
);
console.log(`payment="${order.payment_method_title ?? ''}"  transaction_id="${order.transaction_id ?? ''}"`);

console.log('\nLine items (subtotal = before discount, total = after discount/paid):');
for (const li of order.line_items) {
  console.log(
    `  line#${li.id} "${li.name}" qty=${li.quantity}  price(unit)=£${li.price}  subtotal=£${li.subtotal}  total=£${li.total}  tax=£${li.total_tax}`,
  );
}

const refundedSum = refunds.reduce((s, r) => s + Math.abs(Number(r.total) || 0), 0);
console.log(`\nExisting refunds (${refunds.length}, total refunded £${refundedSum.toFixed(2)}):`);
for (const r of refunds) {
  console.log(`  refund#${r.id}  amount=£${Math.abs(Number(r.total) || 0).toFixed(2)}  date=${r.date_created}  reason="${r.reason ?? ''}"`);
  for (const li of r.line_items ?? []) {
    console.log(`     ↳ line#${li.id} "${li.name ?? ''}" qty=${li.quantity} total=£${li.total}`);
  }
}

const remaining = (Number(order.total) || 0) - refundedSum;
console.log(`\n→ Roughly £${remaining.toFixed(2)} of the £${order.total} order total is not yet refunded.`);
console.log('  (The gateway "unrefunded amount on charge" can differ if the payment was partial.)\n');
