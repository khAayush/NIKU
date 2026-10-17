import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { parseTaskText, type ParseContext } from './parser.js';

const TZ = 'Europe/London';
/** Saturday 17 October 2026, 14:00 in London (BST). */
const NOW = DateTime.fromISO('2026-10-17T14:00', { zone: TZ }).toJSDate();

const LISTS = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'side', name: 'Side Project' },
];

function parse(text: string, overrides: Partial<ParseContext> = {}) {
  return parseTaskText(text, { now: NOW, timezone: TZ, lists: LISTS, ...overrides });
}

/** Local wall-clock rendering of a Date in `tz`. */
const local = (d: Date | null, tz = TZ) =>
  d ? DateTime.fromJSDate(d, { zone: tz }).toFormat("yyyy-MM-dd'T'HH:mm") : null;

/** Compact view of the interesting fields. */
function summary(text: string, overrides: Partial<ParseContext> = {}) {
  const r = parse(text, overrides);
  return {
    title: r.title,
    due: r.dueAt ? (r.dueAllDay ? local(r.dueAt)!.slice(0, 10) : local(r.dueAt)) : null,
    priority: r.priority,
    recurrence: r.recurrence,
    listId: r.listId,
  };
}

describe('examples from the brief', () => {
  it('"Submit report tomorrow at 5pm urgent"', () => {
    expect(summary('Submit report tomorrow at 5pm urgent')).toEqual({
      title: 'Submit report',
      due: '2026-10-18T17:00',
      priority: 'HIGH',
      recurrence: 'NONE',
      listId: null,
    });
  });

  it('"Call mom every Sunday 6pm"', () => {
    expect(summary('Call mom every Sunday 6pm')).toEqual({
      title: 'Call mom',
      due: '2026-10-18T18:00',
      priority: 'MEDIUM',
      recurrence: 'WEEKLY',
      listId: null,
    });
  });
});

describe('dates and times', () => {
  it.each([
    // [input, expected title, expected due (date only = all-day)]
    ['Buy milk', 'Buy milk', null],
    ['Buy milk today', 'Buy milk', '2026-10-17'],
    ['Buy milk tomorrow', 'Buy milk', '2026-10-18'],
    ['Dentist next Friday', 'Dentist', '2026-10-23'],
    ['Dentist next Friday at 10:30', 'Dentist', '2026-10-23T10:30'],
    ['Dentist on Monday', 'Dentist', '2026-10-19'],
    ['Meeting at 3pm', 'Meeting', '2026-10-17T15:00'],
    ['Meeting at 9', 'Meeting', '2026-10-18T09:00'], // 9am already passed today
    ['Meeting at 9am', 'Meeting', '2026-10-18T09:00'],
    ['Pay rent on the 20th', 'Pay rent', '2026-10-20'],
    ['Pay rent on the 1st', 'Pay rent', '2026-11-01'], // the 1st has passed this month
    ['Pay rent on the 1st at 9am', 'Pay rent', '2026-11-01T09:00'],
    ['Buy milk tonight', 'Buy milk', '2026-10-17T20:00'],
    ['Gym tomorrow morning', 'Gym', '2026-10-18T09:00'],
    ['Call Ana friday evening', 'Call Ana', '2026-10-23T18:00'],
    ['Walk the dog this afternoon', 'Walk the dog', '2026-10-17T14:00'],
    ['Book flights in 2 hours', 'Book flights', '2026-10-17T16:00'],
    ['Renew passport Oct 31', 'Renew passport', '2026-10-31'],
    ['Renew passport on 31 October', 'Renew passport', '2026-10-31'],
    ['Lunch with Sam at noon tomorrow', 'Lunch with Sam', '2026-10-18T12:00'],
    ['Submit report by Friday', 'Submit report', '2026-10-23'],
    ['Submit report due Friday 5pm', 'Submit report', '2026-10-23T17:00'],
    ['Call the bank at 4:45pm', 'Call the bank', '2026-10-17T16:45'],
    ['Pick up parcel 18:30', 'Pick up parcel', '2026-10-17T18:30'],
  ])('%j', (input, title, due) => {
    const s = summary(input);
    expect(s.title).toBe(title);
    expect(s.due).toBe(due);
  });

  it('keeps "this afternoon" today even after 2pm', () => {
    const now = DateTime.fromISO('2026-10-17T15:30', { zone: TZ }).toJSDate();
    expect(local(parse('Walk the dog this afternoon', { now }).dueAt)).toBe('2026-10-17T14:00');
  });

  it('uses the all-day flag only when no time is given', () => {
    expect(parse('Dentist next Friday').dueAllDay).toBe(true);
    expect(parse('Dentist next Friday at 10:30').dueAllDay).toBe(false);
    expect(parse('Buy milk').dueAllDay).toBe(false);
  });
});

