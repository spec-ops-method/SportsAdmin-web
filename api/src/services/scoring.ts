import prisma from '../prisma/client';
import { isAscUnit } from './resultParser';
import { recalcTotalPoints } from './competitors';

export async function lookupPoints(
  carnivalId: number,
  scaleName: string,
  place: number,
): Promise<number> {
  const entry = await (prisma as any).pointScaleEntry.findUnique({
    where: { carnivalId_scaleName_place: { carnivalId, scaleName, place } },
  });
  return entry?.points ?? 0;
}

export async function lookupMinPoints(carnivalId: number, scaleName: string): Promise<number> {
  const entries = await (prisma as any).pointScaleEntry.findMany({
    where: { carnivalId, scaleName },
    orderBy: { points: 'asc' },
    take: 1,
  });
  return entries[0]?.points ?? 0;
}

export async function calculatePlaces(
  heatId: number,
  placesAcrossAllHeats: boolean,
): Promise<{ updated: number }> {
  // Load heat with event and eventType
  const heat = await (prisma as any).heat.findUnique({
    where: { id: heatId },
    include: {
      event: {
        include: {
          eventType: true,
        },
      },
    },
  });
  if (!heat) throw new Error(`Heat ${heatId} not found`);

  const eventType = heat.event.eventType;
  const carnivalId: number = eventType.carnivalId;
  const isAsc = isAscUnit(eventType.units);

  // Get comp_events to score
  let compEvents: any[];
  if (placesAcrossAllHeats) {
    compEvents = await (prisma as any).compEvent.findMany({
      where: { eventId: heat.eventId, finalLevel: heat.finalLevel },
    });
  } else {
    compEvents = await (prisma as any).compEvent.findMany({
      where: { heatId },
    });
  }

  const SENTINEL = 1e37;
  const sentinelEntries = compEvents.filter((ce: any) => Math.abs(ce.numericResult) >= SENTINEL);
  const realEntries = compEvents.filter((ce: any) => Math.abs(ce.numericResult) < SENTINEL);

  // Sort real entries
  realEntries.sort((a: any, b: any) =>
    isAsc ? a.numericResult - b.numericResult : b.numericResult - a.numericResult,
  );

  // Assign places with ties
  const placeMap = new Map<number, number>(); // compEventId → place
  let currentPlace = 1;
  let i = 0;
  while (i < realEntries.length) {
    const groupVal = realEntries[i].numericResult;
    const groupStart = i;
    while (i < realEntries.length && realEntries[i].numericResult === groupVal) {
      placeMap.set(realEntries[i].id, currentPlace);
      i++;
    }
    currentPlace += i - groupStart;
  }

  // Get min points for sentinels
  const scaleName = heat.pointScale as string | null;
  const minPoints = scaleName ? await lookupMinPoints(carnivalId, scaleName) : 0;

  // Build updates
  const updates: Array<{ id: number; place: number; points: number }> = [];

  for (const ce of realEntries) {
    const place = placeMap.get(ce.id) ?? 1;
    const points = scaleName ? await lookupPoints(carnivalId, scaleName, place) : 0;
    updates.push({ id: ce.id, place, points });
  }

  for (const ce of sentinelEntries) {
    updates.push({ id: ce.id, place: 0, points: minPoints });
  }

  // Persist updates
  await (prisma as any).$transaction(
    updates.map((u) =>
      (prisma as any).compEvent.update({
        where: { id: u.id },
        data: { place: u.place, points: u.points },
      }),
    ),
  );

  // Recalc total points for all affected competitors
  const competitorIds = [...new Set(compEvents.map((ce: any) => ce.competitorId as number))];
  for (const cId of competitorIds) {
    await recalcTotalPoints(cId);
  }

  return { updated: updates.length };
}

export interface RecordBreaker {
  competitorId: number;
  fullName: string;
  numericResult: number;
  formattedResult: string;
  eventId: number;
  houseCode: string;
}

