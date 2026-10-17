import { useOverdue } from '../api/tasks';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageHeader } from '../components/PageHeader';
import { TaskSection } from '../components/TaskItem';
import { useTaskEditor } from '../hooks/useTaskEditor';

export function OverduePage() {
  const { data, isPending, isError } = useOverdue();
  const { openEdit, editor } = useTaskEditor();

  return (
    <>
      <PageHeader title="Overdue" subtitle="Incomplete tasks past their due date" />
      {isPending ? null : isError ? (
        <LoadError />
      ) : !data.length ? (
        <EmptyState kind="caught-up" />
      ) : (
        <TaskSection tasks={data} onEdit={openEdit} />
      )}
      {editor}
    </>
  );
}
