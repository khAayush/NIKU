import {
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
import { localDayOfMonth, nextOccurrence } from './recurrence.js';
import { snoozeUntil } from './snooze.js';

const MAX_RESULTS = 500;

/** Sort: earliest due first (undated last), then higher priority, then oldest. */
const ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { priority: 'desc' },
  { createdAt: 'asc' },
];

export function toTask(row: TaskRow, tz: string, now = new Date()): Task {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueAt: iso(row.dueAt),
    dueAllDay: row.dueAllDay,
    remindAt: iso(row.remindAt),
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
  const row = await prisma.task.findFirst({ where: { id, userId } });
  if (!row) throw notFound('Task not found');
  return row;
}

interface DateFields {
  dueAt: Date | null;
  dueAllDay: boolean;
  remindAt: Date | null;
  recurrence: Recurrence;
}

/** All-day due dates are stored as the start of that day in the user's timezone. */
function normalizeDue(f: DateFields, tz: string) {
  if (!f.dueAt) return { dueAt: null, dueAllDay: false };
  return { dueAt: f.dueAllDay ? startOfLocalDay(f.dueAt, tz) : f.dueAt, dueAllDay: f.dueAllDay };
}

/** Reminder kept as minutes before the due date, so repeats keep the same lead time. */
function reminderOffset(dueAt: Date | null, remindAt: Date | null) {
  return dueAt && remindAt ? Math.round((dueAt.getTime() - remindAt.getTime()) / 60_000) : null;
}

function recurrenceDay(
  f: { dueAt: Date | null; remindAt: Date | null; recurrence: Recurrence },
  tz: string,
) {
  const anchor = f.dueAt ?? f.remindAt;
  return f.recurrence === 'MONTHLY' && anchor ? localDayOfMonth(anchor, tz) : null;
}

const toDate = (s: string | null) => (s ? new Date(s) : null);

export async function createTask(user: AuthUser, input: z.output<typeof createTaskSchema>) {
  await assertOwnList(user.id, input.listId);
  const due = normalizeDue(
    { ...input, dueAt: toDate(input.dueAt), remindAt: toDate(input.remindAt) },
    user.timezone,
  );
  const remindAt = toDate(input.remindAt);
  const row = await prisma.task.create({
    data: {
      userId: user.id,
      listId: input.listId,
      title: input.title,
      notes: input.notes,
      ...due,
      remindAt,
      reminderOffsetMinutes: reminderOffset(due.dueAt, remindAt),
      priority: input.priority,
      recurrence: input.recurrence,
      recurrenceDay: recurrenceDay(
        { dueAt: due.dueAt, remindAt, recurrence: input.recurrence },
        user.timezone,
      ),
    },
  });
  return toTask(row, user.timezone);
}

export async function updateTask(user: AuthUser, id: string, input: UpdateTaskInput) {
  const existing = await findOwnTask(user.id, id);
  if (input.listId !== undefined) await assertOwnList(user.id, input.listId);

  const merged = {
    title: input.title ?? existing.title,
    notes: input.notes !== undefined ? input.notes : existing.notes,
    dueAt: input.dueAt !== undefined ? toDate(input.dueAt) : existing.dueAt,
    dueAllDay: input.dueAllDay ?? existing.dueAllDay,
    remindAt: input.remindAt !== undefined ? toDate(input.remindAt) : existing.remindAt,
    priority: input.priority ?? existing.priority,
    recurrence: input.recurrence ?? existing.recurrence,
    listId: input.listId !== undefined ? input.listId : existing.listId,
  };
  const issues = taskRuleIssues(merged);
  if (issues.length) throw new AppError(400, 'VALIDATION_ERROR', issues[0]!.message, issues);

  const due = normalizeDue(merged, user.timezone);
  const datesChanged =
    input.dueAt !== undefined || input.dueAllDay !== undefined || input.remindAt !== undefined;
  const row = await prisma.task.update({
    where: { id },
    data: {
      ...merged,
      ...due,
      // Recompute only when the user changed the dates, so a snoozed reminder keeps its offset.
      ...(datesChanged
        ? { reminderOffsetMinutes: reminderOffset(due.dueAt, merged.remindAt) }
        : {}),
      ...(datesChanged || input.recurrence !== undefined
        ? { recurrenceDay: recurrenceDay({ ...merged, dueAt: due.dueAt }, user.timezone) }
        : {}),
    },
  });
  return toTask(row, user.timezone);
}

export async function deleteTask(userId: string, id: string) {
  const { count } = await prisma.task.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound('Task not found');
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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.task.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound('Task not found');
    // Already completed: nothing to do, and never spawn a second next occurrence.
    if (existing.status === 'COMPLETED')
      return { task: toTask(existing, user.timezone, now), next: null };

    const task = await tx.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: now },
    });

    const occurrence = nextOccurrence(existing, user.timezone, now);
    const next = occurrence
      ? await tx.task.create({
          data: {
            userId: user.id,
            listId: existing.listId,
            title: existing.title,
            notes: existing.notes,
            dueAt: occurrence.dueAt,
            dueAllDay: existing.dueAllDay,
            remindAt: occurrence.remindAt,
            reminderOffsetMinutes: existing.reminderOffsetMinutes,
            priority: existing.priority,
            recurrence: existing.recurrence,
            recurrenceDay: existing.recurrenceDay,
          },
        })
      : null;

    return {
      task: toTask(task, user.timezone, now),
      next: next ? toTask(next, user.timezone, now) : null,
    };
  });
}

export async function reopenTask(user: AuthUser, id: string) {
  await findOwnTask(user.id, id);
  const row = await prisma.task.update({
    where: { id },
    data: { status: 'OPEN', completedAt: null },
  });
  return toTask(row, user.timezone);
}

export async function listTasks(user: AuthUser, query: z.output<typeof listTasksQuerySchema>) {
  const where: Prisma.TaskWhereInput = { userId: user.id };
  if (query.listId) where.listId = query.listId === 'none' ? null : query.listId;
  if (query.status !== 'all') where.status = query.status === 'open' ? 'OPEN' : 'COMPLETED';
  if (query.q) where.title = { contains: query.q, mode: 'insensitive' };

  const rows = await prisma.task.findMany({ where, orderBy: ORDER, take: MAX_RESULTS });
  const now = new Date();
  return rows.map((r) => toTask(r, user.timezone, now));
}

export async function overdueTasks(user: AuthUser) {
  const now = new Date();
  const rows = await prisma.task.findMany({
    where: overdueWhere(user.id, now, user.timezone),
    orderBy: ORDER,
    take: MAX_RESULTS,
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
    }),
    prisma.task.findMany({
      where: { userId: user.id, dueAt: { gte: start, lt: end } },
      orderBy: ORDER,
      take: MAX_RESULTS,
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
  });
  const now = new Date();
  return rows.map((r) => toTask(r, user.timezone, now));
}

/**
 * Moves only the reminder time (never the due date or the stored reminder offset).
 * Works whether or not the task already had a reminder.
 */
export async function snoozeTask(user: AuthUser, id: string, option: SnoozeOption) {
  const existing = await findOwnTask(user.id, id);
  if (existing.status === 'COMPLETED') {
    throw new AppError(409, 'TASK_COMPLETED', 'Completed tasks cannot be snoozed');
  }
  const row = await prisma.task.update({
    where: { id },
    data: { remindAt: snoozeUntil(option, new Date(), user.timezone) },
  });
  return toTask(row, user.timezone);
}
