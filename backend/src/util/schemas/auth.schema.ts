import Joi from 'joi';

// Passwords are capped at 128 chars across all schemas: passport-local-mongoose
// hashes with PBKDF2, and an unbounded input is a cheap CPU-DoS vector.
export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(1).max(128).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).max(128).required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

// Super Admin resets another user's password (POST /users/:id/reset-password).
export const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(128).required(),
});
