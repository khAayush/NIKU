import { SNOOZE_LABEL, SNOOZE_OPTIONS, type Task } from '@todo/shared';
import { useEffect, useRef, useState } from 'react';
import { useSnoozeTask } from '../api/tasks';

/** "Snooze" button with the three snooze options. Moves only the reminder time. */
export function SnoozeMenu({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const snooze = useSnoozeTask();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={snooze.isPending}
        className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        {snooze.isPending ? 'Snoozing…' : 'Snooze'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {SNOOZE_OPTIONS.map((option) => (
            <button
              key={option}
              role="menuitem"
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                snooze.mutate({ id: task.id, option });
              }}
            >
              {SNOOZE_LABEL[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
