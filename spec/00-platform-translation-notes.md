# Sports Administrator — Software Specification

## Document 0: Platform Translation Notes

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*This document captures cross-cutting decisions for rebuilding Sport Administrator on a modern web stack (server-side application framework + relational database + browser-based frontend). Read this before any other specification document. It tells you what to translate, what to replace, and what to discard.*

*See [Document 1 — Index & Overview](01-index-and-overview.md) for glossary and conventions.*

---

## 1. Carnival Isolation Strategy

### Original design

The Access application uses a **separate `.accdb` file per carnival**. The main database dynamically links to exactly one carnival file at a time. Switching carnivals means detaching the current file and attaching another.

### Recommended translation

Use a **single database** with a `carnival_id` foreign key on every carnival-scoped table.

```
carnivals
  ├── id (PK)
  ├── name
  ├── created_at
  └── ...

competitors
  ├── id (PK)
  ├── carnival_id (FK → carnivals.id)  ← added
  ├── given_name
  └── ...
```

**Rules:**
- Every table listed as "Carnival database" in Document 2 §1.1 SHALL have a `carnival_id` column.
- All queries SHALL filter by `carnival_id` from the current session context.
- The application SHALL support multiple carnivals in the same database concurrently. Users select their active carnival at login or via a switcher.
- Reference/lookup tables (FinalStatus, HouseTypes, Promotion, Sex Sub, Units, Final Level Sub) MAY be global (no `carnival_id`) since their seed data is identical across carnivals. Alternatively, they can be application constants / enums in code.
- The `Inventory Attached Tables` and `_AlwaysOpen` tables are Access-specific plumbing. **Do not recreate.**

### What this means for Document 2

When the Data Model spec says a table lives in the "Carnival database", translate that as: the table has a `carnival_id` FK and all queries are scoped to the active carnival.

---

## 2. Tables to Discard

The following tables from Document 2 exist only because of Access platform limitations. They SHOULD NOT be created in the new system.

### 2.1 Staging / temporary tables → runtime data structures

| Access Table | Why It Exists | Web Equivalent |
|-------------|---------------|----------------|
| `TEMP1` | Staging for competitor import | In-memory array or temp table during import transaction |
| `EVERYONE1` | Staging for export queries | Query result set — compute on the fly |
| `ImportData` | Staging for disk import | Parse in-memory during import |
| `Competitors-Temp` | Local copy of linked table | Unnecessary — query the table directly |
| `Temporary Memo` | Clipboard buffer | Application variable |
| `Temporary Results-Place Order` | Intermediate place calculation | Compute in-memory during place calculation |
| `Temporary Record-Best in Full` | Record comparison staging | Compute in-memory during record check |
| `Temporary Table` | General scratch space | Not needed |
| `tmpCEAM` | Cache for age-division mapping | Compute on the fly or use a materialised view |
| `EventType_Include` | UI state during bulk operations | Frontend state |

### 2.2 Access-specific system tables

| Access Table | Why It Exists | Web Equivalent |
|-------------|---------------|----------------|
| `_AlwaysOpen` | Keeps carnival DB connection alive | Connection pooling (built into any ORM) |
| `Inventory Attached Tables` | Tracks which linked tables exist | Not needed — single database |
| `USysRibbons` | Stores ribbon XML | Build navigation in frontend framework |
| `accRunCommands` | Access command IDs for zoom/print | Browser handles print/zoom natively |
| `ShowDialog` | UI flag | Frontend state |
| `Misc-EnterCompetitorEvents` | UI state | Frontend state |
| `zzz~Relationships Main` | Template for creating relationships | Define in ORM/migrations |
| `zzz~Relationships Second` | Field mappings for above | Define in ORM/migrations |

### 2.3 Tables that merge into other concepts

| Access Table | Recommendation |
|-------------|----------------|
| `Table Field Names` | Replace with schema metadata or form field labels in the frontend |
| `Operators` | Hardcode comparison operators in filter UI component |
| `Reports-Selected` | Store as user preferences (per-user, per-carnival) in a settings table or frontend state |

