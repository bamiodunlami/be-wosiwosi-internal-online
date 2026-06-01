import { useState, type FormEvent } from 'react';
import { ALL_ROLES, hasAtLeast, Roles, type Role, type User } from '@shared';
import { useCurrentUser } from '../../hooks/useAuth';
import { useConfirm } from '../../components/ui/confirm';
import { useToast } from '../../components/ui/toast';
import { Modal } from '../../components/ui/modal';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useSetUserActive,
  useResetUserPassword,
  useDeleteUser,
} from '../../hooks/useUsers';

/**
 * Staff management. Super Admins do everything (create, edit/role, enable/disable,
 * reset, delete anyone). Admins can only delete users below admin rank.
 */
export default function UsersPage() {
  const { data: users, isLoading, isError, error } = useUsers();
  const { data: me } = useCurrentUser();
  const isSuperAdmin = me?.role === Roles.SUPER_ADMIN;

  // Super Admin → anyone but self; Admin → only users below admin rank.
  function canDelete(u: User): boolean {
    if (!me || u.id === me.id) return false;
    if (isSuperAdmin) return true;
    return me.role === Roles.ADMIN && !hasAtLeast(u.role, Roles.ADMIN);
  }

  // One panel at a time: create a new user, or edit an existing one.
  const [panel, setPanel] = useState<{ mode: 'create' } | { mode: 'edit'; user: User } | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            {isSuperAdmin ? 'Create and manage staff accounts.' : 'Staff accounts.'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setPanel({ mode: 'create' })}
            className="shrink-0 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
          >
            New user
          </button>
        )}
      </header>

      {panel && (
        <Modal onClose={() => setPanel(null)}>
          <UserForm
            key={panel.mode === 'edit' ? panel.user.id : 'create'}
            user={panel.mode === 'edit' ? panel.user : null}
            isSelf={panel.mode === 'edit' && panel.user.id === me?.id}
            onClose={() => setPanel(null)}
          />
        </Modal>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading users…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {users && users.length > 0 && (
        <ul className="space-y-3">
          {users.map((u) => (
            <li key={u.id}>
              <UserRow
                user={u}
                isSelf={u.id === me?.id}
                canManage={!!isSuperAdmin}
                canDelete={canDelete(u)}
                onEdit={() => setPanel({ mode: 'edit', user: u })}
                onReset={() => setResetUser(u)}
              />
            </li>
          ))}
        </ul>
      )}

      {resetUser && (
        <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  canManage,
  canDelete,
  onEdit,
  onReset,
}: {
  user: User;
  isSelf: boolean;
  canManage: boolean; // Super Admin: edit / reset / enable-disable
  canDelete: boolean;
  onEdit: () => void;
  onReset: () => void;
}) {
  const setActive = useSetUserActive();
  const del = useDeleteUser();
  const confirm = useConfirm();
  const toast = useToast();

  async function toggleActive() {
    if (user.active) {
      const ok = await confirm({
        title: 'Disable user',
        message: `Disable ${user.fname} ${user.lname}? They won't be able to log in.`,
        confirmLabel: 'Disable',
        danger: true,
      });
      if (!ok) return;
    }
    setActive.mutate(
      { id: user.id, active: !user.active },
      { onSuccess: () => toast(user.active ? 'User disabled' : 'User enabled') },
    );
  }

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete user',
      message: `Permanently delete ${user.fname} ${user.lname}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(user.id, { onSuccess: () => toast('User deleted') });
  }

  const lightBtn =
    'rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200 disabled:opacity-40';
  const dangerBtn =
    'rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-40';

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${user.active ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">
            {user.fname} {user.lname}
            {isSelf && <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>}
          </p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
              {formatRole(user.role)}
            </span>
            {user.active ? (
              <span className="text-xs font-medium text-emerald-600">● Active</span>
            ) : (
              <span className="text-xs font-medium text-slate-400">● Disabled</span>
            )}
          </div>
        </div>
      </div>

      {(canManage || canDelete) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {canManage && (
            <button type="button" onClick={onEdit} className={lightBtn}>
              Edit
            </button>
          )}
          {canManage && (
            <button type="button" onClick={onReset} className={lightBtn}>
              Reset password
            </button>
          )}
          {/* Can't disable your own account — avoids locking yourself out. */}
          {canManage && !isSelf && (
            <button
              type="button"
              onClick={toggleActive}
              disabled={setActive.isPending}
              className={user.active ? dangerBtn : lightBtn}
            >
              {user.active ? 'Disable' : 'Enable'}
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={onDelete} disabled={del.isPending} className={dangerBtn}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UserForm({
  user,
  isSelf,
  onClose,
}: {
  user: User | null; // null = create
  isSelf: boolean;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const create = useCreateUser();
  const update = useUpdateUser();
  const toast = useToast();

  const [fname, setFname] = useState(user?.fname ?? '');
  const [lname, setLname] = useState(user?.lname ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'packer');
  const [password, setPassword] = useState('');

  const pending = create.isPending || update.isPending;
  const err = create.error?.message ?? update.error?.message;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isEdit && user) {
      update.mutate(
        { id: user.id, input: { fname, lname, email, role } },
        {
          onSuccess: () => {
            toast('User updated');
            onClose();
          },
        },
      );
    } else {
      create.mutate(
        { fname, lname, email, role, password },
        {
          onSuccess: () => {
            toast('User created');
            onClose();
          },
        },
      );
    }
  }

  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">
        {isEdit ? `Edit ${user?.fname}` : 'New user'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">First name</span>
          <input className={field} value={fname} onChange={(e) => setFname(e.target.value)} required />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Last name</span>
          <input className={field} value={lname} onChange={(e) => setLname(e.target.value)} required />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Email</span>
        <input
          type="email"
          className={field}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Role</span>
        <select
          className={`${field} disabled:opacity-50`}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={isSelf}
        >
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {formatRole(r)}
            </option>
          ))}
        </select>
        {isSelf && <span className="mt-1 block text-xs text-slate-400">You can't change your own role.</span>}
      </label>

      {!isEdit && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Initial password</span>
          <input
            type="text"
            className={field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            placeholder="At least 8 characters"
          />
          <span className="mt-1 block text-xs text-slate-400">
            The user is forced to change this on first login.
          </span>
        </label>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const reset = useResetUserPassword();
  const toast = useToast();
  const [password, setPassword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    reset.mutate(
      { id: user.id, newPassword: password },
      {
        onSuccess: () => {
          toast('Password reset');
          onClose();
        },
      },
    );
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Reset password</h2>
        <p className="text-sm text-slate-600">
          Set a new password for {user.fname} {user.lname}. They'll be asked to change it on next login.
        </p>
        <input
          type="text"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          placeholder="New password (min 8 chars)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green"
        />
        {reset.isError && <p className="text-sm text-rose-600">{reset.error.message}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={reset.isPending}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-50"
          >
            {reset.isPending ? 'Saving…' : 'Reset password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatRole(role: string): string {
  return role.replace('-', ' ');
}
