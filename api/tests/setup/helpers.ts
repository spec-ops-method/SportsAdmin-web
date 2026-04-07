// Re-exported for convenience in tests
export { default as prisma } from '../../src/prisma/client';
export { default as app } from '../../src/index';

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { signToken } from '../../src/services/token';
import { UserRole } from '@sportsadmin/shared';

const prisma = new PrismaClient();

export async function createTestUser(
  overrides: Partial<{ email: string; role: UserRole; password: string }> = {},
) {
  const email = overrides.email ?? `test+${Date.now()}@example.com`;
  const password = overrides.password ?? 'test-password-123';
  const role = overrides.role ?? 'viewer';
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName: 'Test User', role },
  });
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  return { user, token, password };
}

export async function cleanupTestUsers(emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}
