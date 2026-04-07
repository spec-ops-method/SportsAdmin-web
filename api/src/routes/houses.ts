import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { authenticate, requireMinRole } from '../middleware/auth';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { NotFoundError, ConflictError, ValidationError } from '../middleware/errors';

type PointsRow = { house_id: number; competition_points: number; extra_points: number };

interface HouseRow {
  id: number;
  carnivalId: number;
  code: string;
  name: string;
  houseTypeId: number | null;
  include: boolean;
  details: string | null;
  lane: number | null;
  competitionPool: number | null;
  flag: boolean;
}

const router = Router({ mergeParams: true });

router.use(authenticate, requireCarnivalAccess);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const houseWithPoints = async (id: number) => {
  const [house, pointsData] = await Promise.all([
    prisma.house.findUnique({ where: { id } }),
    prisma.$queryRaw<[{ competition_points: number; extra_points: number }]>`
      SELECT
        COALESCE(SUM(ce.points), 0) AS competition_points,
        COALESCE((SELECT SUM(points) FROM house_points_extra WHERE house_id = ${id}), 0) AS extra_points
      FROM comp_events ce
      JOIN competitors c ON c.id = ce.competitor_id
      WHERE c.house_id = ${id}`,
  ]);
  if (!house) return null;
  const pts = pointsData[0];
  return {
    ...house,
    totalPoints: Number(pts.competition_points) + Number(pts.extra_points),
    extraPoints: Number(pts.extra_points),
  };
};

// ─── List houses ──────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeOnly = req.query.include_only === 'true';
    const houses = await prisma.house.findMany({
      where: {
        carnivalId: req.carnivalId!,
        ...(includeOnly ? { include: true } : {}),
      },
      orderBy: { code: 'asc' },
    });

    // Attach point totals via a single query
    const ids = houses.map((h: HouseRow) => h.id);
    const pointsRows = ids.length
      ? await prisma.$queryRaw<
          Array<{ house_id: number; competition_points: number; extra_points: number }>
        >`
          SELECT
            h.id AS house_id,
            COALESCE(SUM(ce.points), 0) AS competition_points,
            COALESCE(SUM(hpe.pts), 0) AS extra_points
          FROM houses h
          LEFT JOIN competitors c ON c.house_id = h.id
          LEFT JOIN comp_events ce ON ce.competitor_id = c.id
          LEFT JOIN (
            SELECT house_id, SUM(points) AS pts FROM house_points_extra GROUP BY house_id
          ) hpe ON hpe.house_id = h.id
          WHERE h.id = ANY(${ids}::int[])
          GROUP BY h.id`
      : [];

    const pointsMap = new Map(pointsRows.map((r: PointsRow) => [r.house_id, r]));

    const result = (houses as HouseRow[]).map((h) => {
      const pts = pointsMap.get(h.id) as PointsRow | undefined;
      return {
        ...h,
        totalPoints: pts ? Number(pts.competition_points) + Number(pts.extra_points) : 0,
        extraPoints: pts ? Number(pts.extra_points) : 0,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Create house ─────────────────────────────────────────────────────────────

const createSchema = z.object({
  code: z.string().trim().min(1, 'House code is required').max(7),
  name: z.string().trim().min(1).max(50),
  houseTypeId: z.number().int().optional(),
  include: z.boolean().default(true),
  lane: z.number().int().optional(),
  competitionPool: z.number().int().optional(),
  details: z.string().optional(),
});

router.post(
  '/',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createSchema.parse(req.body);
      const carnivalId = req.carnivalId!;

      const existing = await prisma.house.findUnique({
        where: { carnivalId_code: { carnivalId, code: data.code } },
      });
      if (existing) throw new ConflictError('A house with this code already exists.');

      const house = await prisma.house.create({ data: { ...data, carnivalId } });
      res.status(201).json({ ...house, totalPoints: 0, extraPoints: 0 });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get single house ─────────────────────────────────────────────────────────

router.get('/:houseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const houseId = parseInt(req.params.houseId, 10);
    const house = await prisma.house.findFirst({
      where: { id: houseId, carnivalId: req.carnivalId! },
    });
    if (!house) throw new NotFoundError('House', houseId);

    const result = await houseWithPoints(houseId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Update house ─────────────────────────────────────────────────────────────

const updateSchema = z.object({
  code: z.string().trim().min(1).max(7).optional(),
  name: z.string().trim().min(1).max(50).optional(),
  houseTypeId: z.number().int().nullable().optional(),
  include: z.boolean().optional(),
  flag: z.boolean().optional(),
  lane: z.number().int().nullable().optional(),
  competitionPool: z.number().int().nullable().optional(),
  details: z.string().nullable().optional(),
});

router.put(
  '/:houseId',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const houseId = parseInt(req.params.houseId, 10);
      const data = updateSchema.parse(req.body);
      const carnivalId = req.carnivalId!;

      const existing = await prisma.house.findFirst({ where: { id: houseId, carnivalId } });
      if (!existing) throw new NotFoundError('House', houseId);

      if (data.code && data.code !== existing.code) {
        const conflict = await prisma.house.findUnique({
          where: { carnivalId_code: { carnivalId, code: data.code } },
        });
        if (conflict) throw new ConflictError('A house with this code already exists.');
      }

      const updated = await prisma.house.update({ where: { id: houseId }, data });
      const result = await houseWithPoints(houseId);
      res.json(result ?? updated);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Delete house ─────────────────────────────────────────────────────────────

router.delete(
  '/:houseId',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Deletion requires confirm=true query parameter.');
      }
      const houseId = parseInt(req.params.houseId, 10);
      const existing = await prisma.house.findFirst({
        where: { id: houseId, carnivalId: req.carnivalId! },
      });
      if (!existing) throw new NotFoundError('House', houseId);

      await prisma.house.delete({ where: { id: houseId } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── House points extra ───────────────────────────────────────────────────────

const adjustmentSchema = z.object({
  points: z.number(),
  reason: z.string().optional(),
});

router.get('/:houseId/points-extra', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const houseId = parseInt(req.params.houseId, 10);
    const house = await prisma.house.findFirst({ where: { id: houseId, carnivalId: req.carnivalId! } });
    if (!house) throw new NotFoundError('House', houseId);
    const adjustments = await prisma.housePointsExtra.findMany({ where: { houseId } });
    res.json(adjustments);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:houseId/points-extra',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const houseId = parseInt(req.params.houseId, 10);
      const house = await prisma.house.findFirst({ where: { id: houseId, carnivalId: req.carnivalId! } });
      if (!house) throw new NotFoundError('House', houseId);
      const data = adjustmentSchema.parse(req.body);
      const adj = await prisma.housePointsExtra.create({ data: { houseId, ...data } });
      res.status(201).json(adj);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:houseId/points-extra/:adjustmentId',
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const houseId = parseInt(req.params.houseId, 10);
      const adjId = parseInt(req.params.adjustmentId, 10);
      const house = await prisma.house.findFirst({ where: { id: houseId, carnivalId: req.carnivalId! } });
      if (!house) throw new NotFoundError('House', houseId);
      const adj = await prisma.housePointsExtra.findFirst({ where: { id: adjId, houseId } });
      if (!adj) throw new NotFoundError('Adjustment', adjId);
      await prisma.housePointsExtra.delete({ where: { id: adjId } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