describe('recurrence', () => {
  it.each([
    ['Water plants every day', 'Water plants', 'DAILY', '2026-10-17'],
    ['Water plants everyday', 'Water plants', 'DAILY', '2026-10-17'],
    ['Stand-up daily at 9:30', 'Stand-up', 'DAILY', '2026-10-18T09:30'],
    ['Yoga every morning', 'Yoga', 'DAILY', '2026-10-18T09:00'],
    ['Journal every evening', 'Journal', 'DAILY', '2026-10-17T18:00'],
    ['Clean the house weekly', 'Clean the house', 'WEEKLY', '2026-10-17'],
    ['Clean the house every week', 'Clean the house', 'WEEKLY', '2026-10-17'],
    ['Football every Monday', 'Football', 'WEEKLY', '2026-10-19'],
    ['Football on Mondays at 7pm', 'Football', 'WEEKLY', '2026-10-19T19:00'],
    ['Take out bins every tue', 'Take out bins', 'WEEKLY', '2026-10-20'],
    ['Pay credit card monthly', 'Pay credit card', 'MONTHLY', '2026-10-17'],
    ['Review budget every month on the 25th', 'Review budget', 'MONTHLY', '2026-10-25'],
    ['Pay rent every month on the 1st', 'Pay rent', 'MONTHLY', '2026-11-01'],
  ])('%j', (input, title, recurrence, due) => {
    const s = summary(input);
    expect(s).toMatchObject({ title, recurrence, due });
  });

  it('every Saturday from a Saturday afternoon is today when a later time is given', () => {
    expect(summary('Swim every Saturday at 6pm').due).toBe('2026-10-17T18:00');
  });
});

describe('priority', () => {
  it.each([
    ['Fix login bug urgent', 'Fix login bug', 'HIGH'],
    ['Urgent: call the plumber', 'Call the plumber', 'HIGH'],
    ['Fix bug ASAP', 'Fix bug', 'HIGH'],
    ['Important: renew insurance', 'Renew insurance', 'HIGH'],
    ['Deploy hotfix!!!', 'Deploy hotfix', 'HIGH'],
    ['Finish slides high priority', 'Finish slides', 'HIGH'],
    ['Read novel low priority', 'Read novel', 'LOW'],
    ['Reply to emails not urgent', 'Reply to emails', 'LOW'],
    ['Sort photos whenever', 'Sort photos', 'LOW'],
    ['Organise desk', 'Organise desk', 'MEDIUM'],
  ])('%j', (input, title, priority) => {
    expect(summary(input)).toMatchObject({ title, priority });
  });
});

describe('lists', () => {
  it.each([
    ['Buy eggs for groceries', 'Buy eggs', 'groceries'],
    ['Prepare slides #work tomorrow', 'Prepare slides', 'work'],
    ['Book dentist in my Personal list', 'Book dentist', 'personal'],
    ['Book dentist to personal', 'Book dentist', 'personal'],
    ['Ship v2 in Side Project list', 'Ship v2', 'side'],
    ['Refactor parser #sideproject', 'Refactor parser', 'side'],
    ['Buy bread groceries list', 'Buy bread', 'groceries'],
    ['Work on slides', 'Work on slides', null], // "Work" without a preposition is just a word
    ['Email boss about work', 'Email boss about work', null],
    ['Plan trip for the weekend', 'Plan trip', null], // not a list name
  ])('%j', (input, title, listId) => {
    expect(summary(input)).toMatchObject({ title, listId });
  });

  it('works when the user has no lists', () => {
    expect(summary('Buy eggs for groceries', { lists: [] })).toMatchObject({
      title: 'Buy eggs for groceries',
      listId: null,
    });
  });
});

