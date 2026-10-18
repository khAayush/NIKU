import { describe, expect, it } from 'vitest';
import { isValidTimezone, reminderMinutesSchema, signUpSchema } from './auth.js';

describe('isValidTimezone', () => {
  it.each(['UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata'])('accepts %s', (tz) => {
    expect(isValidTimezone(tz)).toBe(true);
  });
  it.each(['', 'Mars/Olympus', 'GMT+99'])('rejects %j', (tz) => {
    expect(isValidTimezone(tz)).toBe(false);
  });
});

describe('signUpSchema', () => {
  const valid = { name: 'Ana', email: 'ana@example.com', password: 'longenough', timezone: 'UTC' };

  it('accepts valid input', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects passwords shorter than 8 characters', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
  it('has no complexity rules beyond length', () => {
    expect(signUpSchema.safeParse({ ...valid, password: 'all lowercase words' }).success).toBe(
      true,
    );
  });
});

describe('reminderMinutesSchema', () => {
  it('accepts the preset minutes, de-duplicated and largest first', () => {
    expect(reminderMinutesSchema.parse([30, 1440, 30, 2880, 60])).toEqual([2880, 1440, 60, 30]);
    expect(reminderMinutesSchema.parse([])).toEqual([]);
  });
  it.each([[[45]], [[0]], [[1]], [[4320]], [[30.5]]])('rejects %j', (minutes) => {
    expect(reminderMinutesSchema.safeParse(minutes).success).toBe(false);
  });
});
