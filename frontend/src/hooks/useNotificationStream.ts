import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../api/client';

/**
 * Subscribe to the live notification stream (SSE, SPEC §6). On each pushed event,
 * invalidate the notification queries so the bells/banners/lists refetch within
 * ~1s instead of waiting for the poll. EventSource auto-reconnects if the
 * connection drops, and the poll intervals on those queries remain as a fallback.
 *
 * Mounted once in the authenticated shell; `withCredentials` sends the session
 * cookie (needed cross-origin in production).
 */
export function useNotificationStream() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource(`${API_BASE_URL}/api/v1/notifications/stream`, {
      withCredentials: true,
    });
    const onNotification = () => qc.invalidateQueries({ queryKey: ['notifications'] });
    es.addEventListener('notification', onNotification);
    return () => es.close();
  }, [qc]);
}