---

## 3. Singleton Tables → Carnival Settings

The Access application uses **single-row tables** (Miscellaneous, MiscHTML, MiscellaneousLocal) as configuration stores. These are an Access anti-pattern.

### Recommended translation

**Carnival-level settings** (the `Miscellaneous` and `MiscHTML` tables):
- Create a `carnival_settings` table with `carnival_id` as PK (one row per carnival).
- Columns from both `Miscellaneous` and `MiscHTML` merge into this table.
- Split filter/report preferences from carnival metadata:

```
carnival_settings
  ├── carnival_id (PK, FK → carnivals.id)
  ├── title              -- was CarnivalTitle
  ├── footer             -- was CarnivalFooter
  ├── open_age           -- was OpenAge (default: 99)
  ├── house_type_id      -- was HouseType
  ├── meet_manager_team  -- was Mteam
  ├── meet_manager_code  -- was Mcode
  ├── meet_manager_top   -- was Mtop
  └── ...

Note: The Access `MiscHTML` fields (`GenerateHTML`, `ReportHeader`, `TemplateFile`, `TemplateFileSummary`, `HTMLlocation`) exist to drive a **static HTML export** system. In a web application, results are served directly by the app — there is no need to generate standalone HTML files. These fields can be **omitted entirely** unless a static-site publishing feature is explicitly required. See §15 for more detail.
```

**Application-level settings** (the `MiscellaneousLocal` table):
- Move to environment variables or an `app_settings` table.
- Fields like `License`, `AlertToRecord`, `ShowDialog` become app config.
- Per-user filter preferences (`CES*`, `R*` fields) become user-scoped state, either in a `user_preferences` table or stored client-side.

**Report selection state** (`Reports-Selected`):
- Store as user preferences, not a global singleton.

---

## 4. Key Type Translations

When translating the Access/Jet SQL types from Document 2 to a modern relational database:

| Access Type | Standard SQL / Typical Mapping | Notes |
|------------|-------------------------------|-------|
| `AUTOINCREMENT` | Auto-incrementing integer (e.g., `SERIAL`, `AUTO_INCREMENT`, `IDENTITY`) | Use as `id` primary key |
| `LONG` | `INTEGER` | |
| `SHORT` | `SMALLINT` | |
| `BYTE` | `SMALLINT` | Most databases have no unsigned byte; use `SMALLINT` with CHECK ≥ 0 |
| `BIT` | `BOOLEAN` | |
| `SINGLE` | `REAL` / `FLOAT` | 4-byte float |
| `DOUBLE` | `DOUBLE PRECISION` / `FLOAT(53)` | 8-byte float |
| `VARCHAR(n)` | `VARCHAR(n)` or `TEXT` | Use `TEXT` if your database has no performance penalty for unbounded strings. Use `VARCHAR(n)` where a hard limit is meaningful. |
| `LONGTEXT` | `TEXT` | |
| `DATETIME` | `TIMESTAMP WITH TIME ZONE` | Always store with timezone in a web app |

### Naming conventions

Translate Access column names to `snake_case`:

| Access Name | Recommended Name |
|------------|---------------|
| `ET_Code` | `event_type_id` |
| `E_Code` | `event_id` |
| `H_Code` | `house_code` |
| `H_ID` | `house_id` |
| `H_NAme` | `house_name` |
| `F_Lev` | `final_level` |
| `PIN` | `id` (on competitors table) |
| `nResult` | `numeric_result` |
| `TTres` | *(drop — legacy field)* |
| `ET_Des` | `description` |
| `Pro_Type` | `promotion_type` |
| `PtScale` | `point_scale` |
| `Lane_Cnt` | `lane_count` |
| `HE_Code` | *(drop — use surrogate `id` instead)* |
| `HT_Code` | `house_type_id` |
| `R_Code` | `report_type_id` |
| `CompPool` | `competition_pool` |
| `Gname` | `given_name` |
| `DOB` | `date_of_birth` |
| `TotPts` | `total_points` |
| `Hphone` | `home_phone` |
| `Wphone` | `work_phone` |
| `RecName` | `record_holder_name` |
| `RecHouse` | `record_holder_house_id` |

