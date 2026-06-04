import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { replacementRequestSchema } from '../util/schemas/replacement.schema.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import * as replacementController from '../controllers/replacement.controller.js';

const router = Router();

router.use(requireAuth);

// Date-ranged report — Supervisor and above (reports are oversight). Declared
// before the param routes so "report" isn't read as an order id.
router.get('/report', requireRole(Roles.SUPERVISOR), replacementController.report);

// Logging / clearing a substitution — any signed-in role; the service scopes
// packers to their own assigned order. Reference data: no approval, no admin gate.
router.post('/', validate(replacementRequestSchema), replacementController.log);
router.delete('/:orderId/items/:productId', replacementController.clear);

export { router as replacementsRouter };
