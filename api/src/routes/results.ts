import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errors';
import { parseResult } from '../services/resultParser';
import {
  calculatePlaces,
  detectRecords,
  acceptRecord,
  recalcAllPoints,
  lookupPoints,
  RecordBreaker,
} from '../services/scoring';
import { fullName } from '../services/competitors';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FINAL_LEVEL_LABELS: Record<number, string> = {
  0: 'Grand Final', 1: 'Semi Final', 2: 'Quarter Final',
  3: 'Round A', 4: 'Round B', 5: 'Round C', 6: 'Round D', 7: 'Round E',
};

async function verifyHeatInCarnival(heatId: number, carnivalId: number): Promise<any> {
  const heat = await (prisma as any).heat.findFirst({
    where: { id: heatId, event: { eventType: { carnivalId } } },
    include: {
      event: { include: { eventType: true } },
      _count: { select: { compEvents: true } },
    },
  });
  if (!heat) throw new NotFoundError('Heat', heatId);
  return heat;
}

async function verifyEventInCarnival(eventId: number, carnivalId: number): Promise<any> {
  const event = await (prisma as any).event.findFirst({
    where: { id: eventId, eventType: { carnivalId } },
    include: { eventType: true },
  });
  if (!event) throw new NotFoundError('Event', eventId);
  return event;
}

// ─── PATCH comp-event result ──────────────────────────────────────────────────

const patchCompEventSchema = z.object({
  result: z.string().optional(),
  place: z.number().int().optional(),
  memo: z.string().max(100).nullable().optional(),
});

