import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StoreOrder, StoreOrderState } from '@shared';
import type { StoreQuery } from '../../api/orders';
import { useStoreOrders, useSaveOrders, useRemoveSavedOrder } from '../../hooks/useOrders';
import { useConfirm } from '../../components/ui/confirm';
import { useToast } from '../../components/ui/toast';
import { OrderPreviewModal, QuickViewButton } from '../../components/orders/OrderTable';
import { LockIcon, NoteIcon, XIcon } from '../../components/ui/icons';

/**
 * The Order page (Super Admin only). Lists live WooCommerce orders for a date
 * range — today by default, adjustable — and lets the SA select which ones to
 * send for processing. Selecting + saving writes the order into the local
 * `orders` collection; assignment and packing happen later on the Processing page.
 */
export default function SelectOrdersPage() {
  const [from, setFrom] = useState(() => startOfToday());
  const [to, setTo] = useState(() => endOfToday());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewId, setPreviewId] = useState<number | null>(null);
  // The date inputs are just a draft; we only fetch the applied range, which
  // updates when the user presses "Get orders" — never on input change.
  const [applied, setApplied] = useState<StoreQuery>(() => ({
    after: toISO(startOfToday()),
    before: toISO(endOfToday()),
  }));

  const { data: orders, isLoading, isError, error, isFetching } = useStoreOrders(applied);

  // Sortable by order number or date/time; ascending by default.
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedOrders = useMemo(() => {
    if (!orders) return orders;
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...orders].sort((a, b) => factor * compareOrders(a, b, sortBy));
  }, [orders, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }

  function getOrders() {
    setApplied({ after: toISO(from), before: toISO(to) });
  }
  const save = useSaveOrders();
  const removeSaved = useRemoveSavedOrder();
  const confirm = useConfirm();
  const toast = useToast();

  // Only genuinely-new orders can be sent — anything already in processing,
  // completed, or archived is locked out (no duplicates / no re-processing).
  const selectable = (orders ?? []).filter((o) => o.state === 'new');
  const allSelected = selectable.length > 0 && selectable.every((o) => selected.has(o.orderId));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((o) => o.orderId)));
  }

  function onSave() {
    if (selected.size === 0) return;
    save.mutate([...selected], {
      onSuccess: (result) => {
        setSelected(new Set());
        const n = result.saved;
        const skipped = result.skipped ? ` · ${result.skipped} already saved` : '';
        toast(`${n} order${n === 1 ? '' : 's'} sent for processing${skipped}`);
      },
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
        <p className="text-sm text-slate-500">
          Select the orders to send for processing.{' '}
          <Link to="/processing" className="text-brand-green hover:underline">
            Go to Processing →
          </Link>
        </p>
      </div>

      {/* Date / time range — stacked full-width on mobile, a row on sm+ */}
      <div className="flex flex-col items-stretch gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block w-full text-sm sm:w-auto">
          <span className="mb-1 block text-slate-600">From</span>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={isFetching}
            className="w-full min-w-0 max-w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 sm:w-auto"
          />
        </label>
        <label className="block w-full text-sm sm:w-auto">
          <span className="mb-1 block text-slate-600">To</span>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={isFetching}
            className="w-full min-w-0 max-w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 sm:w-auto"
          />
        </label>
        <button
          type="button"
          onClick={getOrders}
          disabled={isFetching}
          className="w-full rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-hover disabled:opacity-50 sm:w-auto"
        >
          {isFetching ? 'Getting…' : 'Get orders'}
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading orders…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && orders.length > 0 && (
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{orders.length}</span>{' '}
          order{orders.length === 1 ? '' : 's'} found
          {selectable.length !== orders.length && (
            <>
              {' '}· <span className="font-semibold text-slate-900">{selectable.length}</span> available
              to send
            </>
          )}
        </p>
      )}

      {orders && orders.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No orders in this range.
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="h-4 w-4 accent-brand-green"
                  />
                </th>
                <th className="p-3">
                  <SortHeader
                    label="Order"
                    active={sortBy === 'orderNumber'}
                    dir={sortDir}
                    onClick={() => toggleSort('orderNumber')}
                  />
                </th>
                <th className="p-3">Customer</th>
                <th className="hidden p-3 sm:table-cell">Postcode</th>
                <th className="hidden p-3 sm:table-cell">Amount</th>
                <th className="w-16 p-3 text-center">Note</th>
                <th className="hidden w-28 p-3 sm:table-cell">
                  <SortHeader
                    label="Date"
                    active={sortBy === 'date'}
                    dir={sortDir}
                    onClick={() => toggleSort('date')}
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(sortedOrders ?? []).map((order) => (
                <OrderRow
                  key={order.orderId}
                  order={order}
                  checked={selected.has(order.orderId)}
                  onToggle={() => toggle(order.orderId)}
                  onPreview={() => setPreviewId(order.orderId)}
                  onRemove={async () => {
                    const ok = await confirm({
                      title: 'Remove from processing',
                      message: `Remove order #${order.orderNumber} from processing?`,
                      confirmLabel: 'Remove',
                      danger: true,
                    });
                    if (ok) removeSaved.mutate(order.orderId);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {save.isError && <p className="text-sm text-rose-600">{save.error.message}</p>}

      {orders && orders.length > 0 && (
        <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:-mx-6 sm:px-6">
          <button
            type="button"
            onClick={onSave}
            disabled={selected.size === 0 || save.isPending}
            className="w-full rounded-lg bg-brand-green py-3 font-medium text-white hover:bg-brand-green-hover disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {save.isPending
              ? 'Saving…'
              : `Send ${selected.size || ''} for processing`.replace('  ', ' ')}
          </button>
        </div>
      )}

      {previewId !== null && (
        <OrderPreviewModal orderId={previewId} onClose={() => setPreviewId(null)} />
      )}
    </div>
  );
}

function OrderRow({
  order,
  checked,
  onToggle,
  onPreview,
  onRemove,
}: {
  order: StoreOrder;
  checked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const handled = order.state !== 'new';
  const when = new Date(order.dateCreated);

  return (
    <tr className={handled ? 'bg-slate-50' : checked ? 'bg-brand-green-light' : ''}>
      <td className="p-3 align-top">
        {order.state === 'new' ? (
          // Not in our system yet → selectable.
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={`Select order ${order.orderNumber}`}
            className="h-4 w-4 accent-brand-green"
          />
        ) : order.state === 'archived' ? (
          // Permanently archived — can't be re-added or removed.
          <span title="Archived — already fulfilled" aria-label="Archived" className="text-slate-400">
            <LockIcon className="h-4 w-4" />
          </span>
        ) : (
          // In the live queue (processing/completed) → can be pulled back out.
          <button
            type="button"
            onClick={onRemove}
            title="Remove from processing"
            aria-label={`Remove order ${order.orderNumber} from processing`}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200"
          >
            <XIcon className="h-3 w-3" />
          </button>
        )}
      </td>
      <td className="p-3 align-top font-medium">
        <Link to={`/orders/${order.orderId}`} className="text-brand-green hover:underline">
          #{order.orderNumber}
        </Link>
        <div>
          <QuickViewButton onClick={onPreview} />
        </div>
        <StateBadge state={order.state} />
      </td>
      <td className="p-3 align-top">
        <Link to={`/orders/${order.orderId}`} className="text-slate-700 hover:underline">
          {order.customerName || 'Unknown customer'}
        </Link>
      </td>
      <td className="hidden whitespace-nowrap p-3 align-top sm:table-cell">
        {order.postcode || '—'}
      </td>
      <td className="hidden whitespace-nowrap p-3 align-top sm:table-cell">£{order.total}</td>
      <td className="p-3 text-center align-top">
        {order.customerNote ? (
          <NoteTooltip note={order.customerNote} />
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="hidden p-3 align-top leading-tight text-slate-500 sm:table-cell">
        <div>{when.toLocaleDateString()}</div>
        <div>{when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </td>
    </tr>
  );
}

const STATE_BADGE: Record<StoreOrderState, { label: string; cls: string } | null> = {
  new: null,
  processing: { label: 'In processing', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', cls: 'bg-brand-green-light text-brand-green' },
  archived: { label: 'Archived', cls: 'bg-slate-200 text-slate-600' },
};

/** Why an order can't be re-sent: it's already in processing, completed, or archived. */
function StateBadge({ state }: { state: StoreOrderState }) {
  const badge = STATE_BADGE[state];
  if (!badge) return null;
  return (
    <span className="mt-1 block">
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
        {badge.label}
      </span>
    </span>
  );
}

// ── sorting ───────────────────────────────────────────────────────────────────

type SortKey = 'orderNumber' | 'date';
type SortDir = 'asc' | 'desc';

/** Ascending comparison; the caller negates for descending. */
function compareOrders(a: StoreOrder, b: StoreOrder, key: SortKey): number {
  if (key === 'orderNumber') {
    const na = Number(a.orderNumber);
    const nb = Number(b.orderNumber);
    if (Number.isNaN(na) || Number.isNaN(nb)) return a.orderNumber.localeCompare(b.orderNumber);
    return na - nb;
  }
  return new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime();
}

/** A clickable column header that shows the active sort direction. */
function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-600"
      aria-label={`Sort by ${label}${active ? (dir === 'asc' ? ', ascending' : ', descending') : ''}`}
    >
      {label}
      <span className="text-[10px] leading-none text-slate-400">
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  );
}

/**
 * Customer note popover — anchored to the cell's right edge so it stays on
 * screen. Tap toggles it (reliable on touch, where hover doesn't exist); on
 * desktop hover also reveals it. Closes on blur. The hover reveal is gated to
 * hover-capable devices — on touch, a tap leaves a sticky emulated :hover that
 * would otherwise hold the tooltip open after tapping to close.
 */
function NoteTooltip({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label={`Customer note: ${note}`}
        aria-expanded={open}
        className="cursor-pointer select-none rounded p-1 text-base focus:outline-none focus:ring-1 focus:ring-brand-green"
      >
        <NoteIcon className="h-5 w-5 text-slate-600" />
      </button>
      <span
        role="tooltip"
        className={`absolute right-0 top-full z-30 mt-1 w-56 max-w-[75vw] whitespace-normal break-words rounded-md bg-slate-800 px-3 py-2 text-left text-sm leading-snug text-white shadow-lg transition-opacity [@media(hover:hover)]:group-hover:visible [@media(hover:hover)]:group-hover:opacity-100 ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        {note}
      </span>
    </span>
  );
}

// ── date helpers (datetime-local strings in the browser's local time) ─────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return toLocalInput(d);
}

function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return toLocalInput(d);
}

function toISO(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
