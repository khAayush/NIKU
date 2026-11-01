import type { Task } from '@todo/shared';
import { useMe } from '../api/auth';
import { useLists, useSetTaskDone } from '../api/tasks';
import { formatDateTime, formatDue, RECURRENCE_LABEL } from '../lib/format';
import { SnoozeMenu } from './SnoozeMenu';
import { RoundCheckbox } from './ui';

const PRIORITY_STYLE: Record<Task['priority'], string> = {
  HIGH: 'bg-neutral-950 text-white',
  MEDIUM: 'border border-neutral-200 text-neutral-600',
  LOW: 'border border-neutral-200 text-neutral-500',
};

function BellIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M12 6a4 4 0 1 0-8 0c0 4.5-2 6-2 6h12s-2-1.5-2-6M9.2 14a1.4 1.4 0 0 1-2.4 0" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M2.5 7V6a3 3 0 0 1 3-3h7m0 0L10.5 1M12.5 3l-2 2M13.5 9v1a3 3 0 0 1-3 3h-7m0 0 2 2m-2-2 2-2" />
    </svg>
  );
}

export function TaskItem({
  task,
  onEdit,
  snoozable = false,
}: {
  task: Task;
  onEdit: (task: Task) => void;
  snoozable?: boolean;
}) {
  const tz = useMe().data!.timezone;
  const { data: lists = [] } = useLists();
  const setDone = useSetTaskDone();
  const done = task.status === 'COMPLETED';
  const listName = lists.find((l) => l.id === task.listId)?.name;
  const due = formatDue(task, tz);

  return (
    <li className="group flex items-start gap-3.5 px-4 py-3.5 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-neutral-50">
      <RoundCheckbox
        checked={done}
        disabled={setDone.isPending}
        onChange={() => setDone.mutate({ id: task.id, done: !done })}
        label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      />

      <button type="button" onClick={() => onEdit(task)} className="min-w-0 flex-1 text-left">
        <div
          className={`text-[15px] leading-snug ${done ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-950'}`}
        >
          {task.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          {due && (
            <span className={task.isOverdue ? 'font-medium text-rose-600' : undefined}>
              {task.isOverdue ? `Overdue · ${due}` : due}
            </span>
          )}
          {task.nextReminderAt && !done && (
            <span title="Reminder" className="inline-flex items-center gap-1">
              <BellIcon /> {formatDateTime(task.nextReminderAt, tz)}
            </span>
          )}
          {task.recurrence !== 'NONE' && (
            <span className="inline-flex items-center gap-1">
              <RepeatIcon /> {RECURRENCE_LABEL[task.recurrence]}
            </span>
          )}
          {listName && (
            <span className="max-w-full min-w-0 truncate rounded-full border border-neutral-200 px-2 py-px text-neutral-600">
              {listName}
            </span>
          )}
          {task.priority !== 'MEDIUM' && !done && (
            <span
              className={`rounded-full px-2 py-px text-[11px] font-medium ${PRIORITY_STYLE[task.priority]}`}
            >
              {task.priority === 'HIGH' ? 'High' : 'Low'}
            </span>
          )}
        </div>
      </button>
      {snoozable && !done && <SnoozeMenu task={task} />}
    </li>
  );
}

export function TaskSection({
  title,
  tasks,
  onEdit,
  tone = 'default',
  snoozable = false,
}: {
  title?: string;
  tasks: Task[];
  onEdit: (task: Task) => void;
  tone?: 'default' | 'warning';
  snoozable?: boolean;
}) {
  if (!tasks.length) return null;
  return (
    <section>
      {title && (
        <h2
          className={`mb-3 flex items-center gap-2 text-[11px] font-medium tracking-[0.15em] uppercase ${tone === 'warning' ? 'text-rose-600' : 'text-neutral-400'}`}
        >
          {title}
          <span className="tabular-nums">{tasks.length}</span>
        </h2>
      )}
      <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onEdit={onEdit} snoozable={snoozable} />
        ))}
      </ul>
    </section>
  );
}
