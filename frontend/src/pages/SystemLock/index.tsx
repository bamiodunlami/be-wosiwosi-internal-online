import { Navigate } from 'react-router-dom';
import { Roles } from '@shared';
import { useCurrentUser } from '../../hooks/useAuth';

/**
 * Shown to a packer while the system is locked (SPEC §7). Reached via RoleGuard's
 * redirect. `useCurrentUser` polls, so when an admin unlocks (or the viewer isn't a
 * locked packer), this bounces back into the app automatically.
 */
export default function SystemLockPage() {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return null;
  // Not signed in → login. Anyone who isn't a locked packer → back into the app.
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== Roles.PACKER || !user.systemLocked) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center space-y-3 bg-white p-8 rounded-lg shadow-sm border border-slate-200">
        <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-7a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2zm10-12V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">System locked</h1>
        <p className="text-sm text-slate-600">
          The warehouse system is currently paused. A Super Admin needs to unlock it before
          you can continue.
        </p>
      </div>
    </div>
  );
}
