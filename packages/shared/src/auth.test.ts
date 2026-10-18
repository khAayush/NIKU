import { describe, expect, it } from 'vitest';
import { isValidTimezone, reminderHoursSchema, signUpSchema } from './auth.js';

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

describe('reminderHoursSchema', () => {
  it('accepts the preset hours, de-duplicated and largest first', () => {
    expect(reminderHoursSchema.parse([1, 24, 1, 48])).toEqual([48, 24, 1]);
    expect(reminderHoursSchema.parse([])).toEqual([]);
  });
  it.each([[[5]], [[0]], [[72]], [[1.5]]])('rejects %j', (hours) => {
    expect(reminderHoursSchema.safeParse(hours).success).toBe(false);
  });
});
