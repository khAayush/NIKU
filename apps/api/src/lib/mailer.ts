import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  /** Plain-text version (shown by clients that don't render HTML). */
  text: string;
  /** Styled version; see `renderEmail` in `email-template.ts`. */
  html?: string;
}

/** Emails "sent" when SMTP isn't configured (tests, local dev). Tests read from here. */
export const outbox: Mail[] = [];

const transport =
  env.SMTP_USER && env.SMTP_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : null;

/** Checks the SMTP login at startup so misconfiguration shows up in the logs immediately. */
export async function verifyMailer(): Promise<void> {
  if (!transport) {
    logger.warn('SMTP is not configured: emails will not be sent');
    return;
  }
  try {
    await transport.verify();
    logger.info('SMTP connection verified');
  } catch (err) {
    logger.error({ err }, 'SMTP verification failed: check SMTP_USER / SMTP_PASS');
  }
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!transport) {
    outbox.push(mail);
    if (env.NODE_ENV === 'development') {
      logger.info(
        { to: mail.to, subject: mail.subject },
        `Email (not sent, SMTP not configured):\n${mail.text}`,
      );
    }
    return;
  }
  await transport.sendMail({
    from: env.MAIL_FROM ?? `${env.APP_NAME} <${env.SMTP_USER}>`,
    ...mail,
  });
}
