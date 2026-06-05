import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order, RedoListItem } from '@shared';
import { useOrderDetail } from '../../hooks/useOrders';
import { useRedo } from '../../hooks/useRedos';
import { useUnreadByOrder, useUnreadByRedo } from '../../hooks/useNotifications';
import { Modal } from '../ui/modal';
import { lineTotal } from '../../lib/money';
import { firstName } from '../../lib/staff';
import { OrderBell } from '../notifications/OrderBell';

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
export function OrderTable({ rows }: { rows: OrderTableRow[] }) {
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
              />
            ) : (
              <RedoRow
                key={row.key}
                redo={row.redo}
                unreadCount={redoUnread?.get(row.redo.id) ?? 0}
                onPreview={() => setPreviewRedoId(row.redo.id)}
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </span>
  );
}

/** Quick-view trigger — label always on one line, even on mobile. */
function QuickViewButton({ onClick }: { onClick: () => void }) {
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
}: {
  order: Order;
  unreadCount: number;
  onPreview: () => void;
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
        <QuickViewButton onClick={onPreview} />
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
}: {
  redo: RedoListItem;
  unreadCount: number;
  onPreview: () => void;
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
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            🔁 Redo
          </span>
          {redo.lock && <LockBadge />}
          <OrderBell count={unreadCount} />
        </div>
        <QuickViewButton onClick={onPreview} />
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

/** Admin quick-preview of an order's contents, fetched live, without navigating. */
function OrderPreviewModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
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
            <div className="relative">
            <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
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
                        {p.picked ? '✓' : '—'}
                      </span>
                    )}
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {/* Bottom fade hints there's more to scroll. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-lg bg-gradient-to-t from-white" />
            </div>
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
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  🔁 Redo
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
            <div className="relative">
            <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
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
                      {p.picked ? '✓' : '—'}
                    </span>
                    <span className="font-extrabold text-slate-900">×{p.quantity}</span>
                    <span className="w-16 text-right text-slate-700">£{lineTotal(p.price, p.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
            {/* Bottom fade hints there's more to scroll. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-lg bg-gradient-to-t from-white" />
            </div>
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
