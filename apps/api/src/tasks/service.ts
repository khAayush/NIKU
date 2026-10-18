import {
  dueDateProblem,
  isPastDue,
  localDayRange,
  localToUtc,
  startOfLocalDay,
  toLocalDate,
  type CalendarResponse,
  type SnoozeOption,
  taskRuleIssues,
  type CompleteTaskResponse,
  type Recurrence,
  type Task,
  type TodayResponse,
  type UpdateTaskInput,
  type createTaskSchema,
  type listTasksQuerySchema,
} from '@todo/shared';
import type { z } from 'zod';
import type { AuthUser } from '../auth/authenticate.js';
import type { Prisma, Task as TaskRow } from '../generated/prisma/client.js';
import { AppError, notFound } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { assertOwnList } from '../lists/service.js';
import { cancelTaskReminders, snoozeReminder, syncTaskReminders } from '../reminders/schedule.js';
import { localDayOfMonth, nextOccurrence } from './recurrence.js';
import { snoozeUntil } from './snooze.js';

const MAX_RESULTS = 500;

/** Sort: earliest due first (undated last), then higher priority, then oldest. */
const ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { priority: 'desc' },
  { createdAt: 'asc' },
];

/** Loads the next pending reminder with each task, for `nextReminderAt`. */
const WITH_NEXT_REMINDER = {
  reminders: {
    where: { sentAt: null },
    orderBy: { remindAt: 'asc' },
    take: 1,
    select: { remindAt: true },
  },
} satisfies Prisma.TaskInclude;

type TaskWithReminder = TaskRow & { reminders: { remindAt: Date }[] };

