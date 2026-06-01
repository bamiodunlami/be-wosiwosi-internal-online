import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './Navbar';

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Every page gets a Back button except the dashboard root (nothing to go back to).
  const showBack = pathname !== '/';

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
        {showBack && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-green"
          >
            ← Back
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}
