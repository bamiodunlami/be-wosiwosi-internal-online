/**
 * Refund-amount guard. The refund `amount` arrives from the client and is only
 * format-validated by Joi (`^\d+(\.\d{1,2})?$`) — nothing ties it to what the line
 * is actually worth. Since the amount is what gets sent to WooCommerce as a REAL
 * gateway refund, an inflated value (e.g. £9999 on a £1 line) could drain an order's
 * remaining refundable balance. Bound it by the server-trusted snapshot price.
 *
 * The unit price is snapshotted from WooCommerce at import (`product.price`). Orders
 * imported before that field existed may store an empty/zero price — we can't bound
 * those, so we allow them through (the Admin still approves the request) rather than
 * blocking legitimate refunds on legacy data.
 */
const EPSILON = 0.01; // a penny of slack for rounding

export function refundAmountError(
  amount: string,
  unitPrice: string,
  quantity: number,
): string | null {
  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested < 0) {
    return 'Invalid refund amount';
  }
  const unit = Number(unitPrice);
  // Only enforceable when we have a positive snapshot price.
  if (Number.isFinite(unit) && unit > 0) {
    const cap = unit * quantity;
    if (requested > cap + EPSILON) {
      return `Refund amount £${requested.toFixed(2)} exceeds the line total £${cap.toFixed(2)}`;
    }
  }
  return null;
}
