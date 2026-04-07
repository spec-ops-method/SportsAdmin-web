import { Router, Request, Response, NextFunction } from 'express';
import { parse as csvParse } from 'csv-parse/sync';
import archiver from 'archiver';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError, ValidationError } from '../middleware/errors';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDob(dob: Date | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  return d.toISOString().slice(0, 10);
}

function csvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

// ─── Export: Carnival Disk ZIP ────────────────────────────────────────────────

router.get(
  '/:carnivalId/exports/carnival-disk',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      const houses = await prisma.house.findMany({
        where: { carnivalId, include: true },
        orderBy: { code: 'asc' },
      });

      if (houses.length === 0) throw new NotFoundError('Houses for carnival', carnivalId);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="carnival-disk.zip"');

      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', (err) => next(err));
      archive.pipe(res);

      const header = csvRow(['Given Name', 'Surname', 'Sex', 'Age', 'DOB', 'PIN', 'Total Points']);

      for (const house of houses) {
        const competitors = await prisma.competitor.findMany({
          where: { carnivalId, houseId: house.id, include: true },
          orderBy: [{ surname: 'asc' }, { givenName: 'asc' }],
        });

        const rows = [
          header,
          ...competitors.map((c) =>
            csvRow([
              c.givenName,
              c.surname,
              c.sex,
              c.age,
              formatDob(c.dob),
              c.externalId ?? '',
              c.totalPoints,
            ]),
          ),
        ];

        archive.append(rows.join('\n'), { name: `${house.code}.csv` });
      }

      await archive.finalize();
    } catch (err) {
      next(err);
    }
  },
);

// ─── Import: Carnival Disk CSV ────────────────────────────────────────────────

interface CsvRecord {
  'Given Name'?: string;
  Surname?: string;
  Sex?: string;
  Age?: string;
  DOB?: string;
  PIN?: string;
  'Total Points'?: string;
}

router.post(
  '/:carnivalId/imports/carnival-disk',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  upload.array('files'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        throw new ValidationError('No files uploaded.');
      }

      let housesProcessed = 0;
      let competitorsUpdated = 0;
      let competitorsCreated = 0;
      const errors: string[] = [];

      for (const file of files) {
        const houseCode = path.basename(file.originalname, path.extname(file.originalname));

        const house = await prisma.house.findFirst({ where: { carnivalId, code: houseCode } });
        if (!house) {
          errors.push(`House not found for file: ${file.originalname} (code: ${houseCode})`);
          continue;
        }

        housesProcessed++;

        let records: CsvRecord[];
        try {
          records = csvParse(file.buffer.toString('utf-8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          }) as CsvRecord[];
        } catch {
          errors.push(`Failed to parse CSV for house ${houseCode}: invalid format`);
          continue;
        }

        for (const row of records) {
          const givenName = row['Given Name']?.trim() ?? '';
          const surname = row['Surname']?.trim() ?? '';
          const pin = row['PIN']?.trim() ?? '';
          const totalPoints = parseFloat(row['Total Points'] ?? '0') || 0;

          if (!givenName && !surname && !pin) continue;

          try {
            let existing = null;

            if (pin) {
              existing = await prisma.competitor.findFirst({
                where: { carnivalId, externalId: pin },
              });
            }

            if (!existing && givenName && surname) {
              existing = await prisma.competitor.findFirst({
                where: {
                  carnivalId,
                  surname: { equals: surname, mode: 'insensitive' },
                  givenName: { equals: givenName, mode: 'insensitive' },
                },
              });
            }

            if (existing) {
              await prisma.competitor.update({
                where: { id: existing.id },
                data: { totalPoints },
              });
              competitorsUpdated++;
            } else {
              const sex = row['Sex']?.trim() ?? 'M';
              const age = parseInt(row['Age'] ?? '0', 10) || 0;

              await prisma.competitor.create({
                data: {
                  carnivalId,
                  givenName,
                  surname,
                  sex: sex.charAt(0).toUpperCase(),
                  age,
                  houseId: house.id,
                  houseCode,
                  totalPoints,
                  externalId: pin || null,
                },
              });
              competitorsCreated++;
            }
          } catch {
            errors.push(`Error processing row (${givenName} ${surname}) in ${houseCode}`);
          }
        }
      }

      res.json({ housesProcessed, competitorsUpdated, competitorsCreated, errors });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
