import nodemailer from 'nodemailer';
import { env } from './env.js';
import { logger } from './logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
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
  await transport.sendMail({ from: env.MAIL_FROM ?? env.SMTP_USER, ...mail });
}
