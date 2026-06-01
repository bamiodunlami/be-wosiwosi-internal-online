import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Prominent quick-search for orders, available to every role. Rendered on the
 * Home dashboard just under the greeting. Submitting navigates to
 * /orders?q=<term>; the Orders page does the actual lookup (by order number or
 * customer name) once the orders backend lands in a later slice.
 *
 * Mobile-first and full-width so it's the obvious first action on the page.
 */
export function QuickOrderSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  return (
    <form onSubmit={onSubmit} role="search" className="relative w-full">
      <span
        className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400"
        aria-hidden
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search order number"
        aria-label="Search by order number"
        className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-12 pr-24 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="submit"
        className="absolute inset-y-0 right-2 my-2 rounded-lg bg-brand-green px-4 text-sm font-medium text-white hover:bg-brand-green-hover"
      >
        Search
      </button>
    </form>
  );
}
