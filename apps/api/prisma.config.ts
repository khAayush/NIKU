import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

// Local development keeps variables in the repo-root .env; production injects them directly.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
