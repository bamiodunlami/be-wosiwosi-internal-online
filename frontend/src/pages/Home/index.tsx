import { Link } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useAuth';
import { useNotificationCounts } from '../../hooks/useNotifications';
import { hasAtLeast } from '@shared';
import { OPERATIONS, OPERATION_GROUPS } from '../../config/operations';
import { QuickOrderSearch } from '../../components/orders/QuickOrderSearch';

/**
 * Launcher dashboard shown at "/" after login. Mobile-first: a 2-up grid of
 * compact, tappable operation cards on phones (the primary device on the floor)
 * so an admin sees more at a glance without scrolling, widening to 3-up on large
 * screens. Each card is gated by role, so a Packer only sees daily work and a
 * Super Admin sees everything.
 */
export default function HomePage() {
  const { data: user } = useCurrentUser();
  const { data: counts } = useNotificationCounts();
  if (!user) return null;

  const visible = OPERATIONS.filter((op) => hasAtLeast(user.role, op.minRole));
  // Bell counts: the Notifications card shows note count, the Refunds card refund.
  const badgeFor = (to: string) =>
    to === '/notifications' ? (counts?.note ?? 0) : to === '/refunds' ? (counts?.refund ?? 0) : 0;

  return (
    <div className="space-y-6">
      <header className="space-y-0.5">
        <h1 className="text-2xl font-semibold text-slate-900">Hi, {user.fname}</h1>
        <p className="text-sm text-slate-500">
          Signed in as{' '}
          <span className="font-medium capitalize">{user.role.replace('-', ' ')}</span>
        </p>
      </header>

      <QuickOrderSearch />

      {OPERATION_GROUPS.map((group) => {
        const items = visible.filter((op) => op.group === group.id);
        if (items.length === 0) return null;

        return (
          <section key={group.id} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group.title}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {items.map((op) => (
                <Link
                  key={op.to}
                  to={op.to}
                  className="group relative flex min-h-[120px] flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-green hover:bg-brand-green-light active:bg-brand-green-light sm:min-h-[88px] sm:flex-row sm:items-start sm:gap-3 sm:p-5"
                >
                  {badgeFor(op.to) > 0 && (
                    <span className="absolute right-2 top-2 inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-rose-500 px-2 text-base font-extrabold leading-none text-white shadow-md">
                      {badgeFor(op.to)}
                    </span>
                  )}
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 ${op.accent} sm:h-11 sm:w-11`}
                    aria-hidden
                  >
                    <op.icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{op.label}</span>
                    <span className="block text-sm text-slate-500">{op.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
