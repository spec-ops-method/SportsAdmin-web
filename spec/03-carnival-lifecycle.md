# Sports Administrator — Software Specification

## Document 3: Carnival Lifecycle

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 3. Load with Documents 0, 1, and 9 §Carnival screens.*

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.*

---

## 1. Overview

A **carnival** is the top-level entity in the system — a single sporting competition (e.g., "2026 Inter-House Athletics"). All competitors, events, heats, results, and records belong to exactly one carnival.

This document specifies the operations for creating, configuring, selecting, copying, renaming, deleting, backing up, and exporting/importing carnival data.

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `carnivals` | Registry of all carnivals |
| `carnival_settings` | Per-carnival configuration (merged from Access Miscellaneous + MiscHTML) |
| `houses` | Teams/houses within a carnival |
| `house_types` | Lookup: types of team groupings |
| `house_points_extra` | Manual point adjustments for houses |

---

## 2. Carnival CRUD

### 2.1 Create Carnival

**Operation:** Create a new carnival with default configuration and seed data.

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | Yes | Non-empty, max 50 chars, unique across all carnivals |

**Processing:**

1. Validate `name` is unique (case-insensitive).
2. Insert row into `carnivals`.
3. Insert row into `carnival_settings` with defaults:

| Setting | Default Value |
|---------|---------------|
| `title` | `name` (copied from input) |
| `footer` | "Hosted by" |
| `open_age` | 99 |
| `house_type_id` | 2 (Inter-School) |
| `meet_manager_top` | 3 |
| `alert_to_record` | true |
| `html_export_enabled` | false |
| `report_head_1` | "Lane" |
| `report_head_2` | "Time" |

4. Return the created carnival with its `id`.

**Response:** `201 Created` with carnival object.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Name empty or whitespace | 400 | "Carnival name is required" |
| Name already exists | 409 | "A carnival with this name already exists" |

---

### 2.2 List Carnivals

**Operation:** Return all carnivals.

**Response:** Array of carnival objects:

```json
[
  {
    "id": 1,
    "name": "2026 Inter-House Athletics",
    "created_at": "2026-03-15T10:00:00Z",
    "competitor_count": 245,
    "event_count": 48
  }
]
```

The `competitor_count` and `event_count` are computed via `COUNT()` subqueries.

---

### 2.3 Get Carnival

**Operation:** Return a single carnival with its settings and summary statistics.

**Response:**

```json
{
  "id": 1,
  "name": "2026 Inter-House Athletics",
  "created_at": "2026-03-15T10:00:00Z",
  "settings": {
    "title": "2026 Inter-House Athletics",
    "footer": "Hosted by Example School",
    "open_age": 99,
    "house_type_id": 2,
    "alert_to_record": true,
    "report_head_1": "Lane",
    "report_head_2": "Time",
    "meet_manager_team": "",
    "meet_manager_code": "",
    "meet_manager_top": 3,
    "html_export_enabled": false,
    "html_report_header": ""
  },
  "summary": {
    "competitor_count": 245,
    "house_count": 4,
    "event_type_count": 12,
    "event_count": 48,
    "heats_completed": 30,
    "heats_total": 52
  }
}
```

---

### 2.4 Update Carnival

**Operation:** Update carnival name and/or settings.

**Input:** Partial update — only supplied fields are changed.

```json
{
  "name": "2026 Inter-House Athletics — Day 2",
  "settings": {
    "title": "2026 Inter-House Athletics — Day 2",
    "footer": "Hosted by Example School"
  }
}
```

**Validation:**
- If `name` is supplied, it must be unique (excluding current carnival).
- Settings fields are validated per the carnival_settings schema (see §2.1 for types).

**Response:** `200 OK` with updated carnival object.

---

### 2.5 Delete Carnival

**Operation:** Delete a carnival and all associated data.

**Processing:**
1. Delete all dependent records in cascade order:
   - `comp_events` → `heats` → `events` → `event_types`
   - `competitors`, `records`, `houses`, `house_points_extra`
   - `carnival_settings`
   - `carnivals`
2. This SHOULD be implemented via `ON DELETE CASCADE` foreign keys from all carnival-scoped tables to `carnivals.id`.

**Confirmation:** The API SHOULD require an explicit confirmation parameter (e.g., `?confirm=true`) to prevent accidental deletion.

**Response:** `204 No Content`.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Carnival not found | 404 | "Carnival not found" |
| Missing confirmation | 400 | "Deletion requires confirm=true" |

---

### 2.6 Copy Carnival

