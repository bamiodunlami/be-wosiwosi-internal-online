import { Router } from 'express';
import { loginSchema, changePasswordSchema } from '../util/schemas/auth.schema.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, sensitiveLimiter } from '../middleware/rateLimit.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post(
  '/change-password',
  sensitiveLimiter,
  requireAuth,
  validate(changePasswordSchema),
  authController.changePassword,
);

export { router as authRouter };