---

## 5. Composite Keys → Surrogate Keys

The Access schema uses **composite primary keys** in several tables. While most relational databases support composite keys, using surrogate `id` columns simplifies ORM usage, API design, and frontend data binding.

| Table | Access PK | Recommended PK | Keep composite as |
|-------|-----------|-----------------|-------------------|
| `Heats` | `(E_Code, F_Lev, Heat)` | `id SERIAL` | UNIQUE constraint |
| `CompEvents` | none (implicit composite) | `id SERIAL` | UNIQUE constraint on `(competitor_id, event_id, final_level, heat)` |
| `Final_Lev` | `(ET_Code, F_Lev)` | `id SERIAL` | UNIQUE constraint |
| `CompetitorEventAge` | `(Cage, Eage)` | `id SERIAL` | UNIQUE constraint |
| `Lane Promotion Allocation` | none | `id SERIAL` | UNIQUE constraint on `(event_type_id, place)` |

Foreign keys from `CompEvents` to `Heats` SHOULD reference the surrogate `heats.id` rather than the old composite. This simplifies the cascade chain.

---

## 6. Reference Data → Enums or Seed Data

Several small lookup tables can be replaced by database enums or application-level constants:

| Access Table | Records | Recommendation |
|-------------|---------|----------------|
| `FinalStatus` | 4 rows (Future, Active, Completed, Promoted) | Database enum (e.g., `ENUM('future', 'active', 'completed', 'promoted')`) or app-level constant |
| `Promotion` | 3 rows (NONE, Smooth, Staggered) | `ENUM('none', 'smooth', 'staggered')` |
| `Sex Sub` | 3 rows (M, F, -) | `ENUM('male', 'female', 'mixed')` |
| `Units` | 6 rows | Seed data in migration, or app-level constant with sort-order logic in code |
| `Final Level Sub` | 8 rows | Seed data in migration. Display labels for final levels. |
| `HouseTypes` | 6 rows | Seed data in migration. Rarely changes. |

---

## 7. Denormalised Fields

The Access schema stores several **computed values** as persistent columns. In a web app, decide per-field whether to compute on read or store:

| Field | Location | What It Stores | Recommendation |
|-------|----------|----------------|----------------|
| `Competitors.TotPts` | Competitors | Sum of all CompEvents.Points | **Compute on read** via `SUM()` query, or maintain via database trigger. Do not rely on application code to keep it in sync. |
| `Competitors.Age` | Competitors | Age derived from DOB | **Compute on read** from `date_of_birth`. Store only if imports provide age without DOB. |
| `Events.nRecord` / `Events.Record` | Events | Duplicate of Records table | **Remove from Events.** Query the Records table directly. |
| `CompEvents.nResult` | CompEvents | Parsed numeric form of Result | **Keep.** Parsing happens at entry time; storing avoids re-parsing on every query. Index this column for sorting. |
| `CompEvents.Points` | CompEvents | Computed from Place + PointScale | **Keep.** Recompute only when places change. Simpler than a real-time join. |

---

## 8. Concurrency Model

The Access application is **single-user, single-session**. A web application must handle concurrent access.

### Decisions for the rebuild:

| Concern | Decision |
|---------|----------|
| **Multi-user result entry** | Multiple operators MAY enter results for **different events** simultaneously. Two operators SHOULD NOT edit the **same heat** at the same time. Use optimistic locking (version column) on heats to detect conflicts. |
| **Promotion safety** | Promotion (advancing competitors to the next final level) SHALL be an atomic transaction. If two users attempt to promote the same heat, the second attempt SHALL fail with a conflict error. |
| **Record updates** | Record-breaking detection and update SHALL use a database transaction with row-level locking on the Records row for that event. |
| **Carnival settings** | Settings edits are rare and low-risk. Last-write-wins is acceptable. |
| **Report generation** | Read-only. No locking needed. Reports reflect the state at query time. |

