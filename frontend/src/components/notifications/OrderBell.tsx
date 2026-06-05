import { BellIcon } from '../ui/icons';

/** Small bell + unread count shown on an order card; renders nothing when zero. */
export function OrderBell({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} new notification${count === 1 ? '' : 's'}`}
      className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-sm font-bold text-white"
    >
      <BellIcon className="h-3.5 w-3.5" /> {count}
    </span>
  );
}
