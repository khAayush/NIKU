import {
  PRIORITIES,
  RECURRENCES,
  createTaskSchema,
  localToUtc,
  toLocalDate,
  toLocalTime,
  type CreateTaskInput,
  type Priority,
  type Recurrence,
  type Task,
  type TaskDraft,
} from '@todo/shared';
import { useId, useState, type FormEvent } from 'react';
import { useMe } from '../api/auth';
import { useCreateTask, useDeleteTask, useLists, useUpdateTask } from '../api/tasks';
import { PRIORITY_LABEL, RECURRENCE_LABEL } from '../lib/format';
import { Modal } from './Modal';
import { Alert, Button, Field, SelectField, errorMessage, inputClass, validate } from './ui';

interface FormValues {
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string;
  remindDate: string;
  remindTime: string;
  priority: Priority;
  recurrence: Recurrence;
  listId: string;
}

export interface TaskDefaults {
  dueDate?: string;
  listId?: string | null;
}

/** Fields shared by saved tasks and quick-add drafts. */
type TaskFields = Pick<
  TaskDraft,
  'title' | 'notes' | 'dueAt' | 'dueAllDay' | 'remindAt' | 'priority' | 'recurrence' | 'listId'
>;

function initialValues(task: TaskFields | null, tz: string, defaults: TaskDefaults): FormValues {
  if (!task) {
    return {
      title: '',
      notes: '',
      dueDate: defaults.dueDate ?? '',
      dueTime: '',
      remindDate: '',
      remindTime: '',
      priority: 'MEDIUM',
      recurrence: 'NONE',
      listId: defaults.listId ?? '',
    };
  }
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const remind = task.remindAt ? new Date(task.remindAt) : null;
  return {
    title: task.title,
    notes: task.notes ?? '',
    dueDate: due ? toLocalDate(due, tz) : '',
    dueTime: due && !task.dueAllDay ? toLocalTime(due, tz) : '',
    remindDate: remind ? toLocalDate(remind, tz) : '',
    remindTime: remind ? toLocalTime(remind, tz) : '',
    priority: task.priority,
    recurrence: task.recurrence,
    listId: task.listId ?? '',
  };
}

/** Form values (local wall-clock in the user's timezone) → API input (UTC). */
function toInput(
  v: FormValues,
  tz: string,
): { input: CreateTaskInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const dueAt = v.dueDate ? localToUtc(v.dueDate, v.dueTime || null, tz) : null;
  if (v.dueDate && !dueAt) errors.dueAt = 'Invalid date';
  if (!v.dueDate && v.dueTime) errors.dueAt = 'Pick a date for this time';

  let remindAt: Date | null = null;
  if (v.remindDate || v.remindTime) {
    remindAt = v.remindDate && v.remindTime ? localToUtc(v.remindDate, v.remindTime, tz) : null;
    if (!remindAt) errors.remindAt = 'Pick both a date and a time';
  }

  return {
    input: {
      title: v.title,
      notes: v.notes.trim() ? v.notes : null,
      dueAt: dueAt?.toISOString() ?? null,
      dueAllDay: Boolean(dueAt && !v.dueTime),
      remindAt: remindAt?.toISOString() ?? null,
      priority: v.priority,
      recurrence: v.recurrence,
      listId: v.listId || null,
    },
    errors,
  };
}

/** Create or edit a task in a modal. Pass `task` to edit. */
export function TaskEditor({
  task,
  defaults = {},
  onClose,
}: {
  task: Task | null;
  defaults?: TaskDefaults;
  onClose: () => void;
}) {
  return (
    <Modal title={task ? 'Edit task' : 'New task'} onClose={onClose}>
      <TaskForm task={task} defaults={defaults} onDone={onClose} />
    </Modal>
  );
}

/**
 * The task form. Edits `task` when given; otherwise creates a task, prefilled from `draft`
 * (quick add) or `defaults`. Calls `onDone` after deleting or cancelling, and `onSaved`
 * (falling back to `onDone`) after saving.
 */
export function TaskForm({
  task = null,
  draft = null,
  defaults = {},
  onDone,
  onSaved,
  submitLabel,
}: {
  task?: Task | null;
  draft?: TaskDraft | null;
  defaults?: TaskDefaults;
  onDone: () => void;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const tz = useMe().data!.timezone;
  const notesId = useId();
  const onClose = onDone;
  const { data: lists = [] } = useLists();
  const [values, setValues] = useState(() => initialValues(task ?? draft, tz, defaults));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const busy = createTask.isPending || updateTask.isPending || deleteTask.isPending;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const { input, errors: dateErrors } = toInput(values, tz);
    const { data, errors: schemaErrors } = validate(createTaskSchema, input);
    const all = { ...schemaErrors, ...dateErrors };
    setErrors(all);
    setFormError('');
    if (!data || Object.keys(all).length) return;
    try {
      if (task) await updateTask.mutateAsync({ id: task.id, input });
      else await createTask.mutateAsync(input);
      (onSaved ?? onDone)();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  async function onDelete() {
    if (!task) return;
    try {
      await deleteTask.mutateAsync(task.id);
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field
        label="Title"
        value={values.title}
        onChange={(e) => set('title', e.target.value)}
        error={errors.title}
        maxLength={200}
        autoFocus
      />
      <div>
        <label className="block text-[13px] font-medium text-neutral-800" htmlFor={notesId}>
          Notes
        </label>
        <textarea
          id={notesId}
          rows={3}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Due date"
          type="date"
          value={values.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          error={errors.dueAt}
        />
        <Field
          label="Due time"
          type="time"
          value={values.dueTime}
          onChange={(e) => set('dueTime', e.target.value)}
          hint={values.dueDate && !values.dueTime ? 'All day' : undefined}
        />
        <Field
          label="Reminder date"
          type="date"
          value={values.remindDate}
          onChange={(e) => set('remindDate', e.target.value)}
          error={errors.remindAt}
        />
        <Field
          label="Reminder time"
          type="time"
          value={values.remindTime}
          onChange={(e) => set('remindTime', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField
          label="Priority"
          value={values.priority}
          onChange={(e) => set('priority', e.target.value as Priority)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="List"
          value={values.listId}
          onChange={(e) => set('listId', e.target.value)}
        >
          <option value="">No list</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Repeat"
          value={values.recurrence}
          onChange={(e) => set('recurrence', e.target.value as Recurrence)}
          error={errors.recurrence}
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABEL[r]}
            </option>
          ))}
        </SelectField>
      </div>
      {values.priority !== 'LOW' && !values.dueDate && !errors.dueAt && (
        <p className="text-xs text-neutral-500">A due date is needed unless priority is Low.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div>
          {task &&
            (confirmDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Delete this task?
                <Button type="button" variant="danger" onClick={onDelete} disabled={busy}>
                  Delete
                </Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : (submitLabel ?? (task ? 'Save' : 'Add task'))}
          </Button>
        </div>
      </div>
    </form>
  );
}
