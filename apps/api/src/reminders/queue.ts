import { PgBoss } from 'pg-boss';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/** pg-boss queues. A reminder job fans out to one job per delivery channel. */
export const QUEUES = {
  /** Fires at `remindAt`: emits in-app and enqueues push/email deliveries. */
  reminder: 'reminder',
  push: 'reminder-push',
  email: 'reminder-email',
} as const;

/** Failed jobs are retried this many times, with exponential backoff, before giving up. */
export const RETRY_LIMIT = 5;
const DAY = 86_400;

let starting: Promise<PgBoss> | null = null;

/** The shared pg-boss instance, started (and its queues created) on first use. */
export function getBoss(): Promise<PgBoss> {
  starting ??= (async () => {
    const boss = new PgBoss({ connectionString: env.DATABASE_URL, max: 5 });
    boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
    await boss.start();
    const retries = {
      retryLimit: RETRY_LIMIT,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 3600,
    };
    // Reminders can be scheduled far ahead; the default retention (14 days) would delete them
    // before they run. Startup catch-up covers anything that is still missed.
    await boss.createQueue(QUEUES.reminder, {
      ...retries,
      retentionSeconds: 400 * DAY,
      expireInSeconds: 60,
    });
    await boss.createQueue(QUEUES.push, { ...retries, expireInSeconds: 60 });
    await boss.createQueue(QUEUES.email, { ...retries, expireInSeconds: 120 });
    return boss;
  })();
  return starting;
}

export async function stopBoss() {
  if (!starting) return;
  const boss = await starting;
  starting = null;
  await boss.stop();
}
