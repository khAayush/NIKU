import { TASK_TITLE_MAX, type Priority, type Recurrence } from '@todo/shared';
import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';

export interface ParseContext {
  now: Date;
  /** The user's IANA timezone; dates are understood on their local calendar. */
  timezone: string;
  lists: { id: string; name: string }[];
}

export interface ParsedTask {
  title: string;
  dueAt: Date | null;
  dueAllDay: boolean;
  priority: Priority;
  recurrence: Recurrence;
  listId: string | null;
  /** Phrases that were understood, in the order they appear. */
  recognized: string[];
}

// ---- Keyword rules -------------------------------------------------------------------------

/** Checked in order; LOW first so "not urgent" isn't read as "urgent". */
const PRIORITY_RULES: { priority: Priority; pattern: RegExp }[] = [
  { priority: 'LOW', pattern: /\b(?:not urgent|low priority|no rush|whenever)\b/i },
  {
    priority: 'HIGH',
    pattern: /\b(?:urgent(?:ly)?|important|asap|high priority|top priority)\b|!{2,}/i,
  },
];

const DAY_NAMES = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const DAY_ABBREVIATIONS = 'mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun';

/**
 * Recurrence phrases. `keep` is the part left in the text for the date parser
 * (e.g. "every Sunday" → "Sunday", so the first due date is the next Sunday).
 */
const RECURRENCE_RULES: {
  recurrence: Recurrence;
  pattern: RegExp;
  keep?: (m: RegExpExecArray) => string;
}[] = [
  {
    // "every Monday", "each fri"
    recurrence: 'WEEKLY',
    pattern: new RegExp(`\\b(?:every|each)\\s+(${DAY_NAMES}|${DAY_ABBREVIATIONS})s?\\b`, 'i'),
    keep: (m) => m[1]!,
  },
  {
    // "on Mondays" (plural full day names only)
    recurrence: 'WEEKLY',
    pattern: new RegExp(`\\b(?:on\\s+)?(${DAY_NAMES})s\\b`, 'i'),
    keep: (m) => m[1]!,
  },
  {
    // "every morning" → daily, first one at the next morning
    recurrence: 'DAILY',
    pattern: /\b(?:every|each)\s+(morning|afternoon|evening|night)\b/i,
    keep: (m) => m[1]!,
  },
  { recurrence: 'DAILY', pattern: /\b(?:every\s*day|each day|daily)\b/i },
  { recurrence: 'WEEKLY', pattern: /\b(?:every week|each week|weekly)\b/i },
  { recurrence: 'MONTHLY', pattern: /\b(?:every month|each month|monthly)\b/i },
];

const REMIND_ME = /^\s*(?:please\s+)?remind me (?:to\s+|about\s+)?/i;

/** Hours used for vague times of day (chrono's own guesses, like 6am for "morning", are odd). */
const PART_OF_DAY: { pattern: RegExp; hour: number }[] = [
  { pattern: /\bmorning\b/i, hour: 9 },
  { pattern: /\bafternoon\b/i, hour: 14 },
  { pattern: /\bevening\b/i, hour: 18 },
  { pattern: /\b(?:tonight|night)\b/i, hour: 20 },
];

/** Words left dangling once a date or keyword has been cut out of the title. */
const DANGLING =
  /(?:^|\s)(?:at|on|by|due|due on|due by|before|for|in|from|every|each|the|and|,|-)\s*$/i;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- Date parser -----------------------------------------------------------------------------

/** chrono's casual English parser, plus "the 15th" / "on the 1st" (day of month only). */
const dateParser = chrono.casual.clone();
dateParser.parsers.push({
  pattern: () => /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
  extract: (_context, match) => {
    const day = Number(match[1]);
    return day >= 1 && day <= 31 ? { day } : null;
  },
});

interface Span {
  text: string;
  index: number;
}

