/**
 * Line total for an order product = unit price × quantity, as a 2dp string.
 * WooCommerce's line-item `price` is the (discount-adjusted) per-unit price, so
 * multiplying by quantity gives the amount paid for that line.
 */
export function lineTotal(unitPrice: string, quantity: number): string {
  return ((Number(unitPrice) || 0) * quantity).toFixed(2);
}
