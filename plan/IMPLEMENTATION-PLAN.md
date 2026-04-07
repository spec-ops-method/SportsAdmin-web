# SportsAdmin Web — Implementation Plan

This document describes how we took a 25-year-old Microsoft Access application and rebuilt it as a modern web application. It covers how we read the spec, formed a plan, and executed it phase by phase.

---

## The Starting Point

**SportsAdmin** is a desktop application used by Australian schools to manage athletics and swimming carnivals — creating events, entering competitors, recording heat results, calculating places, tracking records, and producing reports for officials.

The goal was **full functional parity** with the Access version on a modern, maintainable web stack.

The spec was provided as 13 structured Markdown documents covering every feature domain. These became the authoritative source of truth throughout the project.

---

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Backend | Node.js + Express + TypeScript | Typed, widely known, fast to iterate |
| ORM | Prisma | Schema-first, type-safe, great migration story |
| Database | PostgreSQL | Relational data with complex joins and window functions |
| Frontend | React + Vite + TypeScript | Component model fits the form-heavy UI |
| Styling | CSS Modules | Scoped styles without a framework dependency |
| Auth | JWT (RS256) | Stateless, suitable for future mobile clients |
| Containers | Docker + docker-compose | Reproducible local dev and deployment |
| Testing | Jest (API) + Vitest + RTL (client) | Standard choices for each environment |
| Monorepo | npm workspaces | Shared types between api and client without a build step |

---

## Reading the Spec

Before writing any code, we read all 13 spec documents to understand:

1. **Domain model** — What are the core entities? (Carnivals, Houses, Competitors, Events, Heats, CompEvents, Records, PointScales)
2. **Relationships** — How do they relate? (Everything is scoped to a Carnival via `carnival_id` FK with cascade delete)
3. **Business rules** — What logic lives in the data layer vs the application layer? (Heat generation algorithm, promotion algorithms, result parsing, place calculation with tie handling)
4. **Access control** — Who can do what? (4-level role hierarchy: viewer → operator → coordinator → admin)
5. **Report requirements** — What queries need to work? (42 report variants across 8 categories)
6. **Data exchange** — What import/export formats are needed? (Hy-Tek Meet Manager semicolon format, CSV per-house carnival disk)

### Key Observations From the Spec

- **Heat status machine**: `future → active → completed → promoted` — all heats at the same event+level share one status.
- **Final level numbering is inverted**: 0 = Grand Final (last round), higher numbers = earlier rounds. Competitors promote *downward*.
- **Two promotion algorithms**: Smooth (fill target heats sequentially) and Staggered (round-robin across target heats).
- **Result sentinels**: FOUL = `3e38` (ASC/time events) or `-1e38` (DESC/distance events). Detected by `Math.abs(n) >= 1e37`.
- **ASC vs DESC scoring**: Time units (Seconds, Minutes, Hours) are ASC (lower is better). Distance/points (Meters, Kilometres, Points) are DESC.
- **Tie handling**: Tied competitors share a place; the next place skips by group size.
- **`flag` field**: Used to mark which event types and houses contribute to age champion and statistical reports.

---

## The Plan

We broke the work into **8 phases**, each delivering a vertical slice of functionality — API + database schema + frontend + tests — so that each phase produced a working, testable increment.

### Phase 1 — Foundation
**Goal:** Scaffold the monorepo, get auth working end-to-end, prove the stack.

- npm workspaces: `api/`, `client/`, `shared/`
- Prisma schema: User, UserCarnival, Units, HouseTypes, FinalLevelLabels
- Express app with JWT auth middleware, role-based access, rate limiting
- Auth routes: register, login, logout, profile
- React + Vite client: AuthContext, ProtectedRoute, AppShell, LoginPage
- Docker: multi-stage Dockerfile for API + Nginx-served client, docker-compose with hot-reload
- Tests: Jest (API), Vitest + RTL (client)

**Why first:** Without auth and the monorepo scaffold, nothing else can be built. This phase proved the stack worked end-to-end before investing in domain logic.

---

### Phase 2 — Carnival & House Management
**Goal:** Core administrative entities — the container for all carnival data.

