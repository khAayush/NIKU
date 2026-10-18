import { SNOOZE_LABEL, SNOOZE_OPTIONS, type ReminderPayload } from '@todo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { LISTS_KEY, TASKS_KEY, useSetTaskDone, useSnoozeTask } from '../api/tasks';

/**
 * Listens for reminders over Socket.IO while signed in and shows them as in-app notifications
 * with Done / Snooze / Dismiss. Mounted once inside the signed-in layout.
 */
export function ReminderToasts() {
  const [reminders, setReminders] = useState<ReminderPayload[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Same origin: the session cookie authenticates the connection.
    const socket = io({ path: '/socket.io', withCredentials: true });
    socket.on('reminder', (payload: ReminderPayload) => {
      setReminders((list) => [payload, ...list.filter((r) => r.taskId !== payload.taskId)]);
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      void queryClient.invalidateQueries({ queryKey: LISTS_KEY });
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const dismiss = (taskId: string) =>
    setReminders((list) => list.filter((r) => r.taskId !== taskId));

  if (!reminders.length) return null;
  return (
    <div
      aria-live="assertive"
      className="fixed right-4 bottom-4 left-4 z-50 flex flex-col gap-3 sm:left-auto sm:w-96"
    >
      {reminders.map((r) => (
        <ReminderToast key={r.taskId} reminder={r} onClose={() => dismiss(r.taskId)} />
      ))}
    </div>
  );
}

function ReminderToast({ reminder, onClose }: { reminder: ReminderPayload; onClose: () => void }) {
  const setDone = useSetTaskDone();
  const snooze = useSnoozeTask();
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onClose();
    } catch {
      setError("That didn't work. Please try again.");
    }
  }

  return (
    <div
      role="alert"
      className="rounded-2xl bg-neutral-950 p-5 text-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-[0.15em] text-neutral-400 uppercase">
            Reminder
          </p>
          <p className="mt-0.5 truncate text-[15px] font-medium text-white">{reminder.title}</p>
          {reminder.dueLabel && <p className="text-xs text-neutral-400">Due {reminder.dueLabel}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="Dismiss reminder"
          className="rounded-full p-1 text-neutral-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => run(() => setDone.mutateAsync({ id: reminder.taskId, done: true }))}
          disabled={setDone.isPending}
          className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-950 transition hover:bg-neutral-200"
        >
          Done
        </button>
        {SNOOZE_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => run(() => snooze.mutateAsync({ id: reminder.taskId, option }))}
            disabled={snooze.isPending}
            className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-white/30 hover:text-white"
          >
            {SNOOZE_LABEL[option]}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
    </div>
  );
}
