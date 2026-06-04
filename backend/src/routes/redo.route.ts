import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { assignSchema, pickSchema, noteSchema } from '../util/schemas/order.schema.js';
import {
  createRedoSchema,
  redoRefundRequestSchema,
  redoRefundResolveSchema,
  redoReplacementRequestSchema,
} from '../util/schemas/redo.schema.js';
import * as redoController from '../controllers/redo.controller.js';

const router = Router();
const admin = requireRole(Roles.ADMIN);
const supervisor = requireRole(Roles.SUPERVISOR);

router.use(requireAuth);

// Date-ranged report — Supervisor+. Before "/:id" so "report" isn't read as an id.
router.get('/report', supervisor, redoController.report);
// List + detail — role-scoped in the service (packers see only their own redos).
router.get('/', redoController.list);
// Create a redo from a completed order — Admin and above.
router.post('/', admin, validate(createRedoSchema), redoController.create);
router.get('/:id', redoController.getOne);

// Fulfilment — any signed-in role with access (packers scoped to their own redo).
router.post('/:id/products/:index/pick', validate(pickSchema), redoController.pick);
router.post('/:id/dry-picked', redoController.dryPicked);
router.post('/:id/meat-picked', redoController.meatPicked);
router.post('/:id/complete', redoController.complete);
router.post('/:id/notes', validate(noteSchema), redoController.addNote);
router.delete('/:id/notes', admin, redoController.clearNotes);

// Refunds — request by anyone with access (admin auto-approves + fires the real
// WooCommerce refund); resolve a pending one is Admin+. Replacements are
// reference-only: log by anyone with access, cancel is Admin+.
router.post('/:id/refunds', validate(redoRefundRequestSchema), redoController.requestRefund);
router.post(
  '/:id/refunds/:productId/resolve',
  admin,
  validate(redoRefundResolveSchema),
  redoController.resolveRefund,
);
router.post('/:id/replacements', validate(redoReplacementRequestSchema), redoController.logReplacement);
router.delete('/:id/replacements/:productId', admin, redoController.clearReplacement);

// Admin actions (Super Admin inherits).
router.post('/:id/assign', admin, validate(assignSchema), redoController.assign);
router.post('/:id/lock', admin, redoController.lock);
router.post('/:id/reset', admin, redoController.reset);
router.delete('/:id', admin, redoController.remove);

export { router as redosRouter };
