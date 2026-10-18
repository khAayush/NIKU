import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLists, useTasks } from '../api/tasks';
import { EmptyState } from '../components/EmptyState';
import { LoadError, PageHeader } from '../components/PageHeader';
import { TaskSection } from '../components/TaskItem';
import { useTaskEditor } from '../hooks/useTaskEditor';

/** All tasks, filterable by list (?list=), searchable by title (?q=), optionally with completed. */
export function AllTasksPage() {
  const [params, setParams] = useSearchParams();
  const listFilter = params.get('list') ?? '';
  const q = params.get('q') ?? '';
  const showCompleted = params.get('completed') === '1';
  const [search, setSearch] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  const { data: lists = [] } = useLists();

  // Keep the search box in sync when the URL changes elsewhere (e.g. the sidebar search).
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearch(q);
  }

  const update = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  // Debounce typing into the URL (and therefore the query).
  useEffect(() => {
    const value = search.trim();
    if (value === q) return;
    const t = setTimeout(
      () =>
        setParams(
          (p) => {
            if (value) p.set('q', value);
            else p.delete('q');
            return p;
          },
          { replace: true },
        ),
      250,
    );
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const { data, isPending, isError } = useTasks({
    listId: listFilter || undefined,
    status: showCompleted ? 'all' : 'open',
    q: q || undefined,
  });
  const { openNew, openEdit, editor } = useTaskEditor({
    listId: listFilter && listFilter !== 'none' ? listFilter : null,
  });

  const dated = data?.filter((t) => t.dueAt) ?? [];
  const undated = data?.filter((t) => !t.dueAt) ?? [];
  const listName = lists.find((l) => l.id === listFilter)?.name;

  return (
    <>
      <PageHeader
        title={listFilter === 'none' ? 'No list' : (listName ?? 'All tasks')}
        onAdd={openNew}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search tasks by title"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 focus:outline-none sm:w-64"
        />
        <select
          value={listFilter}
          onChange={(e) => update('list', e.target.value)}
          aria-label="Filter by list"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="">All lists</option>
          <option value="none">No list</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => update('completed', e.target.checked ? '1' : '')}
            className="h-4 w-4 accent-neutral-950"
          />
          Show completed
        </label>
      </div>

      {isPending ? null : isError ? (
        <LoadError />
      ) : !data.length ? (
        q ? (
          <EmptyState kind="no-results">No tasks match "{q}".</EmptyState>
        ) : (
          <EmptyState kind="no-tasks" />
        )
      ) : (
        <div className="space-y-6">
          <TaskSection
            title={undated.length ? 'Scheduled' : undefined}
            tasks={dated}
            onEdit={openEdit}
          />
          <TaskSection title="No due date" tasks={undated} onEdit={openEdit} />
        </div>
      )}
      {editor}
    </>
  );
}