/** Replaces the span with spaces so later indexes stay valid. */
function blank(s: string, span: Span) {
  return (
    s.slice(0, span.index) + ' '.repeat(span.text.length) + s.slice(span.index + span.text.length)
  );
}

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim();
  // Drop connector words left at either end ("Pay rent on" → "Pay rent").
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t
      .replace(DANGLING, '')
      .replace(/^[\s,;:.!-]+/, '')
      .replace(/^(?:to|and)\s+/i, '')
      .replace(/[\s,;:.!-]+$/, '')
      .trim();
  }
  // Collapse leftovers from cutting a phrase out of the middle ("Call , mom").
  t = t.replace(/\s+([,;:])/g, '$1').replace(/\s{2,}/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Turns a sentence like "Submit report tomorrow at 5pm urgent" into a task draft.
 * Pure function: no database access, `now` and the timezone come from the caller.
 */
export function parseTaskText(input: string, ctx: ParseContext): ParsedTask {
  const recognized: (Span & { order: number })[] = [];
  const found = (span: Span) => recognized.push({ ...span, order: span.index });
  let text = input.replace(/\s+/g, ' ').trim();

  // "Remind me to …" is just phrasing: reminders come from the user's settings.
  const remind = REMIND_ME.exec(text);
  if (remind) text = blank(text, { text: remind[0], index: remind.index });

  // Priority keywords.
  let priority: Priority = 'MEDIUM';
  for (const rule of PRIORITY_RULES) {
    const m = rule.pattern.exec(text);
    if (m) {
      priority = rule.priority;
      found({ text: m[0], index: m.index });
      text = blank(text, { text: m[0], index: m.index });
      break;
    }
  }

  // Recurrence. For "every Sunday", keep "Sunday" for the date parser.
  let recurrence: Recurrence = 'NONE';
  for (const rule of RECURRENCE_RULES) {
    const m = rule.pattern.exec(text);
    if (!m) continue;
    recurrence = rule.recurrence;
    found({ text: m[0], index: m.index });
    const kept = rule.keep?.(m) ?? '';
    const keptAt = kept ? m.index + m[0].lastIndexOf(kept) : m.index;
    text = blank(text, { text: m[0], index: m.index });
    if (kept) text = text.slice(0, keptAt) + kept + text.slice(keptAt + kept.length);
    break;
  }

  // List names: "#Work", "in/to/for/on (my|the) Work (list)", "Work list". Longest names first.
  let listId: string | null = null;
  const lists = [...ctx.lists].sort((a, b) => b.name.length - a.name.length);
  for (const list of lists) {
    const name = escape(list.name);
    const patterns = [
      new RegExp(`(?:^|\\s)#${name.replace(/\\? /g, '')}(?=\\s|$)`, 'i'),
      new RegExp(`(?:^|\\s)#${name}(?=\\s|$)`, 'i'),
      new RegExp(
        `\\b(?:in|to|on|for|under|into)\\s+(?:my\\s+|the\\s+)?${name}(?:\\s+list)?(?=\\s|$|[,.!?])`,
        'i',
      ),
      new RegExp(`\\b${name}\\s+list\\b`, 'i'),
    ];
    const m = patterns.map((p) => p.exec(text)).find(Boolean);
    if (m) {
      listId = list.id;
      const leading = m[0].length - m[0].trimStart().length;
      found({ text: m[0].trim(), index: m.index + leading });
      text = blank(text, { text: m[0], index: m.index });
      break;
    }
  }

  // Dates and times, on the user's local calendar.
  const tz = ctx.timezone;
  const now = DateTime.fromJSDate(ctx.now, { zone: tz });
  let dueAt: Date | null = null;
  let dueAllDay = false;
  const [result] = dateParser.parse(
    text,
    { instant: ctx.now, timezone: now.offset },
    { forwardDate: true },
  );
  if (result) {
    const c = result.start;
    let hour: number | null = c.isCertain('hour') ? c.get('hour') : null;
    let minute = c.get('minute') ?? 0;
    if (hour === null) {
      const part = PART_OF_DAY.find((p) => p.pattern.test(result.text));
      if (part) {
        hour = part.hour;
        minute = 0;
      }
    }

    let local = DateTime.fromObject(
      { year: c.get('year')!, month: c.get('month')!, day: c.get('day')! },
      { zone: tz },
    );
    // "the 1st" when the 1st has passed means next month (clamped: 31st → end of a short month).
    if (c.isCertain('day') && !c.isCertain('month') && local < now.startOf('day')) {
      const next = now.startOf('month').plus({ months: 1 });
      local = next.set({ day: Math.min(c.get('day')!, next.daysInMonth!) });
    }
    if (hour !== null) {
      local = local.set({ hour, minute });
      // "this afternoon" / "tonight" always mean today, even once that time has passed.
      const pinnedToToday = /\b(?:this\s+(?:morning|afternoon|evening)|tonight|today)\b/i.test(
        result.text,
      );
      if (pinnedToToday) {
        local = local.set({ year: now.year, month: now.month, day: now.day });
      } else if (local < now && !c.isCertain('day') && !c.isCertain('weekday')) {
        // A bare time that has already passed today ("at 9" at 10pm) means tomorrow.
        local = local.plus({ days: 1 });
      }
    } else {
      dueAllDay = true;
    }

    dueAt = local.toJSDate();
    found({ text: result.text, index: result.index });
    text = blank(text, { text: result.text, index: result.index });
  }

  // A repeating task needs a date to repeat from: start today.
  if (!dueAt && recurrence !== 'NONE') {
    dueAt = now.startOf('day').toJSDate();
    dueAllDay = true;
  }

  const title = cleanTitle(text) || cleanTitle(input);
  return {
    title: title.slice(0, TASK_TITLE_MAX),
    dueAt,
    dueAllDay,
    priority,
    recurrence,
    listId,
    recognized: recognized.sort((a, b) => a.order - b.order).map((r) => r.text.trim()),
  };
}
