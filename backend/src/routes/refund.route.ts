import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { refundRequestSchema } from '../util/schemas/refund.schema.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as refundController from '../controllers/refund.controller.js';

const router = Router();
const admin = requireRole(Roles.ADMIN);

router.use(requireAuth);

// Marking a product for refund — any signed-in role; the service scopes packers
// to their own assigned order.
router.post('/', validate(refundRequestSchema), refundController.request);

// Review + resolve — Admin and above.
router.get('/', admin, refundController.list);
router.post('/:id/items/:productId/approve', admin, refundController.approve);
router.post('/:id/items/:productId/reject', admin, refundController.reject);
router.post('/:id/items/:productId/reopen', admin, refundController.reopen);

export { router as refundsRouter };
