import { execSync } from 'child_process';

export default async function globalSetup() {
  process.env.APP_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    'postgresql://sportsadmin:sportsadmin@localhost:5432/sportsadmin_test';
  process.env.SESSION_SECRET = 'test-secret-do-not-use-in-production-at-all';
  process.env.PASSWORD_HASH_COST = '4'; // low cost for fast tests

  // Run migrations against the test database
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
}
