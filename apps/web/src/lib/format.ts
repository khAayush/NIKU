import type { Task } from '@todo/shared';
import { DateTime } from 'luxon';

/** "Today", "Tomorrow", "Yesterday", "Mon 20 Oct" or "Mon 20 Oct 2027" for a date in `tz`. */
export function formatDay(date: Date, tz: string, now = new Date()): string {
  const d = DateTime.fromJSDate(date, { zone: tz }).startOf('day');
  const today = DateTime.fromJSDate(now, { zone: tz }).startOf('day');
  const diff = Math.round(d.diff(today, 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toFormat(d.year === today.year ? 'ccc d LLL' : 'ccc d LLL yyyy');
}

export function formatTime(date: Date, tz: string): string {
  return DateTime.fromJSDate(date, { zone: tz }).toFormat('HH:mm');
}

/** Due label for a task: "Today 17:00", "Tomorrow", "Mon 20 Oct 09:30". */
export function formatDue(task: Pick<Task, 'dueAt' | 'dueAllDay'>, tz: string): string | null {
  if (!task.dueAt) return null;
  const d = new Date(task.dueAt);
  const day = formatDay(d, tz);
  return task.dueAllDay ? day : `${day} ${formatTime(d, tz)}`;
}

export function formatDateTime(iso: string, tz: string): string {
  const d = new Date(iso);
  return `${formatDay(d, tz)} ${formatTime(d, tz)}`;
}

/** Long heading date, e.g. "Saturday 17 October". */
export function formatLongDate(date: Date, tz: string): string {
  return DateTime.fromJSDate(date, { zone: tz }).toFormat('cccc d LLLL');
}

export const RECURRENCE_LABEL: Record<Task['recurrence'], string> = {
  NONE: 'Does not repeat',
  DAILY: 'Every day',
  WEEKLY: 'Every week',
  MONTHLY: 'Every month',
};

export const PRIORITY_LABEL: Record<Task['priority'], string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

/** "1 hour before", "24 and 1 hours before", "48, 24 and 1 hours before". */
export function formatReminderHours(hours: number[]): string {
  const sorted = [...hours].sort((a, b) => b - a);
  if (sorted.length === 1) return `${sorted[0]} hour${sorted[0] === 1 ? '' : 's'} before`;
  const head = sorted.slice(0, -1).join(', ');
  return `${head} and ${sorted.at(-1)} hours before`;
}