describe('remind me', () => {
  it('sets a reminder at the due time', () => {
    const r = parse('Remind me to call mom tomorrow at 5pm');
    expect(r.title).toBe('Call mom');
    expect(local(r.remindAt)).toBe('2026-10-18T17:00');
    expect(r.remindAt).toEqual(r.dueAt);
  });

  it('reminds at 9:00 for all-day tasks', () => {
    const r = parse('Remind me to pay rent on the 1st');
    expect(r.title).toBe('Pay rent');
    expect(local(r.remindAt)).toBe('2026-11-01T09:00');
  });

  it('has no reminder without a date', () => {
    const r = parse('Remind me to stretch');
    expect(r.title).toBe('Stretch');
    expect(r.remindAt).toBeNull();
  });

  it('never adds a reminder unless asked', () => {
    expect(parse('Call mom tomorrow at 5pm').remindAt).toBeNull();
  });
});

describe('combined sentences', () => {
  it.each([
    [
      'Send invoice to client every month on the 28th #work urgent',
      {
        title: 'Send invoice to client',
        due: '2026-10-28',
        recurrence: 'MONTHLY',
        priority: 'HIGH',
        listId: 'work',
      },
    ],
    [
      'remind me to buy coffee beans for groceries tomorrow morning',
      {
        title: 'Buy coffee beans',
        due: '2026-10-18T09:00',
        listId: 'groceries',
        priority: 'MEDIUM',
      },
    ],
    [
      'Team retro every Friday at 4pm in Work list important',
      {
        title: 'Team retro',
        due: '2026-10-23T16:00',
        recurrence: 'WEEKLY',
        listId: 'work',
        priority: 'HIGH',
      },
    ],
  ])('%j', (input, expected) => {
    expect(summary(input)).toMatchObject(expected);
  });
});

describe('title cleanup', () => {
  it.each([
    ['  submit   report   by friday  ', 'Submit report'],
    ['Call mom on Sunday, urgent', 'Call mom'],
    ['call mom.', 'Call mom'],
    ['- buy milk tomorrow', 'Buy milk'],
    ['pay electricity bill on monday at 10', 'Pay electricity bill'],
  ])('%j → %j', (input, title) => {
    expect(parse(input).title).toBe(title);
  });

  it('falls back to the original text when everything was a keyword', () => {
    expect(parse('tomorrow').title).toBe('Tomorrow');
    expect(parse('urgent').title).toBe('Urgent');
  });

  it('caps the title at 200 characters', () => {
    expect(parse('a'.repeat(300)).title).toHaveLength(200);
  });

  it('reports the phrases it understood, in order', () => {
    expect(parse('Submit report tomorrow at 5pm urgent').recognized).toEqual([
      'tomorrow at 5pm',
      'urgent',
    ]);
    expect(parse('Call mom every Sunday 6pm #personal').recognized).toEqual([
      'every Sunday',
      'Sunday 6pm',
      '#personal',
    ]);
    expect(parse('Buy milk').recognized).toEqual([]);
  });
});

describe('timezones', () => {
  it("understands 'today' on the user's own calendar", () => {
    const now = new Date('2026-10-17T23:30:00Z');
    // 08:30 on the 18th in Tokyo, 19:30 on the 17th in New York.
    const tokyo = parse('Buy milk today', { now, timezone: 'Asia/Tokyo' });
    expect(local(tokyo.dueAt, 'Asia/Tokyo')).toBe('2026-10-18T00:00');
    const ny = parse('Buy milk today', { now, timezone: 'America/New_York' });
    expect(local(ny.dueAt, 'America/New_York')).toBe('2026-10-17T00:00');
  });

  it('stores the UTC instant for the local time', () => {
    const r = parse('Call at 5pm', {
      timezone: 'Asia/Kathmandu',
      now: new Date('2026-10-17T05:00:00Z'),
    });
    expect(r.dueAt?.toISOString()).toBe('2026-10-17T11:15:00.000Z'); // 17:00 at UTC+5:45
  });

  it('keeps the local time across a daylight-saving change', () => {
    // UK clocks go back on Sunday 25 October 2026.
    const now = DateTime.fromISO('2026-10-24T10:00', { zone: TZ }).toJSDate();
    const r = parse('Call mom every Sunday 6pm', { now });
    expect(local(r.dueAt)).toBe('2026-10-25T18:00');
    expect(r.dueAt?.toISOString()).toBe('2026-10-25T18:00:00.000Z'); // GMT again
  });
});
