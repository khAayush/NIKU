import { toLocalDate } from '@todo/shared';
import { useMe } from '../api/auth';
import { useToday } from '../api/tasks';
import { EmptyMessage, LoadError, PageHeader } from '../components/PageHeader';
import { TaskSection } from '../components/TaskItem';
import { useTaskEditor } from '../hooks/useTaskEditor';
import { formatLongDate } from '../lib/format';

export function TodayPage() {
  const tz = useMe().data!.timezone;
  const now = new Date();
  const { data, isPending, isError } = useToday();
  const { openNew, openEdit, editor } = useTaskEditor({ dueDate: toLocalDate(now, tz) });

  return (
    <>
      <PageHeader title="Today" subtitle={formatLongDate(now, tz)} onAdd={openNew} />
      {isPending ? null : isError ? (
        <LoadError />
      ) : !data.overdue.length && !data.today.length ? (
        <EmptyMessage>Nothing due today — enjoy your day.</EmptyMessage>
      ) : (
        <div className="space-y-6">
          <TaskSection title="Overdue" tone="warning" tasks={data.overdue} onEdit={openEdit} />
          <TaskSection
            title={data.overdue.length ? 'Today' : undefined}
            tasks={data.today}
            onEdit={openEdit}
          />
        </div>
      )}
      {editor}
    </>
  );
}
