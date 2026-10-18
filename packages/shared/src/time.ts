import { DateTime } from 'luxon';

/** Calendar date "yyyy-MM-dd" and wall-clock time "HH:mm" in a timezone. */
export const DATE_FORMAT = 'yyyy-MM-dd';
export const TIME_FORMAT = 'HH:mm';

const inZone = (date: Date, tz: string) => DateTime.fromJSDate(date, { zone: tz });

/** Start of the local day (00:00 in `tz`) that contains `date`. */
export function startOfLocalDay(date: Date, tz: string): Date {
  return inZone(date, tz).startOf('day').toJSDate();
}

/** [start, end) of the local day containing `date`. */
export function localDayRange(date: Date, tz: string): { start: Date; end: Date } {
  const start = inZone(date, tz).startOf('day');
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/**
 * The UTC instant for a local date (and optional time) in `tz`.
 * Without a time, returns the start of that day (used for all-day due dates).
 * Returns null for an invalid date/time.
 */
export function localToUtc(date: string, time: string | null, tz: string): Date | null {
  const dt = DateTime.fromFormat(`${date} ${time ?? '00:00'}`, `${DATE_FORMAT} ${TIME_FORMAT}`, {
    zone: tz,
  });
  return dt.isValid ? dt.toJSDate() : null;
}

/** Local calendar date "yyyy-MM-dd" of an instant in `tz`. */
export function toLocalDate(date: Date, tz: string): string {
  return inZone(date, tz).toFormat(DATE_FORMAT);
}

/** Local wall-clock time "HH:mm" of an instant in `tz`. */
export function toLocalTime(date: Date, tz: string): string {
  return inZone(date, tz).toFormat(TIME_FORMAT);
}

/**
 * Whether an open task with this due date is overdue at `now`.
 * Timed tasks are overdue once the due time has passed; all-day tasks once their day has ended.
 */
export function isPastDue(
  due: { dueAt: Date | null; dueAllDay: boolean },
  now: Date,
  tz: string,
): boolean {
  if (!due.dueAt) return false;
  if (due.dueAllDay) return due.dueAt < startOfLocalDay(now, tz);
  return due.dueAt < now;
}

/** A new or changed due date may be at most this far ahead. */
export const MAX_DUE_YEARS = 5;
/** A timed due date may lag "now" by this much (slow form submits, clock skew). */
const PAST_GRACE_MS = 60_000;

/**
 * Why a due date can't be set (null when it's fine): it must not have passed already
 * (all-day: today is fine) and must be within `MAX_DUE_YEARS`. Only applies when a due date is
 * set or changed; existing overdue tasks can still be edited otherwise.
 */
export function dueDateProblem(
  due: { dueAt: Date; dueAllDay: boolean },
  now: Date,
  tz: string,
): string | null {
  const past = due.dueAllDay
    ? due.dueAt < startOfLocalDay(now, tz)
    : due.dueAt.getTime() < now.getTime() - PAST_GRACE_MS;
  if (past) return due.dueAllDay ? 'That day has already passed' : 'That time has already passed';
  const max = new Date(now);
  max.setUTCFullYear(max.getUTCFullYear() + MAX_DUE_YEARS);
  if (due.dueAt > max) return `Pick a date within the next ${MAX_DUE_YEARS} years`;
  return null;
}
