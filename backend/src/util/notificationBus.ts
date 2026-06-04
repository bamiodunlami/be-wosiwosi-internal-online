import { EventEmitter } from 'node:events';

/**
 * In-process event bus for live notifications (SSE). `notify()` emits here when a
 * notification is created; the SSE endpoint (`/notifications/stream`) subscribes
 * and pushes to the matching connected clients, so notes appear in ~1s instead of
 * waiting for the poll (SPEC §6).
 *
 * In-process only — fine for a single dyno (same assumption as the cron). For
 * multiple dynos a Redis pub/sub bus would be needed so an event on one reaches
 * clients connected to another.
 */

export interface NotificationEvent {
  recipientId: string | null; // a specific user, or
  recipientRole: string | null; // a role group (everyone at/above this rank)
}

export const notificationBus = new EventEmitter();
// One listener per connected SSE client — lift the default 10-listener cap.
notificationBus.setMaxListeners(0);
