import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as notificationController from '../controllers/notification.controller.js';

const router = Router();

// Every signed-in user sees their own notifications.
router.use(requireAuth);

router.get('/stream', notificationController.stream); // live SSE push
router.get('/counts', notificationController.counts); // home-card bells
router.get('/by-order', notificationController.byOrder); // per-order bells
router.get('/', notificationController.list); // ?kind=note|refund
router.post('/read-all', notificationController.markKindRead); // ?kind=note|refund
router.get('/order/:orderId', notificationController.forOrder); // open-order banner
router.post('/order/:orderId/read', notificationController.markOrderRead);
router.get('/by-redo', notificationController.byRedo); // per-redo bells
router.get('/redo/:redoId', notificationController.forRedo); // open-redo banner
router.post('/redo/:redoId/read', notificationController.markRedoRead);

export { router as notificationsRouter };
