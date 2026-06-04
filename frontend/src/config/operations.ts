import { Roles, type Role } from '@shared';

/**
 * The app's major operations — the single source of truth for both the
 * Home launcher (pages/Home) and the nav (components/layout/Navbar), so the
 * two never drift. Each entry is role-gated via `minRole`; routes that don't
 * exist yet point at placeholder pages (see router.tsx).
 *
 * Mirrors the SPEC §4 permission matrix: daily work is open to Packers and up;
 * the "admin" group is Admin and up — except user management, which stays
 * Super Admin–only.
 */
export interface Operation {
  to: string;
  label: string;
  description: string;
  icon: string; // emoji glyph — keeps the bundle dep-free
  accent: string; // Tailwind classes for the icon chip
  minRole: Role;
  group: 'daily' | 'admin';
}

export const OPERATION_GROUPS: { id: Operation['group']; title: string }[] = [
  { id: 'daily', title: 'Daily work' },
  { id: 'admin', title: 'Admin operations' },
];

export const OPERATIONS: Operation[] = [
  // ── Daily work ────────────────────────────────────────────────────────────
  {
    to: '/orders',
    label: 'Orders',
    description: 'Pick live store orders to send for processing',
    icon: '📦',
    accent: 'bg-brand-green-light',
    // Admin and above — packers/supervisors work from Processing, not here.
    minRole: Roles.ADMIN,
    group: 'daily',
  },
  {
    to: '/processing',
    label: 'Processing',
    description: 'Orders currently assigned and being packed',
    icon: '⏳',
    accent: 'bg-brand-green-light',
    minRole: Roles.PACKER,
    group: 'daily',
  },
  {
    to: '/completed',
    label: 'Completed',
    description: 'Orders completed today',
    icon: '✅',
    accent: 'bg-brand-green-light',
    minRole: Roles.PACKER,
    group: 'daily',
  },
  {
    to: '/refunds',
    label: 'Refunds',
    description: "Review, approve or reject today's refund requests",
    icon: '💷',
    accent: 'bg-brand-green-light',
    // Approving/rejecting is an Admin action (SPEC §4), though it sits in
    // the daily-work group on the dashboard.
    minRole: Roles.ADMIN,
    group: 'daily',
  },
  {
    to: '/notifications',
    label: 'Notifications',
    description: 'Notes from packers and supervisors',
    icon: '🔔',
    accent: 'bg-brand-green-light',
    // Admin+ only — packers/supervisors see notes via the per-order bell + banner.
    minRole: Roles.ADMIN,
    group: 'daily',
  },
  {
    to: '/reports',
    label: 'Reports',
    description: 'Orders, staff and store performance',
    icon: '📊',
    accent: 'bg-brand-green-light',
    minRole: Roles.SUPERVISOR,
    group: 'daily',
  },

  // ── Super Admin operations ────────────────────────────────────────────────
  {
    to: '/admin/users',
    label: 'Users',
    description: 'Manage staff accounts',
    icon: '👥',
    accent: 'bg-brand-yellow-light',
    // Admin+ — admins can delete packers/supervisors; full management is Super Admin.
    minRole: Roles.ADMIN,
    group: 'admin',
  },
  {
    to: '/admin/system',
    label: 'System settings',
    description: 'System lock & refund email recipients',
    icon: '⚙️',
    accent: 'bg-brand-yellow-light',
    minRole: Roles.ADMIN,
    group: 'admin',
  },
];
