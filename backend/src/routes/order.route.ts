import { Router } from 'express';
import { Roles } from '../util/roles.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { assignSchema, saveSchema, pickSchema, noteSchema } from '../util/schemas/order.schema.js';
import * as orderController from '../controllers/order.controller.js';

const router = Router();
// Order-management actions: Admin and above (Super Admin inherits via hierarchy).
const admin = requireRole(Roles.ADMIN);
const supervisor = requireRole(Roles.SUPERVISOR);

// Every order route needs an authenticated session.
router.use(requireAuth);

// Live store list + save-for-processing (Admin and above). Declared before "/:id"
// so the literal paths aren't captured by the id param.
router.get('/store', admin, orderController.storeOrders);
// Global store search — every signed-in role. Must precede "/store/:orderId" so
// "search" isn't read as an order id.
router.get('/store/search', orderController.storeSearch);
router.post('/save', admin, validate(saveSchema), orderController.save);

// Shared order detail by WooCommerce order id — any signed-in role (the service
// scopes packers to their own assigned orders; unsaved orders are SA-only).
router.get('/store/:orderId', orderController.storeDetail);
// Live status only — the detail page verifies a saved order is still workable.
router.get('/store/:orderId/status', orderController.storeStatus);
// Take a saved order back out of processing, by WooCommerce order id (Admin+).
router.delete('/store/:orderId', admin, orderController.removeFromStore);
// Cancel the order on the store and drop it from processing (Admin+). Irreversible.
router.post('/store/:orderId/cancel', admin, orderController.cancel);
// Cancel AND refund the full paid amount (Admin+). Refund is verified before cancel.
router.post('/store/:orderId/cancel-refund', admin, orderController.cancelRefund);

// Lists + detail (role-scoped inside the service: packers see only their own).
router.get('/', orderController.list);
// Reports — Supervisor+. Before "/:id" so the literals aren't read as an id.
router.get('/report', supervisor, orderController.report);
router.get('/staff-performance', supervisor, orderController.staffPerformance);
router.get('/:id', orderController.getOne);

// Packer / shared fulfilment actions.
router.post('/:id/products/:index/pick', validate(pickSchema), orderController.pick);
router.post('/:id/dry-picked', orderController.dryPicked);
router.post('/:id/meat-picked', orderController.meatPicked);
router.post('/:id/complete', orderController.complete);

// Notes — any signed-in role with access to the order (scoping in the service).
router.post('/:id/notes', validate(noteSchema), orderController.addNote);
// Clear the whole note thread — Admin and above.
router.delete('/:id/notes', admin, orderController.clearNotes);

// Admin actions (Super Admin inherits).
router.post('/:id/assign', admin, validate(assignSchema), orderController.assign);
router.post('/:id/lock', admin, orderController.lock);
router.post('/:id/reset', admin, orderController.reset);
router.post('/:id/products/:index/hide', admin, orderController.hide);
router.post('/:id/undo', admin, orderController.undo);
router.delete('/:id', admin, orderController.remove);

export { router as ordersRouter };
