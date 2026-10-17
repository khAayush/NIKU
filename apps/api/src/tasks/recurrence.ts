import type { Recurrence } from '@todo/shared';
import { startOfLocalDay } from '@todo/shared';
import { DateTime } from 'luxon';

export interface RecurringTask {
  recurrence: Recurrence;
  dueAt: Date | null;
  dueAllDay: boolean;
  remindAt: Date | null;
  /** Minutes the reminder is before dueAt (negative = after). */
  reminderOffsetMinutes: number | null;
  /** Original day of month for MONTHLY. */
  recurrenceDay: number | null;
}

export interface Occurrence {
  dueAt: Date | null;
  remindAt: Date | null;
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
 * The next occurrence of a repeating task, counted from its due date (or its reminder time when it
 * has no due date), never from the completion time. Missed occurrences are skipped: the result is
 * the first one that isn't already past due at `now`.
 */
export function nextOccurrence(task: RecurringTask, tz: string, now: Date): Occurrence | null {
  if (task.recurrence === 'NONE') return null;
  const anchorDate = task.dueAt ?? task.remindAt;
  if (!anchorDate) return null;

  const anchor = DateTime.fromJSDate(anchorDate, { zone: tz });
  const monthDay = task.recurrenceDay ?? anchor.day;
  const allDay = task.dueAt !== null && task.dueAllDay;
  // All-day occurrences count as current for their whole day; timed ones until their moment.
  const notPast = (d: Date) => (allDay ? d >= startOfLocalDay(now, tz) : d > now);

  let next: Date | null = null;
  for (let k = 1; k <= 100_000; k++) {
    const candidate = step(anchor, task.recurrence, k, monthDay).toJSDate();
    if (notPast(candidate)) {
      next = candidate;
      break;
    }
  }
  if (!next) return null;

  if (!task.dueAt) return { dueAt: null, remindAt: next };
  const remindAt =
    task.reminderOffsetMinutes === null
      ? null
      : new Date(next.getTime() - task.reminderOffsetMinutes * 60_000);
  return { dueAt: next, remindAt };
}