router.patch(
  '/:carnivalId/comp-events/:compEventId',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const compEventId = parseInt(req.params.compEventId, 10);
      if (isNaN(compEventId)) throw new NotFoundError('CompEvent', req.params.compEventId);

      const ce = await (prisma as any).compEvent.findFirst({
        where: { id: compEventId, event: { eventType: { carnivalId } } },
        include: { event: { include: { eventType: true } } },
      });
      if (!ce) throw new NotFoundError('CompEvent', compEventId);

      const body = patchCompEventSchema.parse(req.body);
      const updateData: any = {};

      if (body.result !== undefined) {
        if (body.result === '') {
          updateData.result = null;
          updateData.numericResult = 0;
          updateData.place = 0;
        } else {
          const parsed = parseResult(body.result, ce.event.eventType.units);
          if (!parsed.success) throw new ValidationError(parsed.error);
          updateData.result = parsed.formatted;
          updateData.numericResult = parsed.numeric;
        }
      }

      if (body.place !== undefined && body.result !== '') {
        const scaleName = ce.heatId
          ? (await (prisma as any).heat.findUnique({ where: { id: ce.heatId } }))?.pointScale
          : null;
        if (scaleName) {
          updateData.points = await lookupPoints(carnivalId, scaleName, body.place);
        }
        updateData.place = body.place;
      }

      if (body.memo !== undefined) {
        updateData.memo = body.memo;
      }

      const updated = await (prisma as any).compEvent.update({
        where: { id: compEventId },
        data: updateData,
        include: { competitor: { include: { house: { select: { code: true } } } } },
      });

      res.json({
        id: updated.id,
        competitorId: updated.competitorId,
        competitorFullName: fullName(updated.competitor.surname, updated.competitor.givenName),
        houseCode: updated.competitor.house?.code ?? updated.competitor.houseCode,
        eventId: updated.eventId,
        heatId: updated.heatId,
        heatNumber: updated.heatNumber,
        finalLevel: updated.finalLevel,
        lane: updated.lane,
        place: updated.place,
        result: updated.result,
        numericResult: updated.numericResult,
        points: updated.points,
        memo: updated.memo,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST calculate-places ────────────────────────────────────────────────────

router.post(
  '/:carnivalId/heats/:heatId/calculate-places',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);

      if (heat.dontOverridePlaces) {
        throw new ConflictError('dont_override_places is set on this heat');
      }

      const result = await calculatePlaces(heatId, heat.event.eventType.placesAcrossAllHeats);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST check-records ───────────────────────────────────────────────────────

router.post(
  '/:carnivalId/heats/:heatId/check-records',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      await verifyHeatInCarnival(heatId, carnivalId);
      const breakers = await detectRecords(heatId);
      res.json(breakers);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST accept-record ───────────────────────────────────────────────────────

const acceptRecordSchema = z.object({
  competitorId: z.number().int(),
});

router.post(
  '/:carnivalId/heats/:heatId/accept-record',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);
      const { competitorId } = acceptRecordSchema.parse(req.body);

      const ce = await (prisma as any).compEvent.findFirst({
        where: { heatId, competitorId },
        include: { competitor: { include: { house: { select: { code: true } } } } },
      });
      if (!ce) throw new NotFoundError('CompEvent');

      const breakerInfo: RecordBreaker = {
        competitorId,
        fullName: fullName(ce.competitor.surname, ce.competitor.givenName),
        numericResult: ce.numericResult,
        formattedResult: ce.result ?? '',
        eventId: heat.eventId,
        houseCode: ce.competitor.house?.code ?? ce.competitor.houseCode ?? '',
      };

      await acceptRecord(heat.eventId, breakerInfo);
      res.json({ accepted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST results-by-place ────────────────────────────────────────────────────

const resultsByPlaceSchema = z.array(
  z.object({
    place: z.number().int(),
    lane: z.number().int(),
    result: z.string(),
  }),
);

router.post(
  '/:carnivalId/heats/:heatId/results-by-place',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);
      const units = heat.event.eventType.units;
      const items = resultsByPlaceSchema.parse(req.body);

      let resultsEntered = 0;

      for (const item of items) {
        const ce = await (prisma as any).compEvent.findFirst({
          where: { heatId, lane: item.lane },
        });
        if (!ce) continue;

        const parsed = parseResult(item.result, units);
        if (!parsed.success) continue;

        await (prisma as any).compEvent.update({
          where: { id: ce.id },
          data: {
            result: parsed.formatted,
            numericResult: parsed.numeric,
            place: item.place,
          },
        });
        resultsEntered++;
      }

      // Check if all comp_events have non-zero place
      const allCEs = await (prisma as any).compEvent.findMany({ where: { heatId } });
      const allPlaced = allCEs.length > 0 && allCEs.every((ce: any) => ce.place !== 0);
      if (allPlaced) {
        await (prisma as any).heat.update({ where: { id: heatId }, data: { completed: true } });
      }

      const recordBreakers = await detectRecords(heatId);

      res.json({ resultsEntered, heatCompleted: allPlaced, recordBreakers });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST complete heat ───────────────────────────────────────────────────────

router.post(
  '/:carnivalId/heats/:heatId/complete',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const heatId = parseInt(req.params.heatId, 10);
      if (isNaN(heatId)) throw new NotFoundError('Heat', req.params.heatId);

      const heat = await verifyHeatInCarnival(heatId, carnivalId);

      if (!heat.dontOverridePlaces) {
        await calculatePlaces(heatId, heat.event.eventType.placesAcrossAllHeats);
      }

      const recordBreakers = await detectRecords(heatId);

      await (prisma as any).heat.update({ where: { id: heatId }, data: { completed: true } });

      // SetCurrentFinal algorithm
      const allHeatsAtLevel = await (prisma as any).heat.findMany({
        where: { eventId: heat.eventId, finalLevel: heat.finalLevel },
      });
      const allCompleted = allHeatsAtLevel.every((h: any) => h.completed || h.id === heatId);

      if (allCompleted) {
        await (prisma as any).heat.updateMany({
          where: { eventId: heat.eventId, finalLevel: heat.finalLevel },
          data: { status: 'completed' },
        });

        // If not grand final, activate next lower level
        if (heat.finalLevel > 0) {
          const nextLevel = heat.finalLevel - 1;
          await (prisma as any).heat.updateMany({
            where: { eventId: heat.eventId, finalLevel: nextLevel },
            data: { status: 'active' },
          });
        }
      } else {
        await (prisma as any).heat.update({
          where: { id: heatId },
          data: { status: 'active' },
        });
      }

      res.json({ heatCompleted: true, recordBreakers });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Point Scales ─────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/point-scales',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      const scales = await (prisma as any).pointScale.findMany({
        where: { carnivalId },
        include: { entries: { orderBy: { place: 'asc' } } },
      });

      const result = await Promise.all(
        scales.map(async (s: any) => {
          const heatCount = await (prisma as any).heat.count({
            where: { pointScale: s.name, event: { eventType: { carnivalId } } },
          });
          return {
            carnivalId: s.carnivalId,
            name: s.name,
            entries: s.entries.map((e: any) => ({ place: e.place, points: e.points })),
            usedByHeatCount: heatCount,
          };
        }),
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

const createPointScaleSchema = z.object({
  name: z.string().min(1).max(10),
});

router.post(
  '/:carnivalId/point-scales',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { name } = createPointScaleSchema.parse(req.body);

      const existing = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name } },
      });
      if (existing) throw new ConflictError(`Point scale '${name}' already exists`);

      const scale = await (prisma as any).pointScale.create({
        data: { carnivalId, name },
        include: { entries: true },
      });

      res.status(201).json({ carnivalId: scale.carnivalId, name: scale.name, entries: [], usedByHeatCount: 0 });
    } catch (err) {
      next(err);
    }
  },
);

