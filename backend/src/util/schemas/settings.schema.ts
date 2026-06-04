import Joi from 'joi';

/**
 * Body for updating settings (PATCH /settings). MUST match SettingsUpdate in
 * backend/src/util/types/settings.ts and the frontend copy. All fields optional;
 * at least one must be present.
 */
export const settingsUpdateSchema = Joi.object({
  refundBcc: Joi.array().items(Joi.string().trim().email()).max(20),
  lock: Joi.boolean(),
}).min(1);
