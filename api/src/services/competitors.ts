import prisma from '../prisma/client';

/**
 * Calculate age as of the carnival's cutoff date in the current year.
 */
export function calculateAge(dob: Date, cutoffMonth: number, cutoffDay: number): number {
  const currentYear = new Date().getFullYear();
  const cutoffDate = new Date(currentYear, cutoffMonth - 1, cutoffDay);
  let age = cutoffDate.getFullYear() - dob.getFullYear();
  if (
    cutoffMonth - 1 < dob.getMonth() ||
    (cutoffMonth - 1 === dob.getMonth() && cutoffDay < dob.getDate())
  ) {
    age--;
  }
  return age;
}

/** Derive a nominal DOB (Jan 1) from an age integer. */
export function deriveDob(age: number): Date {
  return new Date(new Date().getFullYear() - age, 0, 1);
}

/** Normalise a free-text sex value to 'M', 'F', or null. */
export function normalizeSex(raw: string): 'M' | 'F' | null {
  const lower = raw.trim().toLowerCase();
  if (['m', 'male', 'boy', 'boys'].includes(lower)) return 'M';
  if (['f', 'female', 'girl', 'girls'].includes(lower)) return 'F';
  return null;
}

/**
 * Recalculate and persist a competitor's total points from comp_events.
 */
export async function recalcTotalPoints(competitorId: number): Promise<void> {
  const agg = await prisma.$queryRaw<[{ total: number }]>`
    SELECT COALESCE(SUM(points), 0) as total FROM comp_events WHERE competitor_id = ${competitorId}
  `;
  await prisma.competitor.update({
    where: { id: competitorId },
    data: { totalPoints: agg[0].total },
  });
}

/** Build the display name: SURNAME, givenName. */
export function fullName(surname: string, givenName: string): string {
  return `${surname.toUpperCase()}, ${givenName}`;
}
