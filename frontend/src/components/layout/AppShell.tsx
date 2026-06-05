import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useNotificationStream } from '../../hooks/useNotificationStream';

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Start every page from the top — without this, navigating keeps the previous
  // page's scroll offset, landing the user mid-list instead of at the title.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  // Every page gets a Back button except the dashboard root (nothing to go back to).
  const showBack = pathname !== '/';
  // Processing is a launcher destination — Back returns to the dashboard rather than
  // into the browser history (which could be a worked order on this device).
  const goBack = () => (pathname === '/processing' ? navigate('/') : navigate(-1));
  // Live notifications — the shell only renders for authenticated users, so this
  // keeps one SSE connection open while the user is in the app.
  useNotificationStream();

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
        {showBack && (
          <button
            type="button"
            onClick={goBack}
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
