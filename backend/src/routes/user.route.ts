import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { createUserSchema, updateUserSchema } from '../util/schemas/user.schema.js';
import { resetPasswordSchema } from '../util/schemas/auth.schema.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();
const admin = requireRole(Roles.ADMIN);
const superAdmin = requireRole(Roles.SUPER_ADMIN);

router.use(requireAuth);

// List + delete are Admin+ (admins delete packers/supervisors, and need the list
// for the assign-packer dropdown). Create, edit (role change), enable/disable and
// reset stay Super Admin–only. Per-target delete rules live in the service.
router.get('/', admin, userController.list);
router.post('/', superAdmin, validate(createUserSchema), userController.create);
router.patch('/:id', superAdmin, validate(updateUserSchema), userController.update);
router.delete('/:id', admin, userController.remove);
router.post('/:id/enable', superAdmin, userController.enable);
router.post('/:id/disable', superAdmin, userController.disable);
router.post('/:id/reset-password', superAdmin, validate(resetPasswordSchema), userController.resetPassword);

export { router as usersRouter };
