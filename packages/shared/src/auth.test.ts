import { describe, expect, it } from 'vitest';
import { isValidTimezone, signUpSchema } from './auth.js';

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