const updatePointScaleSchema = z.object({
  name: z.string().min(1).max(10),
});

router.patch(
  '/:carnivalId/point-scales/:name',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const oldName = req.params.name;
      const { name: newName } = updatePointScaleSchema.parse(req.body);

      const existing = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name: oldName } },
      });
      if (!existing) throw new NotFoundError('PointScale', oldName);

      if (newName !== oldName) {
        const conflict = await (prisma as any).pointScale.findUnique({
          where: { carnivalId_name: { carnivalId, name: newName } },
        });
        if (conflict) throw new ConflictError(`Point scale '${newName}' already exists`);
      }

      // Update in transaction: rename scale and update heats
      await (prisma as any).$transaction(async (tx: any) => {
        // Update heats referencing old name
        await tx.heat.updateMany({
          where: { pointScale: oldName, event: { eventType: { carnivalId } } },
          data: { pointScale: newName },
        });

        // Rename the scale (delete + recreate due to composite PK)
        const entries = await tx.pointScaleEntry.findMany({
          where: { carnivalId, scaleName: oldName },
        });
        await tx.pointScaleEntry.deleteMany({ where: { carnivalId, scaleName: oldName } });
        await tx.pointScale.delete({ where: { carnivalId_name: { carnivalId, name: oldName } } });
        await tx.pointScale.create({ data: { carnivalId, name: newName } });
        for (const entry of entries) {
          await tx.pointScaleEntry.create({
            data: { carnivalId, scaleName: newName, place: entry.place, points: entry.points },
          });
        }
      });

      const updated = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name: newName } },
        include: { entries: { orderBy: { place: 'asc' } } },
      });

      res.json({
        carnivalId: updated.carnivalId,
        name: updated.name,
        entries: updated.entries.map((e: any) => ({ place: e.place, points: e.points })),
      });
    } catch (err) {
      next(err);
    }
  },
);

const putEntriesSchema = z.array(
  z.object({
    place: z.number().int().min(1),
    points: z.number(),
  }),
);

router.put(
  '/:carnivalId/point-scales/:name/entries',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const scaleName = req.params.name;

      const scale = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name: scaleName } },
      });
      if (!scale) throw new NotFoundError('PointScale', scaleName);

      const entries = putEntriesSchema.parse(req.body);

      await (prisma as any).$transaction(async (tx: any) => {
        await tx.pointScaleEntry.deleteMany({ where: { carnivalId, scaleName } });
        for (const entry of entries) {
          await tx.pointScaleEntry.create({
            data: { carnivalId, scaleName, place: entry.place, points: entry.points },
          });
        }
      });

      res.json({ entriesSet: entries.length });
    } catch (err) {
      next(err);
    }
  },
);

const allocateDefaultsSchema = z.object({
  numPlaces: z.number().int().min(1),
  pointsPerPlace: z.union([z.number(), z.array(z.number())]),
});

