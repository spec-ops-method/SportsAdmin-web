import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
        SELECT COUNT(*) as count FROM events WHERE carnival_id = ${id}`,
      prisma.house.count({ where: { carnivalId: id } }),
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM event_types WHERE carnival_id = ${id}`,
      prisma.$queryRaw<[{ total: bigint; completed: bigint }]>`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status >= 2 THEN 1 ELSE 0 END) as completed
        FROM heats WHERE carnival_id = ${id}`,
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

      const source = await prisma.carnival.findUnique({
        where: { id: sourceId },
        include: { settings: true, houses: { include: { pointsExtra: true } } },
      });
      if (!source) throw new NotFoundError('Carnival', sourceId);

      const newCarnival = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Create the new carnival
        const nc = await tx.carnival.create({ data: { name } });

        // Copy settings
        if (source.settings) {
          const { carnivalId: _cid, ...settingsData } = source.settings;
          await tx.carnivalSettings.create({
            data: { carnivalId: nc.id, title: name, ...settingsData },
          });
        } else {
          await tx.carnivalSettings.create({
            data: { carnivalId: nc.id, title: name, ...DEFAULT_SETTINGS },
          });
        }

        // Copy houses
        for (const house of source.houses) {
          const { id: _id, carnivalId: _cid, pointsExtra, ...houseData } = house;
          const newHouse = await tx.house.create({ data: { ...houseData, carnivalId: nc.id } });
          for (const pe of pointsExtra) {
            const { id: _peid, houseId: _hid, ...peData } = pe;
            await tx.housePointsExtra.create({ data: { ...peData, houseId: newHouse.id } });
          }
        }

        // Grant access to the creating user
        if (req.user!.role !== 'admin') {
          await tx.userCarnival.create({
            data: { userId: req.user!.userId, carnivalId: nc.id },
          });
        }

        return tx.carnival.findUnique({ where: { id: nc.id }, include: { settings: true } });
      });

      res.status(201).json(newCarnival);
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
