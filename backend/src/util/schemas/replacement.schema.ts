import Joi from 'joi';

/**
 * Body for logging a replacement on one product (POST /replacements). MUST match
 * ReplacementRequest in backend/src/util/types/replacement.ts and the frontend copy.
 */
export const replacementRequestSchema = Joi.object({
  orderId: Joi.number().integer().positive().required(),
  productId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  // What the original product was substituted with (free text — name/SKU).
  replacementProduct: Joi.string().trim().min(1).max(120).required(),
  // Optional extra detail about the substitution.
  note: Joi.string().trim().max(200).allow('').optional(),
});
