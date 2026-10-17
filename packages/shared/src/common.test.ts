import { describe, expect, it } from 'vitest';
import { apiErrorSchema, prioritySchema } from './common.js';

describe('shared schemas', () => {
  it('accepts a well-formed API error', () => {
    expect(
      apiErrorSchema.parse({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
    ).toBeTruthy();
  });

  it('rejects an unknown priority', () => {
    expect(prioritySchema.safeParse('URGENT').success).toBe(false);
  });
});
