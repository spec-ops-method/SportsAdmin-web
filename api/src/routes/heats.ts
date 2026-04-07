import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errors';
import { fullName } from '../services/competitors';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const FINAL_LEVEL_LABELS: Record<number, string> = {
  0: 'Grand Final', 1: 'Semi Final', 2: 'Quarter Final',
  3: 'Round A', 4: 'Round B', 5: 'Round C', 6: 'Round D', 7: 'Round E',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHeat(h: any) {
  return {
    id: h.id,
    eventId: h.eventId,
    heatNumber: h.heatNumber,
    finalLevel: h.finalLevel,
    finalLevelLabel: FINAL_LEVEL_LABELS[h.finalLevel] ?? `Round ${h.finalLevel}`,
    pointScale: h.pointScale,
    promotionType: h.promotionType,
    useTimes: h.useTimes,
    effectsRecords: h.effectsRecords,
    completed: h.completed,
    status: h.status,
    eventNumber: h.eventNumber,
    eventTime: h.eventTime,
    competitorCount: h._count?.compEvents ?? 0,
  };
}

async function verifyHeatInCarnival(heatId: number, carnivalId: number): Promise<any> {
  const heat = await (prisma as any).heat.findFirst({
    where: {
      id: heatId,
      event: { eventType: { carnivalId } },
    },
    include: { _count: { select: { compEvents: true } } },
  });
  if (!heat) throw new NotFoundError('Heat', heatId);
  return heat;
}

// ─── Get heat with competitors ────────────────────────────────────────────────

router.get(
  '/:carnivalId/heats/:heatId',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);

      const compEvents = await (prisma as any).compEvent.findMany({
        where: { heatId },
        include: {
          competitor: { include: { house: { select: { code: true } } } },
        },
        orderBy: [{ lane: 'asc' }, { competitorId: 'asc' }],
      });

      const formatted = formatHeat(heat);
      res.json({
        ...formatted,
        compEvents: compEvents.map((ce: any) => ({
          id: ce.id,
          competitorId: ce.competitorId,
          competitorFullName: fullName(ce.competitor.surname, ce.competitor.givenName),
          houseCode: ce.competitor.house?.code ?? ce.competitor.houseCode,
          eventId: ce.eventId,
          heatId: ce.heatId,
          heatNumber: ce.heatNumber,
          finalLevel: ce.finalLevel,
          lane: ce.lane,
          place: ce.place,
          result: ce.result,
          numericResult: ce.numericResult,
          points: ce.points,
          memo: ce.memo,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update heat ──────────────────────────────────────────────────────────────

const updateHeatSchema = z.object({
  completed: z.boolean().optional(),
  status: z.enum(['future', 'active', 'completed', 'promoted']).optional(),
  eventNumber: z.number().int().nullable().optional(),
  eventTime: z.string().max(10).nullable().optional(),
  allNames: z.boolean().optional(),
  dontOverridePlaces: z.boolean().optional(),
  pointScale: z.string().max(30).nullable().optional(),
});

router.patch(
  '/:carnivalId/heats/:heatId',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);
      const body = updateHeatSchema.parse(req.body);

      const updated = await (prisma as any).$transaction(async (tx: any) => {
        const u = await tx.heat.update({ where: { id: heatId }, data: body });

        // If status changes, update ALL heats at same event_id + final_level
        if (body.status !== undefined) {
          await tx.heat.updateMany({
            where: {
              eventId: heat.eventId,
              finalLevel: heat.finalLevel,
              id: { not: heatId },
            },
            data: { status: body.status },
          });
        }

        return tx.heat.findUnique({
          where: { id: heatId },
          include: { _count: { select: { compEvents: true } } },
        });
      });

      res.json(formatHeat(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Enter competitor in heat ─────────────────────────────────────────────────

const enterCompetitorSchema = z.object({
  competitorId: z.number().int(),
  lane: z.number().int().nullable().optional(),
});

router.post(
  '/:carnivalId/heats/:heatId/competitors',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);
      const { competitorId, lane: requestedLane } = enterCompetitorSchema.parse(req.body);

      // Validate competitor in this carnival
      const competitor = await (prisma as any).competitor.findFirst({
        where: { id: competitorId, carnivalId },
      });
      if (!competitor) throw new NotFoundError('Competitor', competitorId);

      // Check not already in this heat
      const existing = await (prisma as any).compEvent.findFirst({
        where: { competitorId, heatId },
      });
      if (existing) throw new ConflictError('Competitor is already entered in this heat');

      // Auto-assign lane from lane_templates if not provided
      let lane = requestedLane ?? null;
      if (lane === null) {
        const event = await (prisma as any).event.findUnique({
          where: { id: heat.eventId },
          include: {
            eventType: { include: { laneTemplates: { orderBy: { laneNumber: 'asc' } } } },
          },
        });
        const templates = event?.eventType?.laneTemplates ?? [];
        if (templates.length > 0) {
          const usedLanes = await (prisma as any).compEvent.findMany({
            where: { heatId },
            select: { lane: true },
          });
          const usedSet = new Set(usedLanes.map((ce: any) => ce.lane));
          const available = templates.find((t: any) => !usedSet.has(t.laneNumber));
          if (available) lane = available.laneNumber;
        }
      }

      const compEvent = await (prisma as any).compEvent.create({
        data: {
          competitorId,
          eventId: heat.eventId,
          heatId,
          heatNumber: heat.heatNumber,
          finalLevel: heat.finalLevel,
          lane,
        },
        include: { competitor: { include: { house: { select: { code: true } } } } },
      });

      res.status(201).json({
        id: compEvent.id,
        competitorId: compEvent.competitorId,
        competitorFullName: fullName(compEvent.competitor.surname, compEvent.competitor.givenName),
        houseCode: compEvent.competitor.house?.code ?? compEvent.competitor.houseCode,
        eventId: compEvent.eventId,
        heatId: compEvent.heatId,
        heatNumber: compEvent.heatNumber,
        finalLevel: compEvent.finalLevel,
        lane: compEvent.lane,
        place: compEvent.place,
        result: compEvent.result,
        numericResult: compEvent.numericResult,
        points: compEvent.points,
        memo: compEvent.memo,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Remove competitor from heat ──────────────────────────────────────────────

router.delete(
  '/:carnivalId/heats/:heatId/competitors/:competitorId',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      const competitorId = parseInt(req.params.competitorId, 10);
      if (isNaN(heatId) || isNaN(competitorId)) throw new NotFoundError('CompEvent');

      await verifyHeatInCarnival(heatId, carnivalId);

      const ce = await (prisma as any).compEvent.findFirst({
        where: { competitorId, heatId },
      });
      if (!ce) throw new NotFoundError('CompEvent');

      await (prisma as any).compEvent.delete({ where: { id: ce.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Promotion preview & execute ──────────────────────────────────────────────

async function buildPromotionData(eventId: number, fromFinalLevel: number, carnivalId: number) {
  // Verify event belongs to carnival
  const event = await (prisma as any).event.findFirst({
    where: { id: eventId, eventType: { carnivalId } },
    include: {
      eventType: {
        include: {
          finalLevels: { orderBy: { finalLevel: 'asc' } },
        },
      },
    },
  });
  if (!event) throw new NotFoundError('Event', eventId);

  const finalLevels: any[] = event.eventType.finalLevels;
  const fromLevel = finalLevels.find((fl: any) => fl.finalLevel === fromFinalLevel);
  if (!fromLevel) throw new ValidationError(`Final level ${fromFinalLevel} not found`);

  const toFinalLevel = fromFinalLevel - 1;
  const toLevel = finalLevels.find((fl: any) => fl.finalLevel === toFinalLevel);
  if (!toLevel) throw new ValidationError(`No target level (${toFinalLevel}) found — cannot promote below Grand Final`);

  // Get source heats at fromFinalLevel
  const sourceHeats = await (prisma as any).heat.findMany({
    where: { eventId, finalLevel: fromFinalLevel },
    orderBy: { heatNumber: 'asc' },
  });

  if (sourceHeats.length === 0) {
    throw new ValidationError('No heats found at the source final level');
  }

  // Get competitors to promote per heat
  const heatsWithCompetitors = await Promise.all(
    sourceHeats.map(async (h: any) => {
      const compEvents = await (prisma as any).compEvent.findMany({
        where: { heatId: h.id },
        include: { competitor: true },
        orderBy: [{ place: 'asc' }, { numericResult: 'asc' }],
      });
      return { heat: h, compEvents };
    }),
  );

  // Gather promoted competitors (top promoteCount from each heat, or all if promoteCount=0)
  const promoted: Array<{ heatNumber: number; competitor: any; compEventId: number }> = [];
  for (const { heat, compEvents } of heatsWithCompetitors) {
    const toPromote = fromLevel.promoteCount > 0
      ? compEvents.slice(0, fromLevel.promoteCount)
      : compEvents;
    for (const ce of toPromote) {
      promoted.push({ heatNumber: heat.heatNumber, competitor: ce.competitor, compEventId: ce.id });
    }
  }

  // Get or create target heats
  let targetHeats = await (prisma as any).heat.findMany({
    where: { eventId, finalLevel: toFinalLevel },
    orderBy: { heatNumber: 'asc' },
  });

  if (targetHeats.length === 0) {
    // Create target heats based on toLevel.numHeats
    const created = [];
    for (let i = 1; i <= toLevel.numHeats; i++) {
      const h = await (prisma as any).heat.create({
        data: {
          eventId,
          heatNumber: i,
          finalLevel: toFinalLevel,
          pointScale: toLevel.pointScale ?? null,
          promotionType: toLevel.promotionType,
          useTimes: toLevel.useTimes,
          effectsRecords: toLevel.effectsRecords,
          status: 'future',
          completed: false,
        },
      });
      created.push(h);
    }
    targetHeats = created;
  }

  return {
    event,
    fromLevel,
    toLevel,
    toFinalLevel,
    promoted,
    targetHeats,
    sourceHeats,
    heatsWithCompetitors,
  };
}

// GET - promotion preview
router.get(
  '/:carnivalId/events/:eventId/promote',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);

      const fromFinalLevel = parseInt(req.query.from_final_level as string, 10);
      if (isNaN(fromFinalLevel)) throw new ValidationError('from_final_level query param required');

      const data = await buildPromotionData(eventId, fromFinalLevel, carnivalId);

      const { fromLevel, toLevel, toFinalLevel, promoted, targetHeats, heatsWithCompetitors } = data;

      // Simulate assignment without writing
      const assignments = simulatePromotion(
        promoted,
        targetHeats,
        fromLevel.promotionType,
      );

      res.json({
        promotedCount: promoted.length,
        fromLevel: fromFinalLevel,
        fromLevelLabel: FINAL_LEVEL_LABELS[fromFinalLevel] ?? `Round ${fromFinalLevel}`,
        toLevel: toFinalLevel,
        toLevelLabel: FINAL_LEVEL_LABELS[toFinalLevel] ?? `Round ${toFinalLevel}`,
        heatsPromoted: heatsWithCompetitors.map((hwc: any) => ({
          heatNumber: hwc.heat.heatNumber,
          competitorsPromoted: hwc.compEvents
            .slice(0, fromLevel.promoteCount > 0 ? fromLevel.promoteCount : undefined)
            .map((ce: any) => fullName(ce.competitor.surname, ce.competitor.givenName)),
        })),
        preview: assignments,
      });
    } catch (err) {
      next(err);
    }
  },
);

function simulatePromotion(
  promoted: Array<{ heatNumber: number; competitor: any; compEventId: number }>,
  targetHeats: any[],
  promotionType: string,
): Array<{ targetHeatNumber: number; competitor: string }> {
  const result: Array<{ targetHeatNumber: number; competitor: string }> = [];

  if (promotionType === 'Smooth') {
    // Sequential fill: fill heat 1, then heat 2, etc.
    let heatIdx = 0;
    for (const p of promoted) {
      result.push({
        targetHeatNumber: targetHeats[heatIdx % targetHeats.length].heatNumber,
        competitor: fullName(p.competitor.surname, p.competitor.givenName),
      });
      heatIdx++;
    }
  } else if (promotionType === 'Staggered') {
    // Round-robin: 1st goes to heat 1, 2nd to heat 2, etc.
    for (let i = 0; i < promoted.length; i++) {
      result.push({
        targetHeatNumber: targetHeats[i % targetHeats.length].heatNumber,
        competitor: fullName(promoted[i].competitor.surname, promoted[i].competitor.givenName),
      });
    }
  }

  return result;
}

// POST - execute promotion
const promoteSchema = z.object({
  fromFinalLevel: z.number().int().min(0),
});

router.post(
  '/:carnivalId/events/:eventId/promote',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);

      const { fromFinalLevel } = promoteSchema.parse(req.body);

      const data = await buildPromotionData(eventId, fromFinalLevel, carnivalId);
      const { fromLevel, toLevel, toFinalLevel, promoted, targetHeats, sourceHeats, heatsWithCompetitors } = data;

      const heatsPromoted: Array<{ heatNumber: number; competitorsPromoted: string[] }> = [];

      await (prisma as any).$transaction(async (tx: any) => {
        if (fromLevel.promotionType === 'Smooth') {
          // Sequential: fill heats one at a time
          let heatIdx = 0;
          for (const p of promoted) {
            const targetHeat = targetHeats[heatIdx % targetHeats.length];
            await tx.compEvent.create({
              data: {
                competitorId: p.competitor.id,
                eventId,
                heatId: targetHeat.id,
                heatNumber: targetHeat.heatNumber,
                finalLevel: toFinalLevel,
              },
            });
            heatIdx++;
          }
        } else if (fromLevel.promotionType === 'Staggered') {
          // Round-robin distribution
          for (let i = 0; i < promoted.length; i++) {
            const p = promoted[i];
            const targetHeat = targetHeats[i % targetHeats.length];
            await tx.compEvent.create({
              data: {
                competitorId: p.competitor.id,
                eventId,
                heatId: targetHeat.id,
                heatNumber: targetHeat.heatNumber,
                finalLevel: toFinalLevel,
              },
            });
          }
        }

        // Mark source heats as promoted
        await tx.heat.updateMany({
          where: { id: { in: sourceHeats.map((h: any) => h.id) } },
          data: { status: 'promoted' },
        });

        // Activate target heats
        await tx.heat.updateMany({
          where: { id: { in: targetHeats.map((h: any) => h.id) } },
          data: { status: 'active' },
        });
      });

      // Build response
      for (const hwc of heatsWithCompetitors) {
        const toPromote = fromLevel.promoteCount > 0
          ? hwc.compEvents.slice(0, fromLevel.promoteCount)
          : hwc.compEvents;
        heatsPromoted.push({
          heatNumber: hwc.heat.heatNumber,
          competitorsPromoted: toPromote.map((ce: any) =>
            fullName(ce.competitor.surname, ce.competitor.givenName),
          ),
        });
      }

      res.json({
        promotedCount: promoted.length,
        fromLevel: fromFinalLevel,
        fromLevelLabel: FINAL_LEVEL_LABELS[fromFinalLevel] ?? `Round ${fromFinalLevel}`,
        toLevel: toFinalLevel,
        toLevelLabel: FINAL_LEVEL_LABELS[toFinalLevel] ?? `Round ${toFinalLevel}`,
        heatsPromoted,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Auto-enter competitors ───────────────────────────────────────────────────

const autoEnterSchema = z.object({
  age: z.string().optional(),
  heatStrategy: z.enum(['fill_sequentially', 'distribute_evenly', 'by_house']).default('fill_sequentially'),
});

router.post(
  '/:carnivalId/event-types/:eventTypeId/auto-enter',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventTypeId = parseInt(req.params.eventTypeId, 10);
      if (isNaN(eventTypeId)) throw new NotFoundError('EventType', req.params.eventTypeId);

      const et = await (prisma as any).eventType.findFirst({
        where: { id: eventTypeId, carnivalId },
        include: { finalLevels: { orderBy: { finalLevel: 'asc' } } },
      });
      if (!et) throw new NotFoundError('EventType', eventTypeId);

      const { age: filterAge, heatStrategy } = autoEnterSchema.parse(req.body);

      if (et.finalLevels.length === 0) {
        throw new ValidationError('No final levels configured');
      }

      // Get all events (divisions) for this event type
      const events = await (prisma as any).event.findMany({
        where: { eventTypeId, include: true, ...(filterAge ? { age: filterAge } : {}) },
      });

      const maxLevel = et.finalLevels[et.finalLevels.length - 1];
      const breakdown: Array<{ event: string; competitorsAdded: number; heatsUsed: number }> = [];
      let totalEntered = 0;

      await (prisma as any).$transaction(async (tx: any) => {
        for (const ev of events) {
          // Find eligible competitors via competitor_event_age
          const eligible = await tx.$queryRaw<any[]>`
            SELECT c.* FROM competitors c
            JOIN competitor_event_age cea
              ON cea.carnival_id = c.carnival_id
              AND cea.competitor_age = c.age
              AND cea.event_age = ${ev.age}
            WHERE c.carnival_id = ${carnivalId}
              AND c.sex IN (${ev.sex}, '-')
              AND c.include = true
              AND cea.flag = true
            ORDER BY c.surname, c.given_name
          `;

          if (eligible.length === 0) continue;

          // Get heats for this event at the highest final level
          const heats = await tx.heat.findMany({
            where: { eventId: ev.id, finalLevel: maxLevel.finalLevel },
            orderBy: { heatNumber: 'asc' },
          });

          if (heats.length === 0) continue;

          let competitorsAdded = 0;
          let heatsUsed = 0;

          if (heatStrategy === 'fill_sequentially') {
            let heatIdx = 0;
            for (const comp of eligible) {
              const heat = heats[heatIdx % heats.length];
              // Check not already entered
              const exists = await tx.compEvent.findFirst({
                where: { competitorId: comp.id, eventId: ev.id, finalLevel: maxLevel.finalLevel },
              });
              if (exists) continue;

              await tx.compEvent.create({
                data: {
                  competitorId: comp.id,
                  eventId: ev.id,
                  heatId: heat.id,
                  heatNumber: heat.heatNumber,
                  finalLevel: maxLevel.finalLevel,
                },
              });
              competitorsAdded++;
              totalEntered++;

              // Fill current heat before moving to next
              const currentCount = await tx.compEvent.count({ where: { heatId: heat.id } });
              const laneCount = et.laneCount > 0 ? et.laneCount : Infinity;
              if (currentCount >= laneCount) heatIdx++;
            }
          } else if (heatStrategy === 'distribute_evenly' || heatStrategy === 'by_house') {
            // Round-robin distribution
            let i = 0;
            const sorted = heatStrategy === 'by_house'
              ? eligible.sort((a: any, b: any) => a.house_code.localeCompare(b.house_code))
              : eligible;
            for (const comp of sorted) {
              const heat = heats[i % heats.length];
              const exists = await tx.compEvent.findFirst({
                where: { competitorId: comp.id, eventId: ev.id, finalLevel: maxLevel.finalLevel },
              });
              if (exists) { i++; continue; }

              await tx.compEvent.create({
                data: {
                  competitorId: comp.id,
                  eventId: ev.id,
                  heatId: heat.id,
                  heatNumber: heat.heatNumber,
                  finalLevel: maxLevel.finalLevel,
                },
              });
              competitorsAdded++;
              totalEntered++;
              i++;
            }
          }

          heatsUsed = heats.filter(async (h: any) => {
            const count = await tx.compEvent.count({ where: { heatId: h.id } });
            return count > 0;
          }).length;

          breakdown.push({
            event: `${ev.age} ${ev.sex}`,
            competitorsAdded,
            heatsUsed: heats.length,
          });
        }
      });

      res.json({
        eventsProcessed: events.length,
        competitorsEntered: totalEntered,
        breakdown,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Copy competitors between events ─────────────────────────────────────────

const copyCompetitorsSchema = z.object({
  sourceEventId: z.number().int(),
  targetEventId: z.number().int(),
  finalLevel: z.number().int().optional(),
});

router.post(
  '/:carnivalId/events/copy-competitors',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { sourceEventId, targetEventId, finalLevel: fl } = copyCompetitorsSchema.parse(req.body);

      // Verify both events belong to this carnival
      const [sourceEvent, targetEvent] = await Promise.all([
        (prisma as any).event.findFirst({ where: { id: sourceEventId, eventType: { carnivalId } } }),
        (prisma as any).event.findFirst({
          where: { id: targetEventId, eventType: { carnivalId } },
          include: { eventType: { include: { finalLevels: { orderBy: { finalLevel: 'asc' } } } } },
        }),
      ]);

      if (!sourceEvent) throw new NotFoundError('Event', sourceEventId);
      if (!targetEvent) throw new NotFoundError('Event', targetEventId);

      const targetFinalLevels: any[] = targetEvent.eventType.finalLevels;
      if (targetFinalLevels.length === 0) {
        throw new ValidationError('Target event has no final levels configured');
      }
      const maxLevel = targetFinalLevels[targetFinalLevels.length - 1];

      // Get source competitors
      const sourceCompEvents = await (prisma as any).compEvent.findMany({
        where: {
          eventId: sourceEventId,
          ...(fl !== undefined ? { finalLevel: fl } : {}),
        },
        distinct: ['competitorId'],
      });

      const targetHeats = await (prisma as any).heat.findMany({
        where: { eventId: targetEventId, finalLevel: maxLevel.finalLevel },
        orderBy: { heatNumber: 'asc' },
      });

      if (targetHeats.length === 0) {
        throw new ValidationError('No heats found in target event');
      }

      let copied = 0;
      await (prisma as any).$transaction(async (tx: any) => {
        let i = 0;
        for (const ce of sourceCompEvents) {
          const exists = await tx.compEvent.findFirst({
            where: { competitorId: ce.competitorId, eventId: targetEventId },
          });
          if (exists) continue;

          const heat = targetHeats[i % targetHeats.length];
          await tx.compEvent.create({
            data: {
              competitorId: ce.competitorId,
              eventId: targetEventId,
              heatId: heat.id,
              heatNumber: heat.heatNumber,
              finalLevel: maxLevel.finalLevel,
            },
          });
          copied++;
          i++;
        }
      });

      res.json({ copied });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Event order ──────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/event-order',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      // Default sort: event_number, description, age
      const sortFields = [
        req.query.sort as string ?? 'event_number',
        req.query.sort2 as string ?? 'description',
        req.query.sort3 as string ?? 'age',
      ];

      const heats = await (prisma as any).$queryRaw<any[]>`
        SELECT
          h.id as "heatId",
          h.event_number as "eventNumber",
          h.event_time as "eventTime",
          et.description as "eventTypeDescription",
          e.sex,
          e.age,
          h.final_level as "finalLevel",
          h.heat_number as "heatNumber",
          h.status,
          h.completed
        FROM heats h
        JOIN events e ON h.event_id = e.id
        JOIN event_types et ON e.event_type_id = et.id
        WHERE et.carnival_id = ${carnivalId}
          AND et.include = true
          AND e.include = true
        ORDER BY h.event_number NULLS LAST, et.description, e.age, h.final_level, h.heat_number
      `;

      const result = heats.map((h: any) => ({
        heatId: h.heatId,
        eventNumber: h.eventNumber,
        eventTime: h.eventTime,
        eventTypeDescription: h.eventTypeDescription,
        sex: h.sex,
        age: h.age,
        finalLevel: h.finalLevel,
        finalLevelLabel: FINAL_LEVEL_LABELS[h.finalLevel] ?? `Round ${h.finalLevel}`,
        heatNumber: h.heatNumber,
        status: h.status,
        completed: h.completed,
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const eventOrderUpdateSchema = z.object({
  updates: z.array(
    z.object({
      heatId: z.number().int(),
      eventNumber: z.number().int().nullable().optional(),
      eventTime: z.string().max(10).nullable().optional(),
    }),
  ),
});

router.put(
  '/:carnivalId/event-order',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { updates } = eventOrderUpdateSchema.parse(req.body);

      await (prisma as any).$transaction(async (tx: any) => {
        for (const u of updates) {
          // Verify heat belongs to carnival
          const heat = await tx.heat.findFirst({
            where: { id: u.heatId, event: { eventType: { carnivalId } } },
          });
          if (!heat) continue;

          await tx.heat.update({
            where: { id: u.heatId },
            data: {
              ...(u.eventNumber !== undefined ? { eventNumber: u.eventNumber } : {}),
              ...(u.eventTime !== undefined ? { eventTime: u.eventTime } : {}),
            },
          });
        }
      });

      res.json({ updated: updates.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Auto-number events ───────────────────────────────────────────────────────

const autoNumberSchema = z.object({
  sortBy: z.array(z.string()).default(['description', 'age', 'final_level', 'heat_number']),
  startNumber: z.number().int().min(1).default(1),
});

router.post(
  '/:carnivalId/event-order/auto-number',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { startNumber } = autoNumberSchema.parse(req.body);

      // Get all included heats ordered by description, age, final_level, heat_number
      const heats = await (prisma as any).$queryRaw<any[]>`
        SELECT h.id
        FROM heats h
        JOIN events e ON h.event_id = e.id
        JOIN event_types et ON e.event_type_id = et.id
        WHERE et.carnival_id = ${carnivalId}
          AND et.include = true
          AND e.include = true
        ORDER BY et.description, e.age, h.final_level, h.heat_number
      `;

      let num = startNumber;
      await (prisma as any).$transaction(async (tx: any) => {
        for (const h of heats) {
          await tx.heat.update({
            where: { id: h.id },
            data: { eventNumber: num++ },
          });
        }
      });

      res.json({ numberedCount: heats.length, startNumber, endNumber: num - 1 });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
