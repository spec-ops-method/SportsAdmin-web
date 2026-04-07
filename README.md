# SportsAdmin-web

A modern web application rebuild of [Sports Administrator](https://github.com/ruddj/SportsAdmin), an open-source school athletics and swimming carnival management system.

## Background

Sports Administrator was originally developed around 2000 by Andrew Rogers for Christian Outreach College, Brisbane (now known as [Citipointe Christian College](https://citipointe.qld.edu.au/)). It was commercially distributed as a Microsoft Access 97 application before being open-sourced and migrated to Access 2010+ by James Rudd in 2017. The application manages the complete lifecycle of a school sports carnival — event setup, competitor registration, results entry, automatic place and points calculation, promotion through heats to finals, record tracking, and reporting.

The goal of this project is to rebuild Sports Administrator as a modern web application while preserving full functional parity with the original.

## Repository Structure

```
├── api/           # Express + TypeScript backend
│   ├── src/
│   │   ├── prisma/    # Schema, migrations, seed
│   │   ├── routes/    # Express route handlers
│   │   ├── services/  # Business logic (result parsing, scoring)
│   │   └── middleware/
│   └── tests/
├── client/        # React + Vite frontend
│   ├── src/
│   │   ├── pages/     # One file per page/feature
│   │   ├── components/
│   │   ├── context/
│   │   └── hooks/
│   └── tests/
├── shared/        # Shared TypeScript interfaces (used by both api and client)
├── spec/          # Authoritative software specification (13 documents)
├── plan/          # Implementation plan and development history
├── legacy/        # Original Access application (git submodule)
└── docker-compose.yml
```

### `spec/`

Contains a comprehensive, modular specification suite that describes the existing system in enough detail to rebuild it on a modern web stack. The spec covers the data model, carnival lifecycle, competitor management, events and heats, results and scoring, reporting, HTML export, UI flows, deployment, and security. It includes 145 testable functions for verifying the rebuilt system against the original.

This project follows **spec-first development** — all functional changes are documented in the spec before they are implemented in code. See [spec/README.md](spec/README.md) for the full workflow and document index. Any changes to the spec files in the `spec/` directory will automatically generate new issues via the [SpecOps workflow](.github/workflows/spec-ops.yml) set up in this directory.

### `plan/`

Contains the [implementation plan](plan/IMPLEMENTATION-PLAN.md) documenting how the rebuild was planned and executed — technology choices, how the spec was read to form the plan, a phase-by-phase breakdown of what was built and why, and lessons learned.

### `legacy/`

A git submodule pointing to the [original SportsAdmin repository](https://github.com/ruddj/SportsAdmin). This provides direct access to the legacy Access database source for reference during development.

## What the Application Does

Sports Administrator handles school athletics and swimming carnivals for Australian schools, supporting both intra-school (inter-house) and inter-school competitions. Key capabilities:

- **Carnival setup** — create carnivals, define teams/houses, configure point scales, set up events in a three-tier hierarchy (event type → division → heat)
- **Competitor management** — manual entry, quick add, and bulk CSV import with validation and duplicate detection
- **Results entry** — flexible input parsing for times, distances, and special tokens (FOUL, PARTICIPATE) with automatic place calculation and tie handling
- **Scoring** — configurable point scales mapping places to points, with different scales for heats vs. finals
- **Promotion** — automated advancement of competitors through final levels (quarter-finals → semi-finals → grand final) with smooth and staggered methods
- **Record detection** — automatic alerts when a result breaks a standing record
- **Reporting** — team standings, cumulative results, event results, competitor cards, records, marshalling lists, and administrative reports
- **HTML export** — static website generation for publishing results via template-based rendering
- **External integration** — carnival disk exchange for inter-school events and Hy-Tek Meet Manager export for district/regional competitions

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker + docker-compose)
- Node.js 20+ (for running tests locally without Docker)

### Run with Docker (recommended)

```bash
# Clone the repo (include the legacy submodule if needed)
git clone --recurse-submodules https://github.com/your-org/SportsAdmin-web.git
cd SportsAdmin-web

# Copy the environment template
cp .env.example .env

# Start everything (Postgres + API + client)
npm run dev
# or: docker compose up
```

| Service | URL |
|---------|-----|
| Client (React app) | http://localhost:5173 |
| API | http://localhost:3000 |
| Postgres | localhost:5432 |

The API and client both support **hot reload** — edit files under `api/src/` or `client/src/` and changes apply instantly without restarting containers.

### Create your first user

The database starts empty. Add these lines to your `.env` file, then run the seed:

```bash
# In .env:
DATABASE_SEED_ADMIN_EMAIL=admin@example.com
DATABASE_SEED_ADMIN_PASSWORD=changeme
```

```bash
docker compose exec api npm run db:seed
```

The seed variables in `.env` are passed into the container via `env_file` in `docker-compose.yml`. Log in at http://localhost:5173 with those credentials.

### Run without Docker

```bash
# Install dependencies
npm install

# Start Postgres separately (or point DATABASE_URL at an existing instance)
# Then in one terminal:
cd api && npm run dev

# And in another:
cd client && npm run dev
```

Set `DATABASE_URL` in `api/.env` before starting. Run `npm run db:migrate:dev` inside `api/` to apply migrations on first run.

---

## Using the Application

### Typical workflow

1. **Create a carnival** — give it a name and dates on the Carnivals page.
2. **Add houses/teams** — the groups competing for points (e.g. Red, Blue, Green, Gold).
3. **Configure event types** — define the disciplines (100m Sprint, Long Jump, etc.) with units, lane counts, and heat structure (how many rounds, how many heats per round).
4. **Import or add competitors** — use the CSV importer for bulk upload or the quick-add form for individuals.
5. **Generate heats** — the system automatically distributes competitors across heats based on your final-level configuration.
6. **Run the carnival** — enter results heat by heat. The parser accepts times (`12.34`, `1:23.45`), distances (`6.42`), and special tokens (`FOUL`, `P`).
7. **Calculate places** — click "Calculate Places" on each heat. Ties are handled automatically; records are flagged for confirmation.
8. **Promote** — advance heat winners to the next round (semi-finals → final) using smooth or staggered promotion.
9. **View reports** — the Reports page shows live house standings, marshalling lists for officials, age champions, and statistical breakdowns.
10. **Export** — download a Meet Manager file for integration with district/regional timing systems, or export a Carnival Disk ZIP to share results with other schools.

### Role hierarchy

| Role | Can do |
|------|--------|
| `viewer` | Read-only access to results and reports |
| `operator` | Enter results, manage competitors |
| `coordinator` | Full carnival management, export/import |
| `admin` | Manage users, access all carnivals |

---

## Development

### Running tests

```bash
# All tests
npm test

# API tests only
cd api && npm test

# Client tests only
cd client && npm test
```

### Type checking

```bash
cd api && npx tsc --noEmit
cd client && npx tsc --noEmit
```

### Database tools

```bash
# Open Prisma Studio (visual DB browser)
cd api && npm run db:studio

# Apply pending migrations
cd api && npm run db:migrate

# Create a new migration after schema changes
cd api && npm run db:migrate:dev -- --name describe-your-change
```

---



MIT