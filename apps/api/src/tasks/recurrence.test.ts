import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { nextOccurrence, type RecurringTask } from './recurrence.js';

const TZ = 'Europe/London';

/** A local wall-clock time in `tz` ("2026-01-31T09:00") as a Date. */
const local = (iso: string, tz = TZ) => DateTime.fromISO(iso, { zone: tz }).toJSDate();
/** A Date shown as local wall-clock time in `tz`. */
const show = (d: Date | null | undefined, tz = TZ) =>
  d ? DateTime.fromJSDate(d, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm") : null;

function task(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    recurrence: 'DAILY',
    dueAt: null,
    dueAllDay: false,
    recurrenceDay: null,
    ...overrides,
  };
}

/** Completes `t` at `now`, then keeps completing each new occurrence just after it's created. */
function chain(t: RecurringTask, now: Date, count: number, tz = TZ): string[] {
  const out: string[] = [];
  let current = t;
  for (let i = 0; i < count; i++) {
    const next = nextOccurrence(current, tz, now)!;
    out.push(show(next, tz)!);
    current = { ...current, dueAt: next };
  }
  return out;
}

describe('nextOccurrence', () => {
  it('returns null for non-repeating tasks or tasks without a due date', () => {
    expect(
      nextOccurrence(
        task({ recurrence: 'NONE', dueAt: local('2026-01-01T09:00') }),
        TZ,
        new Date(),
      ),
    ).toBeNull();
    expect(nextOccurrence(task({}), TZ, new Date())).toBeNull();
  });

  describe('daily and weekly', () => {
    it('daily: same local time the next day', () => {
      const next = nextOccurrence(
        task({ dueAt: local('2026-06-10T08:30') }),
        TZ,
        local('2026-06-10T07:00'),
      );
      expect(show(next)).toBe('2026-06-11T08:30');
    });

    it('keeps the wall-clock time across a daylight-saving change', () => {
      // UK clocks go forward on 2026-03-29.
      const next = nextOccurrence(
        task({ dueAt: local('2026-03-28T09:00') }),
        TZ,
        local('2026-03-28T08:00'),
      );
      expect(show(next)).toBe('2026-03-29T09:00');
      expect(next!.getTime() - local('2026-03-28T09:00').getTime()).toBe(23 * 3_600_000);
    });

    it('weekly: same weekday and time next week', () => {
      const next = nextOccurrence(
        task({ recurrence: 'WEEKLY', dueAt: local('2026-10-18T18:00') }), // a Sunday
        TZ,
        local('2026-10-18T10:00'),
      );
      expect(show(next)).toBe('2026-10-25T18:00'); // the next Sunday, after the DST change
    });

    it('works in other timezones too', () => {
      const tz = 'America/New_York'; // clocks go back on 2026-11-01
      const next = nextOccurrence(
        task({ recurrence: 'WEEKLY', dueAt: local('2026-10-28T07:15', tz) }),
        tz,
        local('2026-10-28T07:00', tz),
      );
      expect(show(next, tz)).toBe('2026-11-04T07:15');
    });
  });

  describe('monthly', () => {
    const monthly = (iso: string, recurrenceDay?: number) =>
      task({ recurrence: 'MONTHLY', dueAt: local(iso), recurrenceDay: recurrenceDay ?? null });

    it('same day next month', () => {
      const next = nextOccurrence(monthly('2026-05-15T10:00'), TZ, local('2026-05-15T09:00'));
      expect(show(next)).toBe('2026-06-15T10:00');
    });

    it('clamps the 31st to the last day of shorter months', () => {
      const t = monthly('2026-01-31T09:00', 31);
      expect(show(nextOccurrence(t, TZ, local('2026-01-31T08:00')))).toBe('2026-02-28T09:00');
      expect(
        show(nextOccurrence(monthly('2026-03-31T09:00', 31), TZ, local('2026-03-31T08:00'))),
      ).toBe('2026-04-30T09:00');
    });

    it('uses Feb 29 in leap years', () => {
      const next = nextOccurrence(monthly('2028-01-31T09:00', 31), TZ, local('2028-01-31T08:00'));
      expect(show(next)).toBe('2028-02-29T09:00');
    });

    it('returns to the original day after a short month (no drift)', () => {
      expect(chain(monthly('2026-01-31T09:00', 31), local('2026-01-01T00:00'), 5)).toEqual([
        '2026-02-28T09:00',
        '2026-03-31T09:00',
        '2026-04-30T09:00',
        '2026-05-31T09:00',
        '2026-06-30T09:00',
      ]);
    });

    it('does not drift for the 30th or 29th either', () => {
      expect(chain(monthly('2027-01-30T09:00', 30), local('2027-01-01T00:00'), 3)).toEqual([
        '2027-02-28T09:00',
        '2027-03-30T09:00',
        '2027-04-30T09:00',
      ]);
      expect(chain(monthly('2028-01-29T09:00', 29), local('2028-01-01T00:00'), 2)).toEqual([
        '2028-02-29T09:00',
        '2028-03-29T09:00',
      ]);
    });

    it('falls back to the due date day when recurrenceDay is missing', () => {
      const next = nextOccurrence(monthly('2026-08-31T09:00'), TZ, local('2026-08-31T08:00'));
      expect(show(next)).toBe('2026-09-30T09:00');
    });
  });

  describe('late and early completion', () => {
    it('counts from the due date, not the completion time (completed early)', () => {
      const next = nextOccurrence(
        task({ dueAt: local('2026-06-12T09:00') }),
        TZ,
        local('2026-06-10T15:00'), // completed two days early
      );
      expect(show(next)).toBe('2026-06-13T09:00');
    });

    it('counts from the due date when completed late', () => {
      const next = nextOccurrence(
        task({ recurrence: 'WEEKLY', dueAt: local('2026-06-01T09:00') }),
        TZ,
        local('2026-06-03T10:00'), // two days late
      );
      expect(show(next)).toBe('2026-06-08T09:00'); // still Mondays, not Wednesdays
    });

    it('skips missed occurrences and creates only the next future one', () => {
      const next = nextOccurrence(
        task({ dueAt: local('2026-06-01T09:00') }),
        TZ,
        local('2026-06-10T12:00'), // nine days late
      );
      expect(show(next)).toBe('2026-06-11T09:00');
    });

    it('can land later the same day when that time is still ahead', () => {
      const next = nextOccurrence(
        task({ dueAt: local('2026-06-01T18:00') }),
        TZ,
        local('2026-06-10T12:00'),
      );
      expect(show(next)).toBe('2026-06-10T18:00');
    });

    it('skips missed months, keeping the original day', () => {
      const next = nextOccurrence(
        task({ recurrence: 'MONTHLY', dueAt: local('2026-01-31T09:00'), recurrenceDay: 31 }),
        TZ,
        local('2026-05-15T12:00'),
      );
      expect(show(next)).toBe('2026-05-31T09:00');
    });

    it('all-day: today counts as not yet missed', () => {
      const next = nextOccurrence(
        task({ dueAt: local('2026-06-07T00:00'), dueAllDay: true }),
        TZ,
        local('2026-06-10T15:00'),
      );
      expect(show(next)).toBe('2026-06-10T00:00');
    });
  });
});
