import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useOrders } from '../../hooks/useOrders';
import { useRedos } from '../../hooks/useRedos';
import { RepeatIcon } from '../../components/ui/icons';

/**
 * Consolidated pick list of all DRY or all FROZEN products across the orders AND
 * pending redos currently in processing (not completed). Role-scoped by the API
 * exactly like the Processing list — a packer sees only their own orders'/redos'
 * products, supervisors and admins see all. Reached from the two buttons on the
 * Processing page.
 */
type ProductType = 'dry' | 'frozen';

interface Source {
  to: string; // route to the order or redo detail
  label: string; // order number to show on the chip
  isRedo: boolean;
  qty: number;
  picked: boolean;
}

interface Group {
  name: string;
  total: number;
  picked: number;
  sources: Source[];
}

export default function ProcessingProductsPage() {
  const { type } = useParams<{ type: string }>();
  const productType: ProductType = type === 'frozen' ? 'frozen' : 'dry';
  const { data: orders, isLoading, isError, error } = useOrders('processing');
  const { data: redos } = useRedos();

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    const add = (name: string, qty: number, picked: boolean, source: Source) => {
      let g = map.get(name);
      if (!g) {
        g = { name, total: 0, picked: 0, sources: [] };
        map.set(name, g);
      }
      g.total += qty;
      if (picked) g.picked += qty;
      g.sources.push(source);
    };

    for (const o of orders ?? []) {
      for (const p of o.products) {
        if (p.hidden) continue;
        if ((productType === 'frozen') !== p.frozen) continue;
        add(p.name, p.quantity, p.picked, {
          to: `/orders/${o.orderId}`,
          label: o.orderNumber,
          isRedo: false,
          qty: p.quantity,
          picked: p.picked,
        });
      }
    }

    // Pending redos are worked like orders, so their products belong in the same lists.
    for (const r of redos ?? []) {
      if (r.status) continue; // completed redos are out of the queue
      for (const p of r.products) {
        if ((productType === 'frozen') !== p.frozen) continue;
        add(p.name, p.quantity, p.picked, {
          to: `/redos/${r.id}`,
          label: r.originalOrderNumber,
          isRedo: true,
          qty: p.quantity,
          picked: p.picked,
        });
      }
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, redos, productType]);

  const totalUnits = groups.reduce((n, g) => n + g.total, 0);
  const label = productType === 'frozen' ? 'Frozen' : 'Dry';

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{label} products</h1>
        <p className="text-sm text-slate-500">
          All {label.toLowerCase()} products across orders and redos in processing.
        </p>
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {orders && groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No {label.toLowerCase()} products in processing.
        </div>
      )}

      {groups.length > 0 && (
        <>
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{groups.length}</span> product
            {groups.length === 1 ? '' : 's'} ·{' '}
            <span className="font-semibold text-slate-700">{totalUnits}</span> unit
            {totalUnits === 1 ? '' : 's'} to pick
          </p>
          <ul className="space-y-3">
            {groups.map((g) => (
              <li key={g.name}>
                <ProductCard group={g} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ProductCard({ group }: { group: Group }) {
  const done = group.picked >= group.total;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-slate-900">{group.name}</span>
        <span className="shrink-0 text-sm">
          <span className={`font-extrabold ${done ? 'text-brand-green' : 'text-slate-900'}`}>
            {group.total}
          </span>
          <span className="text-slate-400"> to pick</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {group.sources.map((s, i) => (
          <Link
            key={`${s.to}-${i}`}
            to={s.to}
            title={s.isRedo ? `Redo of #${s.label}` : `Order #${s.label}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
              s.picked
                ? 'border-brand-green/40 bg-brand-green-light text-brand-green line-through'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {s.isRedo && <RepeatIcon className="h-3 w-3" />}#{s.label} ×{s.qty}
          </Link>
        ))}
      </div>
    </div>
  );
}
