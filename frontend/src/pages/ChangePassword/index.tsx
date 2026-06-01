import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChangePassword, useCurrentUser } from '../../hooks/useAuth';

export default function ChangePasswordPage() {
  const { data: user } = useCurrentUser();
  const change = useChangePassword();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = newPassword.length > 0 && confirm.length > 0 && newPassword !== confirm;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mismatch || tooShort) return;
    change.mutate(
      { currentPassword, newPassword },
      { onSuccess: () => navigate('/', { replace: true }) },
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 bg-white p-6 rounded-lg shadow-sm border border-slate-200"
      >
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Change password</h1>
          {!user?.passChange && (
            <p className="text-sm text-slate-500">
              You must change your password before continuing.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Current password</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">New password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
          {tooShort && <p className="text-xs text-rose-600">At least 8 characters.</p>}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
          {mismatch && <p className="text-xs text-rose-600">Passwords do not match.</p>}
        </div>

        {change.isError && (
          <p className="text-sm text-rose-600">{change.error.message}</p>
        )}

        <button
          type="submit"
          disabled={change.isPending || mismatch || tooShort}
          className="w-full px-3 py-2 rounded-md bg-brand-green text-white font-medium hover:bg-brand-green-hover disabled:opacity-50"
        >
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
