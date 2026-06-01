export const Roles = {
  PACKER: 'packer',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super-admin',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const ALL_ROLES: readonly Role[] = [
  Roles.PACKER,
  Roles.SUPERVISOR,
  Roles.ADMIN,
  Roles.SUPER_ADMIN,
] as const;

// Permission helpers — mirror SPEC.md §3 hierarchy:
// Packer ⊂ Supervisor ⊂ Admin ⊂ Super Admin.
// Admin has every operational power; only Super Admin can create/manage users.
const ROLE_RANK: Record<Role, number> = {
  packer: 1,
  supervisor: 2,
  admin: 3,
  'super-admin': 4,
};

export function hasAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
