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
    <label className="flex cursor-pointer items-center justify-between gap-6 py-4 has-disabled:cursor-not-allowed">
      <span>
        <span className="block text-sm font-medium text-neutral-950">{label}</span>
        <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>
      </span>
      {/* A real checkbox (keyboard + screen readers), drawn as a switch. */}
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-neutral-200 transition-colors checked:bg-neutral-950 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
        />
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
    <div className="max-w-xl divide-y divide-neutral-100">
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
