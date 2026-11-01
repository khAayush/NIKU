import { describe, expect, it } from 'vitest';
import { isChecklistComplete, sortChecklists } from './checklists.js';

const item = (done: boolean) => ({ id: String(Math.random()), text: 'x', done });
const list = (title: string, createdAt: string, items: ReturnType<typeof item>[]) => ({
  id: title,
  title,
  createdAt,
  updatedAt: createdAt,
  items,
});

describe('isChecklistComplete', () => {
  it('is complete only when it has items and all are checked', () => {
    expect(isChecklistComplete({ items: [] })).toBe(false);
    expect(isChecklistComplete({ items: [item(true), item(false)] })).toBe(false);
    expect(isChecklistComplete({ items: [item(true), item(true)] })).toBe(true);
  });
});

describe('sortChecklists', () => {
  it('puts incomplete checklists first, newest first within each group', () => {
    const sorted = sortChecklists([
      list('old done', '2026-01-01T00:00:00.000Z', [item(true)]),
      list('old open', '2026-01-02T00:00:00.000Z', [item(false)]),
      list('new done', '2026-01-03T00:00:00.000Z', [item(true), item(true)]),
      list('empty', '2026-01-04T00:00:00.000Z', []),
      list('new open', '2026-01-05T00:00:00.000Z', [item(true), item(false)]),
    ]);
    expect(sorted.map((c) => c.title)).toEqual([
      'new open',
      'empty',
      'old open',
      'new done',
      'old done',
    ]);
  });
});