- Prisma schema: Carnival, CarnivalSettings, House, HousePointsExtra
- API: Carnival CRUD + copy + settings, House CRUD + extra points
- Middleware: `carnivalAccess` — enforces that non-admins need a `user_carnivals` row
- Frontend: CarnivalContext (active carnival with localStorage persistence), Carnivals page, Houses page, CarnivalSettings form, AppShell nav with carnival switcher

**Key decision:** Single database, `carnival_id` FK on all carnival-scoped tables with `ON DELETE CASCADE`. This makes carnival deletion clean and keeps queries simple.

---

### Phase 3 — Competitor Management
**Goal:** The people who compete — creation, import, organisation.

- Prisma schema: Competitor, CompetitorEventAge
- API: Competitors service (age calculation, DOB derivation, name normalisation), 14 routes including CSV import with preview token, bulk ops, roll-over/back
- Frontend: Competitors page (search/filter/pagination/bulk), ImportPanel (two-step wizard), CompetitorEventAgeConfig

**Key decision:** CSV preview uses a module-level `Map<string, { rows, expiresAt }>` (no Redis, 10-minute expiry). Simple and sufficient for a single-server deployment.

---

### Phase 4 — Events & Heats
**Goal:** The competition structure — event types, divisions, heat generation, lane management, event ordering.

- Prisma schema: EventType, Event, FinalLevel, Heat, CompEvent, LaneTemplate, Lane, LanePromotionAllocation
- API: Event type CRUD + copy, final level management, heat generation algorithm, lane management, heat status transitions, competitor entry/removal, promotion (Smooth + Staggered), event ordering + auto-number
- Frontend: EventTypes list, EventType detail (4-tab: Events/Final Levels/Lanes/Settings), HeatDetail scaffold, EventOrder programme

**Key algorithm — heat generation:**
1. Read FinalLevel rows for the event type (sorted by finalLevel DESC = earliest rounds first)
2. For each final level, create `numHeats` Heat rows per Event division (age/sex)
3. Auto-enter competitors into the highest-numbered final level heats

**Key algorithm — promotion:**
- *Smooth*: fill target heats sequentially (top finisher → heat 1, next → heat 1 until full, overflow → heat 2...)
- *Staggered*: distribute round-robin (1st → heat 1, 2nd → heat 2, 3rd → heat 3, 4th → heat 1 again...)

---

### Phase 5 — Results & Scoring
**Goal:** The core loop — enter results, calculate places, detect records, score competitors.

- Prisma schema: PointScale, PointScaleEntry, Record
- Services:
  - `resultParser.ts` — parse user input (times, distances, special values) into a normalised numeric + formatted string
  - `scoring.ts` — calculatePlaces (with tie handling), detectRecords, acceptRecord, recalcAllPoints (raw SQL for bulk performance)
- API: 18 endpoints for result entry, place calculation, record management, point scales, bulk recalc
- Frontend: HeatDetail upgraded (ResultCell with unit hints, live parse feedback, Complete Heat → RecordModal, Calculate Places), PointScales page, EventRecords page, Toast notifications

**Key design — result parser:**
Input can be `"12.34"`, `"1:23.45"`, `"1:23:45.67"`, `"FOUL"`, `"P"` (participate), or empty.
Output is always `{ formatted: string, numeric: number, success: boolean }`.
The numeric representation uses sentinels (`3e38`/`-1e38`) for FOUL/PARTICIPATE so they sort correctly without special-casing in every query.

---

### Phase 6 — Carnival Lifecycle
**Goal:** Carnival deep-copy, full JSON export/import, and the `flag` system for reports.

- Schema: Added `flag Boolean @default(true)` to EventType and House
- API: Complete carnival deep-copy (event types + final levels + lane templates + events + heats + point scales; records cleared, heats reset to active/future; competitors NOT copied)
- API: `GET /carnivals/:id/export` — streams a complete JSON bundle for backup/transfer
- API: `POST /carnivals/import` + `POST /carnivals/import/preview` — validates and imports a bundle with full ID remapping in a transaction
- Frontend: Export/Import UI on Carnivals page, Flag toggle columns on EventTypes and Houses pages

**Why this approach for export/import:** The Access "Carnival Disk" concept was a proprietary binary format. We replaced it with structured JSON — transparent, version-tagged, and easy to inspect or transform.

---

### Phase 7 — Reporting
**Goal:** The 42 reports covering everything officials need before, during, and after a carnival.

