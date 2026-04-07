import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma/client';
import { requireCarnivalAccess } from '../middleware/carnivalAccess';
import { ValidationError } from '../middleware/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HousePointsRow {
  house_code: string;
  house_name: string;
  event_points: number;
  extra_points: number;
  grand_total: number;
  percentage: number;
}

interface AgeChampionRow {
  full_name: string;
  age_sex_division: string;
  house_name: string;
  total_points: number;
}

interface CumulativeRow {
  house_code: string;
  event_number: number;
  running_total: number;
}

interface RecordRow {
  event_id: number;
  event_type_description: string;
  age: string;
  sex: string;
  result: string;
  surname: string;
  given_name: string;
  house_code: string | null;
  date: Date;
  comments: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCSVIds(raw: unknown): number[] | null {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;
  const ids = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return ids.length > 0 ? ids : null;
}

function toNumber(raw: unknown, defaultVal: number): number {
  const n = parseInt(String(raw ?? ''), 10);
  return isNaN(n) ? defaultVal : n;
}

function finalLevelLabel(level: number): string {
  const labels: Record<number, string> = {
    0: 'Grand Final',
    1: 'Semi Final',
    2: 'Quarter Final',
    3: 'Round of 16',
    4: 'Round of 32',
  };
  return labels[level] ?? `Heat ${level}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = Router();

// ─── House Points Grand Total ─────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/house-points',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const rows = await prisma.$queryRaw<HousePointsRow[]>`
        SELECT
          h.code                                          AS house_code,
          h.name                                          AS house_name,
          COALESCE(SUM(ce.points), 0)                     AS event_points,
          COALESCE(ep.extra_points, 0)                    AS extra_points,
          COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0) AS grand_total,
          ROUND(
            (COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0))::numeric
            / NULLIF(SUM(SUM(ce.points)) OVER (), 0) * 100,
            1
          )                                               AS percentage
        FROM houses h
        LEFT JOIN competitors c
          ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
        LEFT JOIN comp_events ce
          ON ce.competitor_id = c.id
        LEFT JOIN (
          SELECT hpe.house_id, SUM(hpe.points) AS extra_points
          FROM house_points_extra hpe
          JOIN houses h_ep ON h_ep.id = hpe.house_id AND h_ep.carnival_id = ${carnivalId}
          GROUP BY hpe.house_id
        ) ep ON ep.house_id = h.id
        WHERE h.carnival_id = ${carnivalId} AND h.include = true
        GROUP BY h.code, h.name, ep.extra_points
        ORDER BY grand_total DESC
      `;
      res.json(
        rows.map((r) => ({
          houseCode: r.house_code,
          houseName: r.house_name,
          eventPoints: Number(r.event_points),
          extraPoints: Number(r.extra_points),
          grandTotal: Number(r.grand_total),
          percentage: Number(r.percentage ?? 0),
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Programme of Events ──────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/program',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const variant = (req.query.variant as string) ?? 'standard';

      const heats = await prisma.heat.findMany({
        where: { event: { eventType: { carnivalId, include: true } } },
        include: {
          event: {
            include: { eventType: true },
          },
        },
        orderBy: [{ eventNumber: 'asc' }, { event: { eventType: { description: 'asc' } } }],
      });

      const program = heats.map((h) => ({
        eventNumber: h.eventNumber,
        eventTime: h.eventTime,
        eventTypeDescription: h.event.eventType.description,
        age: h.event.age,
        sex: h.event.sex,
        finalLevel: h.finalLevel,
        finalLevelLabel: finalLevelLabel(h.finalLevel),
        heatNumber: h.heatNumber,
        status: h.status,
        variant,
      }));

      res.json(program);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Marshalling / Event Lists ────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/event-lists',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const { age, sex, final_level, heat, detail_level } = req.query;
      const statusesRaw = req.query.statuses as string | undefined;
      const statuses = statusesRaw
        ? statusesRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const eventTypeIds = parseCSVIds(req.query.event_type_ids);

      const where: Prisma.HeatWhereInput = {
        event: {
          eventType: {
            carnivalId,
            include: true,
            ...(eventTypeIds ? { id: { in: eventTypeIds } } : {}),
          },
          ...(age ? { age: String(age) } : {}),
          ...(sex ? { sex: String(sex) } : {}),
        },
        ...(final_level !== undefined ? { finalLevel: parseInt(String(final_level), 10) } : {}),
        ...(heat !== undefined ? { heatNumber: parseInt(String(heat), 10) } : {}),
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
      };

      const heats = await prisma.heat.findMany({
        where,
        include: {
          event: {
            include: {
              eventType: true,
              records: { orderBy: { date: 'desc' }, take: 1 },
            },
          },
          compEvents: {
            include: { competitor: { include: { house: true } } },
            orderBy: { lane: 'asc' },
          },
        },
        orderBy: [{ eventNumber: 'asc' }, { heatNumber: 'asc' }],
      });

      const grouped = heats.map((h) => ({
        rCode: h.event.eventType.reportTypeId ?? 1,
        eventType: h.event.eventType.description,
        age: h.event.age,
        sex: h.event.sex,
        finalLevel: h.finalLevel,
        finalLevelLabel: finalLevelLabel(h.finalLevel),
        heatNumber: h.heatNumber,
        eventNumber: h.eventNumber,
        eventTime: h.eventTime,
        status: h.status,
        record: h.event.records[0]?.result ?? null,
        recordHolder: h.event.records[0]
          ? `${h.event.records[0].surname}, ${h.event.records[0].givenName}`
          : null,
        units: h.event.eventType.units,
        detailLevel: detail_level ?? 'detailed',
        competitors:
          detail_level === 'summary'
            ? []
            : h.compEvents.map((ce) => ({
                lane: ce.lane,
                name: `${ce.competitor.surname}, ${ce.competitor.givenName}`,
                house: ce.competitor.house.name,
                houseCode: ce.competitor.houseCode,
              })),
      }));

      res.json(grouped);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Statistics ───────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/statistics/:reportName',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const { reportName } = req.params;
      const eventTypeIds = parseCSVIds(req.query.event_type_ids);
      const houseIds = parseCSVIds(req.query.house_ids);
      const maxRecords = toNumber(req.query.max_records, 8);
      const ageChampionCount = toNumber(req.query.age_champion_count, 3);

      // ── Age Champions ──────────────────────────────────────────────────────

      if (reportName === 'age-champions' || reportName === 'age-champions-all-divisions') {
        const rows = await prisma.$queryRaw<AgeChampionRow[]>`
          SELECT
            c.surname || ', ' || c.given_name || ' (' || c.age::text || ')' AS full_name,
            e.age || ' ' || e.sex                                            AS age_sex_division,
            h.name                                                           AS house_name,
            SUM(ce.points)                                                   AS total_points
          FROM competitors c
          JOIN comp_events ce  ON ce.competitor_id = c.id
          JOIN heats ht        ON ht.id = ce.heat_id
          JOIN events e        ON e.id = ht.event_id
          JOIN event_types et  ON et.id = e.event_type_id
          JOIN houses h        ON h.code = c.house_code AND h.carnival_id = c.carnival_id
          WHERE c.carnival_id = ${carnivalId}
            AND et.include = true
            AND h.include = true
            AND UPPER(c.given_name) <> 'TEAM'
            AND c.age IS NOT NULL
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
            ${houseIds ? Prisma.sql`AND h.id IN (${Prisma.join(houseIds)})` : Prisma.sql``}
          GROUP BY c.id, c.surname, c.given_name, c.age, e.age, e.sex, h.name
          ORDER BY age_sex_division, total_points DESC
        `;

        // Keep top N per age_sex_division
        const grouped = new Map<string, typeof rows>();
        for (const row of rows) {
          const key = row.age_sex_division;
          const list = grouped.get(key) ?? [];
          list.push(row);
          grouped.set(key, list);
        }
        const result: AgeChampionRow[] = [];
        for (const [, list] of grouped) {
          result.push(...list.slice(0, ageChampionCount));
        }
        res.json(
          result.map((r) => ({
            fullName: r.full_name,
            ageSexDivision: r.age_sex_division,
            houseName: r.house_name,
            totalPoints: Number(r.total_points),
          })),
        );
        return;
      }

      // ── Non-Participants ───────────────────────────────────────────────────

      if (reportName === 'non-participants') {
        const competitors = await prisma.competitor.findMany({
          where: {
            carnivalId,
            include: true,
            compEvents: { none: {} },
          },
          include: { house: true },
          orderBy: [{ surname: 'asc' }, { givenName: 'asc' }],
        });
        res.json(
          competitors.map((c) => ({
            id: c.id,
            fullName: `${c.surname}, ${c.givenName}`,
            age: c.age,
            sex: c.sex,
            houseCode: c.houseCode,
            houseName: c.house.name,
          })),
        );
        return;
      }

      // ── Overall (same as house-points) ─────────────────────────────────────

      if (reportName === 'overall') {
        const rows = await prisma.$queryRaw<HousePointsRow[]>`
          SELECT
            h.code AS house_code, h.name AS house_name,
            COALESCE(SUM(ce.points), 0) AS event_points,
            COALESCE(ep.extra_points, 0) AS extra_points,
            COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0) AS grand_total,
            ROUND(
              (COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0))::numeric
              / NULLIF(SUM(SUM(ce.points)) OVER (), 0) * 100, 1
            ) AS percentage
          FROM houses h
          LEFT JOIN competitors c ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          LEFT JOIN comp_events ce ON ce.competitor_id = c.id
          LEFT JOIN (
            SELECT hpe.house_id, SUM(hpe.points) AS extra_points
            FROM house_points_extra hpe
            JOIN houses h_ep ON h_ep.id = hpe.house_id AND h_ep.carnival_id = ${carnivalId}
            GROUP BY hpe.house_id
          ) ep ON ep.house_id = h.id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true
          GROUP BY h.code, h.name, ep.extra_points
          ORDER BY grand_total DESC
        `;
        res.json(
          rows.map((r) => ({
            houseCode: r.house_code,
            houseName: r.house_name,
            eventPoints: Number(r.event_points),
            extraPoints: Number(r.extra_points),
            grandTotal: Number(r.grand_total),
            percentage: Number(r.percentage ?? 0),
          })),
        );
        return;
      }

      // ── By Age ────────────────────────────────────────────────────────────

      if (reportName === 'by-age') {
        interface ByAgeRow {
          house_code: string;
          house_name: string;
          event_age: string;
          points: number;
        }
        const rows = await prisma.$queryRaw<ByAgeRow[]>`
          SELECT h.code AS house_code, h.name AS house_name,
                 e.age  AS event_age, COALESCE(SUM(ce.points), 0) AS points
          FROM houses h
          LEFT JOIN competitors c  ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          LEFT JOIN comp_events ce ON ce.competitor_id = c.id
          LEFT JOIN heats ht       ON ht.id = ce.heat_id
          LEFT JOIN events e       ON e.id = ht.event_id
          LEFT JOIN event_types et ON et.id = e.event_type_id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY h.code, h.name, e.age
          ORDER BY e.age, points DESC
        `;
        res.json(rows.map((r) => ({ ...r, points: Number(r.points) })));
        return;
      }

      // ── By Sex ────────────────────────────────────────────────────────────

      if (reportName === 'by-sex') {
        interface BySexRow {
          house_code: string;
          house_name: string;
          sex: string;
          points: number;
        }
        const rows = await prisma.$queryRaw<BySexRow[]>`
          SELECT h.code AS house_code, h.name AS house_name,
                 e.sex, COALESCE(SUM(ce.points), 0) AS points
          FROM houses h
          LEFT JOIN competitors c  ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          LEFT JOIN comp_events ce ON ce.competitor_id = c.id
          LEFT JOIN heats ht       ON ht.id = ce.heat_id
          LEFT JOIN events e       ON e.id = ht.event_id
          LEFT JOIN event_types et ON et.id = e.event_type_id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY h.code, h.name, e.sex
          ORDER BY e.sex, points DESC
        `;
        res.json(rows.map((r) => ({ ...r, points: Number(r.points) })));
        return;
      }

      // ── By Age+Gender ─────────────────────────────────────────────────────

      if (reportName === 'by-age-gender') {
        interface ByAgeGenderRow {
          house_code: string;
          house_name: string;
          age: string;
          sex: string;
          points: number;
        }
        const rows = await prisma.$queryRaw<ByAgeGenderRow[]>`
          SELECT h.code AS house_code, h.name AS house_name,
                 e.age, e.sex, COALESCE(SUM(ce.points), 0) AS points
          FROM houses h
          LEFT JOIN competitors c  ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          LEFT JOIN comp_events ce ON ce.competitor_id = c.id
          LEFT JOIN heats ht       ON ht.id = ce.heat_id
          LEFT JOIN events e       ON e.id = ht.event_id
          LEFT JOIN event_types et ON et.id = e.event_type_id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY h.code, h.name, e.age, e.sex
          ORDER BY e.age, e.sex, points DESC
        `;
        res.json(rows.map((r) => ({ ...r, points: Number(r.points) })));
        return;
      }

      // ── Cumulative by Event Number ────────────────────────────────────────

      if (reportName === 'cumulative-by-event-number') {
        const rows = await prisma.$queryRaw<CumulativeRow[]>`
          SELECT
            h.code AS house_code,
            ht.event_number,
            SUM(SUM(ce.points)) OVER (
              PARTITION BY h.code ORDER BY ht.event_number
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_total
          FROM houses h
          JOIN competitors c   ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          JOIN comp_events ce  ON ce.competitor_id = c.id
          JOIN heats ht        ON ht.id = ce.heat_id
          WHERE h.carnival_id = ${carnivalId}
            AND h.include = true
            AND ht.event_number IS NOT NULL
          GROUP BY h.code, ht.event_number
          ORDER BY ht.event_number, h.code
        `;
        // Pivot into { eventNumbers: number[], series: [...] }
        const eventNumbers = [...new Set(rows.map((r) => r.event_number))].sort(
          (a, b) => a - b,
        );
        const bySeries = new Map<string, number[]>();
        for (const row of rows) {
          const arr = bySeries.get(row.house_code) ?? [];
          arr.push(Number(row.running_total));
          bySeries.set(row.house_code, arr);
        }
        res.json({
          eventNumbers,
          series: [...bySeries.entries()].map(([house, cumulativePoints]) => ({
            house,
            cumulativePoints,
          })),
        });
        return;
      }

      // ── By Place ──────────────────────────────────────────────────────────

      if (reportName === 'by-place') {
        interface ByPlaceRow {
          house_code: string;
          house_name: string;
          place: number;
          count: number;
          points: number;
        }
        const rows = await prisma.$queryRaw<ByPlaceRow[]>`
          SELECT h.code AS house_code, h.name AS house_name,
                 ce.place, COUNT(*)::int AS count,
                 COALESCE(SUM(ce.points), 0) AS points
          FROM houses h
          JOIN competitors c   ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          JOIN comp_events ce  ON ce.competitor_id = c.id
          JOIN heats ht        ON ht.id = ce.heat_id
          JOIN events e        ON e.id = ht.event_id
          JOIN event_types et  ON et.id = e.event_type_id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true AND ce.place > 0
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY h.code, h.name, ce.place
          ORDER BY h.code, ce.place
        `;
        res.json(rows.map((r) => ({ ...r, count: Number(r.count), points: Number(r.points) })));
        return;
      }

      // ── Event Results ─────────────────────────────────────────────────────

      if (reportName === 'event-results') {
        interface EventResultRow {
          event_type: string;
          age: string;
          sex: string;
          final_level: number;
          heat_number: number;
          lane: number | null;
          place: number;
          competitor_name: string;
          house_code: string;
          result: string | null;
          points: number;
        }
        const rows = await prisma.$queryRaw<EventResultRow[]>`
          SELECT et.description AS event_type, e.age, e.sex,
                 ce.final_level, ce.heat_number, ce.lane, ce.place,
                 c.surname || ', ' || c.given_name AS competitor_name,
                 c.house_code, ce.result, ce.points
          FROM comp_events ce
          JOIN competitors c  ON c.id = ce.competitor_id AND c.carnival_id = ${carnivalId}
          JOIN events e       ON e.id = ce.event_id
          JOIN event_types et ON et.id = e.event_type_id
          WHERE et.carnival_id = ${carnivalId}
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          ORDER BY et.description, e.age, e.sex, ce.final_level, ce.heat_number, ce.lane
        `;
        res.json(rows.map((r) => ({ ...r, points: Number(r.points) })));
        return;
      }

      // ── Event Places Distribution ─────────────────────────────────────────

      if (reportName === 'event-places') {
        interface EventPlacesRow {
          event_type: string;
          age: string;
          sex: string;
          place: number;
          count: number;
        }
        const rows = await prisma.$queryRaw<EventPlacesRow[]>`
          SELECT et.description AS event_type, e.age, e.sex,
                 ce.place, COUNT(*)::int AS count
          FROM comp_events ce
          JOIN competitors c  ON c.id = ce.competitor_id AND c.carnival_id = ${carnivalId}
          JOIN events e       ON e.id = ce.event_id
          JOIN event_types et ON et.id = e.event_type_id
          WHERE et.carnival_id = ${carnivalId} AND ce.place > 0
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY et.description, e.age, e.sex, ce.place
          ORDER BY et.description, e.age, e.sex, ce.place
        `;
        res.json(rows.map((r) => ({ ...r, count: Number(r.count) })));
        return;
      }

      // ── Best Times/Results Per Event ─────────────────────────────────────

      if (reportName === 'event-times-best') {
        interface BestTimeRow {
          event_type: string;
          age: string;
          sex: string;
          competitor_name: string;
          house_code: string;
          result: string | null;
          numeric_result: number;
        }
        const rows = await prisma.$queryRaw<BestTimeRow[]>`
          SELECT DISTINCT ON (e.id)
            et.description AS event_type, e.age, e.sex,
            c.surname || ', ' || c.given_name AS competitor_name,
            c.house_code, ce.result, ce.numeric_result
          FROM comp_events ce
          JOIN competitors c  ON c.id = ce.competitor_id AND c.carnival_id = ${carnivalId}
          JOIN events e       ON e.id = ce.event_id
          JOIN event_types et ON et.id = e.event_type_id
          WHERE et.carnival_id = ${carnivalId} AND ce.numeric_result > 0
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          ORDER BY e.id, ce.numeric_result
        `;
        res.json(rows.map((r) => ({ ...r, numericResult: Number(r.numeric_result) })));
        return;
      }

      // ── Competitor Events ─────────────────────────────────────────────────

      if (reportName === 'competitor-events') {
        interface CompetitorEventRow {
          competitor_name: string;
          house_code: string;
          age: number;
          sex: string;
          event_type: string;
          final_level: number;
          heat_number: number;
          lane: number | null;
          place: number;
          result: string | null;
          points: number;
        }
        const rows = await prisma.$queryRaw<CompetitorEventRow[]>`
          SELECT
            c.surname || ', ' || c.given_name AS competitor_name,
            c.house_code, c.age, c.sex,
            et.description AS event_type,
            ce.final_level, ce.heat_number, ce.lane, ce.place, ce.result, ce.points
          FROM comp_events ce
          JOIN competitors c  ON c.id = ce.competitor_id AND c.carnival_id = ${carnivalId}
          JOIN events e       ON e.id = ce.event_id
          JOIN event_types et ON et.id = e.event_type_id
          WHERE et.carnival_id = ${carnivalId}
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
            ${houseIds ? Prisma.sql`AND c.house_id IN (${Prisma.join(houseIds)})` : Prisma.sql``}
          ORDER BY c.surname, c.given_name, et.description
        `;
        res.json(rows.map((r) => ({ ...r, points: Number(r.points) })));
        return;
      }

      // ── Competitor Results Cross-Tab ──────────────────────────────────────

      if (reportName === 'competitor-results-by-team-event') {
        interface CrossTabRow {
          house_name: string;
          event_type: string;
          total_points: number;
          competitor_count: number;
        }
        const rows = await prisma.$queryRaw<CrossTabRow[]>`
          SELECT h.name AS house_name, et.description AS event_type,
                 COALESCE(SUM(ce.points), 0) AS total_points,
                 COUNT(DISTINCT c.id)::int AS competitor_count
          FROM houses h
          JOIN competitors c   ON c.house_code = h.code AND c.carnival_id = ${carnivalId}
          JOIN comp_events ce  ON ce.competitor_id = c.id
          JOIN events e        ON e.id = ce.event_id
          JOIN event_types et  ON et.id = e.event_type_id
          WHERE h.carnival_id = ${carnivalId} AND h.include = true
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          GROUP BY h.name, et.description
          ORDER BY h.name, et.description
        `;
        res.json(
          rows.map((r) => ({
            ...r,
            totalPoints: Number(r.total_points),
            competitorCount: Number(r.competitor_count),
          })),
        );
        return;
      }

      // ── Current Records ───────────────────────────────────────────────────

      if (reportName === 'current-records') {
        const recordDateStr = req.query.record_date as string | undefined;
        const recordDate = recordDateStr ? new Date(recordDateStr) : null;

        const rows = await prisma.$queryRaw<RecordRow[]>`
          SELECT DISTINCT ON (e.id)
            e.id AS event_id,
            et.description AS event_type_description,
            e.age, e.sex,
            r.result, r.surname, r.given_name, r.house_code, r.date, r.comments
          FROM records r
          JOIN events e        ON e.id = r.event_id
          JOIN event_types et  ON et.id = e.event_type_id
          WHERE et.carnival_id = ${carnivalId}
            ${recordDate ? Prisma.sql`AND r.date >= ${recordDate}` : Prisma.sql``}
            ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
          ORDER BY e.id, r.date DESC
        `;
        res.json(
          rows.map((r) => ({
            eventId: Number(r.event_id),
            eventTypeDescription: r.event_type_description,
            age: r.age,
            sex: r.sex,
            result: r.result,
            holderName: `${r.surname}, ${r.given_name}`,
            houseCode: r.house_code,
            date: r.date,
            comments: r.comments,
          })),
        );
        return;
      }

      throw new ValidationError(`Unknown report name: ${reportName}`);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Competitor List ──────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/competitor-list',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const groupBy = (req.query.group_by as string) ?? 'none';
      const includeOnly = req.query.include_only !== 'false';
      const page = Math.max(1, toNumber(req.query.page, 1));
      const perPage = toNumber(req.query.per_page, 50);

      const where: Prisma.CompetitorWhereInput = {
        carnivalId,
        ...(includeOnly ? { include: true } : {}),
      };

      const [total, competitors] = await Promise.all([
        prisma.competitor.count({ where }),
        prisma.competitor.findMany({
          where,
          include: { house: true },
          orderBy:
            groupBy === 'team' || groupBy === 'team-age'
              ? [{ houseCode: 'asc' }, { surname: 'asc' }, { givenName: 'asc' }]
              : groupBy === 'age'
                ? [{ age: 'asc' }, { surname: 'asc' }, { givenName: 'asc' }]
                : [{ surname: 'asc' }, { givenName: 'asc' }],
          skip: (page - 1) * perPage,
          take: perPage,
        }),
      ]);

      res.json({
        data: competitors.map((c) => ({
          id: c.id,
          fullName: `${c.surname}, ${c.givenName}`,
          age: c.age,
          sex: c.sex,
          houseCode: c.houseCode,
          houseName: c.house.name,
          include: c.include,
        })),
        pagination: { page, perPage, total },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Name Tags ────────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/name-tags',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const competitors = await prisma.competitor.findMany({
        where: { carnivalId, include: true },
        include: { house: true },
        orderBy: [{ houseCode: 'asc' }, { surname: 'asc' }, { givenName: 'asc' }],
      });
      res.json(
        competitors.map((c) => ({
          id: c.id,
          name: `${c.givenName} ${c.surname}`,
          house: c.house.name,
          houseCode: c.houseCode,
          age: c.age,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Entry Sheets ─────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/entry-sheets',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const eventTypeIds = parseCSVIds(req.query.event_type_ids);

      const heats = await prisma.heat.findMany({
        where: {
          event: {
            eventType: {
              carnivalId,
              include: true,
              ...(eventTypeIds ? { id: { in: eventTypeIds } } : {}),
            },
          },
        },
        include: {
          event: { include: { eventType: true } },
          compEvents: {
            include: { competitor: { include: { house: true } } },
            orderBy: { lane: 'asc' },
          },
        },
        orderBy: [{ eventNumber: 'asc' }, { heatNumber: 'asc' }],
      });

      res.json(
        heats.map((h) => ({
          eventType: h.event.eventType.description,
          age: h.event.age,
          sex: h.event.sex,
          finalLevel: h.finalLevel,
          heatNumber: h.heatNumber,
          eventNumber: h.eventNumber,
          competitors: h.compEvents.map((ce) => ({
            lane: ce.lane,
            name: `${ce.competitor.surname}, ${ce.competitor.givenName}`,
            house: ce.competitor.house.name,
            houseCode: ce.competitor.houseCode,
            resultSlot: '',
          })),
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Records ──────────────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/records',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const eventTypeIds = parseCSVIds(req.query.event_type_ids);
      const dateStr = req.query.date as string | undefined;
      const filterDate = dateStr ? new Date(dateStr) : null;

      const rows = await prisma.$queryRaw<RecordRow[]>`
        SELECT DISTINCT ON (e.id)
          e.id AS event_id,
          et.description AS event_type_description,
          e.age, e.sex,
          r.result, r.surname, r.given_name, r.house_code, r.date, r.comments
        FROM records r
        JOIN events e        ON e.id = r.event_id
        JOIN event_types et  ON et.id = e.event_type_id
        WHERE et.carnival_id = ${carnivalId}
          ${filterDate ? Prisma.sql`AND r.date >= ${filterDate}` : Prisma.sql``}
          ${eventTypeIds ? Prisma.sql`AND et.id IN (${Prisma.join(eventTypeIds)})` : Prisma.sql``}
        ORDER BY e.id, r.date DESC
      `;
      res.json(
        rows.map((r) => ({
          eventId: Number(r.event_id),
          eventTypeDescription: r.event_type_description,
          age: r.age,
          sex: r.sex,
          result: r.result,
          holderName: `${r.surname}, ${r.given_name}`,
          houseCode: r.house_code,
          date: r.date,
          comments: r.comments,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Non-Participants ─────────────────────────────────────────────────────────

router.get(
  '/:carnivalId/reports/non-participants',
  requireCarnivalAccess,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const carnivalId = req.carnivalId!;
      const competitors = await prisma.competitor.findMany({
        where: { carnivalId, include: true, compEvents: { none: {} } },
        include: { house: true },
        orderBy: [{ surname: 'asc' }, { givenName: 'asc' }],
      });
      res.json(
        competitors.map((c) => ({
          id: c.id,
          fullName: `${c.surname}, ${c.givenName}`,
          age: c.age,
          sex: c.sex,
          houseCode: c.houseCode,
          houseName: c.house.name,
        })),
      );
    } catch (err) {
      next(err);
    }
  },
);

export default router;
