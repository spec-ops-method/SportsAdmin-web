import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errors';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const FINAL_LEVEL_LABELS: Record<number, string> = {
  0: 'Grand Final', 1: 'Semi Final', 2: 'Quarter Final',
  3: 'Round A', 4: 'Round B', 5: 'Round C', 6: 'Round D', 7: 'Round E',
};

const UNITS_DISPLAY: Record<string, string> = {
  Seconds: 'Secs', Minutes: 'Mins', Hours: 'Hrs',
  Meters: 'm', Kilometers: 'Km', Points: 'Pts',
};

const VALID_UNITS = Object.keys(UNITS_DISPLAY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFinalLevel(fl: any) {
  return {
    eventTypeId: fl.eventTypeId,
    finalLevel: fl.finalLevel,
    label: FINAL_LEVEL_LABELS[fl.finalLevel] ?? `Round ${fl.finalLevel}`,
    numHeats: fl.numHeats,
    pointScale: fl.pointScale,
    promotionType: fl.promotionType,
    useTimes: fl.useTimes,
    promoteCount: fl.promoteCount,
    effectsRecords: fl.effectsRecords,
  };
}

async function formatEventType(et: any, includeDivisionsAndLevels = false) {
  const [divisionCount, heatCount] = await Promise.all([
    prisma.event.count({ where: { eventTypeId: et.id } }),
    (prisma as any).$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM heats h
      JOIN events e ON h.event_id = e.id
      WHERE e.event_type_id = ${et.id}
    `,
  ]);

  const base = {
    id: et.id,
    carnivalId: et.carnivalId,
    description: et.description,
    units: et.units,
    unitsDisplay: UNITS_DISPLAY[et.units] ?? et.units,
    laneCount: et.laneCount,
    reportTypeId: et.reportTypeId,
    include: et.include,
    flag: et.flag,
    entrantCount: et.entrantCount,
    placesAcrossAllHeats: et.placesAcrossAllHeats,
    meetManagerEvent: et.meetManagerEvent,
    divisionCount,
    heatCount: Number((heatCount as any)[0].count),
  };

  if (!includeDivisionsAndLevels) return base;

  const [events, finalLevels] = await Promise.all([
    (prisma as any).event.findMany({
      where: { eventTypeId: et.id },
      include: { recordHouse: { select: { code: true } } },
      orderBy: [{ sex: 'asc' }, { age: 'asc' }],
    }),
    (prisma as any).finalLevel.findMany({
      where: { eventTypeId: et.id },
      orderBy: { finalLevel: 'asc' },
    }),
  ]);

  const divisions = await Promise.all(
    events.map(async (ev: any) => {
      const hc = await prisma.heat.count({ where: { eventId: ev.id } });
      return {
        id: ev.id,
        eventTypeId: ev.eventTypeId,
        sex: ev.sex,
        age: ev.age,
        include: ev.include,
        record: ev.record,
        numericRecord: ev.numericRecord,
        recordName: ev.recordName,
        recordHouseId: ev.recordHouseId,
        recordHouseCode: ev.recordHouse?.code ?? null,
        heatCount: hc,
      };
    }),
  );

  return {
    ...base,
    divisions,
    finalLevels: finalLevels.map(formatFinalLevel),
  };
}

async function generateLaneTemplates(tx: any, eventTypeId: number, laneCount: number) {
  await tx.laneTemplate.deleteMany({ where: { eventTypeId } });
  if (laneCount > 0) {
    await tx.laneTemplate.createMany({
      data: Array.from({ length: laneCount }, (_, i) => ({
        eventTypeId,
        laneNumber: i + 1,
      })),
    });
  }
}

// ─── List event types ─────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/event-types',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const includeOnly = req.query.include_only === 'true';

      const eventTypes = await (prisma as any).eventType.findMany({
        where: { carnivalId, ...(includeOnly ? { include: true } : {}) },
        orderBy: { description: 'asc' },
      });

      const result = await Promise.all(eventTypes.map((et: any) => formatEventType(et)));
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Create event type ────────────────────────────────────────────────────────

const createEventTypeSchema = z.object({
  description: z.string().trim().min(1, 'Event type description is required').max(30),
  units: z.string(),
  laneCount: z.number().int().min(0).default(0),
  reportTypeId: z.number().int().nullable().optional(),
  include: z.boolean().default(true),
  entrantCount: z.number().int().min(1).default(1),
  placesAcrossAllHeats: z.boolean().default(false),
  meetManagerEvent: z.string().max(10).nullable().optional(),
});

router.post(
  '/:carnivalId/event-types',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const body = createEventTypeSchema.parse(req.body);

      if (!VALID_UNITS.includes(body.units)) {
        throw new ValidationError('Invalid unit code');
      }

      const existing = await (prisma as any).eventType.findFirst({
        where: {
          carnivalId,
          description: { equals: body.description, mode: 'insensitive' },
        },
      });
      if (existing) throw new ConflictError('An event type with this description already exists');

      const eventType = await (prisma as any).$transaction(async (tx: any) => {
        const et = await tx.eventType.create({
          data: { ...body, carnivalId },
        });
        if (body.laneCount > 0) {
          await generateLaneTemplates(tx, et.id, body.laneCount);
        }
        return et;
      });

      const formatted = await formatEventType(eventType);
      res.status(201).json(formatted);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get event type detail ────────────────────────────────────────────────────

router.get(
  '/:carnivalId/event-types/:id',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({
        where: { id, carnivalId },
      });
      if (!et) throw new NotFoundError('EventType', id);

      const formatted = await formatEventType(et, true);
      res.json(formatted);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update event type ────────────────────────────────────────────────────────

const updateEventTypeSchema = z.object({
  description: z.string().trim().min(1).max(30).optional(),
  units: z.string().optional(),
  laneCount: z.number().int().min(0).optional(),
  reportTypeId: z.number().int().nullable().optional(),
  include: z.boolean().optional(),
  flag: z.boolean().optional(),
  entrantCount: z.number().int().min(1).optional(),
  placesAcrossAllHeats: z.boolean().optional(),
  meetManagerEvent: z.string().max(10).nullable().optional(),
});

router.patch(
  '/:carnivalId/event-types/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const body = updateEventTypeSchema.parse(req.body);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      if (body.units && !VALID_UNITS.includes(body.units)) {
        throw new ValidationError('Invalid unit code');
      }

      if (body.description && body.description !== et.description) {
        const conflict = await (prisma as any).eventType.findFirst({
          where: {
            carnivalId,
            description: { equals: body.description, mode: 'insensitive' },
            NOT: { id },
          },
        });
        if (conflict) throw new ConflictError('An event type with this description already exists');
      }

      const updated = await (prisma as any).$transaction(async (tx: any) => {
        const u = await tx.eventType.update({ where: { id }, data: body });
        if (body.laneCount !== undefined && body.laneCount !== et.laneCount) {
          await generateLaneTemplates(tx, id, body.laneCount);
        }
        return u;
      });

      const formatted = await formatEventType(updated);
      res.json(formatted);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Delete event type ────────────────────────────────────────────────────────

router.delete(
  '/:carnivalId/event-types/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Deletion requires confirm=true query parameter.');
      }
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      await (prisma as any).eventType.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Copy event type ──────────────────────────────────────────────────────────

const copyEventTypeSchema = z.object({
  description: z.string().trim().min(1).max(30),
});

router.post(
  '/:carnivalId/event-types/:id/copy',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const { description } = copyEventTypeSchema.parse(req.body);

      const source = await (prisma as any).eventType.findFirst({
        where: { id, carnivalId },
        include: {
          finalLevels: true,
          laneTemplates: true,
          lanePromoAllocs: true,
          events: { include: { heats: true } },
        },
      });
      if (!source) throw new NotFoundError('EventType', id);

      const conflict = await (prisma as any).eventType.findFirst({
        where: { carnivalId, description: { equals: description, mode: 'insensitive' } },
      });
      if (conflict) throw new ConflictError('An event type with this description already exists');

      const newEt = await (prisma as any).$transaction(async (tx: any) => {
        const { id: _id, carnivalId: _cid, createdAt: _ca, updatedAt: _ua,
          finalLevels, laneTemplates, lanePromoAllocs, events, ...etData } = source;

        const created = await tx.eventType.create({
          data: { ...etData, carnivalId, description },
        });

        // Copy final levels
        for (const fl of finalLevels) {
          const { eventTypeId: _etId, ...flData } = fl;
          await tx.finalLevel.create({ data: { ...flData, eventTypeId: created.id } });
        }

        // Copy lane templates
        for (const lt of laneTemplates) {
          const { eventTypeId: _etId, ...ltData } = lt;
          await tx.laneTemplate.create({ data: { ...ltData, eventTypeId: created.id } });
        }

        // Copy lane promo allocs
        for (const lpa of lanePromoAllocs) {
          const { eventTypeId: _etId, ...lpaData } = lpa;
          await tx.lanePromotionAllocation.create({ data: { ...lpaData, eventTypeId: created.id } });
        }

        // Copy events (clear record info)
        for (const ev of events) {
          const { id: _evId, eventTypeId: _etId, createdAt: _ca, updatedAt: _ua,
            heats, record: _r, numericRecord: _nr, recordName: _rn, recordHouseId: _rhId, ...evData } = ev;
          const newEv = await tx.event.create({
            data: { ...evData, eventTypeId: created.id },
          });

          // Copy heats (clear event_number/time, reset status)
          for (const h of heats) {
            const { id: _hId, eventId: _eId, createdAt: _hca, updatedAt: _hua,
              eventNumber: _en, eventTime: _et, ...hData } = h;
            await tx.heat.create({
              data: {
                ...hData,
                eventId: newEv.id,
                status: 'future',
                completed: false,
                eventNumber: null,
                eventTime: null,
              },
            });
          }
        }

        return tx.eventType.findUnique({ where: { id: created.id } });
      });

      const formatted = await formatEventType(newEt);
      res.status(201).json(formatted);
    } catch (err) {
      next(err);
    }
  },
);

// ─── List final levels ────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/event-types/:id/final-levels',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const levels = await (prisma as any).finalLevel.findMany({
        where: { eventTypeId: id },
        orderBy: { finalLevel: 'asc' },
      });

      res.json(levels.map(formatFinalLevel));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Replace all final levels ─────────────────────────────────────────────────

const finalLevelItemSchema = z.object({
  finalLevel: z.number().int().min(0),
  numHeats: z.number().int().min(1).max(999),
  pointScale: z.string().max(30).nullable().optional(),
  promotionType: z.enum(['NONE', 'Smooth', 'Staggered']).default('NONE'),
  useTimes: z.boolean().default(true),
  promoteCount: z.number().int().min(0).default(0),
  effectsRecords: z.boolean().default(true),
});

router.put(
  '/:carnivalId/event-types/:id/final-levels',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const levels = z.array(finalLevelItemSchema).parse(req.body);

      // Validate: level 0 must have NONE promotion
      const level0 = levels.find((l) => l.finalLevel === 0);
      if (level0 && level0.promotionType !== 'NONE') {
        throw new ValidationError('Grand Final (level 0) must have promotion type NONE');
      }

      // Validate contiguous from 0
      const sorted = [...levels].sort((a, b) => a.finalLevel - b.finalLevel);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].finalLevel !== i) {
          throw new ValidationError('Final levels must be contiguous starting from 0');
        }
      }

      await (prisma as any).$transaction(async (tx: any) => {
        await tx.finalLevel.deleteMany({ where: { eventTypeId: id } });
        await tx.finalLevel.createMany({
          data: levels.map((l) => ({ ...l, eventTypeId: id })),
        });
      });

      const updated = await (prisma as any).finalLevel.findMany({
        where: { eventTypeId: id },
        orderBy: { finalLevel: 'asc' },
      });

      res.json(updated.map(formatFinalLevel));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Generate heats ───────────────────────────────────────────────────────────

const generateHeatsSchema = z.object({
  clearExisting: z.boolean().default(true),
});

router.post(
  '/:carnivalId/event-types/:id/generate-heats',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const { clearExisting } = generateHeatsSchema.parse(req.body);

      const finalLevels = await (prisma as any).finalLevel.findMany({
        where: { eventTypeId: id },
        orderBy: { finalLevel: 'asc' },
      });
      if (finalLevels.length === 0) {
        throw new ValidationError('No final levels configured for this event type');
      }

      const events = await (prisma as any).event.findMany({
        where: { eventTypeId: id, include: true },
      });
      if (events.length === 0) {
        throw new ValidationError('No divisions (events) configured for this event type');
      }

      // Check for existing heats
      const existingHeatCount = await (prisma as any).$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM heats h
        JOIN events e ON h.event_id = e.id
        WHERE e.event_type_id = ${id}
      `;
      const hasExisting = Number(existingHeatCount[0].count) > 0;

      if (clearExisting && hasExisting && req.query.confirm !== 'true') {
        throw new ValidationError(
          'Existing heats will be cleared. Add confirm=true query parameter to proceed.',
        );
      }

      let heatsCreated = 0;
      let existingHeatsCleared = false;

      await (prisma as any).$transaction(async (tx: any) => {
        if (clearExisting && hasExisting) {
          // Delete comp_events and heats for this event type
          await tx.$executeRaw`
            DELETE FROM comp_events WHERE heat_id IN (
              SELECT h.id FROM heats h
              JOIN events e ON h.event_id = e.id
              WHERE e.event_type_id = ${id}
            )
          `;
          await tx.$executeRaw`
            DELETE FROM heats WHERE event_id IN (
              SELECT id FROM events WHERE event_type_id = ${id}
            )
          `;
          existingHeatsCleared = true;
        }

        // The highest final_level is the entry round (where competitors start)
        const maxLevel = finalLevels[finalLevels.length - 1];

        for (const ev of events) {
          for (let heatNum = 1; heatNum <= maxLevel.numHeats; heatNum++) {
            await tx.heat.create({
              data: {
                eventId: ev.id,
                heatNumber: heatNum,
                finalLevel: maxLevel.finalLevel,
                pointScale: maxLevel.pointScale ?? null,
                promotionType: maxLevel.promotionType,
                useTimes: maxLevel.useTimes,
                effectsRecords: maxLevel.effectsRecords,
                status: 'future',
                completed: false,
              },
            });
            heatsCreated++;
          }
        }
      });

      res.json({
        heatsCreated,
        eventsProcessed: events.length,
        existingHeatsCleared,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── List events (divisions) for an event type ────────────────────────────────

router.get(
  '/:carnivalId/event-types/:id/events',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const events = await (prisma as any).event.findMany({
        where: { eventTypeId: id },
        include: { recordHouse: { select: { code: true } } },
        orderBy: [{ sex: 'asc' }, { age: 'asc' }],
      });

      const result = await Promise.all(
        events.map(async (ev: any) => {
          const hc = await prisma.heat.count({ where: { eventId: ev.id } });
          return {
            id: ev.id,
            eventTypeId: ev.eventTypeId,
            sex: ev.sex,
            age: ev.age,
            include: ev.include,
            record: ev.record,
            numericRecord: ev.numericRecord,
            recordName: ev.recordName,
            recordHouseId: ev.recordHouseId,
            recordHouseCode: ev.recordHouse?.code ?? null,
            heatCount: hc,
          };
        }),
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Create event (division) ──────────────────────────────────────────────────

const createEventSchema = z.object({
  sex: z.string().length(1),
  age: z.string().max(10),
  include: z.boolean().default(true),
  record: z.string().max(20).nullable().optional(),
  numericRecord: z.number().nullable().optional(),
  recordName: z.string().max(60).nullable().optional(),
  recordHouseId: z.number().int().nullable().optional(),
});

router.post(
  '/:carnivalId/event-types/:id/events',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventTypeId = parseInt(req.params.id, 10);
      if (isNaN(eventTypeId)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id: eventTypeId, carnivalId } });
      if (!et) throw new NotFoundError('EventType', eventTypeId);

      const body = createEventSchema.parse(req.body);

      const validSexes = ['M', 'F', '-'];
      if (!validSexes.includes(body.sex)) {
        throw new ValidationError('Sex must be M, F, or -');
      }

      const existing = await (prisma as any).event.findFirst({
        where: { eventTypeId, sex: body.sex, age: body.age },
      });
      if (existing) throw new ConflictError('An event with this sex and age already exists');

      const ev = await (prisma as any).event.create({
        data: { ...body, eventTypeId },
        include: { recordHouse: { select: { code: true } } },
      });

      res.status(201).json({
        id: ev.id,
        eventTypeId: ev.eventTypeId,
        sex: ev.sex,
        age: ev.age,
        include: ev.include,
        record: ev.record,
        numericRecord: ev.numericRecord,
        recordName: ev.recordName,
        recordHouseId: ev.recordHouseId,
        recordHouseCode: ev.recordHouse?.code ?? null,
        heatCount: 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update event (division) ──────────────────────────────────────────────────

const updateEventSchema = z.object({
  sex: z.string().length(1).optional(),
  age: z.string().max(10).optional(),
  include: z.boolean().optional(),
  record: z.string().max(20).nullable().optional(),
  numericRecord: z.number().nullable().optional(),
  recordName: z.string().max(60).nullable().optional(),
  recordHouseId: z.number().int().nullable().optional(),
});

router.patch(
  '/:carnivalId/event-types/:eventTypeId/events/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventTypeId = parseInt(req.params.eventTypeId, 10);
      const id = parseInt(req.params.id, 10);
      if (isNaN(eventTypeId) || isNaN(id)) throw new NotFoundError('Event', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id: eventTypeId, carnivalId } });
      if (!et) throw new NotFoundError('EventType', eventTypeId);

      const ev = await (prisma as any).event.findFirst({ where: { id, eventTypeId } });
      if (!ev) throw new NotFoundError('Event', id);

      const body = updateEventSchema.parse(req.body);

      if (body.sex && !['M', 'F', '-'].includes(body.sex)) {
        throw new ValidationError('Sex must be M, F, or -');
      }

      if ((body.sex && body.sex !== ev.sex) || (body.age && body.age !== ev.age)) {
        const conflict = await (prisma as any).event.findFirst({
          where: {
            eventTypeId,
            sex: body.sex ?? ev.sex,
            age: body.age ?? ev.age,
            NOT: { id },
          },
        });
        if (conflict) throw new ConflictError('An event with this sex and age already exists');
      }

      const updated = await (prisma as any).event.update({
        where: { id },
        data: body,
        include: { recordHouse: { select: { code: true } } },
      });
      const hc = await prisma.heat.count({ where: { eventId: id } });

      res.json({
        id: updated.id,
        eventTypeId: updated.eventTypeId,
        sex: updated.sex,
        age: updated.age,
        include: updated.include,
        record: updated.record,
        numericRecord: updated.numericRecord,
        recordName: updated.recordName,
        recordHouseId: updated.recordHouseId,
        recordHouseCode: updated.recordHouse?.code ?? null,
        heatCount: hc,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Delete event (division) ──────────────────────────────────────────────────

router.delete(
  '/:carnivalId/event-types/:eventTypeId/events/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Deletion requires confirm=true query parameter.');
      }
      const carnivalId = req.carnivalId!;
      const eventTypeId = parseInt(req.params.eventTypeId, 10);
      const id = parseInt(req.params.id, 10);
      if (isNaN(eventTypeId) || isNaN(id)) throw new NotFoundError('Event', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id: eventTypeId, carnivalId } });
      if (!et) throw new NotFoundError('EventType', eventTypeId);

      const ev = await (prisma as any).event.findFirst({ where: { id, eventTypeId } });
      if (!ev) throw new NotFoundError('Event', id);

      await (prisma as any).event.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Lane templates ───────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/event-types/:id/lane-templates',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const templates = await (prisma as any).laneTemplate.findMany({
        where: { eventTypeId: id },
        orderBy: { laneNumber: 'asc' },
      });

      res.json(templates);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Lane promotion allocations ───────────────────────────────────────────────

router.get(
  '/:carnivalId/event-types/:id/lane-promotion-allocations',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const allocs = await (prisma as any).lanePromotionAllocation.findMany({
        where: { eventTypeId: id },
        orderBy: { place: 'asc' },
      });

      res.json(allocs);
    } catch (err) {
      next(err);
    }
  },
);

const lanePromoAllocSchema = z.object({
  allocations: z.array(
    z.object({
      place: z.number().int().min(1),
      lane: z.number().int().min(1),
    }),
  ),
});

router.put(
  '/:carnivalId/event-types/:id/lane-promotion-allocations',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) throw new NotFoundError('EventType', req.params.id);

      const et = await (prisma as any).eventType.findFirst({ where: { id, carnivalId } });
      if (!et) throw new NotFoundError('EventType', id);

      const { allocations } = lanePromoAllocSchema.parse(req.body);

      await (prisma as any).$transaction(async (tx: any) => {
        await tx.lanePromotionAllocation.deleteMany({ where: { eventTypeId: id } });
        await tx.lanePromotionAllocation.createMany({
          data: allocations.map((a) => ({ eventTypeId: id, place: a.place, lane: a.lane })),
        });
      });

      const updated = await (prisma as any).lanePromotionAllocation.findMany({
        where: { eventTypeId: id },
        orderBy: { place: 'asc' },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Carnival lanes ───────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/lanes',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const lanes = await (prisma as any).lane.findMany({
        where: { carnivalId },
        include: { house: { select: { id: true, code: true, name: true } } },
        orderBy: { laneNumber: 'asc' },
      });
      res.json(lanes);
    } catch (err) {
      next(err);
    }
  },
);

const setLanesSchema = z.object({
  lanes: z.array(
    z.object({
      laneNumber: z.number().int().min(1),
      houseId: z.number().int().nullable().optional(),
    }),
  ),
});

router.put(
  '/:carnivalId/lanes',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { lanes } = setLanesSchema.parse(req.body);

      await (prisma as any).$transaction(async (tx: any) => {
        await tx.lane.deleteMany({ where: { carnivalId } });
        await tx.lane.createMany({
          data: lanes.map((l) => ({
            carnivalId,
            laneNumber: l.laneNumber,
            houseId: l.houseId ?? null,
          })),
        });
      });

      const updated = await (prisma as any).lane.findMany({
        where: { carnivalId },
        include: { house: { select: { id: true, code: true, name: true } } },
        orderBy: { laneNumber: 'asc' },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
