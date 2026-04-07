import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding reference data…');

  // Units (Doc 01 §5 — six result measurement types)
  await prisma.unit.createMany({
    data: [
      { id: 1, name: 'Seconds', label: 'Secs', sortAscending: true },
      { id: 2, name: 'Minutes', label: 'Mins', sortAscending: true },
      { id: 3, name: 'Hours',   label: 'Hrs',  sortAscending: true },
      { id: 4, name: 'Meters',  label: 'm',    sortAscending: false },
      { id: 5, name: 'Kilometers', label: 'Km', sortAscending: false },
      { id: 6, name: 'Points',  label: 'Pts',  sortAscending: false },
    ],
    skipDuplicates: true,
  });

  // House types (Doc 03 — six kinds of team grouping)
  await prisma.houseType.createMany({
    data: [
      { id: 1, name: 'Inter-House' },
      { id: 2, name: 'Inter-School' },
      { id: 3, name: 'Inter-Class' },
      { id: 4, name: 'Inter-Country' },
      { id: 5, name: 'Inter-Youth Group' },
      { id: 6, name: 'Inter-Church' },
    ],
    skipDuplicates: true,
  });

  // Final level labels (Doc 05 — display names for final levels 0–7)
  await prisma.finalLevelLabel.createMany({
    data: [
      { level: 0, label: 'Grand Final' },
      { level: 1, label: 'Semi Final' },
      { level: 2, label: 'Quarter Final' },
      { level: 3, label: 'Round of 16' },
      { level: 4, label: 'Round of 32' },
      { level: 5, label: 'Heat 5' },
      { level: 6, label: 'Heat 6' },
      { level: 7, label: 'Heat 7' },
    ],
    skipDuplicates: true,
  });

  // Seed an initial admin user if DATABASE_SEED_ADMIN_EMAIL is set
  const adminEmail = process.env.DATABASE_SEED_ADMIN_EMAIL;
  const adminPassword = process.env.DATABASE_SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const cost = parseInt(process.env.PASSWORD_HASH_COST ?? '12', 10);
    const passwordHash = await bcrypt.hash(adminPassword, cost);
    await prisma.user.upsert({
      where: { email: adminEmail },
      create: {
        email: adminEmail,
        passwordHash,
        displayName: 'Admin',
        role: 'admin',
      },
      update: {},
    });
    console.log(`Admin user seeded: ${adminEmail}`);
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
