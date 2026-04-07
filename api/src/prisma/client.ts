import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse the client in development to avoid exhausting connections on hot reload
const prisma = global.__prisma ?? new PrismaClient();

if (process.env.APP_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
