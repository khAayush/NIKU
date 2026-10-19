import { describe, expect, it } from 'vitest';
import { NO_REPLY_NOTICE, renderEmail } from './email-template.js';
import { env } from './env.js';

const name = env.APP_NAME;

const content = {
  preheader: 'Due Sun 18 Oct, 17:00',
  eyebrow: 'Reminder',
  heading: 'Submit report',
  paragraphs: ["Hi Ana, here's your reminder for this task."],
  details: [{ label: 'Due', value: 'Sun 18 Oct, 17:00' }],
  button: { label: `Open ${name}`, url: 'https://app.example/today' },
  note: 'You can change when and how you get reminders in Settings.',
};

describe('renderEmail', () => {
  it('renders the app layout with every part of the content', () => {
    const { html } = renderEmail(content);
    for (const part of [
      `>${name}<`, // app name at the top
      'Due Sun 18 Oct, 17:00', // preheader and detail
      'Submit report',
      `Open ${name}`,
      'href="https://app.example/today"',
      'You can change when and how you get reminders in Settings.',
    ]) {
      expect(html).toContain(part);
    }
    expect(html).toContain('background:#0a0a0a'); // black button, like the app
  });

  it('says it is system-generated and not to reply, in both versions', () => {
    const { html, text } = renderEmail(content);
    expect(NO_REPLY_NOTICE).toMatch(/system-generated.*do not reply/i);
    expect(html).toContain(NO_REPLY_NOTICE);
    expect(text).toContain(NO_REPLY_NOTICE);
  });

  it('has a readable plain-text version', () => {
    const { text } = renderEmail(content);
    expect(text).toBe(
      [
        name,
        '',
        'REMINDER',
        'Submit report',
        '',
        "Hi Ana, here's your reminder for this task.",
        '',
        'Due: Sun 18 Oct, 17:00',
        '',
        `Open ${name}: https://app.example/today`,
        '',
        'You can change when and how you get reminders in Settings.',
        '',
        '--',
        NO_REPLY_NOTICE,
      ].join('\n'),
    );
  });

  it('escapes user content so it cannot inject HTML', () => {
    const { html } = renderEmail({
      ...content,
      heading: '<script>alert(1)</script> & "quotes"',
      paragraphs: ['Hi <b>Eve</b>'],
      button: { label: 'Open', url: 'https://x.example/?a=1&b="2"' },
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Eve</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
    expect(html).toContain('href="https://x.example/?a=1&amp;b=&quot;2&quot;"');
  });

  it('leaves out optional parts', () => {
    const { html, text } = renderEmail({ preheader: 'p', heading: 'H', paragraphs: ['Body'] });
    expect(html).not.toContain('<a href');
    expect(text).not.toContain('Due:');
  });
});
