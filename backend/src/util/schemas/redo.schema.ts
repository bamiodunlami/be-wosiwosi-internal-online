import Joi from 'joi';
import { REDO_REASONS } from '../../models/redo.model.js';

/**
 * Body for creating a redo from a completed order (POST /redos). MUST match
 * CreateRedoRequest in backend/src/util/types/redo.ts and the frontend copy.
 */
export const createRedoSchema = Joi.object({
  originalOrderId: Joi.number().integer().positive().required(),
  reason: Joi.string()
    .valid(...REDO_REASONS)
    .required(),
  reasonDetail: Joi.string().trim().max(300).allow('').optional(),
  // Product ids to exclude from the redo; may be empty (redo the whole order).
  excludedProductIds: Joi.array().items(Joi.number().integer()).default([]),
});

/** Body for requesting a refund on one redo product (POST /redos/:id/refunds). */
export const redoRefundRequestSchema = Joi.object({
  productId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  amount: Joi.string()
    .pattern(/^\d+(\.\d{1,2})?$/)
    .required(),
});

/** Body for resolving a pending redo refund (POST /redos/:id/refunds/:productId/resolve). */
export const redoRefundResolveSchema = Joi.object({
  decision: Joi.string().valid('approved', 'rejected', 'pending').required(),
});

/** Body for logging a replacement on one redo product (POST /redos/:id/replacements). */
export const redoReplacementRequestSchema = Joi.object({
  productId: Joi.number().integer().positive().required(),
  quantity: Joi.number().integer().min(1).required(),
  replacementProduct: Joi.string().trim().min(1).max(120).required(),
  note: Joi.string().trim().max(200).allow('').optional(),
});
