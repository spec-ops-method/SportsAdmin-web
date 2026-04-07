import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import prisma from '../prisma/client';
import { authenticate, requireMinRole } from '../middleware/auth';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/errors';

const router = Router();

// All carnival routes require authentication
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  footer: 'Hosted by',
  openAge: 99,
  houseTypeId: 2,
  meetManagerTop: 3,
  alertToRecord: true,
  htmlExportEnabled: false,
  reportHead1: 'Lane',
  reportHead2: 'Time',
  publicAccess: false,
};

const carnivalWithSummary = async (id: number) => {
  const [carnival, competitorCount, eventCount, houseCount, eventTypeCount, heatsAgg] =
    await Promise.all([
      prisma.carnival.findUnique({ where: { id }, include: { settings: true } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM competitors WHERE carnival_id = ${id}`,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM events e
        JOIN event_types et ON e.event_type_id = et.id
        WHERE et.carnival_id = ${id}`,
      prisma.house.count({ where: { carnivalId: id } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM event_types WHERE carnival_id = ${id}`,
      prisma.$queryRaw<[{ total: bigint; completed: bigint }]>`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN h.completed = true THEN 1 ELSE 0 END) as completed
        FROM heats h
        JOIN events e ON h.event_id = e.id
        JOIN event_types et ON e.event_type_id = et.id
        WHERE et.carnival_id = ${id}`,
    ]);

  if (!carnival) return null;

  return {
    ...carnival,
    summary: {
      competitorCount: Number(competitorCount[0].count),
      houseCount,
      eventTypeCount: Number(eventTypeCount[0].count),
      eventCount: Number(eventCount[0].count),
      heatsCompleted: Number(heatsAgg[0].completed ?? 0),
      heatsTotal: Number(heatsAgg[0].total),
    },
  };
};

// ─── List ──────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Admins see all carnivals; others see only assigned ones
    const carnivals =
      req.user!.role === 'admin'
        ? await prisma.carnival.findMany({ orderBy: { createdAt: 'desc' } })
        : await prisma.carnival.findMany({
            where: { users: { some: { userId: req.user!.userId } } },
            orderBy: { createdAt: 'desc' },
          });

    // Attach counts — kept simple here; Phase 3+ will have competitors/events
    const withCounts = await Promise.all(
      carnivals.map(async (c: typeof carnivals[0]) => {
        const houseCount = await prisma.house.count({ where: { carnivalId: c.id } });
        return { ...c, competitorCount: 0, eventCount: 0, houseCount };
      }),
    );

    res.json(withCounts);
  } catch (err) {
    next(err);
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().trim().min(1, 'Carnival name is required').max(50),
});

router.post(
  '/',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = createSchema.parse(req.body);

      const existing = await prisma.carnival.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) throw new ConflictError('A carnival with this name already exists.');

      const carnival = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const c = await tx.carnival.create({ data: { name } });
        await tx.carnivalSettings.create({
          data: { carnivalId: c.id, title: name, ...DEFAULT_SETTINGS },
        });
        // Grant the creating user access to the new carnival (unless admin — already has access)
        if (req.user!.role !== 'admin') {
          await tx.userCarnival.create({
            data: { userId: req.user!.userId, carnivalId: c.id },
          });
        }
        return tx.carnival.findUnique({ where: { id: c.id }, include: { settings: true } });
      });

      res.status(201).json(carnival);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get ──────────────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await carnivalWithSummary(req.carnivalId!);
      if (!data) throw new NotFoundError('Carnival', req.carnivalId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update ───────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  settings: z
    .object({
      title: z.string().max(100).optional(),
      footer: z.string().max(100).nullable().optional(),
      openAge: z.number().int().min(0).max(999).optional(),
      houseTypeId: z.number().int().nullable().optional(),
      alertToRecord: z.boolean().optional(),
      reportHead1: z.string().max(50).optional(),
      reportHead2: z.string().max(50).optional(),
      meetManagerTeam: z.string().max(30).nullable().optional(),
      meetManagerCode: z.string().max(4).nullable().optional(),
      meetManagerTop: z.number().int().min(0).optional(),
      htmlExportEnabled: z.boolean().optional(),
      htmlReportHeader: z.string().max(50).nullable().optional(),
      publicAccess: z.boolean().optional(),
    })
    .optional(),
});

router.put(
  '/:carnivalId',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateSchema.parse(req.body);
      const id = req.carnivalId!;

      if (body.name) {
        const conflict = await prisma.carnival.findFirst({
          where: { name: { equals: body.name, mode: 'insensitive' }, NOT: { id } },
        });
        if (conflict) throw new ConflictError('A carnival with this name already exists.');
      }

      const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (body.name) {
          await tx.carnival.update({ where: { id }, data: { name: body.name } });
        }
        if (body.settings) {
          await tx.carnivalSettings.update({ where: { carnivalId: id }, data: body.settings });
        }
        return tx.carnival.findUnique({ where: { id }, include: { settings: true } });
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete(
  '/:carnivalId',
  requireCarnivalAccess,
  requireMinRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Deletion requires confirm=true query parameter.');
      }
      // CASCADE deletes handle all child data via FK relationships
      await prisma.carnival.delete({ where: { id: req.carnivalId! } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Copy ─────────────────────────────────────────────────────────────────────

const copySchema = z.object({
  name: z.string().trim().min(1).max(50),
});

router.post(
  '/:carnivalId/copy',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = copySchema.parse(req.body);
      const sourceId = req.carnivalId!;

      const conflict = await prisma.carnival.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (conflict) throw new ConflictError('A carnival with this name already exists.');

      // Load all source data up front
      const source = await prisma.carnival.findUnique({
        where: { id: sourceId },
        include: {
          settings: true,
          houses: { include: { pointsExtra: true } },
          eventTypes: {
            include: {
              finalLevels: true,
              laneTemplates: true,
              lanePromoAllocs: true,
              events: { include: { heats: true } },
            },
          },
          pointScales: { include: { entries: true } },
          lanes: true,
          competitorEventAges: true,
        },
      });
      if (!source) throw new NotFoundError('Carnival', sourceId);

      const newCarnival = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create new carnival
        const nc = await tx.carnival.create({ data: { name } });

        // Copy settings
        if (source.settings) {
          const { carnivalId: _c, title: _t, ...s } = source.settings;
          await tx.carnivalSettings.create({ data: { carnivalId: nc.id, title: name, ...s } });
        } else {
          await tx.carnivalSettings.create({
            data: { carnivalId: nc.id, title: name, ...DEFAULT_SETTINGS },
          });
        }

        // Copy houses — track old → new ID map
        const houseIdMap = new Map<number, number>();
        for (const house of source.houses) {
          const { id: _id, carnivalId: _c, pointsExtra, ...houseData } = house;
          const nh = await tx.house.create({ data: { ...houseData, carnivalId: nc.id } });
          houseIdMap.set(house.id, nh.id);
          for (const pe of pointsExtra) {
            const { id: _pe, houseId: _h, ...peData } = pe;
            await tx.housePointsExtra.create({ data: { ...peData, houseId: nh.id } });
          }
        }

        // Copy point scales
        for (const ps of source.pointScales) {
          const { carnivalId: _c, entries, ...psData } = ps;
          await tx.pointScale.create({ data: { ...psData, carnivalId: nc.id } });
          for (const entry of entries) {
            const { carnivalId: _c2, ...entryData } = entry;
            await tx.pointScaleEntry.create({ data: { ...entryData, carnivalId: nc.id } });
          }
        }

        // Copy event types — track old → new event type ID, event ID, etc.
        const eventTypeIdMap = new Map<number, number>();
        const eventIdMap = new Map<number, number>();

        for (const et of source.eventTypes) {
          const { id: _id, carnivalId: _c, finalLevels, laneTemplates, lanePromoAllocs, events, ...etData } = et;
          const net = await tx.eventType.create({ data: { ...etData, carnivalId: nc.id } });
          eventTypeIdMap.set(et.id, net.id);

          // Copy final levels
          for (const fl of finalLevels) {
            const { eventTypeId: _e, ...flData } = fl;
            await tx.finalLevel.create({ data: { ...flData, eventTypeId: net.id } });
          }

          // Copy lane templates
          for (const lt of laneTemplates) {
            const { eventTypeId: _e, ...ltData } = lt;
            await tx.laneTemplate.create({ data: { ...ltData, eventTypeId: net.id } });
          }

          // Copy lane promotion allocations
          for (const lpa of lanePromoAllocs) {
            const { eventTypeId: _e, ...lpaData } = lpa;
            await tx.lanePromotionAllocation.create({ data: { ...lpaData, eventTypeId: net.id } });
          }

          // Copy events (clear record data)
          for (const ev of events) {
            const { id: _id2, eventTypeId: _e2, recordHouseId: _rh, heats, ...evData } = ev;
            const nev = await tx.event.create({
              data: {
                ...evData,
                eventTypeId: net.id,
                record: null,
                numericRecord: null,
                recordName: null,
                recordHouseId: null,
              },
            });
            eventIdMap.set(ev.id, nev.id);

            // Copy heats — first-level heats get status=active; others get future
            for (const heat of heats) {
              const { id: _hid, eventId: _eid, ...heatData } = heat;
              const isFirstLevel = heat.finalLevel === 1;
              await tx.heat.create({
                data: {
                  ...heatData,
                  eventId: nev.id,
                  eventNumber: null,
                  eventTime: null,
                  completed: false,
                  status: isFirstLevel ? 'active' : 'future',
                },
              });
            }
          }
        }

        // Copy competitor_event_age mappings
        for (const cea of source.competitorEventAges) {
          const { carnivalId: _c, ...ceaData } = cea;
          await tx.competitorEventAge.create({ data: { ...ceaData, carnivalId: nc.id } });
        }

        // Copy lanes (house references remapped)
        for (const lane of source.lanes) {
          const { carnivalId: _c, houseId, ...laneData } = lane;
          const newHouseId = houseId ? houseIdMap.get(houseId) ?? null : null;
          await tx.lane.create({ data: { ...laneData, carnivalId: nc.id, houseId: newHouseId } });
        }

        // Grant access to the creating user
        if (req.user!.role !== 'admin') {
          await tx.userCarnival.create({
            data: { userId: req.user!.userId, carnivalId: nc.id },
          });
        }

        return tx.carnival.findUnique({ where: { id: nc.id } });
      });

      res.status(201).json({ id: newCarnival!.id, name: newCarnival!.name });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Export (Carnival Disk) ───────────────────────────────────────────────────

router.get(
  '/:carnivalId/export',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.carnivalId!;

      const [
        carnival,
        settings,
        houses,
        housePointsExtra,
        eventTypes,
        events,
        finalLevels,
        heats,
        laneTemplates,
        lanePromotionAllocs,
        lanes,
        pointScales,
        pointScaleEntries,
        competitors,
        competitorEventAges,
        compEvents,
        records,
      ] = await Promise.all([
        prisma.carnival.findUnique({ where: { id } }),
        prisma.carnivalSettings.findUnique({ where: { carnivalId: id } }),
        prisma.house.findMany({ where: { carnivalId: id } }),
        prisma.$queryRaw<unknown[]>`
          SELECT hpe.* FROM house_points_extra hpe
          JOIN houses h ON hpe.house_id = h.id
          WHERE h.carnival_id = ${id}`,
        prisma.eventType.findMany({ where: { carnivalId: id } }),
        prisma.$queryRaw<unknown[]>`
          SELECT e.* FROM events e
          JOIN event_types et ON e.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
        prisma.$queryRaw<unknown[]>`
          SELECT fl.* FROM final_levels fl
          JOIN event_types et ON fl.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
        prisma.$queryRaw<unknown[]>`
          SELECT h.* FROM heats h
          JOIN events e ON h.event_id = e.id
          JOIN event_types et ON e.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
        prisma.$queryRaw<unknown[]>`
          SELECT lt.* FROM lane_templates lt
          JOIN event_types et ON lt.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
        prisma.$queryRaw<unknown[]>`
          SELECT lpa.* FROM lane_promotion_allocations lpa
          JOIN event_types et ON lpa.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
        prisma.lane.findMany({ where: { carnivalId: id } }),
        prisma.pointScale.findMany({ where: { carnivalId: id } }),
        prisma.pointScaleEntry.findMany({ where: { carnivalId: id } }),
        prisma.competitor.findMany({ where: { carnivalId: id } }),
        prisma.competitorEventAge.findMany({ where: { carnivalId: id } }),
        prisma.$queryRaw<unknown[]>`
          SELECT ce.* FROM comp_events ce
          JOIN competitors c ON ce.competitor_id = c.id
          WHERE c.carnival_id = ${id}`,
        prisma.$queryRaw<unknown[]>`
          SELECT r.* FROM records r
          JOIN events e ON r.event_id = e.id
          JOIN event_types et ON e.event_type_id = et.id
          WHERE et.carnival_id = ${id}`,
      ]);

      if (!carnival) throw new NotFoundError('Carnival', id);

      const safeName = carnival.name.replace(/[^a-z0-9]/gi, '_');
      const dateStr = new Date().toISOString().split('T')[0];

      const bundle = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        carnival,
        settings,
        houses,
        housePointsExtra,
        eventTypes,
        events,
        finalLevels,
        heats,
        laneTemplates,
        lanePromotionAllocs,
        lanes,
        pointScales,
        pointScaleEntries,
        competitors,
        competitorEventAges,
        compEvents,
        records,
      };

      res.setHeader('Content-Disposition', `attachment; filename="carnival-${safeName}-${dateStr}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(bundle);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Import helpers ───────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function parseBundleBody(req: Request): unknown {
  // Support both JSON body and multipart file upload
  if (req.file?.buffer) {
    return JSON.parse(req.file.buffer.toString('utf8'));
  }
  return req.body;
}

function bundleCounts(bundle: any) {
  return {
    houses: Array.isArray(bundle.houses) ? bundle.houses.length : 0,
    eventTypes: Array.isArray(bundle.eventTypes) ? bundle.eventTypes.length : 0,
    events: Array.isArray(bundle.events) ? bundle.events.length : 0,
    heats: Array.isArray(bundle.heats) ? bundle.heats.length : 0,
    competitors: Array.isArray(bundle.competitors) ? bundle.competitors.length : 0,
    pointScales: Array.isArray(bundle.pointScales) ? bundle.pointScales.length : 0,
    records: Array.isArray(bundle.records) ? bundle.records.length : 0,
  };
}

// ─── Import Preview ───────────────────────────────────────────────────────────

router.post(
  '/import/preview',
  requireMinRole('coordinator'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bundle = parseBundleBody(req) as any;
      if (!bundle?.version) throw new ValidationError('Invalid carnival export bundle: missing version field.');
      if (!bundle?.carnival?.name) throw new ValidationError('Invalid carnival export bundle: missing carnival name.');

      res.json({
        version: bundle.version,
        carnivalName: bundle.carnival.name,
        counts: bundleCounts(bundle),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Import ───────────────────────────────────────────────────────────────────

router.post(
  '/import',
  requireMinRole('coordinator'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bundle = parseBundleBody(req) as any;
      if (!bundle?.version) throw new ValidationError('Invalid carnival export bundle: missing version field.');
      if (!bundle?.carnival?.name) throw new ValidationError('Invalid carnival export bundle: missing carnival name.');

      const importName: string = (req.body as any)?.name ?? bundle.carnival.name;

      const conflict = await prisma.carnival.findFirst({
        where: { name: { equals: importName, mode: 'insensitive' } },
      });
      if (conflict) throw new ConflictError('A carnival with this name already exists.');

      const newCarnival = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const nc = await tx.carnival.create({ data: { name: importName } });

        // Settings
        const s = bundle.settings;
        if (s) {
          const { carnivalId: _c, createdAt: _ca, updatedAt: _ua, ...settingsData } = s;
          await tx.carnivalSettings.create({ data: { ...settingsData, carnivalId: nc.id, title: importName } });
        } else {
          await tx.carnivalSettings.create({
            data: { carnivalId: nc.id, title: importName, ...DEFAULT_SETTINGS },
          });
        }

        // Houses
        const houseIdMap = new Map<number, number>();
        for (const house of (bundle.houses ?? [])) {
          const { id: oldId, carnivalId: _c, createdAt: _ca, updatedAt: _ua, ...houseData } = house;
          const nh = await tx.house.create({ data: { ...houseData, carnivalId: nc.id } });
          houseIdMap.set(oldId, nh.id);
        }

        // House points extra
        for (const hpe of (bundle.housePointsExtra ?? [])) {
          const { id: _id, houseId: oldHouseId, ...hpeData } = hpe;
          const newHouseId = houseIdMap.get(oldHouseId);
          if (newHouseId) {
            await tx.housePointsExtra.create({ data: { ...hpeData, houseId: newHouseId } });
          }
        }

        // Point scales
        for (const ps of (bundle.pointScales ?? [])) {
          const { carnivalId: _c, ...psData } = ps;
          await tx.pointScale.create({ data: { ...psData, carnivalId: nc.id } });
        }
        for (const pse of (bundle.pointScaleEntries ?? [])) {
          const { carnivalId: _c, ...pseData } = pse;
          await tx.pointScaleEntry.create({ data: { ...pseData, carnivalId: nc.id } });
        }

        // Event types
        const eventTypeIdMap = new Map<number, number>();
        for (const et of (bundle.eventTypes ?? [])) {
          const { id: oldId, carnivalId: _c, createdAt: _ca, updatedAt: _ua, ...etData } = et;
          const net = await tx.eventType.create({ data: { ...etData, carnivalId: nc.id } });
          eventTypeIdMap.set(oldId, net.id);
        }

        // Final levels
        for (const fl of (bundle.finalLevels ?? [])) {
          const { event_type_id: oldEtId, ...flData } = fl;
          const newEtId = eventTypeIdMap.get(Number(oldEtId));
          if (newEtId) {
            await tx.finalLevel.create({ data: { ...flData, eventTypeId: newEtId } });
          }
        }

        // Lane templates
        for (const lt of (bundle.laneTemplates ?? [])) {
          const { event_type_id: oldEtId, lane_number: laneNumber } = lt;
          const newEtId = eventTypeIdMap.get(Number(oldEtId));
          if (newEtId) {
            await tx.laneTemplate.create({ data: { eventTypeId: newEtId, laneNumber: Number(laneNumber) } });
          }
        }

        // Lane promotion allocations
        for (const lpa of (bundle.lanePromotionAllocs ?? [])) {
          const { event_type_id: oldEtId, place, lane } = lpa;
          const newEtId = eventTypeIdMap.get(Number(oldEtId));
          if (newEtId) {
            await tx.lanePromotionAllocation.create({ data: { eventTypeId: newEtId, place: Number(place), lane: Number(lane) } });
          }
        }

        // Events
        const eventIdMap = new Map<number, number>();
        for (const ev of (bundle.events ?? [])) {
          const { id: oldId, event_type_id: oldEtId, record_house_id: _rh, createdAt: _ca, updatedAt: _ua, ...evData } = ev;
          const newEtId = eventTypeIdMap.get(Number(oldEtId));
          if (newEtId) {
            const nev = await tx.event.create({
              data: {
                ...evData,
                eventTypeId: newEtId,
                record: null,
                numericRecord: null,
                recordName: null,
                recordHouseId: null,
              },
            });
            eventIdMap.set(Number(oldId), nev.id);
          }
        }

        // Heats
        for (const heat of (bundle.heats ?? [])) {
          const { id: _id, event_id: oldEventId, createdAt: _ca, updatedAt: _ua, ...heatData } = heat;
          const newEventId = eventIdMap.get(Number(oldEventId));
          if (newEventId) {
            const isFirstLevel = Number(heat.final_level ?? heat.finalLevel) === 1;
            await tx.heat.create({
              data: {
                ...heatData,
                eventId: newEventId,
                eventNumber: null,
                eventTime: null,
                completed: false,
                status: isFirstLevel ? 'active' : 'future',
              },
            });
          }
        }

        // Lanes
        for (const lane of (bundle.lanes ?? [])) {
          const { carnival_id: _c, house_id: oldHouseId, lane_number: laneNumber } = lane;
          const newHouseId = oldHouseId ? houseIdMap.get(Number(oldHouseId)) ?? null : null;
          await tx.lane.create({ data: { carnivalId: nc.id, laneNumber: Number(laneNumber), houseId: newHouseId } });
        }

        // Competitor event ages
        for (const cea of (bundle.competitorEventAges ?? [])) {
          const { carnival_id: _c, ...ceaData } = cea;
          await tx.competitorEventAge.create({ data: { ...ceaData, carnivalId: nc.id } });
        }

        // Competitors
        const competitorIdMap = new Map<number, number>();
        for (const comp of (bundle.competitors ?? [])) {
          const { id: oldId, carnivalId: _c, house_id: oldHouseId, createdAt: _ca, updatedAt: _ua, ...compData } = comp;
          const newHouseId = oldHouseId ? houseIdMap.get(Number(oldHouseId)) : undefined;
          if (newHouseId !== undefined) {
            const nc2 = await tx.competitor.create({
              data: { ...compData, carnivalId: nc.id, houseId: newHouseId },
            });
            competitorIdMap.set(Number(oldId), nc2.id);
          }
        }

        // CompEvents
        for (const ce of (bundle.compEvents ?? [])) {
          const { id: _id, competitor_id: oldCompId, event_id: oldEventId, heat_id: _heatId, createdAt: _ca, updatedAt: _ua, ...ceData } = ce;
          // Skip comp events if competitor or event wasn't imported
          const newCompId = competitorIdMap.get(Number(oldCompId));
          const newEventId = eventIdMap.get(Number(oldEventId));
          if (newCompId && newEventId) {
            // Find the new heat based on the new event
            const heat = await tx.heat.findFirst({
              where: {
                eventId: newEventId,
                heatNumber: Number(ce.heat_number ?? ce.heatNumber),
                finalLevel: Number(ce.final_level ?? ce.finalLevel),
              },
            });
            if (heat) {
              await tx.compEvent.create({
                data: { ...ceData, competitorId: newCompId, eventId: newEventId, heatId: heat.id },
              });
            }
          }
        }

        // Records
        for (const rec of (bundle.records ?? [])) {
          const { id: _id, event_id: oldEventId, createdAt: _ca, ...recData } = rec;
          const newEventId = eventIdMap.get(Number(oldEventId));
          if (newEventId) {
            await tx.record.create({ data: { ...recData, eventId: newEventId } });
          }
        }

        // Grant access
        if (req.user!.role !== 'admin') {
          await tx.userCarnival.create({ data: { userId: req.user!.userId, carnivalId: nc.id } });
        }

        return nc;
      });

      res.status(201).json({ id: newCarnival.id, name: newCarnival.name });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Settings (dedicated route) ───────────────────────────────────────────────

router.get(
  '/:carnivalId/settings',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await prisma.carnivalSettings.findUnique({
        where: { carnivalId: req.carnivalId! },
      });
      if (!settings) throw new NotFoundError('CarnivalSettings', req.carnivalId);
      res.json(settings);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:carnivalId/settings',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateSchema.shape.settings.unwrap().parse(req.body);
      const settings = await prisma.carnivalSettings.update({
        where: { carnivalId: req.carnivalId! },
        data,
      });
      res.json(settings);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
