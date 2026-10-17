import type { Task } from '@todo/shared';
import { useState } from 'react';
import { TaskEditor, type TaskDefaults } from '../components/TaskEditor';

/** State for opening the task editor from a page: `openNew()`, `openEdit(task)`, render `editor`. */
export function useTaskEditor(defaults: TaskDefaults = {}) {
  const [state, setState] = useState<{ task: Task | null } | null>(null);
  return {
    openNew: () => setState({ task: null }),
    openEdit: (task: Task) => setState({ task }),
    editor: state ? (
      <TaskEditor task={state.task} defaults={defaults} onClose={() => setState(null)} />
    ) : null,
  };
}