**Operation:** Create a new carnival by duplicating all data from an existing one.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_carnival_id` | integer | Yes | Carnival to copy from |
| `name` | string | Yes | Name for the new carnival |

**Processing:**

1. Validate `name` is unique.
2. Create new carnival and settings (copying settings from source).
3. Copy all source carnival data into the new carnival, reassigning `carnival_id`:
   - Houses → copy with new IDs
   - Event types, events, heats, final levels → copy with new IDs, preserving internal references
   - Point scales → copy
   - Lanes, lane templates, lane promotion allocations → copy
   - Competitors → copy with new IDs
   - CompEvents → copy, mapping to new competitor/event/heat IDs
   - Records → copy, mapping to new event IDs
   - CompetitorEventAge → copy
4. All ID references within the copied data SHALL be internally consistent (e.g., a copied CompEvent references the copied Competitor and copied Event, not the originals).

**Response:** `201 Created` with the new carnival object.

**Notes:**
- This is equivalent to the Access `DBEngine.CompactDatabase(source, dest)` copy operation.
- In the web version, this is a deep-copy within the same database, not a file copy.

---

## 3. Carnival Selection (Active Carnival)

### 3.1 Original Behaviour

In the Access application, only one carnival can be active at a time. Switching carnivals detaches the current linked tables and attaches new ones.

### 3.2 Web Translation

In the web application, there is no "active carnival" at the database level — all carnivals coexist. Instead:

- The **frontend** tracks which carnival the user is currently viewing via URL parameter or session state (e.g., `/carnivals/3/competitors`).
- The **backend** scopes all queries to the `carnival_id` extracted from the URL path.
- Users MAY switch carnivals at any time without server-side state changes.
- If role-based access restricts a user to specific carnivals (see Doc 0 §9), the backend SHALL enforce this as middleware.

---

## 4. House / Team Management

Houses (teams) are configured per carnival. Every competitor belongs to one house.

### 4.1 Create House

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `code` | string | Yes | Max 7 chars, unique within carnival |
| `name` | string | Yes | Max 50 chars |
| `house_type_id` | integer | No | FK to house_types. Defaults to carnival setting. |
| `include` | boolean | No | Default: true |
| `lane` | integer | No | Default lane assignment |
| `competition_pool` | integer | No | Pool/category grouping |
| `details` | string | No | Free-text notes |

**Processing:**
1. Validate `code` is unique within the carnival.
2. Insert house record.
3. Return the created house with its auto-generated `id`.

**Response:** `201 Created`.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Code already exists in carnival | 409 | "A house with this code already exists" |
| Code empty | 400 | "House code is required" |

---

### 4.2 List Houses

**Operation:** Return all houses for a carnival.

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_only` | boolean | false | If true, only return houses with `include = true` |

**Response:**

```json
[
  {
    "id": 1,
    "code": "RED",
    "name": "Red House",
    "house_type_id": 1,
    "include": true,
    "lane": 1,
    "competition_pool": null,
    "details": null,
    "total_points": 245.5,
    "extra_points": 10.0
  }
]
```

- `total_points` = sum of all `comp_events.points` for competitors in this house + sum of `house_points_extra.points` for this house. Computed via query.
- `extra_points` = sum of `house_points_extra.points` for this house.

---

### 4.3 Update House

**Input:** Partial update of any house field.

**Validation:**
- If `code` is changed, the new code must be unique within the carnival.
- Changing `code` SHALL cascade to `competitors.house_code` for all competitors in that house.

---

### 4.4 Delete House

