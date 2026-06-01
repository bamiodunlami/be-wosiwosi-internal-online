import Joi from 'joi';

/**
 * Body for requesting a refund on one product (POST /refunds). MUST match
 * RefundRequest in backend/src/util/types/refund.ts and the frontend copy.
 */
export const refundRequestSchema = Joi.object({
  orderId: Joi.number().integer().positive().required(),
  productId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  // Refund amount in GBP — a money string, e.g. "12.50".
  amount: Joi.string()
    .pattern(/^\d+(\.\d{1,2})?$/)
    .required(),
});
