import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { parse as csvParse } from 'csv-parse/sync';
import crypto from 'crypto';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errors';
import { calculateAge, deriveDob, normalizeSex, fullName } from '../services/competitors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorRow {
  id: number;
  carnivalId: number;
  givenName: string;
  surname: string;
  sex: string;
  age: number;
  dob: Date | null;
  houseId: number;
  houseCode: string;
  include: boolean;
  totalPoints: number;
  externalId: string | null;
  comments: string | null;
  createdAt: Date;
  updatedAt: Date;
  house: { id: number; name: string; code: string } | null;
}

interface ParsedImportRow {
  rowNumber: number;
  status: 'valid' | 'warning' | 'skip' | 'error';
  data: {
    givenName?: string;
    surname?: string;
    sex?: string;
    age?: number;
    dob?: string;
    houseCode?: string;
    houseId?: number;
    externalId?: string;
  };
  message: string | null;
}

interface CacheEntry {
  carnivalId: number;
  rows: ParsedImportRow[];
  expiresAt: number;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/** In-memory import preview cache (no Redis needed in Phase 3). */
const previewCache = new Map<string, CacheEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCompetitor(c: CompetitorRow) {
  return {
    id: c.id,
    carnivalId: c.carnivalId,
    givenName: c.givenName,
    surname: c.surname,
    fullName: fullName(c.surname, c.givenName),
    sex: c.sex as 'M' | 'F',
    age: c.age,
    dob: c.dob ? c.dob.toISOString().split('T')[0] : null,
    houseId: c.houseId,
    houseCode: c.houseCode,
    houseName: c.house?.name ?? '',
    include: c.include,
    totalPoints: c.totalPoints,
    externalId: c.externalId,
    comments: c.comments,
    eventCount: 0, // Phase 3 stub — populated in Phase 5
  };
}

function buildFilterOp(operator: string, value: string): unknown {
  switch (operator) {
    case 'eq':  return value;
    case 'neq': return { not: value };
    case 'lt':  return { lt: Number(value) };
    case 'gt':  return { gt: Number(value) };
    case 'lte': return { lte: Number(value) };
    case 'gte': return { gte: Number(value) };
    case 'like': return { contains: value, mode: 'insensitive' };
    case 'in':  return { in: value.split(',').map((v) => v.trim()) };
    default:    return null;
  }
}

function detectDelimiter(content: string): string {
  for (const delimiter of [',', '\t', '|']) {
    try {
      const rows = csvParse(content.slice(0, 1000), {
        delimiter,
        columns: true,
        to_line: 3,
        skip_empty_lines: true,
      }) as Record<string, string>[];
      if (rows.length > 0 && Object.keys(rows[0]).length > 1) return delimiter;
    } catch {
      // try next delimiter
    }
  }
  return ',';
}

/** Flexible column lookup — normalises key names before comparing. */
function getField(row: Record<string, string>, ...names: string[]): string | undefined {
  const normalise = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');
  for (const name of names) {
    const key = Object.keys(row).find((k) => normalise(k) === normalise(name));
    if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

function purgeExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of previewCache.entries()) {
    if (entry.expiresAt < now) previewCache.delete(key);
  }
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createSchema = z
  .object({
    givenName:  z.string().trim().min(1, 'givenName is required').max(30),
    surname:    z.string().trim().min(1, 'surname is required').max(30),
    sex:        z.enum(['M', 'F']),
    houseId:    z.number().int(),
    dob:        z.string().optional(),
    age:        z.number().int().min(0).optional(),
    include:    z.boolean().default(true),
    externalId: z.string().max(50).optional(),
    comments:   z.string().max(100).optional(),
  })
  .refine((d) => d.dob !== undefined || d.age !== undefined, {
    message: 'Either dob or age is required',
  });

const updateSchema = z.object({
  givenName:  z.string().trim().min(1).max(30).optional(),
  surname:    z.string().trim().min(1).max(30).optional(),
  sex:        z.enum(['M', 'F']).optional(),
  houseId:    z.number().int().optional(),
  dob:        z.string().nullable().optional(),
  age:        z.number().int().min(0).optional(),
  include:    z.boolean().optional(),
  externalId: z.string().max(50).nullable().optional(),
  comments:   z.string().max(100).nullable().optional(),
});

const quickAddSchema = z.object({
  givenName: z.string().trim().min(1).max(30),
  surname:   z.string().trim().min(1).max(30),
  sex:       z.enum(['M', 'F']),
  age:       z.number().int().min(0),
  houseId:   z.number().int(),
});

const ALLOWED_FILTER_FIELDS = new Set([
  'age', 'sex', 'include', 'houseId', 'houseCode', 'externalId', 'totalPoints',
]);

// ─── List ──────────────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/competitors',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const page    = Math.max(1, parseInt(String(req.query.page    ?? '1'),  10) || 1);
      const perPage = Math.max(1, parseInt(String(req.query.perPage ?? '50'), 10) || 50);

      const where: Record<string, unknown> = { carnivalId };

      if (req.query.includeOnly === 'true')                    where.include  = true;
      if (req.query.houseId)                                   where.houseId  = parseInt(String(req.query.houseId), 10);
      if (req.query.sex === 'M' || req.query.sex === 'F')      where.sex      = req.query.sex;
      if (req.query.age)                                       where.age      = parseInt(String(req.query.age), 10);

      if (req.query.search) {
        const search = String(req.query.search);
        where.OR = [
          { surname:   { contains: search, mode: 'insensitive' } },
          { givenName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Advanced single-field filter
      const { filterField, filterOperator, filterValue } = req.query;
      if (filterField && filterOperator && filterValue !== undefined) {
        const field = String(filterField);
        if (ALLOWED_FILTER_FIELDS.has(field)) {
          const op = buildFilterOp(String(filterOperator), String(filterValue));
          if (op !== null) where[field] = op;
        }
      }

      // Sort
      const SORTABLE = new Set(['surname', 'givenName', 'age', 'sex', 'houseCode', 'totalPoints', 'include']);
      const sortParam = String(req.query.sort ?? 'surname,givenName');
      const orderBy = sortParam
        .split(',')
        .map((f) => f.trim())
        .filter((f) => SORTABLE.has(f.replace(/^-/, '')))
        .map((f) => {
          const desc  = f.startsWith('-');
          const field = f.replace(/^-/, '');
          return { [field]: desc ? ('desc' as const) : ('asc' as const) };
        });
      if (orderBy.length === 0) orderBy.push({ surname: 'asc' }, { givenName: 'asc' } as any);

      const [total, rows] = await Promise.all([
        (prisma as any).competitor.count({ where }),
        (prisma as any).competitor.findMany({
          where,
          include: { house: { select: { id: true, name: true, code: true } } },
          orderBy,
          skip:  (page - 1) * perPage,
          take:  perPage,
        }),
      ]);

      res.json({
        data:       (rows as CompetitorRow[]).map(formatCompetitor),
        pagination: { page, perPage, total },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Create ───────────────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const data = createSchema.parse(req.body);

      // Validate house belongs to this carnival
      const house = await prisma.house.findFirst({ where: { id: data.houseId, carnivalId } });
      if (!house) throw new NotFoundError('House', data.houseId);

      // Resolve age / dob
      const settings = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
      const cutoffMonth = (settings as any)?.ageCutoffMonth ?? 1;
      const cutoffDay   = (settings as any)?.ageCutoffDay   ?? 1;

      let resolvedAge: number;
      let resolvedDob: Date | null;

      if (data.dob && data.age !== undefined) {
        resolvedDob = new Date(data.dob);
        resolvedAge = data.age;
      } else if (data.dob) {
        resolvedDob = new Date(data.dob);
        resolvedAge = calculateAge(resolvedDob, cutoffMonth, cutoffDay);
      } else {
        resolvedAge = data.age!;
        resolvedDob = deriveDob(resolvedAge);
      }

      const competitor = await (prisma as any).competitor.create({
        data: {
          carnivalId,
          givenName:   data.givenName,
          surname:     data.surname,
          sex:         data.sex,
          age:         resolvedAge,
          dob:         resolvedDob,
          houseId:     house.id,
          houseCode:   house.code,
          include:     data.include,
          totalPoints: 0,
          externalId:  data.externalId ?? null,
          comments:    data.comments ?? null,
        },
        include: { house: { select: { id: true, name: true, code: true } } },
      });

      res.status(201).json(formatCompetitor(competitor as CompetitorRow));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Quick-add ────────────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors/quick-add',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const data = quickAddSchema.parse(req.body);

      const house = await prisma.house.findFirst({ where: { id: data.houseId, carnivalId } });
      if (!house) throw new NotFoundError('House', data.houseId);

      // Duplicate check (case-insensitive names)
      const dup = await (prisma as any).competitor.findFirst({
        where: {
          carnivalId,
          surname:   { equals: data.surname,   mode: 'insensitive' },
          givenName: { equals: data.givenName, mode: 'insensitive' },
          sex:       data.sex,
          age:       data.age,
          houseId:   data.houseId,
        },
        include: { house: { select: { id: true, name: true, code: true } } },
      });

      if (dup) {
        res.status(409).json({
          error: { code: 'CONFLICT', message: 'Duplicate competitor.' },
          existing_competitor: formatCompetitor(dup as CompetitorRow),
        });
        return;
      }

      const competitor = await (prisma as any).competitor.create({
        data: {
          carnivalId,
          givenName:   data.givenName,
          surname:     data.surname,
          sex:         data.sex,
          age:         data.age,
          dob:         deriveDob(data.age),
          houseId:     house.id,
          houseCode:   house.code,
          include:     true,
          totalPoints: 0,
        },
        include: { house: { select: { id: true, name: true, code: true } } },
      });

      res.status(201).json(formatCompetitor(competitor as CompetitorRow));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Import preview ───────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors/import/preview',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      if (!req.file) throw new ValidationError('A CSV file is required.');

      const settings = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
      const cutoffMonth = (settings as any)?.ageCutoffMonth ?? 1;
      const cutoffDay   = (settings as any)?.ageCutoffDay   ?? 1;

      const content   = req.file.buffer.toString('utf8');
      const delimiter = detectDelimiter(content);

      let rawRows: Record<string, string>[];
      try {
        rawRows = csvParse(content, {
          delimiter,
          columns:           true,
          skip_empty_lines:  true,
          trim:              true,
        }) as Record<string, string>[];
      } catch {
        throw new ValidationError('Failed to parse CSV file.');
      }

      // Pre-load all houses for this carnival for fast lookup
      type HouseRecord = { id: number; code: string; name: string };
      const houses = await prisma.house.findMany({ where: { carnivalId } });
      const houseByCode = new Map<string, HouseRecord>(
        (houses as HouseRecord[]).map((h) => [h.code.toUpperCase(), h]),
      );

      // Track already-seen rows in this CSV to flag in-file duplicates
      type DupKey = string;
      const seen = new Map<DupKey, number>();

      const parsedRows: ParsedImportRow[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNumber = i + 1;

        const givenName  = getField(row, 'givenName', 'given_name', 'firstName', 'first_name', 'given');
        const surname    = getField(row, 'surname', 'lastName', 'last_name', 'familyName', 'family_name');
        const sexRaw     = getField(row, 'sex', 'gender');
        const ageRaw     = getField(row, 'age');
        const dobRaw     = getField(row, 'dob', 'dateOfBirth', 'date_of_birth', 'birthDate', 'birth_date');
        const houseCode  = getField(row, 'houseCode', 'house_code', 'house', 'team');
        const externalId = getField(row, 'externalId', 'external_id', 'id');

        const rowData = {
          givenName:  givenName ?? undefined,
          surname:    surname   ?? undefined,
          sex:        sexRaw    ?? undefined,
          age:        ageRaw    !== undefined ? Number(ageRaw) : undefined,
          dob:        dobRaw    ?? undefined,
          houseCode:  houseCode ?? undefined,
          externalId: externalId ?? undefined,
        };

        // Validate required fields
        if (!givenName || !surname) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: 'Missing givenName or surname.' });
          continue;
        }
        if (!sexRaw) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: 'Missing sex.' });
          continue;
        }
        const sex = normalizeSex(sexRaw);
        if (!sex) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: `Invalid sex value: "${sexRaw}".` });
          continue;
        }
        if (!ageRaw && !dobRaw) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: 'Missing age or dob.' });
          continue;
        }
        if (!houseCode) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: 'Missing houseCode.' });
          continue;
        }

        // Resolve age/dob
        let resolvedAge: number;
        let resolvedDobStr: string | undefined;
        if (dobRaw) {
          const dobDate = new Date(dobRaw);
          if (isNaN(dobDate.getTime())) {
            parsedRows.push({ rowNumber, status: 'error', data: rowData, message: `Invalid dob: "${dobRaw}".` });
            continue;
          }
          resolvedAge    = ageRaw !== undefined ? Number(ageRaw) : calculateAge(dobDate, cutoffMonth, cutoffDay);
          resolvedDobStr = dobDate.toISOString().split('T')[0];
        } else {
          resolvedAge    = Number(ageRaw);
          resolvedDobStr = undefined;
        }

        if (!Number.isInteger(resolvedAge) || resolvedAge < 0) {
          parsedRows.push({ rowNumber, status: 'error', data: rowData, message: `Invalid age: "${ageRaw}".` });
          continue;
        }

        // Resolve house
        const houseUpper = houseCode.toUpperCase();
        const house = houseByCode.get(houseUpper);
        let houseId: number | undefined;
        let rowStatus: 'valid' | 'warning' = 'valid';
        let rowMessage: string | null = null;

        if (!house) {
          rowStatus  = 'warning';
          rowMessage = `House "${houseCode}" not found — will be created on commit.`;
        } else {
          houseId = (house as { id: number }).id;
        }

        // In-file duplicate check
        const dupKey: DupKey = `${surname.toUpperCase()}|${givenName.toUpperCase()}|${sex}|${resolvedAge}|${houseUpper}`;
        if (seen.has(dupKey)) {
          parsedRows.push({ rowNumber, status: 'skip', data: rowData, message: `Duplicate of row ${seen.get(dupKey)}.` });
          continue;
        }
        seen.set(dupKey, rowNumber);

        parsedRows.push({
          rowNumber,
          status:  rowStatus,
          data:    {
            givenName,
            surname,
            sex,
            age:        resolvedAge,
            dob:        resolvedDobStr,
            houseCode,
            houseId,
            externalId: externalId ?? undefined,
          },
          message: rowMessage,
        });
      }

      const token = crypto.randomUUID();
      purgeExpiredCache();
      previewCache.set(token, {
        carnivalId,
        rows:      parsedRows,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const counts = parsedRows.reduce(
        (acc, r) => { acc[r.status]++; return acc; },
        { valid: 0, warning: 0, skip: 0, error: 0 },
      );

      res.json({
        totalRows:    rawRows.length,
        ...counts,
        previewToken: token,
        rows:         parsedRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Import commit ────────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors/import/commit',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId       = req.carnivalId!;
      const { previewToken, autoCreateHouses = true, skipDuplicates = true } = req.body as {
        previewToken: string;
        autoCreateHouses?: boolean;
        skipDuplicates?: boolean;
      };

      if (!previewToken) throw new ValidationError('previewToken is required.');

      purgeExpiredCache();
      const cached = previewCache.get(previewToken);
      if (!cached) throw new NotFoundError('Import preview (token expired or not found)');
      if (cached.carnivalId !== carnivalId) throw new ValidationError('Token does not match this carnival.');

      const importableRows = cached.rows.filter((r) => r.status === 'valid' || r.status === 'warning');

      let imported          = 0;
      let housesCreated     = 0;
      let skippedDuplicates = 0;
      let errors            = 0;

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Build house map (may create missing ones)
        const existingHouses = await (tx as any).house.findMany({ where: { carnivalId } });
        const houseByCode    = new Map<string, { id: number; code: string; name: string }>(
          existingHouses.map((h: any) => [h.code.toUpperCase(), h]),
        );

        for (const row of importableRows) {
          try {
            const { givenName, surname, sex, age, dob, houseCode, externalId } = row.data;
            if (!givenName || !surname || !sex || age === undefined || !houseCode) {
              errors++;
              continue;
            }

            const houseUpper = houseCode.toUpperCase();
            let house = houseByCode.get(houseUpper);

            if (!house && autoCreateHouses) {
              const created = await (tx as any).house.create({
                data: { carnivalId, code: houseCode, name: houseCode, include: true },
              });
              houseByCode.set(houseUpper, created);
              house = created as { id: number; code: string; name: string };
              housesCreated++;
            } else if (!house) {
              errors++;
              continue;
            }

            // Duplicate check against DB
            if (skipDuplicates) {
              const dup = await (tx as any).competitor.findFirst({
                where: {
                  carnivalId,
                  surname:   { equals: surname,   mode: 'insensitive' },
                  givenName: { equals: givenName, mode: 'insensitive' },
                  sex,
                  age,
                },
              });
              if (dup) {
                skippedDuplicates++;
                continue;
              }
            }

            const resolvedDob = dob ? new Date(dob) : deriveDob(age);

            await (tx as any).competitor.create({
              data: {
                carnivalId,
                givenName,
                surname,
                sex,
                age,
                dob:         resolvedDob,
                houseId:     (house as { id: number }).id,
                houseCode:   (house as { code: string }).code,
                include:     true,
                totalPoints: 0,
                externalId:  externalId ?? null,
              },
            });
            imported++;
          } catch {
            errors++;
          }
        }
      });

      previewCache.delete(previewToken);

      res.json({ imported, housesCreated, skippedDuplicates, errors });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Bulk update ──────────────────────────────────────────────────────────────

router.patch(
  '/:carnivalId/competitors/bulk',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { competitorIds, all, updates } = req.body as {
        competitorIds?: number[];
        all?: boolean;
        updates: { include?: boolean };
      };

      if (!updates || typeof updates.include !== 'boolean') {
        throw new ValidationError('Only "include" is allowed in bulk updates.');
      }

      const where: Record<string, unknown> = { carnivalId };
      if (!all) {
        if (!Array.isArray(competitorIds) || competitorIds.length === 0) {
          throw new ValidationError('Provide competitorIds or set all=true.');
        }
        where.id = { in: competitorIds };
      }

      const result = await (prisma as any).competitor.updateMany({
        where,
        data: { include: updates.include },
      });

      res.json({ updated: result.count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Bulk delete ──────────────────────────────────────────────────────────────

router.delete(
  '/:carnivalId/competitors/bulk',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const { competitorIds, filterField, filterOperator, filterValue, confirm } = req.body as {
        competitorIds?: number[];
        filterField?: string;
        filterOperator?: string;
        filterValue?: string;
        confirm?: boolean;
      };

      if (!confirm) throw new ValidationError('Bulk delete requires confirm=true in body.');

      const where: Record<string, unknown> = { carnivalId };

      if (Array.isArray(competitorIds) && competitorIds.length > 0) {
        where.id = { in: competitorIds };
      } else if (filterField && filterOperator && filterValue !== undefined) {
        if (ALLOWED_FILTER_FIELDS.has(filterField)) {
          const op = buildFilterOp(filterOperator, filterValue);
          if (op !== null) where[filterField] = op;
        }
      } else {
        throw new ValidationError('Provide competitorIds or a filter (filterField/filterOperator/filterValue).');
      }

      const result = await (prisma as any).competitor.deleteMany({ where });
      res.json({ deleted: result.count });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Roll-over ages ───────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors/roll-over',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Roll-over requires confirm=true query parameter.');
      }
      const carnivalId = req.carnivalId!;
      const result = await prisma.$executeRaw`
        UPDATE competitors SET age = age + 1 WHERE carnival_id = ${carnivalId}
      `;
      res.json({ updated: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Roll-back ages ───────────────────────────────────────────────────────────

router.post(
  '/:carnivalId/competitors/roll-back',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.confirm !== 'true') {
        throw new ValidationError('Roll-back requires confirm=true query parameter.');
      }
      const carnivalId = req.carnivalId!;
      const result = await prisma.$executeRaw`
        UPDATE competitors SET age = GREATEST(age - 1, 1) WHERE carnival_id = ${carnivalId}
      `;
      res.json({ updated: result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get single competitor ────────────────────────────────────────────────────

router.get(
  '/:carnivalId/competitors/:id',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId   = req.carnivalId!;
      const competitorId = parseInt(req.params.id, 10);
      if (isNaN(competitorId)) throw new NotFoundError('Competitor', req.params.id);

      const competitor = await (prisma as any).competitor.findFirst({
        where:   { id: competitorId, carnivalId },
        include: { house: { select: { id: true, name: true, code: true } } },
      });
      if (!competitor) throw new NotFoundError('Competitor', competitorId);

      res.json({ ...formatCompetitor(competitor as CompetitorRow), events: [] });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Update competitor ────────────────────────────────────────────────────────

router.patch(
  '/:carnivalId/competitors/:id',
  requireCarnivalAccess,
  requireMinRole('operator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId   = req.carnivalId!;
      const competitorId = parseInt(req.params.id, 10);
      if (isNaN(competitorId)) throw new NotFoundError('Competitor', req.params.id);

      const existing = await (prisma as any).competitor.findFirst({
        where: { id: competitorId, carnivalId },
      });
      if (!existing) throw new NotFoundError('Competitor', competitorId);

      const data = updateSchema.parse(req.body);
      const updateData: Record<string, unknown> = {};

      if (data.givenName  !== undefined) updateData.givenName  = data.givenName;
      if (data.surname    !== undefined) updateData.surname    = data.surname;
      if (data.sex        !== undefined) updateData.sex        = data.sex;
      if (data.include    !== undefined) updateData.include    = data.include;
      if (data.externalId !== undefined) updateData.externalId = data.externalId;
      if (data.comments   !== undefined) updateData.comments   = data.comments;

      // House change — validate and update houseCode
      if (data.houseId !== undefined && data.houseId !== existing.houseId) {
        const house = await prisma.house.findFirst({ where: { id: data.houseId, carnivalId } });
        if (!house) throw new NotFoundError('House', data.houseId);
        updateData.houseId   = house.id;
        updateData.houseCode = house.code;
      }

      // DOB / age recalculation
      if (data.dob !== undefined && data.age !== undefined) {
        updateData.dob = data.dob ? new Date(data.dob) : null;
        updateData.age = data.age;
      } else if (data.dob !== undefined) {
        updateData.dob = data.dob ? new Date(data.dob) : null;
        if (data.dob) {
          const settings    = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
          const cutoffMonth = (settings as any)?.ageCutoffMonth ?? 1;
          const cutoffDay   = (settings as any)?.ageCutoffDay   ?? 1;
          updateData.age    = calculateAge(new Date(data.dob), cutoffMonth, cutoffDay);
        }
      } else if (data.age !== undefined) {
        updateData.age = data.age;
        // Only re-derive DOB if the current dob is the auto-derived Jan 1 value
        const existingDob: Date | null = existing.dob;
        if (existingDob) {
          const derived = deriveDob(existing.age);
          const isAutoDerived =
            existingDob.getMonth() === 0 &&
            existingDob.getDate()  === 1 &&
            existingDob.getFullYear() === derived.getFullYear();
          if (isAutoDerived) updateData.dob = deriveDob(data.age);
        }
      }

      const updated = await (prisma as any).competitor.update({
        where:   { id: competitorId },
        data:    updateData,
        include: { house: { select: { id: true, name: true, code: true } } },
      });

      res.json(formatCompetitor(updated as CompetitorRow));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Delete competitor ────────────────────────────────────────────────────────

router.delete(
  '/:carnivalId/competitors/:id',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId   = req.carnivalId!;
      const competitorId = parseInt(req.params.id, 10);
      if (isNaN(competitorId)) throw new NotFoundError('Competitor', req.params.id);

      const existing = await (prisma as any).competitor.findFirst({
        where: { id: competitorId, carnivalId },
      });
      if (!existing) throw new NotFoundError('Competitor', competitorId);

      // Phase 3: no comp_events table yet — delete directly.
      // In Phase 5: check for events and require ?confirm=true if found.
      await (prisma as any).competitor.delete({ where: { id: competitorId } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Competitor event-age mappings ────────────────────────────────────────────

router.get(
  '/:carnivalId/competitor-event-age',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const mappings   = await (prisma as any).competitorEventAge.findMany({
        where:   { carnivalId },
        orderBy: [{ competitorAge: 'asc' }, { eventAge: 'asc' }],
      });
      res.json(mappings);
    } catch (err) {
      next(err);
    }
  },
);

const eventAgeMappingSchema = z.object({
  competitorAge:  z.number().int().min(0),
  eventAge:       z.string().trim().min(1).max(20),
  flag:           z.boolean().default(true),
  tag:            z.boolean().default(false),
  meetManagerDiv: z.string().max(2).nullable().optional(),
});

router.put(
  '/:carnivalId/competitor-event-age',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const rows       = z.array(eventAgeMappingSchema).parse(req.body);

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await (tx as any).competitorEventAge.deleteMany({ where: { carnivalId } });
        if (rows.length > 0) {
          await (tx as any).competitorEventAge.createMany({
            data: rows.map((r) => ({
              carnivalId,
              competitorAge:  r.competitorAge,
              eventAge:       r.eventAge,
              flag:           r.flag,
              tag:            r.tag,
              meetManagerDiv: r.meetManagerDiv ?? null,
            })),
          });
        }
      });

      res.json({ count: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
