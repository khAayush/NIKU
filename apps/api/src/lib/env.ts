import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Local development keeps variables in the repo-root .env; production injects them directly.
const rootEnvFile = fileURLToPath(new URL('../../../../.env', import.meta.url));
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('127.0.0.1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.url(),
    /**
     * Public origin of the app (web + API share it: Vite proxy locally, Caddy in production).
     * Used for CORS, auth cookies/redirects, and links in emails.
     */
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    /** Secret Better Auth uses to sign cookies and tokens. At least 32 characters. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Gmail address used to send email, and its Google app password. */
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    /** "From" header for outgoing email, e.g. `Tasks <you@gmail.com>`. Defaults to SMTP_USER. */
    MAIL_FROM: z.string().optional(),
    /** Web Push VAPID keys (generate with `pnpm --filter @todo/api vapid:generate`). */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    /** Contact for push services, e.g. `mailto:you@example.com`. */
    VAPID_SUBJECT: z.string().default('mailto:admin@localhost'),
  })
  .refine((e) => e.NODE_ENV !== 'production' || (e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY), {
    message: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required in production',
    path: ['VAPID_PUBLIC_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || (e.SMTP_USER && e.SMTP_PASS), {
    message: 'SMTP_USER and SMTP_PASS are required in production',
    path: ['SMTP_USER'],
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
