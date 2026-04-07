import prisma from '../../src/prisma/client';

export default async function globalTeardown() {
  await prisma.$disconnect();
}