router.post(
  '/:carnivalId/point-scales/:name/allocate-defaults',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const scaleName = req.params.name;

      const scale = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name: scaleName } },
      });
      if (!scale) throw new NotFoundError('PointScale', scaleName);

      const { numPlaces, pointsPerPlace } = allocateDefaultsSchema.parse(req.body);

      // Build points array
      let pointsArray: number[];
      if (Array.isArray(pointsPerPlace)) {
        pointsArray = pointsPerPlace;
      } else {
        pointsArray = Array.from({ length: numPlaces }, (_, i) => pointsPerPlace);
      }

      // Get existing entries to avoid duplicates
      const existing = await (prisma as any).pointScaleEntry.findMany({
        where: { carnivalId, scaleName },
        select: { place: true },
      });
      const existingPlaces = new Set(existing.map((e: any) => e.place));

      let created = 0;
      for (let place = 1; place <= numPlaces; place++) {
        if (!existingPlaces.has(place)) {
          const points = pointsArray[place - 1] ?? 0;
          await (prisma as any).pointScaleEntry.create({
            data: { carnivalId, scaleName, place, points },
          });
          created++;
        }
      }

      res.json({ entriesCreated: created });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:carnivalId/point-scales/:name',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const scaleName = req.params.name;

      const scale = await (prisma as any).pointScale.findUnique({
        where: { carnivalId_name: { carnivalId, name: scaleName } },
      });
      if (!scale) throw new NotFoundError('PointScale', scaleName);

      const heatCount = await (prisma as any).heat.count({
        where: { pointScale: scaleName, event: { eventType: { carnivalId } } },
      });
      if (heatCount > 0) {
        throw new ConflictError(`Point scale is in use by ${heatCount} heat(s)`);
      }

      await (prisma as any).pointScale.delete({
        where: { carnivalId_name: { carnivalId, name: scaleName } },
      });

      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Recalculate points ───────────────────────────────────────────────────────

