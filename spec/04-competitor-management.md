# Sports Administrator — Software Specification

## Document 4: Competitor Management

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 4. Load with Documents 0, 1, 2, and 3.*

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.
See [Document 3](03-carnival-lifecycle.md) §4 for House management (competitors reference houses).*

---

## 1. Overview

A **competitor** is an individual participant (student/athlete) registered in a carnival. Competitors belong to a house and are entered into events via the `comp_events` junction table (covered in Doc 5).

This document specifies competitor registration, maintenance, import, bulk operations, age management, and data validation.

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `competitors` | Registry of all competitors within a carnival |
| `competitor_event_age` | Maps a competitor's actual age to an event age category |

### Tables referenced (owned by other documents)

| Table | Owner Doc | Relationship |
|-------|-----------|--------------|
| `houses` | Doc 3 | `competitors.house_id` → `houses.id` |
| `comp_events` | Doc 5 | Junction: competitor ↔ event/heat |
| `carnivals` | Doc 3 | `competitors.carnival_id` → `carnivals.id` |

---

## 2. Competitor CRUD

### 2.1 Create Competitor

**Endpoint:** `POST /carnivals/:carnival_id/competitors`

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `given_name` | string | Yes | Non-empty, max 30 chars |
| `surname` | string | Yes | Non-empty, max 30 chars |
| `sex` | enum | Yes | `M` or `F` |
| `house_id` | integer | Yes | Must exist in this carnival |
| `dob` | date | Conditional | Required if `age` not provided |
| `age` | integer | Conditional | Required if `dob` not provided |
| `include` | boolean | No | Default: `true` |
| `external_id` | string | No | Max 50 chars. External student/school ID |
| `comments` | string | No | Max 100 chars |

**Age / DOB resolution:**

The system needs both `age` and `dob`. If only one is supplied, the other is derived:

| Provided | Derived | Rule |
|----------|---------|------|
| `age` only | `dob` | Set `dob` to January 1 of `(current_year - age)` |
| `dob` only | `age` | Calculate age in whole years as of the carnival's age cut-off date (default: current date). See §6 for age cut-off. |
| Both | — | Use both as supplied; no derivation |
| Neither | — | Reject with 400 error |

**Processing:**

1. Validate required fields.
2. Resolve `house_id` — confirm the house belongs to this carnival.
3. Resolve `age` / `dob` per the rules above.
4. Look up `house_code` from `house_id` and store on the competitor record (denormalized for display).
5. Set `total_points = 0`.
6. Insert into `competitors`.
7. Return the created competitor with auto-generated `id` (equivalent to the Access `PIN`).

**Response:** `201 Created` with competitor object.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Missing given_name or surname | 400 | "Given name and surname are required" |
| Missing sex | 400 | "Sex is required" |
| Invalid sex value | 400 | "Sex must be M or F" |
| Missing both age and dob | 400 | "Either age or date of birth is required" |
| House not found in carnival | 404 | "House not found in this carnival" |

---

### 2.2 List Competitors

