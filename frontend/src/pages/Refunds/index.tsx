import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Refund, RefundItem } from '@shared';
import { useRefunds, useResolveRefund } from '../../hooks/useRefunds';
import { useMarkKindRead } from '../../hooks/useNotifications';
import { useToast } from '../../components/ui/toast';

/**
 * Refund Requests — Admin/Super Admin review. Lists every order with at least one
 * pending refund item; each product can be approved or rejected. The 20:00 cron
 * (email + archive) acts on approved items in a later slice.
 */
export default function RefundsPage() {
  const { data: refunds, isLoading, isError, error } = useRefunds();
  const { mutate: markKindRead } = useMarkKindRead();

  // Viewing the refunds review clears the Refund card bell (records still persist).
  useEffect(() => {
    markKindRead('refund');
  }, [markKindRead]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Refunds</h1>
        <p className="text-sm text-slate-500">Review and approve refund requests.</p>
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {refunds && refunds.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No pending refund requests.
        </div>
      )}

      {refunds && refunds.length > 0 && (
        <ul className="space-y-3">
          {refunds.map((r) => (
            <li key={r.id}>
              <RefundCard refund={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Decision = 'approved' | 'rejected' | 'pending';

function RefundCard({ refund }: { refund: Refund }) {
  const resolve = useResolveRefund();
  const toast = useToast();

  const pendingCount = refund.items.filter((it) => !it.status).length;
  // Open by default when there's something to act on.
  const [open, setOpen] = useState(pendingCount > 0);

  function act(productId: number, decision: Decision) {
    const msg =
      decision === 'approved'
        ? 'Refund approved'
        : decision === 'rejected'
          ? 'Refund rejected'
          : 'Refund reopened';
    resolve.mutate(
      { refundId: refund.id, productId, decision, redoId: refund.redoId },
      { onSuccess: () => toast(msg), onError: (e) => toast(e.message, 'error') },
    );
  }

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
          <span className="font-semibold text-slate-900">#{refund.orderNumber}</span>
          <span className="truncate text-sm text-slate-500">{refund.customerName}</span>
        </span>
        {pendingCount > 0 && (
          <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
            {pendingCount} pending
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4">
          <ul className="divide-y divide-slate-100">
            {refund.items.map((it) => (
              <RefundRow
                key={it.productId}
                item={it}
                pending={resolve.isPending}
                onAct={(decision) => act(it.productId, decision)}
              />
            ))}
          </ul>
          <div className="py-3">
            <Link
              to={refund.redoId ? `/redos/${refund.redoId}` : `/orders/${refund.orderId}`}
              className="text-sm text-brand-green hover:underline"
            >
              {refund.redoId ? 'View redo →' : 'View order →'}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function RefundRow({
  item,
  pending,
  onAct,
}: {
  item: RefundItem;
  pending: boolean;
  onAct: (decision: Decision) => void;
}) {
  const ghost =
    'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{item.productName}</p>
        <p className="text-xs text-slate-500">
          Qty {item.quantity} · £{item.amount} · by {item.requestedByName || '—'}
          {item.status && item.resolvedByName ? ` · resolved by ${item.resolvedByName}` : ''}
        </p>
      </div>

      {item.status ? (
        // Resolved — show the outcome and let an Admin re-open (cancel) it.
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              item.approval ? 'bg-brand-green-light text-slate-800' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {item.approval ? 'Approved' : 'Rejected'}
          </span>
          <button type="button" onClick={() => onAct('pending')} disabled={pending} className={ghost}>
            {item.approval ? 'Cancel' : 'Reopen'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => onAct('rejected')} disabled={pending} className={ghost}>
            Reject
          </button>
          <button
            type="button"
            onClick={() => onAct('approved')}
            disabled={pending}
            className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-50"
          >
            Approve
          </button>
        </div>
      )}
    </li>
  );
}
