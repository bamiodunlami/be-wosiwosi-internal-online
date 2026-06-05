import { useEffect, useState, type FormEvent } from 'react';
import { useSettings, useUpdateSettings } from '../../hooks/useSettings';
import { useToast } from '../../components/ui/toast';
import { LockIcon, UnlockIcon, XIcon } from '../../components/ui/icons';
import { useConfirm } from '../../components/ui/confirm';

/**
 * System settings (Admin+): the system lock (SPEC §7) and the refund-email
 * recipients (the accountant/manager group BCC'd on the nightly refund emails — §8).
 */
export default function SystemPage() {
  const { data: settings, isLoading, isError, error } = useSettings();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">System settings</h1>
        <p className="text-sm text-slate-500">Configuration for the warehouse console.</p>
      </header>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">{error.message}</p>}

      {settings && (
        <>
          <SystemLockToggle locked={settings.lock} />
          <RefundRecipients initial={settings.refundBcc} />
        </>
      )}
    </div>
  );
}

function SystemLockToggle({ locked }: { locked: boolean }) {
  const update = useUpdateSettings();
  const toast = useToast();
  const confirm = useConfirm();

  async function toggle() {
    const next = !locked;
    const ok = await confirm({
      title: next ? 'Lock the system?' : 'Unlock the system?',
      message: next
        ? 'Packers will be paused and bounced to a lock page until you unlock. Supervisors and admins keep working.'
        : 'Packers can resume working immediately.',
      confirmLabel: next ? 'Lock system' : 'Unlock system',
    });
    if (!ok) return;
    update.mutate({ lock: next }, { onSuccess: () => toast(next ? 'System locked' : 'System unlocked') });
  }

  const base =
    'rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">System lock</h2>
        <p className="text-sm text-slate-500">
          Pause the whole floor — packers are bounced to a lock page; supervisors and admins keep working.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            locked ? 'bg-rose-100 text-rose-800' : 'bg-brand-green-light text-brand-green'
          }`}
        >
          {locked ? (
            <>
              <LockIcon className="h-4 w-4" /> Locked
            </>
          ) : (
            <>
              <UnlockIcon className="h-4 w-4" /> Unlocked
            </>
          )}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={update.isPending}
          className={`${base} ${locked ? 'bg-brand-green hover:bg-brand-green-hover' : 'bg-rose-600 hover:bg-rose-700'}`}
        >
          {update.isPending ? 'Saving…' : locked ? 'Unlock system' : 'Lock system'}
        </button>
      </div>
    </section>
  );
}

function RefundRecipients({ initial }: { initial: string[] }) {
  const update = useUpdateSettings();
  const toast = useToast();
  const [emails, setEmails] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');

  // Keep in sync if the cache refreshes underneath us.
  useEffect(() => setEmails(initial), [initial]);

  function add(e: FormEvent) {
    e.preventDefault();
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      toast('Enter a valid email', 'error');
      return;
    }
    if (emails.includes(v)) {
      setDraft('');
      return;
    }
    setEmails([...emails, v]);
    setDraft('');
  }

  function remove(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  function save() {
    update.mutate(
      { refundBcc: emails },
      { onSuccess: () => toast('Recipients saved') },
    );
  }

  const dirty = JSON.stringify(emails) !== JSON.stringify(initial);
  const field =
    'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green';

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Refund email recipients</h2>
        <p className="text-sm text-slate-500">
          BCC&apos;d on the nightly refund-confirmation emails (the accountant / manager group).
        </p>
      </div>

      {emails.length === 0 ? (
        <p className="text-sm text-slate-400">No recipients yet — refund emails will go to the customer only.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <li
              key={email}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700"
            >
              {email}
              <button
                type="button"
                onClick={() => remove(email)}
                aria-label={`Remove ${email}`}
                className="text-slate-400 hover:text-rose-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="name@wosiwosi.co.uk"
          className={`${field} flex-1`}
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add
        </button>
      </form>

      {update.isError && <p className="text-sm text-rose-600">{update.error.message}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || update.isPending}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover disabled:opacity-50"
        >
          {update.isPending ? 'Saving…' : 'Save recipients'}
        </button>
      </div>
    </section>
  );
}
