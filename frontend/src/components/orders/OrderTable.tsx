import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Order, RedoListItem } from '@shared';
import { useOrderDetail } from '../../hooks/useOrders';
import { useRedo } from '../../hooks/useRedos';
import { useUnreadByOrder, useUnreadByRedo } from '../../hooks/useNotifications';
import { Modal } from '../ui/modal';
import { lineTotal } from '../../lib/money';
import { firstName } from '../../lib/staff';
import { OrderBell } from '../notifications/OrderBell';
import { CheckIcon, LockIcon, RepeatIcon } from '../ui/icons';

/** A row is either a normal order or a redo; both work the same flow. */
export type OrderTableRow =
  | { kind: 'order'; key: string; order: Order }
  | { kind: 'redo'; key: string; redo: RedoListItem };

/**
 * The shared 3-column orders table used by both Processing and Completed:
 *   1. Order #  (+ lock, notification bell, Quick view)
 *   2. Customer (name, postcode, amount)
 *   3. Packer   (assigned first name, or Unassigned)
 * Quick view opens a read-only preview modal without leaving the list.
 */
export function OrderTable({
  rows,
  showQuickView = true,
}: {
  rows: OrderTableRow[];
  showQuickView?: boolean;
}) {
  const { data: unread } = useUnreadByOrder();
  const { data: redoUnread } = useUnreadByRedo();
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewRedoId, setPreviewRedoId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="p-3">Order</th>
            <th className="p-3">Customer</th>
            <th className="w-32 p-3">Packer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) =>
            row.kind === 'order' ? (
              <OrderRow
                key={row.key}
                order={row.order}
                unreadCount={unread?.get(row.order.orderId) ?? 0}
                onPreview={() => setPreviewId(row.order.orderId)}
                showQuickView={showQuickView}
              />
            ) : (
              <RedoRow
                key={row.key}
                redo={row.redo}
                unreadCount={redoUnread?.get(row.redo.id) ?? 0}
                onPreview={() => setPreviewRedoId(row.redo.id)}
                showQuickView={showQuickView}
              />
            ),
          )}
        </tbody>
      </table>

      {previewId !== null && (
        <OrderPreviewModal orderId={previewId} onClose={() => setPreviewId(null)} />
      )}
      {previewRedoId !== null && (
        <RedoPreviewModal redoId={previewRedoId} onClose={() => setPreviewRedoId(null)} />
      )}
    </div>
  );
}

const quickViewClasses =
  'mt-1.5 inline-block whitespace-nowrap rounded-lg border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200';

/** Locked-order marker — a small red padlock icon (red = the locked/blocked state). */
function LockBadge() {
  return (
    <span title="Locked" aria-label="Locked" className="inline-flex text-red-600">
      <LockIcon className="h-4 w-4" />
    </span>
  );
}

/** Quick-view trigger — label always on one line, even on mobile. */
export function QuickViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={quickViewClasses}>
      Quick view
    </button>
  );
}

function PackerCell({
  assigned,
  picked,
  total,
}: {
  assigned: { name: string } | null;
  picked: number;
  total: number;
}) {
  return (
    <td className="p-3 align-top">
      {assigned ? (
        <span className="block text-sm font-medium text-slate-700">{firstName(assigned.name)}</span>
      ) : (
        <span className="block text-sm font-medium text-amber-700">Unassigned</span>
      )}
      <span className="mt-0.5 block text-xs text-slate-500">
        {picked}/{total} picked
      </span>
    </td>
  );
}

function OrderRow({
  order,
  unreadCount,
  onPreview,
  showQuickView,
}: {
  order: Order;
  unreadCount: number;
  onPreview: () => void;
  showQuickView: boolean;
}) {
  const visible = order.products.filter((p) => !p.hidden);
  const picked = visible.filter((p) => p.picked).length;
  return (
    <tr
      className="transition-colors hover:bg-slate-50"
    >
      <td className="p-3 align-top">
        <div className="flex items-center gap-1.5">
          <Link
            to={`/orders/${order.orderId}`}
            className="font-semibold text-brand-green hover:underline"
          >
            #{order.orderNumber}
          </Link>
          {order.lock && <LockBadge />}
          <OrderBell count={unreadCount} />
        </div>
        {showQuickView && <QuickViewButton onClick={onPreview} />}
      </td>
      <td className="p-3 align-top">
        <Link
          to={`/orders/${order.orderId}`}
          className="block break-words text-slate-800 hover:underline"
        >
          {order.customerName || 'Unknown customer'}
        </Link>
        <div className="text-xs text-slate-500">{order.postcode || 'No postcode'}</div>
      </td>
      <PackerCell assigned={order.assigned} picked={picked} total={visible.length} />
    </tr>
  );
}

