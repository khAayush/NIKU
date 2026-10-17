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
