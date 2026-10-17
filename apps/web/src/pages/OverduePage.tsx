import { useOverdue } from '../api/tasks';
import { EmptyMessage, LoadError, PageHeader } from '../components/PageHeader';
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
        <EmptyMessage>Nothing overdue — you're all caught up.</EmptyMessage>
      ) : (
        <TaskSection tasks={data} onEdit={openEdit} />
      )}
      {editor}
    </>
  );
}
