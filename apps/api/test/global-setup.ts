import { execSync } from 'node:child_process';

/** Applies all migrations to the test database before the test run. */
export default function setup() {
  execSync('pnpm prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://todo:todo@localhost:5432/todo_test',
    },
  });
}
