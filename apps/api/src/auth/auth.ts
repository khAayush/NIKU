import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidTimezone } from '@todo/shared';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { sendMail } from '../lib/mailer.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from './password.js';

const DAY = 60 * 60 * 24;

export const auth = betterAuth({
  appName: 'NIKU',
  baseURL: env.WEB_ORIGIN,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    password: { hash: hashPassword, verify: verifyPassword },
    resetPasswordTokenExpiresIn: 30 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      const url = `${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
      // Not awaited, so response time doesn't reveal whether the email exists.
      void sendMail({
        to: user.email,
        subject: 'Reset your NIKU password',
        text:
          `Hi ${user.name},\n\nUse this link to choose a new password. It expires in 30 minutes ` +
          `and can only be used once:\n\n${url}\n\n` +
          `If you didn't ask for this, you can ignore this email.`,
      }).catch((err) =>
        logger.error({ err, userId: user.id }, 'Failed to send password reset email'),
      );
    },
  },

  session: {
    // Sliding expiry: a session not used for 7 days expires. Activity extends it (at most once a day).
    expiresIn: 7 * DAY,
    updateAge: DAY,
  },

  user: {
    additionalFields: {
      timezone: { type: 'string', required: true, input: true },
      notifyInApp: { type: 'boolean', required: false, input: false, defaultValue: true },
      notifyPush: { type: 'boolean', required: false, input: false, defaultValue: false },
      notifyEmail: { type: 'boolean', required: false, input: false, defaultValue: true },
    },
    // Lists, tasks and push subscriptions are removed by ON DELETE CASCADE.
    deleteUser: { enabled: true },
  },

  verification: {
    // Store password-reset tokens hashed (SHA-256), never in plain text.
    storeIdentifier: 'hashed',
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (typeof user.timezone !== 'string' || !isValidTimezone(user.timezone)) {
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_TIMEZONE',
              message: 'Unknown timezone',
            });
          }
          return { data: user };
        },
      },
    },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
  },

  // Profile/timezone changes go through PATCH /api/me, which validates them.
  disabledPaths: ['/update-user'],

  logger: {
    log: (level, message, ...args) => logger[level]({ args }, message),
  },
  telemetry: { enabled: false },
});

export type AuthSession = typeof auth.$Infer.Session;