export function toTask(row: TaskWithReminder, tz: string, now = new Date()): Task {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: iso(row.dueAt),
    dueAllDay: row.dueAllDay,
    nextReminderAt: iso(row.reminders[0]?.remindAt ?? null),
    priority: row.priority,
    recurrence: row.recurrence,
    status: row.status,
    completedAt: iso(row.completedAt),
    listId: row.listId,
    isOverdue: row.status === 'OPEN' && isPastDue(row, now, tz),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Prisma filter for open tasks that are past due at `now` in `tz`. */
function overdueWhere(userId: string, now: Date, tz: string): Prisma.TaskWhereInput {
  return {
    userId,
    status: 'OPEN',
    OR: [
      { dueAllDay: false, dueAt: { lt: now } },
      { dueAllDay: true, dueAt: { lt: startOfLocalDay(now, tz) } },
    ],
  };
}

async function findOwnTask(userId: string, id: string) {
  const row = await prisma.task.findFirst({ where: { id, userId }, include: WITH_NEXT_REMINDER });
  if (!row) throw notFound('Task not found');
  return row;
}

/** Re-reads a task (after its reminders changed) in API shape. */
async function reload(id: string, tz: string) {
  const row = await prisma.task.findUniqueOrThrow({ where: { id }, include: WITH_NEXT_REMINDER });
  return toTask(row, tz);
}

interface DateFields {
  dueAt: Date | null;
  dueAllDay: boolean;
}

/** Rejects a due date that has already passed or is too far ahead (when one is set or changed). */
function assertDueDateAllowed(due: { dueAt: Date | null; dueAllDay: boolean }, tz: string) {
  if (!due.dueAt) return;
  const problem = dueDateProblem({ dueAt: due.dueAt, dueAllDay: due.dueAllDay }, new Date(), tz);
  if (problem) {
    throw new AppError(400, 'VALIDATION_ERROR', problem, [{ path: 'dueAt', message: problem }]);
  }
}

/** Escapes LIKE wildcards so a search for "%" or "_" finds those characters literally. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** All-day due dates are stored as the start of that day in the user's timezone. */
function normalizeDue(f: DateFields, tz: string) {
  if (!f.dueAt) return { dueAt: null, dueAllDay: false };
  return { dueAt: f.dueAllDay ? startOfLocalDay(f.dueAt, tz) : f.dueAt, dueAllDay: f.dueAllDay };
}

function recurrenceDay(f: { dueAt: Date | null; recurrence: Recurrence }, tz: string) {
  return f.recurrence === 'MONTHLY' && f.dueAt ? localDayOfMonth(f.dueAt, tz) : null;
}

const toDate = (s: string | null) => (s ? new Date(s) : null);

export async function createTask(user: AuthUser, input: z.output<typeof createTaskSchema>) {
  await assertOwnList(user.id, input.listId);
  const due = normalizeDue({ ...input, dueAt: toDate(input.dueAt) }, user.timezone);
  assertDueDateAllowed(due, user.timezone);
  const row = await prisma.task.create({
    data: {
      userId: user.id,
      listId: input.listId,
      title: input.title,
      notes: input.notes,
      ...due,
      priority: input.priority,
      recurrence: input.recurrence,
      recurrenceDay: recurrenceDay(
        { dueAt: due.dueAt, recurrence: input.recurrence },
        user.timezone,
      ),
    },
  });
  await syncTaskReminders(row.id);
  return reload(row.id, user.timezone);
}

export async function updateTask(user: AuthUser, id: string, input: UpdateTaskInput) {
  const existing = await findOwnTask(user.id, id);
  if (input.listId !== undefined) await assertOwnList(user.id, input.listId);

  const merged = {
    title: input.title ?? existing.title,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    dueAt: input.dueAt !== undefined ? toDate(input.dueAt) : existing.dueAt,
    dueAllDay: input.dueAllDay ?? existing.dueAllDay,
    priority: input.priority ?? existing.priority,
    recurrence: input.recurrence ?? existing.recurrence,
    listId: input.listId !== undefined ? input.listId : existing.listId,
  };
  const issues = taskRuleIssues(merged);
  if (issues.length) throw new AppError(400, 'VALIDATION_ERROR', issues[0]!.message, issues);

  const due = normalizeDue(merged, user.timezone);
  const datesChanged = input.dueAt !== undefined || input.dueAllDay !== undefined;
  // Only a new due date is checked, so overdue tasks can still be renamed, moved to a list, etc.
  const dueMoved =
    datesChanged &&
    (due.dueAt?.getTime() !== existing.dueAt?.getTime() || due.dueAllDay !== existing.dueAllDay);
  if (dueMoved) assertDueDateAllowed(due, user.timezone);
  await prisma.task.update({
    where: { id },
    data: {
      ...merged,
      ...due,
      ...(datesChanged || input.recurrence !== undefined
        ? { recurrenceDay: recurrenceDay({ ...merged, dueAt: due.dueAt }, user.timezone) }
        : {}),
    },
  });
  if (datesChanged) await syncTaskReminders(id);
  return reload(id, user.timezone);
}

export async function deleteTask(userId: string, id: string) {
  await findOwnTask(userId, id);
  await cancelTaskReminders(id);
  await prisma.task.deleteMany({ where: { id, userId } });
}

export async function getTask(user: AuthUser, id: string) {
  return toTask(await findOwnTask(user.id, id), user.timezone);
}

/**
 * Marks a task complete. For a repeating task, also creates its next occurrence
 * (only the next future one, counted from the due date).
 */
export async function completeTask(user: AuthUser, id: string): Promise<CompleteTaskResponse> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({
      where: { id, userId: user.id },
      include: WITH_NEXT_REMINDER,
    });
    if (!existing) throw notFound('Task not found');
    // Already completed: nothing to do, and never spawn a second next occurrence.
    if (existing.status === 'COMPLETED') return { task: existing, next: null, changed: false };

    // Only the first of several simultaneous completions (e.g. a double click) gets past this:
    // the row lock makes the others re-check `status` and update nothing.
    const { count } = await tx.task.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'COMPLETED', completedAt: now },
    });
    if (count === 0) return { task: existing, next: null, changed: false };
    const task = await tx.task.findUniqueOrThrow({ where: { id }, include: WITH_NEXT_REMINDER });

    const nextDue = nextOccurrence(existing, user.timezone, now);
    const next = nextDue
      ? await tx.task.create({
          data: {
            userId: user.id,
            listId: existing.listId,
            title: existing.title,
            notes: existing.notes,
            dueAt: nextDue,
            dueAllDay: existing.dueAllDay,
            priority: existing.priority,
            recurrence: existing.recurrence,
            recurrenceDay: existing.recurrenceDay,
          },
        })
      : null;

    return { task, next, changed: true };
  });

  if (!result.changed) return { task: await reload(id, user.timezone), next: null };
  await syncTaskReminders(result.task.id); // completed: cancels its reminders
  if (result.next) await syncTaskReminders(result.next.id);
  return {
    task: await reload(result.task.id, user.timezone),
    next: result.next ? await reload(result.next.id, user.timezone) : null,
  };
}

