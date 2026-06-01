import Joi from 'joi';

/**
 * Request body shapes for the order routes. The order DTO itself lives in
 * backend/src/util/types/order.ts and frontend/src/shared/types.ts — keep all
 * three in sync by hand.
 */

/** POST /orders/:id/assign — assign a packer to an order (Super Admin). */
export const assignSchema = Joi.object({
  packerId: Joi.string().hex().length(24).required(),
});

/** POST /orders/:id/products/:index/pick — set a product's picked flag. */
export const pickSchema = Joi.object({
  picked: Joi.boolean().required(),
});

/** POST /orders/:id/notes — drop a note on an order. */
export const noteSchema = Joi.object({
  message: Joi.string().trim().min(1).max(80).required(),
});

/** POST /orders/save — save selected WooCommerce orders for processing (Super Admin). */
export const saveSchema = Joi.object({
  orderIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(100).required(),
});