### Implementation guidance

Add a `version` column (`INTEGER DEFAULT 1`) to tables where concurrent edits are possible:
- `heats` — increment on status change, result entry
- `comp_events` — increment on result/place update
- `records` — increment on record change

On update, include `WHERE version = :expected_version`. If zero rows are affected, return a 409 Conflict.

---

## 9. Authentication & Authorisation

The Access application has **no authentication**. Anyone who opens the file has full access. A "Developer Mode" toggle hides the Access development UI but provides no security.

### Decisions for the rebuild:

| Concern | Decision |
|---------|----------|
| **Authentication** | SHALL require user login. Use email + password or an OAuth provider. |
| **Roles** | Define at minimum: **Admin** (full access, manage carnivals/users), **Coordinator** (setup events, import competitors, manage settings for their carnival), **Operator** (enter results, view reports for their carnival), **Viewer** (read-only access to results and reports). |
| **Carnival scoping** | Users SHALL be assigned to one or more carnivals. All data access SHALL be scoped to the user's assigned carnival(s). |
| **Developer Mode** | Not needed. The web app has no "design view" to hide. Admin features are role-gated instead. |

---

## 10. Schema Migration Strategy

The Access application checks carnival database structure at open time and adds missing fields/tables inline (see Document 2 §8). This is a custom migration system.

### Recommended translation

Use a **standard migration tool** appropriate to your stack (e.g., Flyway, Liquibase, Alembic, Prisma Migrate, Knex migrations, ActiveRecord migrations, or raw SQL migrations):
- All schema changes are versioned migration files in source control.
- Migrations run automatically on deploy.
- No runtime schema checks needed — the database is always at the current version.
- The Access-era migration list in Document 2 §8 is historical context only. It does not need to be reimplemented.

---

## 11. API Design Guidance

The Access application has no API — forms read/write directly to tables via DAO. A web rebuild needs to define an API layer between frontend and backend.

### Recommended approach

Organise the API around the **domain operations** described in Documents 3–8, not around CRUD on individual tables. Core resource groups:

| Resource | Key Operations |
|----------|---------------|
| `/carnivals` | List, create, get, update, delete, switch active |
| `/carnivals/:id/competitors` | List, create, import (bulk), get, update, delete |
| `/carnivals/:id/events` | List (with event type details), get event with heats |
| `/carnivals/:id/event-types` | List, create, get, update, delete, auto-create heats |
| `/carnivals/:id/heats` | Get, update status, enter results (batch), calculate places, promote |
| `/carnivals/:id/heats/:id/results` | List, create/update result for a competitor |
| `/carnivals/:id/records` | List, get by event |
| `/carnivals/:id/houses` | List, create, get, update, delete, get points summary |
| `/carnivals/:id/reports` | Generate report by type (query params for filters) |
| `/carnivals/:id/exports/meet-manager` | Generate Meet Manager export file |
| `/carnivals/:id/settings` | Get, update carnival settings |
| `/point-scales` | List, create, get, update (may be global or per-carnival) |

### Key operation notes

- **Result entry** is the most latency-sensitive operation. It should accept a batch of results for one heat and return calculated places + record-check results in one round trip.
- **Promotion** is a complex write that creates new CompEvent rows in the next final level. It should be a single POST that returns the newly created heat(s) with competitor assignments.
- **Report generation** should return structured data (JSON), with the frontend responsible for rendering. Optionally support PDF export server-side.
- **Import** should accept CSV/Excel upload, validate, return preview with errors, then confirm to commit.

---

## 12. What Each Remaining Document Should Provide

Based on the gaps identified in the review, here is what each remaining specification document SHALL include to be sufficient for AI-assisted code generation:

