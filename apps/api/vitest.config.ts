import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      // Tests always use the separate todo_test database.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://todo:todo@localhost:5432/todo_test',
    },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
  },
});
