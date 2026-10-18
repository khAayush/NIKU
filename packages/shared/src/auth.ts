import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** True when `tz` is an IANA timezone the runtime understands (e.g. "Europe/London"). */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().min(1).max(100).refine(isValidTimezone, {
  message: 'Unknown timezone',
});

export const emailSchema = z.email().max(254);
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);
export const nameSchema = z.string().trim().min(1, 'Name is required').max(100);

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: timezoneSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** The signed-in user's profile and settings (`GET /api/me`). */
export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  timezone: z.string(),
  notifyInApp: z.boolean(),
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
  /** Hours before each task's due time, largest first. */
  reminderHours: z.array(z.number().int()),
  createdAt: z.iso.datetime(),
});
export type Me = z.infer<typeof meSchema>;

/** Reminder choices: hours before a task's due time (all-day tasks: before 6:00 that day). */
export const REMINDER_HOURS = [1, 2, 3, 6, 12, 24, 48] as const;
export type ReminderHours = (typeof REMINDER_HOURS)[number];

/** Any subset of `REMINDER_HOURS` (empty = no reminders). */
export const reminderHoursSchema = z
  .array(
    z
      .number()
      .int()
      .refine((h) => (REMINDER_HOURS as readonly number[]).includes(h), {
        message: `Choose from ${REMINDER_HOURS.join(', ')} hours`,
      }),
  )
  .max(REMINDER_HOURS.length)
  .transform((hours) => [...new Set(hours)].sort((a, b) => b - a));

export const updateMeSchema = z
  .object({
    name: nameSchema,
    timezone: timezoneSchema,
    /** Reminder channels. */
    notifyInApp: z.boolean(),
    notifyPush: z.boolean(),
    notifyEmail: z.boolean(),
    /** Hours before each task's due time to send reminders. */
    reminderHours: reminderHoursSchema,
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
