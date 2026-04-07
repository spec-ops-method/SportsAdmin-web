import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { requireMinRole } from '../middleware/auth';
import { NotFoundError } from '../middleware/errors';

const router = Router({ mergeParams: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDobShort(dob: Date | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function formatDobLong(dob: Date | null): string {
  if (!dob) return '';
  const d = new Date(dob);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function formatDateLong(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

// ─── Divisions (mdiv mapping) ─────────────────────────────────────────────────

router.get(
  '/:carnivalId/meet-manager/divisions',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const rows = await prisma.competitorEventAge.findMany({
        where: { carnivalId },
        select: { eventAge: true, meetManagerDiv: true },
        distinct: ['eventAge'],
        orderBy: { eventAge: 'asc' },
      });
      res.json(rows.map((r) => ({ eventAge: r.eventAge, mdiv: r.meetManagerDiv ?? '' })));
    } catch (err) {
      next(err);
    }
  },
);

const divisionSchema = z.array(z.object({ eventAge: z.string(), mdiv: z.string() }));

router.put(
  '/:carnivalId/meet-manager/divisions',
  requireCarnivalAccess,
  requireMinRole('coordinator'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;
      const items = divisionSchema.parse(req.body);
      await Promise.all(
        items.map(({ eventAge, mdiv }) =>
          prisma.competitorEventAge.updateMany({
            where: { carnivalId, eventAge },
            data: { meetManagerDiv: mdiv },
          }),
        ),
      );
      res.json({ updated: items.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Export: Entries ──────────────────────────────────────────────────────────

type EntryRow = {
  surname: string;
  given_name: string;
  sex: string;
  dob: Date | null;
  meet_manager_event: string | null;
  result: string | null;
  place: number;
  mdiv: string | null;
};

router.get(
  '/:carnivalId/meet-manager/export/entries',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      const settings = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
      if (!settings) throw new NotFoundError('CarnivalSettings', carnivalId);

      const mtop = settings.meetManagerTop ?? 3;
      const teamCode = settings.meetManagerCode ?? '';
      const teamName = settings.meetManagerTeam ?? '';

      const rows = await prisma.$queryRaw<EntryRow[]>`
        SELECT
          c.surname,
          c.given_name,
          c.sex,
          c.dob,
          et.meet_manager_event,
          ce.result,
          ce.place,
          cea.meet_manager_division as mdiv
        FROM comp_events ce
        JOIN competitors c ON ce.competitor_id = c.id
        JOIN events e ON ce.event_id = e.id
        JOIN event_types et ON e.event_type_id = et.id
        LEFT JOIN competitor_event_age cea
          ON cea.carnival_id = et.carnival_id
         AND cea.event_age = e.age
         AND cea.competitor_age = c.age
        WHERE et.carnival_id = ${carnivalId}
          AND c.given_name <> 'Team'
          AND ce.final_level = 0
          AND ce.place > 0
          AND e.include = true
          AND et.include = true
          AND et.flag = true
          AND et.meet_manager_event IS NOT NULL
          AND et.meet_manager_event <> ''
        ORDER BY c.age DESC, c.surname, c.given_name
      `;

      const filtered = rows.filter((r) => Number(r.place) <= mtop);

      const lines = filtered.map((r) => {
        const dob = formatDobShort(r.dob);
        const division = r.mdiv ?? '';
        const mevent = r.meet_manager_event ?? '';
        const result = r.result ?? '';
        return `D;${r.surname};${r.given_name};;${r.sex};${dob};${teamCode};${teamName};;;${mevent};${result};M;${division};`;
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="meet-manager-entries.txt"');
      res.send(lines.join('\r\n'));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Export: Athletes ─────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/meet-manager/export/athletes',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      const settings = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
      if (!settings) throw new NotFoundError('CarnivalSettings', carnivalId);

      const teamCode = settings.meetManagerCode ?? '';
      const teamName = settings.meetManagerTeam ?? '';

      const competitors = await prisma.competitor.findMany({
        where: {
          carnivalId,
          NOT: { givenName: 'Team' },
        },
        orderBy: [{ age: 'desc' }, { surname: 'asc' }, { givenName: 'asc' }],
      });

      const lines = competitors.map((c) => {
        const dob = formatDobShort(c.dob);
        return `I;${c.surname};${c.givenName};;${c.sex};${dob};${teamCode};${teamName};`;
      });

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="meet-manager-athletes.txt"');
      res.send(lines.join('\r\n'));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Export: RE1 ──────────────────────────────────────────────────────────────

type Re1Row = {
  surname: string;
  given_name: string;
  sex: string;
  dob: Date | null;
  meet_manager_event: string | null;
  result: string | null;
  mdiv: string | null;
};

router.get(
  '/:carnivalId/meet-manager/export/re1',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const carnivalId = req.carnivalId!;

      const settings = await prisma.carnivalSettings.findUnique({ where: { carnivalId } });
      if (!settings) throw new NotFoundError('CarnivalSettings', carnivalId);

      const carnival = await prisma.carnival.findUnique({ where: { id: carnivalId } });
      if (!carnival) throw new NotFoundError('Carnival', carnivalId);

      const mtop = settings.meetManagerTop ?? 3;
      const teamCode = settings.meetManagerCode ?? '';
      const teamName = settings.meetManagerTeam ?? '';
      const title = settings.title ?? carnival.name;

      const rows = await prisma.$queryRaw<(Re1Row & { place: number })[]>`
        SELECT
          c.surname,
          c.given_name,
          c.sex,
          c.dob,
          et.meet_manager_event,
          ce.result,
          ce.place,
          cea.meet_manager_division as mdiv
        FROM comp_events ce
        JOIN competitors c ON ce.competitor_id = c.id
        JOIN events e ON ce.event_id = e.id
        JOIN event_types et ON e.event_type_id = et.id
        LEFT JOIN competitor_event_age cea
          ON cea.carnival_id = et.carnival_id
         AND cea.event_age = e.age
         AND cea.competitor_age = c.age
        WHERE et.carnival_id = ${carnivalId}
          AND c.given_name <> 'Team'
          AND ce.final_level = 0
          AND ce.place > 0
          AND e.include = true
          AND et.include = true
          AND et.flag = true
          AND et.meet_manager_event IS NOT NULL
          AND et.meet_manager_event <> ''
        ORDER BY c.age DESC, c.surname, c.given_name
      `;

      const filtered = rows.filter((r) => Number(r.place) <= mtop);

      const today = formatDateLong(new Date());
      const header = `"${title}";"${today}";"Sports Administrator";"1.0"`;

      const lines = [
        header,
        ...filtered.map((r) => {
          const dob = formatDobLong(r.dob);
          const division = r.mdiv ?? '';
          const eventCode = r.meet_manager_event ?? '';
          const result = r.result ?? '';
          return `"E";"${r.surname}";"${r.given_name}";"";"${r.sex}";"${dob}";"";"${teamCode}";"${teamName}";"${division}";"${eventCode}";"${result}";"M";`;
        }),
      ];

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="meet-manager.re1"');
      res.send(lines.join('\r\n'));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