| Document | Required Content |
|----------|-----------------|
| **3 — Carnival Lifecycle** | Operations as input→processing→output. Translate split-DB operations to carnival_id-scoped CRUD. Include create-with-seed-data flow. |
| **4 — Competitor Management** | Import operation: accepted file formats, column mapping, validation rules with specific error conditions, conflict handling (duplicate names). Manual entry validation rules. |
| **5 — Events & Heats** | **Pseudocode** for `AutomaticallyCreateHeatsAndFinals()` and `PromoteEventFinal()`. Decision tree for promotion type selection. Examples with concrete numbers. |
| **6 — Results & Scoring** | **Pseudocode** for result parser with a **test vector table** (input string + unit → expected numeric_result + formatted display). Place calculation algorithm. Record-check decision flow. |
| **7 — Reporting** | Each report as a **data query specification**: fields, joins, filters, grouping, sorting. Not Access report layouts. Include sample output structure. |
| **8 — HTML Export & Data Exchange** | Meet Manager file format specs with field-by-field mapping. Carnival disk export. **HTML export is likely redundant** — the web app serves results directly. Document 8 retains the HTML export spec for reference but flags it as optional. |
| **9 — UI & Navigation** | **User task flows** (numbered steps), **screen inventory** (data displayed + actions available per screen), not Access form properties. |
| **10 — Deployment & Security** | Skip Access-specific content (Trusted Locations, NSIS installer, `.accdr`). Instead: environment variables, database connection config, CORS, rate limiting, backup strategy. |

---

## 14. Summary of Cross-Cutting Decisions

| Decision | Choice |
|----------|--------|
| Carnival isolation | Single database, `carnival_id` FK on all carnival-scoped tables |
| Primary keys | Surrogate `SERIAL id` on all tables; composite business keys become UNIQUE constraints |
| Naming | `snake_case` for all columns and tables |
| Temporary/staging tables | Do not persist — use in-memory processing |
| Singleton config tables | Merge into `carnival_settings` (per-carnival) and `app_settings` (global) |
| Small lookup tables | Database enums or application constants |
| Computed fields | Prefer compute-on-read; store only `numeric_result` and `points` |
| Concurrency | Optimistic locking via `version` column on heats, comp_events, records |
| Authentication | Required; role-based (Admin, Coordinator, Operator, Viewer) |
| Schema migrations | Standard migration tool; no runtime schema checks |
| API style | RESTful, organised by domain resource, with batch operations for result entry |
| Legacy/dropped fields | `TTres` (superseded by nResult), `HE_Code` (replaced by surrogate id), `Completed` (superseded by Status) |
| HTML export system | **Likely redundant.** The web app serves results pages directly. The static HTML generation system (Document 8 §2), the `MiscHTML` settings, and the `tblReportsHTML` configuration table can be omitted unless static-site publishing is a requirement. Meet Manager export and Carnival Disk export remain relevant. |

---

## 15. HTML Export — Redundancy Note

The Access application includes a **static HTML export system** (documented in Document 8 §2) because it is a desktop app with no web presence. Users generate `.htm` files and upload them to a school website to publish results online.

In a web application, this entire subsystem is **redundant**:

- Results, standings, records, and reports are served directly by the application.
- Public/read-only views can be exposed via shareable URLs (no file generation needed).
- The template system, `MiscHTML` settings table, `tblReportsHTML` configuration table, and the `HTML Code.bas` helper module have no equivalent.

**Recommendation:** Do not implement the HTML export system. Instead:

| Access Feature | Web Equivalent |
|---------------|----------------|
| Static `.htm` result pages | Public report URLs (e.g., `/carnivals/:id/public/results`) |
| HTML template files | Application view templates (already part of the web framework) |
| `sport.css` | Application stylesheet |
| Summary/index page | Public carnival dashboard page |
| `tblReportsHTML` config | Not needed — report rendering is handled by the UI layer |
| `MiscHTML` settings | Not needed |

Document 8 retains the full HTML export specification for historical reference and in case a static-site publishing feature is ever desired (e.g., generating a ZIP of HTML files for download). Builders should treat Document 8 §2 as **optional/deferred**.

---

*Next: [Document 1 — Index & Overview](01-index-and-overview.md)*
