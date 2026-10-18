import { deleteAccountSchema, updateMeSchema, type Me } from '@todo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ME_KEY, browserTimezone, deleteAccount, updateMe, useMe } from '../api/auth';
import { PageHeader } from '../components/PageHeader';
import { NotificationSettings } from '../components/NotificationSettings';
import { Alert, Button, Field, SelectField, errorMessage, validate } from '../components/ui';

export function SettingsPage() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Account" />
      <ProfileSection me={me} />
      <Section title="Reminders">
        <NotificationSettings me={me} />
      </Section>
      <DeleteAccountSection />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-7">
      <h2 className="mb-5 text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSection({ me }: { me: Me }) {
  const [values, setValues] = useState({ name: me.name, timezone: me.timezone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const timezones = useMemo(() => {
    const all = Intl.supportedValuesOf('timeZone');
    return all.includes(values.timezone) ? all : [values.timezone, ...all];
  }, [values.timezone]);
  const detected = browserTimezone();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(updateMeSchema, values);
    setErrors(errors);
    setStatus(null);
    if (!data) return;
    setBusy(true);
    try {
      queryClient.setQueryData(ME_KEY, await updateMe(data));
      setStatus({ kind: 'success', text: 'Saved.' });
    } catch (err) {
      setStatus({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Profile">
      <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
        {status && <Alert kind={status.kind}>{status.text}</Alert>}
        <Field label="Email" value={me.email} disabled readOnly />
        <Field
          label="Name"
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={errors.name}
        />
        <div>
          <SelectField
            label="Timezone"
            value={values.timezone}
            onChange={(e) => setValues({ ...values, timezone: e.target.value })}
            error={errors.timezone}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll('_', ' ')}
              </option>
            ))}
          </SelectField>
          {detected !== values.timezone && (
            <button
              type="button"
              className="mt-1 text-xs text-neutral-950 hover:underline"
              onClick={() => setValues({ ...values, timezone: detected })}
            >
              Use this device's timezone ({detected})
            </button>
          )}
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Section>
  );
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { data, errors } = validate(deleteAccountSchema, { password });
    setError(errors.password ?? '');
    if (!data) return;
    setBusy(true);
    try {
      await deleteAccount(data);
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Section title="Delete account">
      <p className="mb-4 text-sm text-neutral-600">
        Permanently deletes your account, tasks, lists and settings. This can't be undone.
      </p>
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field
            label="Confirm with your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={busy}>
              {busy ? 'Deleting…' : 'Delete permanently'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