function RedoRow({
  redo,
  unreadCount,
  onPreview,
  showQuickView,
}: {
  redo: RedoListItem;
  unreadCount: number;
  onPreview: () => void;
  showQuickView: boolean;
}) {
  return (
    <tr
      className="transition-colors hover:bg-slate-50"
    >
      <td className="p-3 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/redos/${redo.id}`}
            className="font-semibold text-brand-green hover:underline"
          >
            #{redo.originalOrderNumber}
          </Link>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            <RepeatIcon className="h-2.5 w-2.5" /> Redo
          </span>
          {redo.lock && <LockBadge />}
          <OrderBell count={unreadCount} />
        </div>
        {showQuickView && <QuickViewButton onClick={onPreview} />}
      </td>
      <td className="p-3 align-top">
        <Link to={`/redos/${redo.id}`} className="block break-words text-slate-800 hover:underline">
          {redo.customerName || 'Unknown customer'}
        </Link>
        <div className="text-xs text-slate-500">{redo.postcode || 'No postcode'}</div>
      </td>
      <PackerCell assigned={redo.assigned} picked={redo.pickedCount} total={redo.productCount} />
    </tr>
  );
}

/**
 * A capped-height, scrollable product list with an explicit "more below"
 * affordance: a bottom fade + a small bouncing "⌄ scroll" chevron that show only
 * while there's content below the fold, and vanish once you reach the bottom.
 */
function ScrollableList({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div>
      <ul
        ref={ref}
        className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
      >
        {children}
      </ul>
      {/* Hint sits OUTSIDE the scroll area (below it) so it never covers list text.
          A reserved height keeps the layout from jumping when it toggles. */}
      <div
        className={`mt-2 flex h-5 items-center justify-center transition-opacity duration-200 ${
          moreBelow ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="animate-bounce text-xs font-medium text-slate-500">⌄ scroll for more</span>
      </div>
    </div>
  );
}

/** Admin quick-preview of an order's contents, fetched live, without navigating. */
export function OrderPreviewModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { data: order, isLoading, isError, error } = useOrderDetail(orderId);

  return (
    <Modal onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-500">Loading order…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {order && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">#{order.orderNumber}</h2>
              <p className="truncate text-sm text-slate-500">
                {order.customerName || 'Unknown customer'}
              </p>
            </div>
            <span className="shrink-0 font-semibold text-slate-700">£{order.total}</span>
          </div>

          {order.assigned ? (
            <span className="text-sm font-medium text-slate-700">{firstName(order.assigned.name)}</span>
          ) : (
            <span className="text-sm font-medium text-amber-700">Unassigned</span>
          )}

          {order.customerNote && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <span className="font-semibold">Customer note: </span>
              {order.customerNote}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Products ({order.products.filter((p) => !p.hidden).length})
            </h3>
            <ScrollableList>
              {order.products
                .filter((p) => !p.hidden)
                .map((p, i) => (
                <li key={`${p.productId}-${i}`} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <span className="text-sm text-slate-900">{p.name}</span>
                    {p.cutOption && (
                      <span className="mt-0.5 block text-sm font-bold text-orange-600">{p.cutOption}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {order.saved && (
                      <span className={p.picked ? 'text-brand-green' : 'text-slate-300'}>
                        {p.picked ? <CheckIcon className="h-4 w-4" /> : '—'}
                      </span>
                    )}
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ScrollableList>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <Link
              to={`/orders/${order.orderId}`}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              Open full page
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Admin quick-preview of a redo's contents — mirrors OrderPreviewModal. */
function RedoPreviewModal({ redoId, onClose }: { redoId: string; onClose: () => void }) {
  const { data: redo, isLoading, isError, error } = useRedo(redoId);

  return (
    <Modal onClose={onClose} size="lg">
      {isLoading && <p className="text-sm text-slate-500">Loading redo…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {redo && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">#{redo.originalOrderNumber}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <RepeatIcon className="h-3 w-3" /> Redo
                </span>
              </div>
              <p className="truncate text-sm text-slate-500">
                {redo.customerName || 'Unknown customer'}
              </p>
            </div>
          </div>

          {redo.assigned ? (
            <span className="text-sm font-medium text-slate-700">{firstName(redo.assigned.name)}</span>
          ) : (
            <span className="text-sm font-medium text-amber-700">Unassigned</span>
          )}

          {redo.customerNote && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <span className="font-semibold">Customer note: </span>
              {redo.customerNote}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Products ({redo.products.length})
            </h3>
            <ScrollableList>
              {redo.products.map((p, i) => (
                <li key={`${p.productId}-${i}`} className="flex items-start justify-between gap-3 p-2.5">
                  <div className="min-w-0">
                    <span className="text-sm text-slate-900">{p.name}</span>
                    {p.cutOption && (
                      <span className="mt-0.5 block text-sm font-bold text-orange-600">{p.cutOption}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={p.picked ? 'text-brand-green' : 'text-slate-300'}>
                      {p.picked ? <CheckIcon className="h-4 w-4" /> : '—'}
                    </span>
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ScrollableList>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <Link
              to={`/redos/${redo.id}`}
              className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
            >
              Open full page
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
