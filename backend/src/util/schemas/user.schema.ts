import Joi from 'joi';
import { ALL_ROLES } from '../roles.js';

/**
 * User shape returned by the API.
 * MUST match backend/src/util/types/user.ts (User interface).
 */
export const userSchema = Joi.object({
  id: Joi.string().required(), // ObjectId hex string
  email: Joi.string().email().required(),
  fname: Joi.string().min(1).required(),
  lname: Joi.string().min(1).required(),
  role: Joi.string()
    .valid(...ALL_ROLES)
    .required(),
  active: Joi.boolean().required(),
  passChange: Joi.boolean().required(),
});

/**
 * Body shape for creating a new user (Super Admin only).
 */
export const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  fname: Joi.string().min(1).required(),
  lname: Joi.string().min(1).required(),
  role: Joi.string()
    .valid(...ALL_ROLES)
    .required(),
  // Initial password — user is forced to change it on first login
  password: Joi.string().min(8).max(128).required(),
});

/**
 * Body shape for editing an existing user (Super Admin only). Every field is
 * optional, but at least one must be present. Password is not edited here — use
 * the reset-password route. MUST match UpdateUserInput in the frontend.
 */
export const updateUserSchema = Joi.object({
  email: Joi.string().email(),
  fname: Joi.string().min(1),
  lname: Joi.string().allow(''),
  role: Joi.string().valid(...ALL_ROLES),
}).min(1);
