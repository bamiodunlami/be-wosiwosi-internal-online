/**
 * Shared builder for the customer refund-confirmation email. Used by the nightly
 * archival cron (combined refund) and by redo-refund approval (single item), so the
 * wording stays in one place.
 */

export interface RefundEmailItem {
  productName: string;
  quantity: number;
  amount: string; // GBP
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function itemRows(items: RefundEmailItem[]): string {
  return items
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.productName)}</td><td align="center">${it.quantity}</td><td align="right">£${escapeHtml(it.amount)}</td></tr>`,
    )
    .join('');
}

/** Sum of refund-item amounts as a 2dp GBP string. */
export function refundTotal(items: { amount: string }[]): string {
  return items.reduce((s, it) => s + (Number(it.amount) || 0), 0).toFixed(2);
}

export function customerRefundHtml(
  customerName: string,
  orderNumber: string,
  items: RefundEmailItem[],
): string {
  return `
    <p>Hi ${escapeHtml(customerName) || 'there'},</p>
    <p>We've processed a refund on your Wosiwosi order
       <strong>#${escapeHtml(orderNumber)}</strong>. Here's a summary:</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <thead><tr><th align="left">Item</th><th>Qty</th><th align="right">Refunded</th></tr></thead>
      <tbody>${itemRows(items)}</tbody>
    </table>
    <p><strong>Total refunded: £${refundTotal(items)}</strong></p>
    <p>The money goes back to the card you paid with. It can take
       <strong>up to 7 days</strong> to appear on your statement, depending on your bank.</p>
    <p>Thank you for shopping with Wosiwosi,<br/>The Wosiwosi team</p>`;
}
