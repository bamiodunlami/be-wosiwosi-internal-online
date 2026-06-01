import type { Role } from '../roles.js';

/**
 * Shape of a user record returned by the API to the web client.
 * Excludes password hashes / passport-local fields.
 *
 * Keep this in sync with backend/src/util/schemas/user.schema.ts
 * (Joi doesn't auto-derive — code review must catch drift), and with the
 * frontend's copy at frontend/src/shared/types.ts.
 */
export interface User {
  id: string; // ObjectId hex string — the client's handle for this user
  email: string; // login identifier
  fname: string;
  lname: string;
  role: Role;
  active: boolean;
  passChange: boolean; // false = must change password on next login
}
