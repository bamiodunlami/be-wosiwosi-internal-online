/**
 * Settings DTO. Keep in sync with the Joi schema in
 * backend/src/util/schemas/settings.schema.ts and the frontend copy in
 * frontend/src/shared/types.ts.
 */

export interface Settings {
  refundBcc: string[]; // emails BCC'd on refund-confirmation emails
  lock: boolean; // system lock
}

/** Body for updating settings (PATCH /settings). All fields optional. */
export interface SettingsUpdate {
  refundBcc?: string[];
  lock?: boolean;
}
