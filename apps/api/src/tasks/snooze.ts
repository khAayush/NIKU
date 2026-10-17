import type { SnoozeOption } from '@todo/shared';
import { DateTime } from 'luxon';

export const SNOOZE_MORNING_HOUR = 9;

/** When a reminder snoozed at `now` should fire again. "tomorrow" = 9:00 tomorrow in `tz`. */
export function snoozeUntil(option: SnoozeOption, now: Date, tz: string): Date {
  switch (option) {
    case '10m':
      return new Date(now.getTime() + 10 * 60_000);
    case '1h':
      return new Date(now.getTime() + 60 * 60_000);
    case 'tomorrow':
      return DateTime.fromJSDate(now, { zone: tz })
        .plus({ days: 1 })
        .set({ hour: SNOOZE_MORNING_HOUR, minute: 0, second: 0, millisecond: 0 })
        .toJSDate();
  }
}
