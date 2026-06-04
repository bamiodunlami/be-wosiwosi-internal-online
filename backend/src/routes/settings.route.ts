import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { settingsUpdateSchema } from '../util/schemas/settings.schema.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as settingsController from '../controllers/settings.controller.js';

const router = Router();
const admin = requireRole(Roles.ADMIN);

router.use(requireAuth);

// App settings — Admin and above (refund BCC list, system lock).
router.get('/', admin, settingsController.get);
router.patch('/', admin, validate(settingsUpdateSchema), settingsController.update);

export { router as settingsRouter };