**Endpoint:** `GET /carnivals/:carnival_id/competitors`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_only` | boolean | false | If true, only return competitors with `include = true` |
| `house_id` | integer | — | Filter to a specific house |
| `sex` | string | — | Filter by sex: `M` or `F` |
| `age` | integer | — | Filter by age |
| `search` | string | — | Case-insensitive substring match on surname or given_name |
| `sort` | string | `surname,given_name` | Sort order. Allowed: `surname`, `given_name`, `age`, `house_code`, `total_points` |
| `page` | integer | 1 | Page number |
| `per_page` | integer | 50 | Results per page |

**Response:**

```json
{
  "data": [
    {
      "id": 42,
      "given_name": "Sarah",
      "surname": "Johnson",
      "full_name": "JOHNSON, Sarah",
      "sex": "F",
      "house_id": 3,
      "house_code": "BLU",
      "house_name": "Blue House",
      "age": 14,
      "dob": "2012-03-15",
      "include": true,
      "total_points": 22.5,
      "external_id": "STU-1234",
      "comments": null,
      "event_count": 4
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 245
  }
}
```

**Computed fields:**
- `full_name`: `UPPER(surname) + ", " + given_name`
- `event_count`: `COUNT(*)` from `comp_events` for this competitor
- `house_code` and `house_name`: joined from `houses`

---

### 2.3 Get Competitor

**Endpoint:** `GET /carnivals/:carnival_id/competitors/:id`

**Response:** Single competitor object (same shape as list item), plus an `events` array:

```json
{
  "id": 42,
  "given_name": "Sarah",
  "surname": "Johnson",
  "full_name": "JOHNSON, Sarah",
  "sex": "F",
  "house_id": 3,
  "house_code": "BLU",
  "house_name": "Blue House",
  "age": 14,
  "dob": "2012-03-15",
  "include": true,
  "total_points": 22.5,
  "external_id": "STU-1234",
  "comments": null,
  "events": [
    {
      "comp_event_id": 101,
      "event_type_description": "100m Freestyle",
      "final_level": 0,
      "heat": 1,
      "lane": 3,
      "place": 2,
      "result": "1:12.34",
      "points": 4.0,
      "memo": null
    }
  ]
}
```

The `events` array is the equivalent of the Access `CompetitorsSubform` query — all event entries for this competitor with event type description, heat, place, result, and points.

---

### 2.4 Update Competitor

**Endpoint:** `PATCH /carnivals/:carnival_id/competitors/:id`

**Input:** Partial update — only supplied fields are changed.

```json
{
  "surname": "Smith",
  "house_id": 2,
  "age": 15
}
```

**Validation:**
- If `house_id` is changed, confirm the new house exists in this carnival. Update `house_code` accordingly.
- If `sex` is changed, it must be `M` or `F`.
- If `age` is changed and `dob` was auto-derived, recalculate `dob`.
- If `dob` is changed, recalculate `age`.
- `total_points` cannot be set directly — it is recomputed from `comp_events` (see §5).

**Response:** `200 OK` with updated competitor object.

---

### 2.5 Delete Competitor

**Endpoint:** `DELETE /carnivals/:carnival_id/competitors/:id`

**Processing:**
1. Delete all `comp_events` rows for this competitor.
2. Delete the competitor record.
3. This SHOULD be implemented via `ON DELETE CASCADE` from `comp_events.competitor_id`.

**Confirmation:** Require `?confirm=true` if the competitor has any `comp_events` entries.

**Response:** `204 No Content`.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Competitor not found | 404 | "Competitor not found" |
| Has events and no confirm | 400 | "Competitor has event entries. Use ?confirm=true to delete." |

---

## 3. Quick Add

Quick Add is a streamlined flow for adding a competitor during event entry (e.g., when a name typed into the event entry form doesn't match an existing competitor).

**Endpoint:** `POST /carnivals/:carnival_id/competitors/quick-add`

**Input:**

| Field | Type | Required |
|-------|------|----------|
| `given_name` | string | Yes |
| `surname` | string | Yes |
| `sex` | enum | Yes |
| `age` | integer | Yes |
| `house_id` | integer | Yes |

**Processing:**

1. Validate all fields.
2. Check for duplicate: query `competitors` WHERE `surname`, `given_name`, `sex`, `age`, and `house_id` all match (case-insensitive on names).
3. If duplicate found: return `409 Conflict` with the existing competitor's data.
4. If no duplicate:
   - Derive `dob` = January 1 of `(current_year - age)`.
   - Retrieve `house_code` from the house record.
   - Insert competitor with `include = true`, `total_points = 0`.
   - Return `201 Created` with the new competitor.

**Response (duplicate):**

```json
{
  "error": "duplicate",
  "message": "A competitor with these details already exists",
  "existing_competitor": {
    "id": 42,
    "given_name": "Sarah",
    "surname": "Johnson",
    "sex": "F",
    "age": 14,
    "house_code": "BLU"
  }
}
```

**Frontend behaviour:** The Quick Add dialog appears when a user types a competitor name in the event entry grid that doesn't match any existing competitor. If the duplicate check returns a match, the frontend should offer to use the existing competitor instead.

---

## 4. Competitor Import

Import allows bulk loading of competitors from an external file (e.g., a CSV exported from a school information system).

### 4.1 Import vs. Carnival Data Import

This section covers **competitor-only import** — adding competitors to the carnival roster from a file. This is distinct from the carnival data import (Doc 3 §8), which imports competitors AND their event/heat assignments together.

### 4.2 Import: Phase 1 — Upload & Preview

**Endpoint:** `POST /carnivals/:carnival_id/competitors/import/preview`

**Input:** Multipart file upload (CSV or TXT, delimited).

**Expected columns:**

| Column | Maps To | Required | Notes |
|--------|---------|----------|-------|
| `GivenName` | `given_name` | Yes | |
| `Surname` | `surname` | Yes | |
| `Sex` | `sex` | Yes | Accepts: M, F, Male, Female, Boys, Girls → normalized to M/F |
| `Age` | `age` | Conditional | Numeric. Required if DOB not provided. |
| `DOB` | `dob` | Conditional | Date. Required if Age not provided. |
| `House` | `house_code` | Yes | Must match an existing house code |
| `ID` | `external_id` | No | External student/school ID |

**Processing:**

1. Parse the file (auto-detect delimiter: comma, tab, or pipe).
2. For each row:
   a. Validate required fields are present and non-empty.
   b. **Normalize sex:** Map `Male`/`Boys`/`M` → `M`, `Female`/`Girls`/`F` → `F`. If unrecognizable, mark as error.
   c. **Resolve age/DOB:** Apply the same rules as §2.1.
      - If configurable age cut-off month/day is set on the carnival (see §6), use it for age calculation from DOB.
   d. **Validate house:** Look up `house_code` in this carnival's houses. If not found, classify row as **warning** (house will be auto-created on commit).
   e. **Check duplicate:** Search for existing competitor by (`surname`, `given_name`, `age`, `house_code`, `sex`). If found, classify as **skip**.
   f. Classify each row as: `valid`, `warning`, `skip`, or `error`.
3. Return preview.

**Response:**

```json
{
  "total_rows": 150,
  "valid": 130,
  "warnings": 10,
  "skipped": 8,
  "errors": 2,
  "rows": [
    {
      "row_number": 1,
      "status": "valid",
      "data": {
        "given_name": "Sarah",
        "surname": "Johnson",
        "sex": "F",
        "age": 14,
        "dob": "2012-01-01",
        "house_code": "RED",
        "external_id": "STU-001"
      },
      "message": null
    },
    {
      "row_number": 15,
      "status": "warning",
      "data": {"house_code": "GRN", "...": "..."},
      "message": "House 'GRN' does not exist and will be auto-created"
    },
    {
      "row_number": 22,
      "status": "skip",
      "data": {"...": "..."},
      "message": "Duplicate: matches existing competitor #42"
    },
    {
      "row_number": 98,
      "status": "error",
      "data": {"sex": "X", "...": "..."},
      "message": "Unable to determine sex from value 'X'"
    }
  ]
}
```

---

### 4.3 Import: Phase 2 — Confirm & Commit

**Endpoint:** `POST /carnivals/:carnival_id/competitors/import/commit`

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `preview_token` | string | Token returned by preview endpoint |
| `auto_create_houses` | boolean | If true, create missing houses on the fly (default: true) |
| `skip_duplicates` | boolean | If true, silently skip duplicates (default: true) |

**Processing (per valid/warning row):**

```
FOR each row:
  1. IF house_code not found AND auto_create_houses:
       CREATE house with code = house_code, name = house_code, include = true
  2. IF duplicate found AND skip_duplicates:
       SKIP row
  3. ELSE:
       INSERT competitor:
         given_name, surname, sex, age, dob (derived if needed)
         house_id (from house lookup)
         house_code (denormalized)
         include = true
         total_points = 0
         external_id = row.ID (if provided)
```

**Response:**

```json
{
  "imported": 130,
  "houses_created": 2,
  "skipped_duplicates": 8,
  "errors": 2
}
```

---

### 4.4 Sex Normalization

The import process normalizes various sex/gender representations into the system's `M`/`F` codes:

| Input (case-insensitive) | Normalized |
|--------------------------|------------|
| `M`, `Male`, `Boy`, `Boys` | `M` |
| `F`, `Female`, `Girl`, `Girls` | `F` |
| Any other value | Error |

This logic is equivalent to the Access `DetermineSex()` function.

---

## 5. Total Points Recalculation

A competitor's `total_points` is an aggregate of all points earned across their event entries.

**Trigger:** Recalculate whenever:
- A `comp_events` record is created, updated, or deleted for this competitor.
- Points are recalculated for an event (see Doc 6).

**Calculation:**

```sql
UPDATE competitors
SET total_points = (
  SELECT COALESCE(SUM(ce.points), 0)
  FROM comp_events ce
  WHERE ce.competitor_id = competitors.id
)
WHERE competitors.id = :competitor_id;
```

This is equivalent to the Access `Update Competitor Points` query, which calls `DeterminePoints([Place], [PtScale])` for each `comp_events` row (via the Heats join) and sums the result.

### Implementation options

1. **Application-level:** Recalculate in the service layer after any `comp_events` mutation.
2. **Database trigger:** A database trigger on `comp_events` that updates `competitors.total_points` on INSERT/UPDATE/DELETE.
3. **Computed view:** Use a view or computed column instead of storing `total_points` — derive it live from `comp_events`. This trades storage for consistency.

**Recommended:** Option 1 (application-level). Keep the denormalized `total_points` column for read performance, but update it in the service layer alongside `comp_events` mutations.

---

## 6. Age Cut-off and Age Calculation

### 6.1 Purpose

In school sport, a competitor's "competition age" is determined by their age on a specific cut-off date (not today's date). For example, if the cut-off is January 1, a student born on December 31, 2012 is considered age 14 for 2026 events even if they turn 14 later in the year.

### 6.2 Configuration

Store age cut-off as carnival-level settings:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `age_cutoff_month` | integer | 1 | Month of the age cut-off date (1–12) |
| `age_cutoff_day` | integer | 1 | Day of the age cut-off date (1–31) |

These correspond to the Access import form's `CutMonth` and `CutDay` controls.

### 6.3 Calculation Function

```
calculateAge(dob, cutoffMonth, cutoffDay):
  cutoffDate = Date(currentYear, cutoffMonth, cutoffDay)
  age = cutoffDate.year - dob.year
  IF (cutoffMonth, cutoffDay) < (dob.month, dob.day):
    age = age - 1
  RETURN age
```

### 6.4 DOB Derivation

When age is provided but DOB is not:

```
deriveDob(age):
  RETURN Date(currentYear - age, 1, 1)
```

This is equivalent to the Access `DetermineDOB()` function.

---

## 7. Competitor Event Age Mapping

The `competitor_event_age` table maps a competitor's actual age (in years) to the event age category they compete in. This handles cases where age groups span multiple years (e.g., "14–16" or "Open").

### 7.1 Purpose

When entering competitors into events, the system needs to know which events a competitor of age N is eligible for. The `competitor_event_age` table provides this mapping.

### 7.2 Schema (from Doc 2)

| Column | Type | Description |
|--------|------|-------------|
| `competitor_age` | integer | The competitor's actual age (PK, composite) |
| `event_age` | string | The event age category label (PK, composite) |
| `flag` | boolean | Whether this mapping is active |
| `tag` | boolean | Selection marker |
| `meet_manager_division` | string(2) | Meet Manager division code |

### 7.3 Seed Data Example

| competitor_age | event_age | flag |
|----------------|-----------|------|
| 10 | 10 | true |
| 11 | 11 | true |
| 12 | 12 | true |
| 13 | 13 | true |
| 14 | 14–16 | true |
| 15 | 14–16 | true |
| 16 | 14–16 | true |
| 17 | Open | true |
| 18 | Open | true |
| 99 | Open | true |

### 7.4 Usage

When filtering competitors eligible for an event with `event.age = "14–16"`:

```sql
SELECT c.*
FROM competitors c
JOIN competitor_event_age cea
  ON c.age = cea.competitor_age
WHERE cea.event_age = '14-16'
  AND cea.flag = true
  AND c.carnival_id = :carnival_id
  AND c.include = true;
```

### 7.5 CRUD

**Endpoint:** `GET /carnivals/:carnival_id/competitor-event-age` — List all mappings.

**Endpoint:** `PUT /carnivals/:carnival_id/competitor-event-age` — Replace all mappings (bulk upsert). Input is an array of `{competitor_age, event_age, flag, tag, meet_manager_division}` objects.

Mappings are typically configured once during carnival setup and rarely changed.

---

## 8. Bulk Operations

### 8.1 Bulk Filter & View

**Endpoint:** `GET /carnivals/:carnival_id/competitors` with filter parameters.

The Access "Competitors Bulk Maintain" form allows filtering competitors by any field using a SQL-like filter (field + operator + value). In the web version, this is handled by extending the standard list endpoint (§2.2) with additional filter parameters:

| Param | Type | Description |
|-------|------|-------------|
| `filter_field` | string | Column name to filter on |
| `filter_operator` | string | One of: `eq`, `neq`, `lt`, `gt`, `lte`, `gte`, `like`, `in` |
| `filter_value` | string | Value to compare against |

Example: `GET /carnivals/1/competitors?filter_field=age&filter_operator=gte&filter_value=14`

### 8.2 Bulk Update Include Flag

**Endpoint:** `PATCH /carnivals/:carnival_id/competitors/bulk`

**Input:**

```json
{
  "competitor_ids": [1, 2, 3, 4, 5],
  "updates": {
    "include": true
  }
}
```

Alternatively, to set all competitors in the carnival at once:

```json
{
  "all": true,
  "updates": {
    "include": false
  }
}
```

This replaces the Access "ALL" and "NONE" buttons that toggle the `Include` checkbox for all competitors.

**Response:**

```json
{
  "updated": 5
}
```

### 8.3 Bulk Delete

**Endpoint:** `DELETE /carnivals/:carnival_id/competitors/bulk`

**Input:**

```json
{
  "competitor_ids": [1, 2, 3],
  "confirm": true
}
```

Or with filter criteria (delete all matching a filter):

```json
{
  "filter_field": "include",
  "filter_operator": "eq",
  "filter_value": "false",
  "confirm": true
}
```

**Processing:**
1. Resolve the set of competitors to delete (by IDs or by filter).
2. Delete all `comp_events` for those competitors (cascade).
3. Delete the competitor records.
4. Return count of deleted records.

**Response:**

```json
{
  "deleted": 3
}
```

---

## 9. Roll Competitors Over / Back

### 9.1 Purpose

Between seasons, competitors need their age incremented (or decremented if correcting an error). This is a bulk operation that affects all competitors in the carnival.

### 9.2 Roll Over (Age + 1)

**Endpoint:** `POST /carnivals/:carnival_id/competitors/roll-over`

**Processing:**

```sql
UPDATE competitors
SET age = age + 1,
    dob = dob  -- DOB unchanged; only age advances
WHERE carnival_id = :carnival_id;
```

This is equivalent to the Access `Roll Competitors Over` query: `UPDATE Competitors SET Age = Trim(Str(Val([Age])+1))`.

**Confirmation:** Require `?confirm=true`. This operation affects ALL competitors in the carnival.

**Response:**

```json
{
  "updated": 245,
  "message": "All competitor ages incremented by 1"
}
```

### 9.3 Roll Back (Age − 1)

**Endpoint:** `POST /carnivals/:carnival_id/competitors/roll-back`

**Processing:**

```sql
UPDATE competitors
SET age = age - 1
WHERE carnival_id = :carnival_id
  AND age > 0;  -- prevent negative ages
```

**Confirmation:** Require `?confirm=true`.

**Response:**

```json
{
  "updated": 245,
  "message": "All competitor ages decremented by 1"
}
```

### 9.4 Frontend Considerations

The roll-over/roll-back buttons should display a confirmation dialog:
- "This will update the age of all 245 competitors. Are you sure?"
- Show the direction (over = +1, back = −1).
- After completion, refresh the competitor list.

---

## 10. Competitor Data Validation

### 10.1 Completeness Check

The Access "Competitor-Check" form displays competitors with incomplete data. The web version should provide an equivalent validation endpoint.

**Endpoint:** `GET /carnivals/:carnival_id/competitors/validate`

**Processing:** Query competitors where any required field is null or empty:

```sql
SELECT * FROM competitors
WHERE carnival_id = :carnival_id
AND (
  given_name IS NULL OR given_name = '' OR
  surname IS NULL OR surname = '' OR
  sex IS NULL OR sex = '' OR
  house_id IS NULL OR
  age IS NULL
);
```

**Response:**

```json
{
  "incomplete_count": 3,
  "competitors": [
    {
      "id": 55,
      "given_name": "John",
      "surname": null,
      "sex": "M",
      "house_code": "RED",
      "age": null,
      "missing_fields": ["surname", "age"]
    }
  ]
}
```

### 10.2 Required Fields Summary

| Field | Required | Notes |
|-------|----------|-------|
| `given_name` | Yes | |
| `surname` | Yes | |
| `sex` | Yes | Must be `M` or `F` |
| `house_id` | Yes | Must reference a valid house in the carnival |
| `age` or `dob` | Yes | At least one; the other is derived |

### 10.3 Optional Fields

| Field | Purpose |
|-------|---------|
| `comments` | Free-text notes |
| `external_id` | External student/school ID |
| `include` | Active/inactive flag (default: true) |
| `address1`, `address2`, `suburb`, `state`, `postcode` | Contact address |
| `home_phone`, `work_phone` | Contact phone numbers |

---

## 11. Team Names (Placeholder Competitors)

### 11.1 Purpose

Some events use team names instead of individual competitor names (e.g., relay races). The Access application has a "Create Team Names" function that creates placeholder competitor records for each house.

### 11.2 Operation

**Endpoint:** `POST /carnivals/:carnival_id/competitors/create-team-names`

**Processing:**
1. For each included house in the carnival:
   - Create a competitor record with:
     - `given_name` = house name (e.g., "Red House")
     - `surname` = "Team"
     - `sex` = `M` (placeholder)
     - `house_id` = the house's ID
     - `age` = carnival's `open_age` setting (typically 99)
     - `include` = true
2. If team name competitors already exist for a house, skip creation.

**Response:**

```json
{
  "created": 4,
  "message": "Team name competitors created for 4 houses"
}
```

---

## 12. Duplicate Detection Rules

Duplicate detection is used during both manual creation and import to prevent the same competitor from being registered twice.

### 12.1 Match Criteria

A competitor is considered a duplicate if ALL of the following match (case-insensitive):

| Field | Comparison |
|-------|------------|
| `surname` | Case-insensitive equality |
| `given_name` | Case-insensitive equality |
| `age` | Exact match |
| `house_code` | Case-insensitive equality |
| `sex` | Exact match |

### 12.2 Behaviour by Context

| Context | Duplicate Found | Action |
|---------|-----------------|--------|
| Quick Add | Show error, return existing competitor | Block creation |
| Standard Create | Not checked automatically | Allow (caller may check separately) |
| Import Preview | Mark row as `skip` | Display to user |
| Import Commit | Skip silently if `skip_duplicates = true` | Do not insert |

---

## 13. Cross-Document References

| Topic | See |
|-------|-----|
| Entering competitors into events | Doc 5 §3 (Event Entry) |
| Competitor results and places | Doc 6 §2 (Result Entry) |
| Points calculation from event places | Doc 6 §3 (Scoring) |
| Competitor reports (event cards, lists) | Doc 7 |
| House management (where competitors belong) | Doc 3 §4 |
| Meet Manager athlete export | Doc 8 §2 |
| Competitor filtering by event age | Doc 5 §2 (Eligibility) |
