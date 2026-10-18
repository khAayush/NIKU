import type { Recurrence } from '@todo/shared';
import { startOfLocalDay } from '@todo/shared';
import { DateTime } from 'luxon';

export interface RecurringTask {
  recurrence: Recurrence;
  dueAt: Date | null;
  dueAllDay: boolean;
  /** Original day of month for MONTHLY. */
  recurrenceDay: number | null;
}

/** Day of the month of `date` in `tz`, stored so monthly tasks keep their original day. */
export function localDayOfMonth(date: Date, tz: string): number {
  return DateTime.fromJSDate(date, { zone: tz }).day;
}

/** The k-th occurrence after `anchor`, computed on the local calendar in `tz`. */
function step(anchor: DateTime, recurrence: Recurrence, k: number, monthDay: number): DateTime {
  switch (recurrence) {
    case 'DAILY':
      return anchor.plus({ days: k }); // calendar math keeps the wall-clock time across DST
    case 'WEEKLY':
      return anchor.plus({ weeks: k });
    case 'MONTHLY': {
      const month = anchor.startOf('month').plus({ months: k });
      return DateTime.fromObject(
        {
          year: month.year,
          month: month.month,
          // Clamp to the month's last day, but always aim for the original day (no drift).
          day: Math.min(monthDay, month.daysInMonth!),
          hour: anchor.hour,
          minute: anchor.minute,
          second: anchor.second,
          millisecond: anchor.millisecond,
        },
        { zone: anchor.zone },
      );
    }
    default:
      throw new Error(`Not a repeating recurrence: ${recurrence}`);
  }
}

/**
 * The due date of the next occurrence of a repeating task, counted from its due date, never from
 * the completion time. Missed occurrences are skipped: the result is the first one that isn't
 * already past due at `now`. (Reminders come from the user's settings, not from the task.)
 */
export function nextOccurrence(task: RecurringTask, tz: string, now: Date): Date | null {
  if (task.recurrence === 'NONE' || !task.dueAt) return null;

  const anchor = DateTime.fromJSDate(task.dueAt, { zone: tz });
  const monthDay = task.recurrenceDay ?? anchor.day;
  // All-day occurrences count as current for their whole day; timed ones until their moment.
  const notPast = (d: Date) => (task.dueAllDay ? d >= startOfLocalDay(now, tz) : d > now);

  for (let k = 1; k <= 100_000; k++) {
    const candidate = step(anchor, task.recurrence, k, monthDay).toJSDate();
    if (notPast(candidate)) return candidate;
  }
  return null;
}
