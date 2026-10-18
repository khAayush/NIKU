import { describe, expect, it } from 'vitest';
import { createTaskSchema } from './tasks.js';

describe('createTaskSchema', () => {
  const due = '2026-10-20T17:00:00.000Z';

  it('applies defaults', () => {
    const t = createTaskSchema.parse({ title: '  Buy milk  ', dueAt: due });
    expect(t).toMatchObject({
      title: 'Buy milk',
      priority: 'MEDIUM',
      recurrence: 'NONE',
      dueAllDay: false,
      listId: null,
      notes: null,
    });
  });

  it('requires a title of at most 200 characters', () => {
    expect(createTaskSchema.safeParse({ title: '', dueAt: due }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(201), dueAt: due }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x'.repeat(200), dueAt: due }).success).toBe(true);
  });

  it('requires a due date unless priority is Low', () => {
    expect(createTaskSchema.safeParse({ title: 'A' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'A', priority: 'HIGH' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'A', priority: 'LOW' }).success).toBe(true);
  });

  it('requires a due date for repeating tasks', () => {
    const base = { title: 'A', priority: 'LOW', recurrence: 'DAILY' } as const;
    expect(createTaskSchema.safeParse(base).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, dueAt: due }).success).toBe(true);
  });
});
