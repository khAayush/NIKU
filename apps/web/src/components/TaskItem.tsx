import type { Task } from '@todo/shared';
import { useMe } from '../api/auth';
import { useLists, useSetTaskDone } from '../api/tasks';
import { formatDateTime, formatDue, RECURRENCE_LABEL } from '../lib/format';

const PRIORITY_STYLE: Record<Task['priority'], string> = {
  HIGH: 'bg-rose-50 text-rose-700 ring-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-amber-200',
  LOW: 'bg-slate-50 text-slate-500 ring-slate-200',
};

export function TaskItem({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const tz = useMe().data!.timezone;
  const { data: lists = [] } = useLists();
  const setDone = useSetTaskDone();
  const done = task.status === 'COMPLETED';
  const listName = lists.find((l) => l.id === task.listId)?.name;
  const due = formatDue(task, tz);

  return (
    <li className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-xs hover:border-slate-300">
      <input
        type="checkbox"
        checked={done}
        disabled={setDone.isPending}
        onChange={() => setDone.mutate({ id: task.id, done: !done })}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-indigo-600"
      />
      <button type="button" onClick={() => onEdit(task)} className="min-w-0 flex-1 text-left">
        <div
          className={`text-sm font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}
        >
          {task.title}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {due && (
            <span className={task.isOverdue ? 'font-medium text-rose-600' : undefined}>
              {task.isOverdue ? `Overdue · ${due}` : due}
            </span>
          )}
          {task.remindAt && !done && (
            <span title="Reminder">🔔 {formatDateTime(task.remindAt, tz)}</span>
          )}
          {task.recurrence !== 'NONE' && <span>↻ {RECURRENCE_LABEL[task.recurrence]}</span>}
          {listName && <span className="rounded bg-slate-100 px-1.5 py-0.5">{listName}</span>}
          {task.priority !== 'MEDIUM' && !done && (
            <span className={`rounded px-1.5 py-0.5 ring-1 ${PRIORITY_STYLE[task.priority]}`}>
              {task.priority === 'HIGH' ? 'High' : 'Low'}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

export function TaskSection({
  title,
  tasks,
  onEdit,
  tone = 'default',
}: {
  title?: string;
  tasks: Task[];
  onEdit: (task: Task) => void;
  tone?: 'default' | 'warning';
}) {
  if (!tasks.length) return null;
  return (
    <section className="space-y-2">
      {title && (
        <h2
          className={`text-xs font-semibold tracking-wide uppercase ${tone === 'warning' ? 'text-rose-600' : 'text-slate-500'}`}
        >
          {title} <span className="font-normal">({tasks.length})</span>
        </h2>
      )}
      <ul className="space-y-2">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}
