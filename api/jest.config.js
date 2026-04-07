/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  globalSetup: './tests/setup/globalSetup.ts',
  globalTeardown: './tests/setup/globalTeardown.ts',
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/prisma/seed.ts', '!src/index.ts'],
  moduleNameMapper: {
    '^@sportsadmin/shared$': '<rootDir>/../shared/types/index.ts',
  },
};
