import {
  MAX_DUE_MONTHS,
  PRIORITIES,
  RECURRENCES,
  createTaskSchema,
  dueDateProblem,
  localToUtc,
  toLocalDate,
  toLocalTime,
  type CreateTaskInput,
  type Priority,
  type Recurrence,
  type Task,
  type TaskDraft,
} from '@todo/shared';
import { DateTime } from 'luxon';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/auth';
import { useCreateTask, useDeleteTask, useLists, useUpdateTask } from '../api/tasks';
import { PRIORITY_LABEL, RECURRENCE_LABEL, formatReminders } from '../lib/format';
import { Modal } from './Modal';
import { Alert, Button, Field, SelectField, errorMessage, inputClass, validate } from './ui';

interface FormValues {
  title: string;
  notes: string;
  dueDate: string;
  dueTime: string;
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
  'title' | 'notes' | 'dueAt' | 'dueAllDay' | 'priority' | 'recurrence' | 'listId'
>;

function initialValues(task: TaskFields | null, tz: string, defaults: TaskDefaults): FormValues {
  if (!task) {
    return {
      title: '',
      notes: '',
      dueDate: defaults.dueDate ?? '',
      dueTime: '',
      priority: 'MEDIUM',
      recurrence: 'NONE',
      listId: defaults.listId ?? '',
    };
  }
  const due = task.dueAt ? new Date(task.dueAt) : null;
  return {
    title: task.title,
    notes: task.notes ?? '',
    dueDate: due ? toLocalDate(due, tz) : '',
    dueTime: due && !task.dueAllDay ? toLocalTime(due, tz) : '',
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

  return {
    input: {
      title: v.title,
      notes: v.notes.trim() ? v.notes : null,
      dueAt: dueAt?.toISOString() ?? null,
      dueAllDay: Boolean(dueAt && !v.dueTime),
      priority: v.priority,
      recurrence: v.recurrence,
      listId: v.listId || null,
    },
    errors,
  };
}

/** True when any of the fields under "More options" differs from its default. */
const hasExtras = (v: FormValues) =>
  v.priority !== 'MEDIUM' || v.recurrence !== 'NONE' || v.listId !== '' || v.notes.trim() !== '';

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
  const me = useMe().data!;
  const tz = me.timezone;
  const notesId = useId();
  const onClose = onDone;
  const { data: lists = [] } = useLists();
  const [values, setValues] = useState(() => initialValues(task ?? draft, tz, defaults));
  // Extras start open only when they already hold something (editing, or quick add found some).
  const [showMore, setShowMore] = useState(() => hasExtras(values));
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
    // Same rule as the server: a new or changed due date can't be in the past (or > 6 months ahead).
    const dueChanged =
      !task || input.dueAt !== task.dueAt || Boolean(input.dueAllDay) !== task.dueAllDay;
    if (input.dueAt && dueChanged && !dateErrors.dueAt) {
      const problem = dueDateProblem(
        { dueAt: new Date(input.dueAt), dueAllDay: Boolean(input.dueAllDay) },
        new Date(),
        tz,
      );
      if (problem) dateErrors.dueAt = problem;
    }
    const { data, errors: schemaErrors } = validate(createTaskSchema, input);
    const all = { ...schemaErrors, ...dateErrors };
    setErrors(all);
    setFormError('');
    // A missing due date can be fixed by choosing Low priority, which lives under More options.
    if (schemaErrors.dueAt || schemaErrors.recurrence) setShowMore(true);
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
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Due date"
          type="date"
          min={toLocalDate(new Date(), tz)}
          max={DateTime.now().setZone(tz).plus({ months: MAX_DUE_MONTHS }).toFormat('yyyy-MM-dd')}
          value={values.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          error={errors.dueAt}
        />
        <Field
          label="Time"
          type="time"
          value={values.dueTime}
          onChange={(e) => set('dueTime', e.target.value)}
          hint={values.dueDate && !values.dueTime ? 'All day' : undefined}
        />
      </div>
      <p className="text-xs text-neutral-500">
        {values.dueDate
          ? me.reminderMinutes.length
            ? `Reminders ${formatReminders(me.reminderMinutes)}.`
            : 'Reminders are off.'
          : 'Add a due date to get reminders.'}{' '}
        <Link to="/settings" className="text-neutral-950 underline-offset-2 hover:underline">
          Change in Settings
        </Link>
      </p>

      <div className="border-t border-neutral-100 pt-4">
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="flex w-full items-center justify-between text-sm font-medium text-neutral-950"
        >
          <span>
            More options
            {!showMore && hasExtras(values) && (
              <span className="ml-2 font-normal text-neutral-500">
                {[
                  values.priority !== 'MEDIUM' && PRIORITY_LABEL[values.priority],
                  lists.find((l) => l.id === values.listId)?.name,
                  values.recurrence !== 'NONE' && RECURRENCE_LABEL[values.recurrence],
                  values.notes.trim() && 'Notes',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={`h-4 w-4 text-neutral-400 transition-transform ${showMore ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>

        {showMore && (
          <div className="mt-4 space-y-4">
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
            {values.priority !== 'LOW' && !values.dueDate && (
              <p className="text-xs text-neutral-500">
                A due date is needed unless priority is Low.
              </p>
            )}
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
          </div>
        )}
      </div>

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
