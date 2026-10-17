import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      // Tests always use the separate todo_test database.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://todo:todo@localhost:5432/todo_test',
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      // Empty values win over the repo .env, so tests never send real email.
      SMTP_USER: '',
      SMTP_PASS: '',
    },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
  },
});
