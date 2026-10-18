import { describe, expect, it } from 'vitest';
import {
  dueDateProblem,
  isPastDue,
  localDayRange,
  localToUtc,
  toLocalDate,
  toLocalTime,
} from './time.js';

describe('time helpers', () => {
  it('converts a local date and time to UTC', () => {
    // London is UTC+1 in summer.
    expect(localToUtc('2026-07-01', '09:30', 'Europe/London')?.toISOString()).toBe(
      '2026-07-01T08:30:00.000Z',
    );
  });

  it('uses the start of the day when there is no time', () => {
    expect(localToUtc('2026-01-15', null, 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-01-14T18:30:00.000Z',
    );
  });

  it('returns null for an invalid date', () => {
    expect(localToUtc('2026-02-30', '10:00', 'UTC')).toBeNull();
  });

  it('round-trips to local date and time', () => {
    const d = new Date('2026-03-29T23:15:00Z');
    expect(toLocalDate(d, 'Asia/Tokyo')).toBe('2026-03-30');
    expect(toLocalTime(d, 'Asia/Tokyo')).toBe('08:15');
  });

  it('gives a 23-hour day across a spring-forward change', () => {
    const { start, end } = localDayRange(new Date('2026-03-29T12:00:00Z'), 'Europe/London');
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  describe('isPastDue', () => {
    const tz = 'America/New_York';
    const now = new Date('2026-05-10T15:00:00Z'); // 11:00 in New York

    it('timed task is overdue once its time has passed', () => {
      expect(
        isPastDue({ dueAt: new Date('2026-05-10T14:59:00Z'), dueAllDay: false }, now, tz),
      ).toBe(true);
      expect(
        isPastDue({ dueAt: new Date('2026-05-10T15:01:00Z'), dueAllDay: false }, now, tz),
      ).toBe(false);
    });

    it('all-day task is not overdue during its own day', () => {
      const today = localToUtc('2026-05-10', null, tz)!;
      const yesterday = localToUtc('2026-05-09', null, tz)!;
      expect(isPastDue({ dueAt: today, dueAllDay: true }, now, tz)).toBe(false);
      expect(isPastDue({ dueAt: yesterday, dueAllDay: true }, now, tz)).toBe(true);
    });

    it('task without a due date is never overdue', () => {
      expect(isPastDue({ dueAt: null, dueAllDay: false }, now, tz)).toBe(false);
    });
  });
});

describe('dueDateProblem', () => {
  const tz = 'Europe/London';
  const now = new Date('2026-06-10T12:00:00Z'); // 13:00 in London

  it('rejects a time that has already passed', () => {
    expect(
      dueDateProblem({ dueAt: new Date('2026-06-10T11:00:00Z'), dueAllDay: false }, now, tz),
    ).toBe('That time has already passed');
  });

  it('allows a minute of grace and any future time', () => {
    expect(
      dueDateProblem({ dueAt: new Date('2026-06-10T11:59:30Z'), dueAllDay: false }, now, tz),
    ).toBeNull();
    expect(
      dueDateProblem({ dueAt: new Date('2026-06-10T12:30:00Z'), dueAllDay: false }, now, tz),
    ).toBeNull();
  });

  it('allows today but not yesterday for all-day tasks', () => {
    expect(
      dueDateProblem({ dueAt: localToUtc('2026-06-10', null, tz)!, dueAllDay: true }, now, tz),
    ).toBeNull();
    expect(
      dueDateProblem({ dueAt: localToUtc('2026-06-09', null, tz)!, dueAllDay: true }, now, tz),
    ).toBe('That day has already passed');
  });

  it('rejects dates more than 5 years ahead', () => {
    expect(
      dueDateProblem({ dueAt: new Date('2031-06-01T12:00:00Z'), dueAllDay: false }, now, tz),
    ).toBeNull();
    expect(
      dueDateProblem({ dueAt: new Date('2031-07-01T12:00:00Z'), dueAllDay: false }, now, tz),
    ).toBe('Pick a date within the next 5 years');
  });
});
