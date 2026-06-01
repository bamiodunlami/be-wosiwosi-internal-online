import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';

/**
 * Slim top bar: just the brand and sign-out. Navigation lives on the Home
 * launcher dashboard (the operation cards), and a Back button is in AppShell —
 * so the bar stays uncluttered. Notification bells live on the dashboard cards.
 */
export function Navbar() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  if (!user) return null;

  const signOut = () => logout.mutate(undefined, { onSuccess: () => navigate('/login') });

  return (
    <nav className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-brand-green sm:text-2xl">
            wosiwosi
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">
              {user.fname} <span className="text-slate-400">·</span> {user.role}
            </span>
            <span className="text-sm text-slate-600 sm:hidden">{user.fname}</span>
            <button
              type="button"
              onClick={signOut}
              disabled={logout.isPending}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