- Prisma schema: ReportType (seed data: 6 r_codes for marshalling layout types)
- API: 9 reporting endpoints
  - `house-points` — grand total with window function percentage calculation
  - `program` — programme of events (3 variants)
  - `event-lists` — marshalling lists filtered by age/sex/status/event type
  - `statistics/:reportName` — 14 variants: overall/by-age/by-sex/by-age-gender/by-place/cumulative/event-results/event-places/event-times-best/competitor-events/competitor-results-by-team-event/age-champions/age-champions-all-divisions/current-records/non-participants
  - `competitor-list`, `name-tags`, `entry-sheets`, `records`, `non-participants`
- Frontend: Reports page with collapsible sidebar categories, gold/silver/bronze house points table, cumulative running totals, marshalling heat blocks, age champions grouped by division, `window.print()` with `@media print` CSS

**Key SQL challenge — house points percentage:**
```sql
ROUND(
  (event_points + extra_points)::numeric
  / NULLIF(SUM(SUM(ce.points)) OVER (), 0)::numeric * 100, 1
)
```
The `SUM(SUM()) OVER ()` pattern (aggregate inside window function) is valid PostgreSQL. The `::numeric` cast on the divisor is required because `ROUND(float8, int)` doesn't exist in PostgreSQL — only `ROUND(numeric, int)`.

---

### Phase 8 — Data Exchange & Dashboard
**Goal:** Integration with external systems (Hy-Tek Meet Manager) and a useful landing page.

- API: Meet Manager export (entries semicolon-delimited, athletes, RE1 registration format), division mapping CRUD
- API: Carnival Disk ZIP export (per-house CSVs via `archiver`), CSV multi-file import with upsert by PIN or name
- API: `GET /carnivals/:id/dashboard` — stats summary + recent results
- Frontend: MeetManager page (division mapping table + 3 export buttons), CarnivalDisk page (export ZIP + multi-file import), Dashboard upgraded from placeholder to stat cards + recent activity + quick actions

---

## What We Built

| Metric | Count |
|--------|-------|
| Prisma models | 20 |
| API routes | ~120 |
| Frontend pages | 18 |
| API tests | 135 |
| Client tests | 27 |
| Git commits | 9 |

### Route Summary

| Router | Coverage |
|--------|----------|
| `auth.ts` | Register, login, logout, profile |
| `carnivals.ts` | CRUD, copy, settings, dashboard, export, import |
| `houses.ts` | CRUD, flag toggle, extra points |
| `competitors.ts` | CRUD, quick-add, CSV import, bulk ops, roll-over |
| `eventTypes.ts` | CRUD, copy, events, final levels, heat generation, lanes |
| `heats.ts` | Detail, update, competitor entry, promotion, event order |
| `results.ts` | Result entry, place calculation, records, point scales, bulk recalc |
| `reports.ts` | House points, programme, marshalling, 14 statistics variants |
| `meetManager.ts` | Division mapping, entries/athletes/RE1 export |
| `carnivalDisk.ts` | ZIP export, CSV import |

---

## Lessons Learned

1. **Spec documents as source of truth** — Having 13 detailed spec docs meant we could implement features confidently without guessing intent. The SQL queries in the spec (§5 of the reporting doc) were particularly valuable.

2. **Parallel agents for speed** — Phases 4–8 all used parallel API + frontend background agents. This roughly halved wall-clock time. The key was writing comprehensive prompts with full context so agents didn't need to ask questions.

3. **Prisma without a running DB** — The test environment ran migrations against a real PostgreSQL instance (`sportsadmin_test`). Development used `schema.prisma` only. Using `as any` for Prisma query clauses avoided generated-client type errors without sacrificing runtime correctness.

4. **Shared types package** — The `shared/types/index.ts` module used by both `api` and `client` via `@sportsadmin/shared` path alias prevented drift between API response shapes and frontend expectations.

5. **Test isolation matters** — Early tests sent `houseCode` where the API required `houseId`. These were caught in the final integration run. Writing tests that exercise the real HTTP stack (supertest) catches this class of bug; unit tests of the route handler alone would not.

6. **PostgreSQL type precision** — The `ROUND(float8, n)` function doesn't exist in PostgreSQL; only `ROUND(numeric, n)` does. Always cast window function results to `::numeric` before `ROUND`. This was a runtime error that TypeScript couldn't catch.
