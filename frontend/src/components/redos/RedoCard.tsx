import { Link } from 'react-router-dom';
import type { RedoListItem } from '@shared';
import { OrderBell } from '../notifications/OrderBell';

/**
 * A redo as it appears inside the Processing / Completed lists — laid out exactly
 * like an order's ProcessingCard so the queue reads uniformly, just flagged with a
 * "🔁 Redo" badge. Links to the redo detail to work it. Managers get a Quick view.
 */
export function RedoCard({
  redo,
  isManager = false,
  unreadCount = 0,
  onPreview,
}: {
  redo: RedoListItem;
  isManager?: boolean;
  unreadCount?: number;
  onPreview?: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${redo.lock ? 'border-rose-300' : 'border-slate-200'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link to={`/redos/${redo.id}`} className="font-semibold text-brand-green hover:underline">
            #{redo.originalOrderNumber}
          </Link>
          <OrderBell count={unreadCount} />
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            🔁 Redo
          </span>
          {redo.lock && (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              🔒 Locked
            </span>
          )}
        </div>
        <span className="shrink-0 font-medium text-slate-700">£{redo.total}</span>
      </div>

      <Link to={`/redos/${redo.id}`} className="block">
        <p className="truncate text-sm text-slate-700">{redo.customerName || 'Unknown customer'}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{redo.postcode || 'No postcode'}</span>
          <span>
            {redo.pickedCount}/{redo.productCount} picked
          </span>
          {redo.dryPicked && <span className="text-brand-green">✓ Dry</span>}
          {redo.meatPicked && <span className="text-brand-green">✓ Meat</span>}
        </div>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {redo.assigned ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-light px-3 py-1 text-sm font-semibold text-slate-800">
            <span aria-hidden>👤</span> {redo.assigned.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            <span aria-hidden>⚠️</span> Unassigned
          </span>
        )}

        {/* Admin / Super Admin only — peek at the redo without opening it. */}
        {isManager && onPreview && (
          <button
            type="button"
            onClick={onPreview}
            className="shrink-0 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            Quick view
          </button>
        )}
      </div>
    </div>
  );
}
