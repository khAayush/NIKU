import type { Me, UpdateMeInput } from '@todo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ME_KEY, updateMe } from '../api/auth';
import {
  currentSubscription,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push';
import { errorMessage } from './ui';

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-600"
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  );
}

/** Which channels reminders use. Push is opted into per browser. */
export function NotificationSettings({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const subscription = useQuery({
    queryKey: ['push-subscription'],
    queryFn: currentSubscription,
    enabled: pushSupported,
  });
  const thisBrowserSubscribed = Boolean(subscription.data);
  const blocked = pushSupported && Notification.permission === 'denied';

  async function save(input: UpdateMeInput) {
    queryClient.setQueryData(ME_KEY, await updateMe(input));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error && !('status' in err) ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
      void subscription.refetch();
    }
  }

  const setPush = (on: boolean) =>
    run(async () => {
      if (on) {
        await subscribeToPush();
        await save({ notifyPush: true });
      } else {
        await unsubscribeFromPush();
        await save({ notifyPush: false });
      }
    });

  return (
    <div className="max-w-xl divide-y divide-slate-100">
      <Toggle
        label="In-app notifications"
        description="Pop up in this app while it's open."
        checked={me.notifyInApp}
        disabled={busy}
        onChange={(v) => run(() => save({ notifyInApp: v }))}
      />
      <Toggle
        label="Browser push notifications"
        description={
          !pushSupported
            ? "This browser doesn't support push notifications."
            : blocked
              ? 'Notifications are blocked for this site. Allow them in the browser settings first.'
              : me.notifyPush && !thisBrowserSubscribed
                ? 'On for your other browsers. Turn off and on again to add this browser.'
                : 'Show reminders even when the app tab is closed (the browser must be running).'
        }
        checked={me.notifyPush && (thisBrowserSubscribed || !pushSupported)}
        disabled={busy || !pushSupported || blocked}
        onChange={setPush}
      />
      <Toggle
        label="Email"
        description={`Send reminders to ${me.email}.`}
        checked={me.notifyEmail}
        disabled={busy}
        onChange={(v) => run(() => save({ notifyEmail: v }))}
      />
      {error && <p className="pt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