export async function detectRecords(heatId: number): Promise<RecordBreaker[]> {
  const heat = await (prisma as any).heat.findUnique({
    where: { id: heatId },
    include: {
      event: { include: { eventType: true } },
    },
  });
  if (!heat) return [];
  if (!heat.effectsRecords) return [];

  const eventType = heat.event.eventType;
  const isAsc = isAscUnit(eventType.units);
  const eventId: number = heat.eventId;

  const SENTINEL = 1e37;

  // Get comp_events with real results
  const compEvents = await (prisma as any).compEvent.findMany({
    where: {
      heatId,
      result: { not: null },
    },
    include: {
      competitor: { include: { house: { select: { code: true } } } },
    },
  });

  const realCompEvents = compEvents.filter((ce: any) => Math.abs(ce.numericResult) < SENTINEL);
  if (realCompEvents.length === 0) return [];

  const bestInHeat = isAsc
    ? Math.min(...realCompEvents.map((ce: any) => ce.numericResult))
    : Math.max(...realCompEvents.map((ce: any) => ce.numericResult));

  // Get existing records
  const existingRecords = await (prisma as any).record.findMany({
    where: { eventId },
    orderBy: { numericResult: isAsc ? 'asc' : 'desc' },
  });

  let breakers: any[];

  if (existingRecords.length === 0) {
    breakers = realCompEvents.filter((ce: any) => ce.numericResult === bestInHeat);
  } else {
    const existingBest: number = existingRecords[0].numericResult;
    if (isAsc) {
      if (bestInHeat <= existingBest) {
        breakers = realCompEvents.filter((ce: any) => ce.numericResult <= existingBest);
      } else {
        breakers = [];
      }
    } else {
      if (bestInHeat >= existingBest) {
        breakers = realCompEvents.filter((ce: any) => ce.numericResult >= existingBest);
      } else {
        breakers = [];
      }
    }
  }

  return breakers.map((ce: any) => ({
    competitorId: ce.competitorId,
    fullName: `${ce.competitor.surname.toUpperCase()}, ${ce.competitor.givenName}`,
    numericResult: ce.numericResult,
    formattedResult: ce.result ?? '',
    eventId,
    houseCode: ce.competitor.house?.code ?? ce.competitor.houseCode ?? '',
  }));
}

export async function acceptRecord(eventId: number, breakerInfo: RecordBreaker): Promise<void> {
  // Create the record entry
  await (prisma as any).record.create({
    data: {
      eventId,
      surname: breakerInfo.fullName.split(',')[0].trim(),
      givenName: breakerInfo.fullName.split(',').slice(1).join(',').trim(),
      houseCode: breakerInfo.houseCode || null,
      date: new Date(),
      result: breakerInfo.formattedResult,
      numericResult: breakerInfo.numericResult,
    },
  });

  // Check if this beats existing event record
  const event = await (prisma as any).event.findUnique({
    where: { id: eventId },
    include: { eventType: true },
  });
  if (!event) return;

  const isAsc = isAscUnit(event.eventType.units);
  const existing: number | null = event.numericRecord;

  const isBetter =
    existing === null ||
    (isAsc ? breakerInfo.numericResult < existing : breakerInfo.numericResult > existing);

  if (isBetter) {
    // Look up house by houseCode in this event's carnival
    let recordHouseId: number | null = null;
    if (breakerInfo.houseCode) {
      const house = await (prisma as any).house.findFirst({
        where: {
          carnival: { eventTypes: { some: { events: { some: { id: eventId } } } } },
          code: breakerInfo.houseCode,
        },
      });
      recordHouseId = house?.id ?? null;
    }

    await (prisma as any).event.update({
      where: { id: eventId },
      data: {
        record: breakerInfo.formattedResult,
        numericRecord: breakerInfo.numericResult,
        recordName: breakerInfo.fullName,
        recordHouseId,
      },
    });
  }
}

export async function recalcAllPoints(
  carnivalId: number,
): Promise<{ compEventsUpdated: number; competitorsUpdated: number }> {
  const countResult = await (prisma as any).$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM comp_events
    WHERE competitor_id IN (SELECT id FROM competitors WHERE carnival_id = ${carnivalId})
  `;
  const compEventsUpdated = Number(countResult[0].count);

  const competitorsUpdated = await (prisma as any).$executeRaw`
    UPDATE competitors
    SET total_points = (
      SELECT COALESCE(SUM(ce.points), 0)
      FROM comp_events ce
      WHERE ce.competitor_id = competitors.id
    )
    WHERE carnival_id = ${carnivalId}
  `;

  return { compEventsUpdated, competitorsUpdated };
}