router.post(
  '/:carnivalId/recalculate-points',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      if (req.query.confirm !== 'true') {
        throw new ValidationError('confirm=true required');
      }

      const result = await recalcAllPoints(carnivalId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Event Records ────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/events/:eventId/records',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);

      const event = await verifyEventInCarnival(eventId, carnivalId);
      const { isAscUnit } = await import('../services/resultParser');
      const isAsc = isAscUnit(event.eventType.units);

      const records = await (prisma as any).record.findMany({
        where: { eventId },
        orderBy: { numericResult: isAsc ? 'asc' : 'desc' },
      });

      res.json(
        records.map((r: any) => ({
          id: r.id,
          eventId: r.eventId,
          surname: r.surname,
          givenName: r.givenName,
          houseCode: r.houseCode,
          date: r.date,
          result: r.result,
          numericResult: r.numericResult,
          comments: r.comments,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

const createRecordSchema = z.object({
  surname: z.string().min(1).max(30),
  givenName: z.string().min(1).max(30),
  houseCode: z.string().max(10).nullable().optional(),
  date: z.string(),
  result: z.string(),
  comments: z.string().max(100).nullable().optional(),
});

router.post(
  '/:carnivalId/events/:eventId/records',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);

      const event = await verifyEventInCarnival(eventId, carnivalId);
      const body = createRecordSchema.parse(req.body);

      const parsed = parseResult(body.result, event.eventType.units);
      if (!parsed.success) throw new ValidationError(parsed.error);

      const record = await (prisma as any).record.create({
        data: {
          eventId,
          surname: body.surname,
          givenName: body.givenName,
          houseCode: body.houseCode ?? null,
          date: new Date(body.date),
          result: parsed.formatted,
          numericResult: parsed.numeric,
          comments: body.comments ?? null,
        },
      });

      // Check if this beats existing event record
      const { isAscUnit } = await import('../services/resultParser');
      const isAsc = isAscUnit(event.eventType.units);
      const existing: number | null = event.numericRecord;
      const isBetter =
        existing === null ||
        (isAsc ? parsed.numeric < existing : parsed.numeric > existing);

      if (isBetter) {
        let recordHouseId: number | null = null;
        if (body.houseCode) {
          const house = await (prisma as any).house.findFirst({
            where: { carnivalId, code: body.houseCode },
          });
          recordHouseId = house?.id ?? null;
        }
        await (prisma as any).event.update({
          where: { id: eventId },
          data: {
            record: parsed.formatted,
            numericRecord: parsed.numeric,
            recordName: fullName(body.surname, body.givenName),
            recordHouseId,
          },
        });
      }

      res.status(201).json({
        id: record.id,
        eventId: record.eventId,
        surname: record.surname,
        givenName: record.givenName,
        houseCode: record.houseCode,
        date: record.date,
        result: record.result,
        numericResult: record.numericResult,
        comments: record.comments,
      });
    } catch (err) {
      next(err);
    }
  },
);

const updateRecordSchema = z.object({
  surname: z.string().min(1).max(30).optional(),
  givenName: z.string().min(1).max(30).optional(),
  houseCode: z.string().max(10).nullable().optional(),
  date: z.string().optional(),
  result: z.string().optional(),
  comments: z.string().max(100).nullable().optional(),
});

router.patch(
  '/:carnivalId/events/:eventId/records/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      const recordId = parseInt(req.params.id, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);
      if (isNaN(recordId)) throw new NotFoundError('Record', req.params.id);

      const event = await verifyEventInCarnival(eventId, carnivalId);
      const existing = await (prisma as any).record.findFirst({ where: { id: recordId, eventId } });
      if (!existing) throw new NotFoundError('Record', recordId);

      const body = updateRecordSchema.parse(req.body);
      const updateData: any = {};

      if (body.surname !== undefined) updateData.surname = body.surname;
      if (body.givenName !== undefined) updateData.givenName = body.givenName;
      if (body.houseCode !== undefined) updateData.houseCode = body.houseCode;
      if (body.date !== undefined) updateData.date = new Date(body.date);
      if (body.comments !== undefined) updateData.comments = body.comments;

      if (body.result !== undefined) {
        const parsed = parseResult(body.result, event.eventType.units);
        if (!parsed.success) throw new ValidationError(parsed.error);
        updateData.result = parsed.formatted;
        updateData.numericResult = parsed.numeric;
      }

      const updated = await (prisma as any).record.update({
        where: { id: recordId },
        data: updateData,
      });

      res.json({
        id: updated.id,
        eventId: updated.eventId,
        surname: updated.surname,
        givenName: updated.givenName,
        houseCode: updated.houseCode,
        date: updated.date,
        result: updated.result,
        numericResult: updated.numericResult,
        comments: updated.comments,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:carnivalId/events/:eventId/records/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      const recordId = parseInt(req.params.id, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);
      if (isNaN(recordId)) throw new NotFoundError('Record', req.params.id);

      await verifyEventInCarnival(eventId, carnivalId);
      const existing = await (prisma as any).record.findFirst({ where: { id: recordId, eventId } });
      if (!existing) throw new NotFoundError('Record', recordId);

      await (prisma as any).record.delete({ where: { id: recordId } });

      // Recalculate event record from remaining records
      const { isAscUnit } = await import('../services/resultParser');
      const event = await (prisma as any).event.findUnique({
        where: { id: eventId },
        include: { eventType: true },
      });
      const isAsc = isAscUnit(event.eventType.units);

      const remaining = await (prisma as any).record.findMany({
        where: { eventId },
        orderBy: { numericResult: isAsc ? 'asc' : 'desc' },
      });

      if (remaining.length === 0) {
        await (prisma as any).event.update({
          where: { id: eventId },
          data: { record: null, numericRecord: null, recordName: null, recordHouseId: null },
        });
      } else {
        const best = remaining[0];
        let recordHouseId: number | null = null;
        if (best.houseCode) {
          const house = await (prisma as any).house.findFirst({
            where: { carnivalId, code: best.houseCode },
          });
          recordHouseId = house?.id ?? null;
        }
        await (prisma as any).event.update({
          where: { id: eventId },
          data: {
            record: best.result,
            numericRecord: best.numericResult,
            recordName: fullName(best.surname, best.givenName),
            recordHouseId,
          },
        });
      }

      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Record history ───────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/events/:eventId/records/history',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const eventId = parseInt(req.params.eventId, 10);
      if (isNaN(eventId)) throw new NotFoundError('Event', req.params.eventId);

      const event = await verifyEventInCarnival(eventId, carnivalId);
      const records = await (prisma as any).record.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
      });

      res.json(
        records.map((r: any) => ({
          id: r.id,
          eventId: r.eventId,
          surname: r.surname,
          givenName: r.givenName,
          houseCode: r.houseCode,
          date: r.date,
          result: r.result,
          numericResult: r.numericResult,
          comments: r.comments,
          isCurrent:
            r.numericResult === event.numericRecord &&
            fullName(r.surname, r.givenName) === event.recordName,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

export default router;
