import { Navigate, useLocation } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useAuth';
import { hasAtLeast, Roles, type Role } from '@shared';

interface RoleGuardProps {
  minRole?: Role;
  children: React.ReactNode;
}

/**
 * Wrap any protected route. Redirects to /login if unauthenticated,
 * to /change-password if password change required,
 * to / if the user lacks the required role.
 */
export function RoleGuard({ minRole, children }: RoleGuardProps) {
  const { data: user, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // System lock (SPEC §7): packers are paused; supervisors/admins work on.
  if (user.role === Roles.PACKER && user.systemLocked) {
    return <Navigate to="/system-locked" replace />;
  }

  if (!user.passChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (minRole && !hasAtLeast(user.role, minRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
