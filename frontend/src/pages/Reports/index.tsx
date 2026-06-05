import { useState } from 'react';
import OrderReport from './OrderReport';
import ReplacementReport from './ReplacementReport';
import RefundReport from './RefundReport';
import RedoReport from './RedoReport';
import StaffReport from './StaffReport';

/**
 * Reports (Supervisor+). A tab per report, each with the shared date + staff filter
 * bar. Built one at a time — Replacement is live; the rest land in later slices.
 */
type TabId = 'replacement' | 'order' | 'refund' | 'redo' | 'staff';

const TABS: { id: TabId; label: string; ready: boolean }[] = [
  { id: 'order', label: 'Orders', ready: true },
  { id: 'refund', label: 'Refunds', ready: true },
  { id: 'replacement', label: 'Replacements', ready: true },
  { id: 'redo', label: 'Redos', ready: true },
  { id: 'staff', label: 'Staff performance', ready: true },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<TabId>('order');

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Filter by date range and staff.</p>
      </header>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-brand-green text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'order' ? (
        <OrderReport />
      ) : tab === 'replacement' ? (
        <ReplacementReport />
      ) : tab === 'refund' ? (
        <RefundReport />
      ) : tab === 'redo' ? (
        <RedoReport />
      ) : (
        <StaffReport />
      )}
    </div>
  );
}