**WARNING:** Deleting a house cascade-deletes all its competitors and their associated records (see Doc 2 §6.3 cascade rule #1).

The API SHOULD require `?confirm=true`.

---

### 4.5 House Points Extra

Manual point adjustments for houses. These are added to the house's total points from competition results.

**Create Adjustment:**

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `house_id` | integer | Yes | FK to houses |
| `points` | decimal | Yes | Points to add (positive) or subtract (negative) |
| `reason` | string | No | Explanation |

**Response:** `201 Created`.

**List Adjustments:** Returns all adjustments for a house.

**Delete Adjustment:** Removes a specific adjustment by ID.

---

## 5. House Types

Reference data for classifying team groupings. These are **global** (not per-carnival).

### Seed Data

| id | description |
|----|-------------|
| 1 | Inter-House |
| 2 | Inter-School |
| 3 | Inter-Class |
| 4 | Inter-Country |
| 5 | Inter-Youth Group |
| 6 | Inter-Church |

**Operations:** Read-only in normal use. Admin MAY add new types.

---

## 6. Carnival Settings

Carnival settings are a **single row per carnival**. See §2.1 for default values, §2.4 for update.

### 6.1 Settings Field Reference

Settings are organised into groups:

**Display:**

| Field | Type | Description |
|-------|------|-------------|
| `title` | string(100) | Carnival title on reports |
| `footer` | string(100) | Footer text on reports |
| `report_head_1` | string(50) | Column header 1 on reports (default: "Lane") |
| `report_head_2` | string(50) | Column header 2 on reports (default: "Time") |

**Competition Rules:**

| Field | Type | Description |
|-------|------|-------------|
| `open_age` | integer | Age value representing "open" category (default: 99) |
| `house_type_id` | integer | FK → house_types |
| `alert_to_record` | boolean | Prompt user when records are broken |

**Meet Manager Integration:**

| Field | Type | Description |
|-------|------|-------------|
| `meet_manager_team` | string(30) | Team name for Meet Manager export |
| `meet_manager_code` | string(4) | Team code for Meet Manager export |
| `meet_manager_top` | integer | Number of top results to export (default: 3) |

**HTML Export:**

| Field | Type | Description |
|-------|------|-------------|
| `html_export_enabled` | boolean | Whether HTML export is active |
| `html_report_header` | string(50) | Header text for HTML reports |

---

## 7. Carnival Data Export

**Operation:** Export carnival data as a downloadable package for distribution (e.g., sending event sheets to participating schools before a carnival).

### 7.1 Original Behaviour

The Access app exports per-house data files ("carnival disks") in text, CSV, or RTF format. The export iterates through each included house and creates a file containing that house's competitors and event assignments.

### 7.2 Web Translation

**Endpoint:** `POST /carnivals/:id/exports/data`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | enum | Yes | `csv`, `json`, or `pdf` |
| `house_ids` | integer[] | No | Filter to specific houses. If omitted, export all included houses. |
| `sex_format` | enum | No | `male_female` or `boys_girls` (default: `male_female`) |
| `heat_format` | enum | No | `numeric` (1,2,3) or `alpha` (A,B,C) (default: `numeric`) |

**Processing:**
1. Query all competitors in selected houses with `include = true`.
2. For each competitor, include their event assignments (event type, sex, age, heat number).
3. Group output by house.
4. Format as requested (CSV, JSON, or PDF).

**Response:** File download with appropriate `Content-Type`.

**CSV Columns:**

```
House,Sex,Age,Event,Heat,Competitor#,GivenName,Surname,Notes
```

---

## 8. Carnival Data Import

**Operation:** Import competitor/event data from an external file (e.g., data collected from schools before a carnival).

### 8.1 Original Behaviour

The Access app imports delimited text or CSV files into an `ImportData` staging table, previews the data, then processes each row:
1. Determine sex from the sex field.
2. Validate house code exists.
3. Validate heat reference exists.
4. Look up or create the competitor.
5. Link competitor to the event/heat.
6. Assign lane.
7. Report errors (incomplete names, invalid house codes, duplicate enrolments).

### 8.2 Web Translation

Import is a two-phase process: **upload + preview**, then **confirm + commit**.

**Phase 1: Upload & Preview**

**Endpoint:** `POST /carnivals/:id/imports/data/preview`

**Input:** Multipart file upload (CSV or TXT).

**Expected columns:** (positional or header-mapped)

| Column | Maps To | Required | Validation |
|--------|---------|----------|------------|
| House | `house_code` | Yes | Must match existing house code in carnival |
| Sex | `sex` | Yes | Must resolve to M, F, or mixed via lookup |
| Age | `age` | Yes | Must be numeric |
| Event | `event_type_description` | Yes | Must match existing event type name |
| Heat | `heat_number` | Yes | Must be valid heat for the event |
| Competitor# | *(sequence)* | No | Ordering within heat |
| GivenName | `given_name` | Yes | Non-empty |
| Surname | `surname` | Yes | Non-empty |
| Notes | `memo` | No | Free text |

**Processing:**
1. Parse file into rows.
2. Validate each row against the rules above.
3. For each competitor name, check if already enrolled in the event.
4. Classify each row as: **valid**, **warning** (e.g., already enrolled — will skip), or **error** (e.g., invalid house code).
5. Return preview with row-level status.

**Response:**

```json
{
  "total_rows": 120,
  "valid": 115,
  "warnings": 3,
  "errors": 2,
  "rows": [
    {
      "row_number": 1,
      "status": "valid",
      "data": {"house": "RED", "sex": "M", "age": 12, ...},
      "message": null
    },
    {
      "row_number": 45,
      "status": "warning",
      "data": {"house": "BLU", "sex": "F", "age": 14, ...},
      "message": "Competitor already enrolled in this event — will be skipped"
    },
    {
      "row_number": 98,
      "status": "error",
      "data": {"house": "YEL", "sex": "", "age": 12, ...},
      "message": "Unable to determine sex"
    }
  ]
}
```

**Phase 2: Confirm & Commit**

**Endpoint:** `POST /carnivals/:id/imports/data/commit`

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `rows` | array | The validated rows from preview (or a preview token/ID) |
| `skip_warnings` | boolean | If true, skip warning rows. If false, include them. |

**Processing (per valid row):**

```
FOR each row:
  1. Look up competitor by (given_name, surname, age, house_code, sex) in this carnival
  2. IF not found:
       CREATE new competitor record
       SET include = true, total_points = 0
  3. Look up event by (event_type_description, sex, age) in this carnival
  4. Look up heat by (event_id, heat_number, final_level = lowest level)
  5. IF competitor NOT already in this event+heat:
       CREATE comp_event record
       SET place = 0, result = null, numeric_result = null, lane = next available
  6. ELSE:
       SKIP (already enrolled)
```

**Response:**

```json
{
  "imported": 115,
  "skipped": 5,
  "competitors_created": 30,
  "competitors_matched": 85
}
```

---

## 9. Carnival Backup

### 9.1 Original Behaviour

The Access application creates a backup by compacting the carnival database file to a new location using `DBEngine.CompactDatabase()`. Two modes:
1. **Same folder** — creates `<name>_backup.accdb` alongside the original.
2. **Custom path** — user selects a destination.

### 9.2 Web Translation

Backup is a database-level concern, not an application feature. Options:

- **Automated:** Use the database's native dump/backup tool on a schedule (recommended).
- **Per-carnival export:** Provide an API endpoint that exports all carnival data as a JSON or SQL dump:

**Endpoint:** `GET /carnivals/:id/backup`

**Response:** JSON file download containing all carnival data (houses, competitors, events, heats, comp_events, records, settings, point scales).

This can be used for:
- Archiving a completed carnival.
- Importing into another instance of the application (see §8).
- Version history (if stored).

---

## 10. Carnival Import from Backup

**Endpoint:** `POST /carnivals/import`

**Input:** JSON file (as produced by §9.2).

**Processing:**
1. Validate the JSON structure matches the expected schema.
2. Create a new carnival with the imported name (append " (imported)" if duplicate).
3. Insert all entities, generating new IDs and maintaining internal references.
4. Return the new carnival.

**Response:** `201 Created` with carnival object.

---

## 11. Carnival List Import (Legacy)

### 11.1 Original Behaviour

The Access application can import a carnival registry from a previous installation by opening an old `Sports.accdb` file, reading its `Carnivals` table, and copying entries (skipping duplicates).

### 11.2 Web Translation

Not applicable. There is no legacy Access installation to import from. If migration from an Access installation is needed, it is a one-time data migration task outside the scope of normal application operations. A migration script SHOULD be provided separately.

---

## 12. API Endpoint Summary

| Method | Endpoint | Operation | Ref |
|--------|----------|-----------|-----|
| POST | `/carnivals` | Create carnival | §2.1 |
| GET | `/carnivals` | List carnivals | §2.2 |
| GET | `/carnivals/:id` | Get carnival with settings and summary | §2.3 |
| PATCH | `/carnivals/:id` | Update carnival name/settings | §2.4 |
| DELETE | `/carnivals/:id?confirm=true` | Delete carnival | §2.5 |
| POST | `/carnivals/:id/copy` | Copy carnival | §2.6 |
| GET | `/carnivals/:id/houses` | List houses | §4.2 |
| POST | `/carnivals/:id/houses` | Create house | §4.1 |
| PATCH | `/carnivals/:id/houses/:houseId` | Update house | §4.3 |
| DELETE | `/carnivals/:id/houses/:houseId?confirm=true` | Delete house | §4.4 |
| GET | `/carnivals/:id/houses/:houseId/points-extra` | List point adjustments | §4.5 |
| POST | `/carnivals/:id/houses/:houseId/points-extra` | Create point adjustment | §4.5 |
| DELETE | `/carnivals/:id/houses/:houseId/points-extra/:adjId` | Delete adjustment | §4.5 |
| GET | `/house-types` | List house types | §5 |
| GET | `/carnivals/:id/settings` | Get carnival settings | §6 |
| PATCH | `/carnivals/:id/settings` | Update carnival settings | §6 |
| POST | `/carnivals/:id/exports/data` | Export carnival data | §7 |
| POST | `/carnivals/:id/imports/data/preview` | Preview import file | §8.2 |
| POST | `/carnivals/:id/imports/data/commit` | Commit import | §8.2 |
| GET | `/carnivals/:id/backup` | Download carnival backup | §9.2 |
| POST | `/carnivals/import` | Import carnival from backup | §10 |

---

*Previous: [Document 2 — Data Model](02-data-model.md)*
*Next: [Document 4 — Competitor Management](04-competitor-management.md)*
