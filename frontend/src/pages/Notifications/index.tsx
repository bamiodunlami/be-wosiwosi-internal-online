import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '@shared';
import { useNotificationList, useMarkKindRead, useMarkOrderRead } from '../../hooks/useNotifications';

/** Note notifications (Admin+) — packer/supervisor notes, grouped by order. */
export default function NotificationsPage() {
  const { data: notes, isLoading, isError, error } = useNotificationList('note');
  const markAll = useMarkKindRead();

  // Group by order, preserving the newest-first order from the API.
  const groups = useMemo(() => {
    const map = new Map<number, { orderId: number; orderNumber: string; notes: Notification[] }>();
    for (const n of notes ?? []) {
      const g = map.get(n.orderId) ?? { orderId: n.orderId, orderNumber: n.orderNumber, notes: [] };
      g.notes.push(n);
      map.set(n.orderId, g);
    }
    return [...map.values()];
  }, [notes]);

  const hasUnread = !!notes?.some((n) => !n.read);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500">Notes from packers and supervisors.</p>
        </div>
        {hasUnread && (
          <button
            type="button"
            onClick={() => markAll.mutate('note')}
            disabled={markAll.isPending}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark all read
          </button>
        )}
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {groups.length === 0 && !isLoading && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No notifications.
        </div>
      )}

      {groups.length > 0 && (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.orderId}>
              <OrderNotes group={g} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderNotes({
  group,
}: {
  group: { orderId: number; orderNumber: string; notes: Notification[] };
}) {
  const unread = group.notes.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const markRead = useMarkOrderRead();

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left hover:bg-slate-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
          <span className="font-semibold text-slate-900">#{group.orderNumber}</span>
          <span className="text-sm text-slate-500">
            {group.notes.length} note{group.notes.length === 1 ? '' : 's'}
          </span>
        </span>
        {unread > 0 && (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            {unread} new
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4">
          <ul className="divide-y divide-slate-100">
            {group.notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.read && (
                  <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                    New
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 py-3">
            <Link to={`/orders/${group.orderId}`} className="text-sm text-brand-green hover:underline">
              View order →
            </Link>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(group.orderId)}
                disabled={markRead.isPending}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Mark as read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
