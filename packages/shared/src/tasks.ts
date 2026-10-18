import { z } from 'zod';
import { prioritySchema, recurrenceSchema, taskStatusSchema } from './common.js';

export const TASK_TITLE_MAX = 200;
export const TASK_NOTES_MAX = 10_000;

const isoDateTime = z.iso.datetime({ offset: true });

/** A task as returned by the API. All times are ISO-8601 UTC. */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  /** For all-day tasks: the start of that day in the user's timezone. */
  dueAt: z.iso.datetime().nullable(),
  dueAllDay: z.boolean(),
  /** The next reminder that will be sent (from settings or a snooze), if any. */
  nextReminderAt: z.iso.datetime().nullable(),
  priority: prioritySchema,
  recurrence: recurrenceSchema,
  status: taskStatusSchema,
  completedAt: z.iso.datetime().nullable(),
  listId: z.string().nullable(),
  /** Open and past its due time (all-day: past its day), computed by the server. */
  isOverdue: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Task = z.infer<typeof taskSchema>;

const taskFields = {
  title: z.string().trim().min(1, 'Title is required').max(TASK_TITLE_MAX),
  notes: z.string().max(TASK_NOTES_MAX).nullable(),
  dueAt: isoDateTime.nullable(),
  dueAllDay: z.boolean(),
  priority: prioritySchema,
  recurrence: recurrenceSchema,
  listId: z.uuid().nullable(),
};

interface TaskRuleInput {
  dueAt: unknown;
  priority: string;
  recurrence: string;
}

/** Rules that span several fields. Checked on create, and on the merged task when updating. */
export function taskRuleIssues(t: TaskRuleInput): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (!t.dueAt && t.priority !== 'LOW') {
    issues.push({ path: 'dueAt', message: 'A due date is required unless priority is Low' });
  }
  if (t.recurrence !== 'NONE' && !t.dueAt) {
    issues.push({ path: 'recurrence', message: 'A repeating task needs a due date' });
  }
  return issues;
}

export const createTaskSchema = z
  .object({
    ...taskFields,
    notes: taskFields.notes.default(null),
    dueAt: taskFields.dueAt.default(null),
    dueAllDay: taskFields.dueAllDay.default(false),
    priority: taskFields.priority.default('MEDIUM'),
    recurrence: taskFields.recurrence.default('NONE'),
    listId: taskFields.listId.default(null),
  })
  .superRefine((t, ctx) => {
    for (const { path, message } of taskRuleIssues(t)) {
      ctx.addIssue({ code: 'custom', path: [path], message });
    }
  });
export type CreateTaskInput = z.input<typeof createTaskSchema>;

/** Partial update; the server re-checks `taskRuleIssues` on the merged result. */
export const updateTaskSchema = z.object(taskFields).partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  /** A list id, or "none" for tasks without a list. Omit for all lists. */
  listId: z.union([z.uuid(), z.literal('none')]).optional(),
  status: z.enum(['open', 'completed', 'all']).default('open'),
  /** Case-insensitive search in titles. */
  q: z.string().trim().max(TASK_TITLE_MAX).optional(),
});
export type ListTasksQuery = z.input<typeof listTasksQuerySchema>;

export const todayResponseSchema = z.object({
  overdue: z.array(taskSchema),
  today: z.array(taskSchema),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;

export const completeTaskResponseSchema = z.object({
  task: taskSchema,
  /** The next occurrence created for a repeating task, otherwise null. */
  next: taskSchema.nullable(),
});
export type CompleteTaskResponse = z.infer<typeof completeTaskResponseSchema>;

/** A local calendar date, "yyyy-MM-dd". */
export const localDateSchema = z.iso.date();

export const CALENDAR_MAX_DAYS = 62;

/** Visible range of the month grid, as local dates (inclusive). */
export const calendarQuerySchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < CALENDAR_MAX_DAYS, {
    message: `Range must be at most ${CALENDAR_MAX_DAYS} days`,
    path: ['to'],
  });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarDaySchema = z.object({
  total: z.number().int(),
  completed: z.number().int(),
  overdue: z.number().int(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;

/** Only days that have tasks are included, keyed by local date. */
export const calendarResponseSchema = z.object({
  days: z.record(z.string(), calendarDaySchema),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

export const dayQuerySchema = z.object({ date: localDateSchema });

export const SNOOZE_OPTIONS = ['10m', '1h', 'tomorrow'] as const;
export const snoozeSchema = z.object({ option: z.enum(SNOOZE_OPTIONS) });
export type SnoozeOption = (typeof SNOOZE_OPTIONS)[number];
export const SNOOZE_LABEL: Record<SnoozeOption, string> = {
  '10m': '10 minutes',
  '1h': '1 hour',
  tomorrow: 'Tomorrow 9:00',
};

export const PARSE_TEXT_MAX = 500;

export const parseTaskRequestSchema = z.object({
  text: z.string().trim().min(1, 'Type something to add').max(PARSE_TEXT_MAX),
});
export type ParseTaskRequest = z.infer<typeof parseTaskRequestSchema>;

/** A task draft from quick add. Not saved: the client confirms (and may edit) it first. */
export const taskDraftSchema = z.object({
  title: z.string(),
  notes: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  dueAllDay: z.boolean(),
  priority: prioritySchema,
  recurrence: recurrenceSchema,
  listId: z.string().nullable(),
});
export type TaskDraft = z.infer<typeof taskDraftSchema>;

export const parseTaskResponseSchema = z.object({
  draft: taskDraftSchema,
  /** The phrases that were understood (e.g. "tomorrow at 5pm", "urgent"), for display. */
  recognized: z.array(z.string()),
});
export type ParseTaskResponse = z.infer<typeof parseTaskResponseSchema>;
