/**
 * Keep in sync with backend/src/util/schemas/auth.schema.ts.
 * The frontend keeps its own copy at frontend/src/shared/types.ts — update both.
 */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