export async function reopenTask(user: AuthUser, id: string) {
  await findOwnTask(user.id, id);
  await prisma.task.update({ where: { id }, data: { status: 'OPEN', completedAt: null } });
  await syncTaskReminders(id);
  return reload(id, user.timezone);
}

export async function listTasks(user: AuthUser, query: z.output<typeof listTasksQuerySchema>) {
  const where: Prisma.TaskWhereInput = { userId: user.id };
  if (query.listId) where.listId = query.listId === 'none' ? null : query.listId;
  if (query.status !== 'all') where.status = query.status === 'open' ? 'OPEN' : 'COMPLETED';
  if (query.q) where.title = { contains: escapeLike(query.q), mode: 'insensitive' };

  const rows = await prisma.task.findMany({
    where,
    orderBy: ORDER,
    take: MAX_RESULTS,
    include: WITH_NEXT_REMINDER,
  });
  const now = new Date();
  return rows.map((r) => toTask(r, user.timezone, now));
}

export async function overdueTasks(user: AuthUser) {
  const now = new Date();
  const rows = await prisma.task.findMany({
    where: overdueWhere(user.id, now, user.timezone),
    orderBy: ORDER,
    take: MAX_RESULTS,
    include: WITH_NEXT_REMINDER,
  });
  return rows.map((r) => toTask(r, user.timezone, now));
}

/** Overdue tasks, then everything due today (including completed ones) that isn't overdue. */
export async function todayTasks(user: AuthUser): Promise<TodayResponse> {
  const now = new Date();
  const { start, end } = localDayRange(now, user.timezone);
  const [overdueRows, todayRows] = await Promise.all([
    prisma.task.findMany({
      where: overdueWhere(user.id, now, user.timezone),
      orderBy: ORDER,
      take: MAX_RESULTS,
      include: WITH_NEXT_REMINDER,
    }),
    prisma.task.findMany({
      where: { userId: user.id, dueAt: { gte: start, lt: end } },
      orderBy: ORDER,
      take: MAX_RESULTS,
      include: WITH_NEXT_REMINDER,
    }),
  ]);
  const overdue = overdueRows.map((r) => toTask(r, user.timezone, now));
  const overdueIds = new Set(overdue.map((t) => t.id));
  const today = todayRows
    .filter((r) => !overdueIds.has(r.id))
    .map((r) => toTask(r, user.timezone, now));
  return { overdue, today };
}

/** Per-day counts for the month grid: only days with tasks, keyed by local date. */
export async function calendarSummary(
  user: AuthUser,
  from: string,
  to: string,
): Promise<CalendarResponse> {
  const now = new Date();
  const start = localToUtc(from, null, user.timezone)!;
  const end = localDayRange(localToUtc(to, null, user.timezone)!, user.timezone).end;
  const rows = await prisma.task.findMany({
    where: { userId: user.id, dueAt: { gte: start, lt: end } },
    select: { dueAt: true, dueAllDay: true, status: true },
  });

  const days: CalendarResponse['days'] = {};
  for (const row of rows) {
    const key = toLocalDate(row.dueAt!, user.timezone);
    const day = (days[key] ??= { total: 0, completed: 0, overdue: 0 });
    day.total++;
    if (row.status === 'COMPLETED') day.completed++;
    else if (isPastDue(row, now, user.timezone)) day.overdue++;
  }
  return { days };
}

/** Every task due on a local date (including completed ones), for the calendar day panel. */
export async function dayTasks(user: AuthUser, date: string) {
  const { start, end } = localDayRange(localToUtc(date, null, user.timezone)!, user.timezone);
  const rows = await prisma.task.findMany({
    where: { userId: user.id, dueAt: { gte: start, lt: end } },
    orderBy: ORDER,
    take: MAX_RESULTS,
    include: WITH_NEXT_REMINDER,
  });
  const now = new Date();
  return rows.map((r) => toTask(r, user.timezone, now));
}

/**
 * Adds a one-off reminder at the snooze time (replacing any earlier pending snooze).
 * Never changes the due date or the reminders from settings.
 */
export async function snoozeTask(user: AuthUser, id: string, option: SnoozeOption) {
  const existing = await findOwnTask(user.id, id);
  if (existing.status === 'COMPLETED') {
    throw new AppError(409, 'TASK_COMPLETED', 'Completed tasks cannot be snoozed');
  }
  await snoozeReminder(id, snoozeUntil(option, new Date(), user.timezone));
  return reload(id, user.timezone);
}
