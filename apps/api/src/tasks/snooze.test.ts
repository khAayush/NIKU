import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { snoozeUntil } from './snooze.js';

const local = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: tz }).toJSDate();
const show = (d: Date, tz: string) =>
  DateTime.fromJSDate(d, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm");

describe('snoozeUntil', () => {
  const now = new Date('2026-06-10T12:00:00Z');

  it('10 minutes and 1 hour are relative to now', () => {
    expect(snoozeUntil('10m', now, 'UTC').toISOString()).toBe('2026-06-10T12:10:00.000Z');
    expect(snoozeUntil('1h', now, 'UTC').toISOString()).toBe('2026-06-10T13:00:00.000Z');
  });

  it("tomorrow is 9:00 the next day in the user's timezone", () => {
    const tz = 'Asia/Kolkata';
    expect(show(snoozeUntil('tomorrow', local('2026-06-10T23:30', tz), tz), tz)).toBe(
      '2026-06-11T09:00',
    );
    expect(show(snoozeUntil('tomorrow', local('2026-06-10T00:15', tz), tz), tz)).toBe(
      '2026-06-11T09:00',
    );
  });

  it('tomorrow keeps 9:00 local across a daylight-saving change', () => {
    const tz = 'Europe/London'; // clocks go forward on 2026-03-29
    const until = snoozeUntil('tomorrow', local('2026-03-28T20:00', tz), tz);
    expect(show(until, tz)).toBe('2026-03-29T09:00');
    expect(until.toISOString()).toBe('2026-03-29T08:00:00.000Z');
  });
});
