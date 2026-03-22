# Sports Administrator — Software Specification

## Document 6: Results & Scoring

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 6. Load with Documents 0, 1, 2, 3, and 5.*

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.
See [Document 5](05-events-and-heats.md) for event/heat structure and the heat status lifecycle.*

---

## 1. Overview

This document specifies how competitor results are entered, parsed, validated, and stored; how places and points are calculated; how event records are tracked; and how point scales are managed.

The results and scoring pipeline:

```
User enters result string  →  Parse & validate (Calculate_Results)
                           →  Store formatted result + numeric value
                           →  Calculate places (from results)
                           →  Look up points (from places + point scale)
                           →  Update competitor total points
                           →  Check for broken records
```

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `point_scales` | Named scoring scales (place → points mapping) |
| `records` | Best-ever performance records per event |

### Tables referenced (owned by other documents)

| Table | Owner Doc | Relationship |
|-------|-----------|--------------|
| `comp_events` | Doc 5 | Result/place/points are stored here |
| `heats` | Doc 5 | Point scale, status, completion flags |
| `events` | Doc 5 | Current record values (`record`, `numeric_record`) |
| `event_types` | Doc 5 | Units, `places_across_all_heats` flag |
| `competitors` | Doc 4 | `total_points` aggregate |

---

## 2. Result Entry

### 2.1 Update CompEvent Result

**Endpoint:** `PATCH /carnivals/:carnival_id/comp-events/:comp_event_id`

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `result` | string | Raw result entered by user (e.g., "12.34", "1:05.23", "F", "P") |

**Processing:**

1. Determine the event's unit from `event_type.units`.
2. Parse the result string using the result parser (§2.2).
3. If parsing succeeds:
   - Store `result` (formatted display string).
   - Store `numeric_result` (numeric value in base units for sorting/comparison).
4. If parsing fails: return 400 with error message.
5. If result is cleared (empty string): set `result = null`, `numeric_result = 0`, `place = null`.

**Response:** `200 OK` with updated comp_event including `result`, `numeric_result`.

---

### 2.2 Result Parser (`Calculate_Results`)

The result parser converts a user-entered string into a formatted display string and a numeric value suitable for sorting and comparison.

#### Input/Output

| Parameter | Direction | Description |
|-----------|-----------|-------------|
| `input` | in | Raw text entered by the user |
| `unit` | in | Event's unit code (from event type) |
| `formatted_result` | out | Display-formatted result string |
| `numeric_value` | out | Numeric value in base units (seconds for time, meters for distance) |
| `success` | out | Whether parsing succeeded |

#### Special Result Values

| Input (case-insensitive prefix) | Formatted | Numeric Value | Description |
|--------------------------------|-----------|---------------|-------------|
| Starts with `F` | `"FOUL"` | `+3E+38` (ASC) or `-1E+38` (DESC) | Competitor fouled |
| Starts with `P` | `"PARTICIPATE"` | `+3E+38` (ASC) or `-1E+38` (DESC) | Participation only (no competitive result) |
| Empty string | `null` | `0` | No result |

The extreme numeric values ensure FOUL and PARTICIPATE results sort last regardless of sort direction.

#### Distance / Points Parsing (M, KM, PTS)

| Unit | Input Examples | Formatted | Numeric (base unit) |
|------|---------------|-----------|---------------------|
| `M` (meters) | `"5.67"`, `"5.67m"` | `"5.67"` | `5.67` |
| `KM` (kilometers) | `"2.5"` | `"2.50"` | `2500.0` (stored as meters) |
| `PTS` (points) | `"45"`, `"45.5"` | `"45"`, `"45.5"` | `45.0`, `45.5` |

- Strip any trailing non-numeric characters (unit suffixes).
- Validate the remainder is a valid number ≥ 0.
- KM values are stored internally as meters (`value × 1000`).

#### Time Parsing (SECS, MINS, HRS)

Time inputs accept flexible delimiter formats: `:`, `'`, `"`, `-`. All are normalized internally.

**Seconds unit (`SECS`):**

| Input | Formatted | Numeric (total seconds) |
|-------|-----------|------------------------|
| `"12"` | `"12.00"` | `12.0` |
| `"12.34"` | `"12.34"` | `12.34` |
| `"1:05.23"` | `"1:05.23"` | `65.23` |
| `"1:30:05.23"` | `"1:30:05.23"` | `5405.23` |

**Minutes unit (`MINS`):**

| Input | Formatted | Numeric (total seconds) |
|-------|-----------|------------------------|
| `"5"` | `"5:00.00"` | `300.0` |
| `"5:30"` | `"5:30.00"` | `330.0` |
| `"5:30.45"` | `"5:30.45"` | `330.45` |

**Hours unit (`HRS`):**

| Input | Formatted | Numeric (total seconds) |
|-------|-----------|------------------------|
| `"2"` | `"2:00"` | `7200.0` |
| `"2:30"` | `"2:30"` | `9000.0` |
| `"2:30:15"` | `"2:30:15"` | `9015.0` |
| `"2:30:15.50"` | `"2:30:15.50"` | `9015.50` |

**Parsing algorithm:**

1. Normalize all delimiters (`:`, `'`, `"`, `-`) to a common separator.
2. Split into parts.
3. Validate each part is numeric.
4. Assign parts based on count and unit:

| Parts | SECS | MINS | HRS |
|-------|------|------|-----|
| 1 | seconds | minutes | hours |
| 2 | minutes:seconds | minutes:seconds | hours:minutes |
| 3 | hours:minutes:seconds | hours:minutes:seconds | hours:minutes:seconds |

5. Convert to total seconds: `(hours × 3600) + (minutes × 60) + seconds`.
6. Decompose back to H:M:S:hundredths for formatted display.
7. Centiseconds are always shown for SECS and MINS; only shown for HRS if present in input.

**Validation errors:**

| Condition | Error Message |
|-----------|---------------|
| Non-numeric parts | "Could not parse as a time" |
| More than 3 parts | "Too many components" |
| Unknown unit | "Unknown unit. Valid: SECS, MINS, HRS, M, KM, PTS" |
| Non-numeric distance/points | "Could not parse as [unit]" |

### 2.3 Result Input Hints

The UI should display appropriate input hints based on the event's unit:

| Unit | Hint |
|------|------|
| SECS | "Enter the time as SS.cc or M:SS.cc" |
| MINS | "Enter the time as M:SS.cc, M'SS.cc, H'MM'SS, or H:MM:SS" |
| HRS | "Enter the time as H:MM:SS.cc, H'MM'SS, H:MM, or H'MM" |
| M | "Enter the distance as mm.cc" |
| KM | "Enter the distance as kk.mm" |
| PTS | "Enter the points as 12 or 12.34" |

---

## 3. Place Calculation

### 3.1 Automatic Place Calculation

Places are automatically calculated from results when the user exits the event entry form (navigates away from the heat), unless `dont_override_places` is set on the heat.

**Endpoint:** `POST /carnivals/:carnival_id/heats/:heat_id/calculate-places`

**Algorithm:**

```
1. Determine unit sort order:
   - Time units (SECS, MINS, HRS): ASC — lower numeric_result is better
   - Distance/points (M, KM, PTS): DESC — higher numeric_result is better

2. Query comp_events for this heat:
   WHERE numeric_result <> 0 OR result = 'PARTICIPATE'
   ORDER BY numeric_result [ASC or DESC based on unit]

3. IF event_type.places_across_all_heats = true:
     Query across ALL heats at this final level (not just this heat)

4. Handle special results first:
   - PARTICIPATE → place = null, points = minimum from point scale
   - FOUL → place = null, points = minimum from point scale

5. For remaining competitors (with real results):
   current_place = 1
   WHILE more competitors:
     Count how many have the same numeric_result (ties)
     Assign all tied competitors the same place = current_place
     Advance: current_place += count_of_tied
   
   Example: If two competitors tie for 2nd:
     Both get place = 2
     Next competitor gets place = 4 (not 3)

6. For each placed competitor:
   points = lookup(heat.point_scale, place)
   IF place not found in point scale: points = 0

7. Update all comp_events with calculated place and points.

8. Trigger total points recalculation for affected competitors (Doc 4 §5).
```

### 3.2 The `dont_override_places` Flag

Each heat has a `dont_override_places` boolean. When `true`, automatic place calculation is suppressed — places are only set manually.

**Behaviour:** When the user manually edits places and then exits the heat entry form, the system offers to set this flag:

> "You have made manual changes to competitor places which could be overwritten. Do you wish to tick 'Don't override places'?"

In the web version, this should be a toggle on the heat, and the frontend should display a warning when it is active.

### 3.3 Manual Place Entry

When a place is entered manually on a comp_event:

1. Look up points from the point scale: `SELECT points FROM point_scales WHERE scale_name = :heat_point_scale AND place = :place`.
2. Update the comp_event's `points` field.
3. If place is cleared (null): set `points = null`.
4. Flag `dont_override_places` consideration.

**Endpoint:** `PATCH /carnivals/:carnival_id/comp-events/:comp_event_id`

```json
{
  "place": 2
}
```

**Processing:** Look up points, update comp_event, set `GlobalPlaceChange` flag.

---

## 4. Points Calculation

### 4.1 Point Scale Lookup

Points are determined by a named point scale and a finishing place:

```
points = point_scales[scale_name][place]
```

If the place is not defined in the scale, `points = 0`.

For PARTICIPATE and FOUL results, points are set to the minimum value in the scale:

```sql
SELECT MIN(points) FROM point_scales WHERE scale_name = :scale_name;
```

### 4.2 Bulk Points Recalculation

**Endpoint:** `POST /carnivals/:carnival_id/recalculate-points`

Recalculates ALL competitor points across the entire carnival using the current point scale values. This is equivalent to the Access `Update Competitor Points` query.

**Processing:**

```sql
UPDATE comp_events ce
SET points = (
  SELECT ps.points
  FROM point_scales ps
  JOIN heats h ON h.id = ce.heat_id
  WHERE ps.scale_name = h.point_scale
    AND ps.place = ce.place
)
WHERE ce.place IS NOT NULL
  AND ce.carnival_id = :carnival_id;
```

Then recalculate all competitor `total_points`:

```sql
UPDATE competitors c
SET total_points = (
  SELECT COALESCE(SUM(ce.points), 0)
  FROM comp_events ce
  WHERE ce.competitor_id = c.id
)
WHERE c.carnival_id = :carnival_id;
```

**Use case:** After modifying point values within a point scale mid-carnival.

**Confirmation:** Require `?confirm=true` — this overwrites all existing points.

**Response:**

```json
{
  "comp_events_updated": 520,
  "competitors_updated": 245
}
```

---

## 5. Point Scales CRUD

### 5.1 List Point Scales

**Endpoint:** `GET /carnivals/:carnival_id/point-scales`

**Response:**

```json
[
  {
    "name": "Olympic",
    "entries": [
      { "place": 1, "points": 10.0 },
      { "place": 2, "points": 8.0 },
      { "place": 3, "points": 6.0 },
      { "place": 4, "points": 5.0 },
      { "place": 5, "points": 4.0 },
      { "place": 6, "points": 3.0 },
      { "place": 7, "points": 2.0 },
      { "place": 8, "points": 1.0 }
    ],
    "used_by_heat_count": 12
  }
]
```

`used_by_heat_count` is the count of heats currently referencing this scale.

### 5.2 Create Point Scale

**Endpoint:** `POST /carnivals/:carnival_id/point-scales`

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | Yes | Max 10 chars, unique within carnival |

**Response:** `201 Created` with the new (empty) point scale.

### 5.3 Allocate Default Points

**Endpoint:** `POST /carnivals/:carnival_id/point-scales/:name/allocate-defaults`

Bulk-creates point scale entries with a uniform points value.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `num_places` | integer | Yes | Number of places to create (1 to N) |
| `points_per_place` | number | Yes | Points to assign to each place |

**Processing:**

```
FOR place = 1 TO num_places:
  IF entry for this place doesn't exist:
    INSERT (scale_name, place, points_per_place)
```

Existing entries are NOT overwritten.

**Response:**

```json
{
  "entries_created": 8
}
```

### 5.4 Update Point Scale Entries

**Endpoint:** `PUT /carnivals/:carnival_id/point-scales/:name/entries`

Full replacement of point scale entries.

**Input:** Array of `{ place, points }` objects.

```json
[
  { "place": 1, "points": 10.0 },
  { "place": 2, "points": 8.0 },
  { "place": 3, "points": 6.0 }
]
```

**Processing:**
1. Delete all existing entries for this scale.
2. Insert all new entries.

**After updating entries:** The frontend should prompt: "Do you want to recalculate all competitor points?" If yes, trigger the bulk recalculation (§4.2).

### 5.5 Rename Point Scale

**Endpoint:** `PATCH /carnivals/:carnival_id/point-scales/:name`

**Input:**

```json
{
  "name": "New Scale Name"
}
```

**Processing:** Update the scale name and cascade to all heats referencing this scale.

### 5.6 Delete Point Scale

**Endpoint:** `DELETE /carnivals/:carnival_id/point-scales/:name`

**Validation:** Cannot delete a point scale that is currently referenced by any heat.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Scale in use | 409 | "This point scale is currently used by events. Change those events' point scale first." |
| Scale not found | 404 | "Point scale not found" |

---

## 6. Event Records

### 6.1 Concept

Each event (division) can have a **record** — the best-ever performance. Records are tracked in two places:

1. **Events table:** `record` (formatted text) and `numeric_record` (numeric value) — the current best.
2. **Records table:** Historical log of all record-setting performances, including who set it and when.

### 6.2 Automatic Record Detection

After results are entered for a heat, the system checks whether any competitor has broken (or set) the event record.

**Trigger:** Called automatically when the user exits the event entry form, IF the heat's `effects_records` flag is true.

**Algorithm (equivalent to `CheckIfRecordBroken()`):**

```
1. Determine the unit sort order for this event:
   - ASC (time): best = lowest numeric_result
   - DESC (distance/points): best = highest numeric_result

2. Query the best result in this heat:
   - ASC: MIN(numeric_result) WHERE numeric_result > 0 AND effects_records = true
   - DESC: MAX(numeric_result) WHERE effects_records = true

3. IF no result found: EXIT (no competitors with results)

4. Compare against existing record:
   IF records table has entries for this event:
     existing_best = MIN or MAX of records.numeric_result (per sort order)
     IF best_result is better than or equal to existing_best:
       → Record broken (proceed to step 5)
     ELSE:
       EXIT (no new record)
   ELSE:
     → First record ever (proceed to step 5)

5. Look up the competitor(s) who achieved the best result.
   (Multiple competitors may tie for the record.)

6. For each record-setting competitor:
   - Present confirmation:
     "{Name} has set a new record for this event ({Result} {Units}).
      Do you wish to accept it?"
   
   - IF accepted:
     a. Check for duplicate: don't insert if this competitor already has
        a record entry with the same numeric_result for this event.
     b. INSERT into records table:
        event_id, surname, given_name, house_code, date = now,
        numeric_result, result (formatted)
     c. UPDATE the event's record and numeric_record fields.
```

### 6.3 The `effects_records` Flag

Each heat (and each final level configuration) has an `effects_records` boolean. When `false`, results in that heat do not trigger record checking.

**Use case:** Preliminary heats may not count toward records; only Grand Final results should affect records. The user configures this per final level in the heat/final level setup (Doc 5 §5).

### 6.4 Records CRUD

**List Records for Event:**

**Endpoint:** `GET /carnivals/:carnival_id/events/:event_id/records`

**Response:**

```json
[
  {
    "id": 1,
    "event_id": 101,
    "surname": "Johnson",
    "given_name": "Sarah",
    "house_code": "RED",
    "date": "2025-03-15",
    "result": "12.34",
    "numeric_result": 12.34,
    "comments": null
  }
]
```

**Create Record (Manual):**

**Endpoint:** `POST /carnivals/:carnival_id/events/:event_id/records`

**Input:**

| Field | Type | Required |
|-------|------|----------|
| `surname` | string | Yes |
| `given_name` | string | Yes |
| `house_code` | string | No |
| `date` | date | No (default: today) |
| `result` | string | Yes |
| `comments` | string | No |

**Processing:**
1. Parse the result using the result parser (§2.2) with the event's unit.
2. Store `result` (formatted) and `numeric_result` (parsed numeric).
3. Update the event's `record` and `numeric_record` if this is better than the current value.

**Update Record:**

**Endpoint:** `PATCH /carnivals/:carnival_id/events/:event_id/records/:id`

**Processing:** Same as create — re-parse the result if changed.

**Delete Record:**

**Endpoint:** `DELETE /carnivals/:carnival_id/events/:event_id/records/:id`

**Processing:** After deletion, recalculate the event's `record` and `numeric_record` from remaining records (best remaining value).

### 6.5 Record History

**Endpoint:** `GET /carnivals/:carnival_id/events/:event_id/records/history`

Returns all records for the event ordered by date (most recent first), showing the progression of records over time.

**Response:**

```json
[
  {
    "id": 3,
    "surname": "Johnson",
    "given_name": "Sarah",
    "house_code": "RED",
    "date": "2026-03-20",
    "result": "12.10",
    "numeric_result": 12.10,
    "is_current": true
  },
  {
    "id": 2,
    "surname": "Smith",
    "given_name": "Jane",
    "house_code": "BLU",
    "date": "2025-03-15",
    "result": "12.34",
    "numeric_result": 12.34,
    "is_current": false
  }
]
```

`is_current` indicates whether this record is the current best (matches the event's `numeric_record`).

### 6.6 Record Comparison Function

The `Better()` function determines whether a result beats the existing record:

```
better(numeric_result, event_id):
  existing_records = SELECT numeric_result FROM records WHERE event_id = :event_id
  
  IF no existing records: RETURN true  (first record)
  
  unit_order = lookup unit sort order for event
  
  IF unit_order = ASC (time — lower is better):
    RETURN numeric_result <= MIN(existing_records.numeric_result)
  ELSE (distance/points — higher is better):
    RETURN numeric_result >= MAX(existing_records.numeric_result)
```

---

## 7. Results Entry Workflow

### 7.1 Standard Entry (By Competitor)

The primary entry mode. The user navigates to a heat and enters results per competitor in a datasheet grid.

**Grid columns:** Lane | Team (House) | Competitor Name | Place | Result | Points | Memo

**Per-row processing when result is entered:**

1. Validate via result parser (before save).
2. If valid: store `result` and `numeric_result` on the comp_event.
3. If result cleared: set `numeric_result = 0`, `place = null`.

**When user leaves the heat (exits subform):**

1. Check if all places are filled (`place IS NULL OR place = 0` count = 0) → mark heat completed.
2. Check if all results are filled (`numeric_result = 0` count = 0) → mark heat completed.
3. If `effects_records = true`: run record detection (§6.2).
4. If `dont_override_places = false`: run automatic place calculation (§3.1).
5. Check for unassigned lanes (lane = 0) → warn user.

### 7.2 Place Order Entry

An alternative mode where the user enters results by finishing position rather than by competitor.

**Endpoint:** `POST /carnivals/:carnival_id/heats/:heat_id/results-by-place`

**Input:**

```json
[
  { "place": 1, "lane": 4, "result": "12.34" },
  { "place": 2, "lane": 7, "result": "12.56" },
  { "place": 3, "lane": 2, "result": "12.78" }
]
```

**Processing:**

1. For each entry:
   a. Identify the competitor by lane number in this heat.
   b. Parse the result string via the result parser.
   c. Update the comp_event: `place`, `result`, `numeric_result`.
2. Calculate points based on the assigned places and point scale.
3. If all competitors have places: mark heat completed.
4. Run record detection.

**Response:**

```json
{
  "results_entered": 8,
  "heat_completed": true
}
```

### 7.3 Grid Display Order

The results entry grid can be sorted in four ways:

| Mode | Sort Order | Use Case |
|------|-----------|----------|
| By Lane | `lane ASC, surname, given_name` | Default for lane-based events |
| By Name | `surname ASC, given_name ASC` | Alphabetical lookup |
| By Place | `place ASC` | Review results |
| Unsorted | Record order | Raw data view |

**Endpoint:** Use the `sort` query parameter on `GET /carnivals/:carnival_id/heats/:heat_id/competitors`.

---

## 8. Heat Completion and Status Transitions

### 8.1 Auto-Completion

A heat is automatically marked as completed when ALL of the following are true:
- Every competitor has a result (`numeric_result <> 0`), OR
- Every competitor has a place (`place IS NOT NULL AND place <> 0`)

### 8.2 Status Determination on Form Close

When the user closes the event entry form, the system recalculates the status of all heats for that event:

**Algorithm (equivalent to `SetCurrentFinal()`):**

```
1. Find the highest final_level with at least one uncompleted heat:
   current_level = MAX(final_level)
     FROM heats
     WHERE event_id = :event_id AND completed = false

2. IF no uncompleted heats found:
     All heats are completed.
     Set the last (lowest) final_level's status to 'completed'.
     current_level = MIN(final_level) -- the Grand Final

3. FOR each heat of this event:
   IF heat.final_level < current_level:
     heat.status = 'future'
   ELSE IF heat.final_level = current_level:
     IF all_completed:
       heat.status = 'completed'
     ELSE:
       heat.status = 'active'
   ELSE (heat.final_level > current_level):
     IF heat.status != 'promoted':
       heat.status = 'completed'
     -- Keep 'promoted' status as-is
```

This ensures the pipeline flows correctly: completed levels stay complete (or promoted), the current level is active, and future levels stay future.

---

## 9. Lane Assignment

### 9.1 Automatic Lane Assignment

When a competitor is added to a heat without specifying a lane, the system auto-assigns one.

**Algorithm (equivalent to `Calculate_Competitor_Lane()`):**

```
1. Look up the competitor's house.
2. Look up the house's default lane assignment (from the lanes/house configuration).
3. IF a default lane exists AND it's not already taken in this heat:
     Assign that lane.
4. ELSE:
     Assign the next available lane (lowest unoccupied lane number).
5. IF lane_count = 0 (unlimited): assign lane = 0 (no lane).
```

### 9.2 Lane Update After Deletion

When a competitor is deleted from a heat, lane assignments for remaining competitors in that heat may need to be refreshed (equivalent to `Update_Lane_Assignments()`).

---

## 10. Unit Sort Order Reference

This table drives result comparison logic throughout the system:

| Unit | Sort Order | "Better" Means | Example |
|------|-----------|----------------|---------|
| Seconds (SECS) | Ascending | Lower value | 12.00 beats 13.00 |
| Minutes (MINS) | Ascending | Lower value | 5:30 beats 6:00 |
| Hours (HRS) | Ascending | Lower value | 2:15:00 beats 2:30:00 |
| Meters (M) | Descending | Higher value | 5.67 beats 5.50 |
| Kilometers (KM) | Descending | Higher value | 2.50 beats 2.40 |
| Points (PTS) | Descending | Higher value | 45 beats 40 |

---

## 11. Worked Examples

### 11.1 Time Result Entry and Place Calculation

**Scenario:** 100m Sprint (SECS unit, 8 lanes, "Olympic" point scale)

**Results entered:**

| Lane | Competitor | Result Input | Formatted | Numeric |
|------|-----------|-------------|-----------|---------|
| 1 | Smith | "12.34" | "12.34" | 12.34 |
| 2 | Johnson | "12.56" | "12.56" | 12.56 |
| 3 | Brown | "12.34" | "12.34" | 12.34 |
| 4 | Davis | "F" | "FOUL" | 3E+38 |
| 5 | Wilson | "P" | "PARTICIPATE" | 3E+38 |
| 6 | Taylor | "13.01" | "13.01" | 13.01 |
| 7 | Lee | "12.78" | "12.78" | 12.78 |
| 8 | Clark | "" | null | 0 |

**Sorted (ASC):** 12.34, 12.34, 12.56, 12.78, 13.01, FOUL, PARTICIPATE

**Places and points (Olympic scale: 10,8,6,5,4,3,2,1):**

| Competitor | Numeric | Place | Points | Notes |
|-----------|---------|-------|--------|-------|
| Smith | 12.34 | 1 | 10 | Tied for 1st |
| Brown | 12.34 | 1 | 10 | Tied for 1st |
| Johnson | 12.56 | 3 | 6 | Skips 2nd |
| Lee | 12.78 | 4 | 5 | |
| Taylor | 13.01 | 5 | 4 | |
| Davis | FOUL | null | 1 | Min points |
| Wilson | PARTICIPATE | null | 1 | Min points |
| Clark | *(no result)* | null | null | Not placed |

### 11.2 Distance Result and Record Check

**Scenario:** Long Jump (M unit, existing record: 5.50m)

**New result:** 5.67m (numeric: 5.67)

**Record check:** Unit order = DESC (higher is better). 5.67 ≥ 5.50 → Record broken.

**Prompt:** "Smith has set a new record for this event (5.67 m). Do you wish to accept it?"

**If accepted:** Insert into `records`, update `events.record = "5.67"`, `events.numeric_record = 5.67`.

---

## 12. Cross-Document References

| Topic | See |
|-------|-----|
| Heat structure and final levels | Doc 5 §5, §6 |
| Heat status lifecycle | Doc 5 §6.2 |
| Competitor promotion between levels | Doc 5 §7 |
| Places across all heats flag | Doc 5 §3.1 (event type) |
| Competitor total points | Doc 4 §5 |
| Event entry form layout | Doc 9 |
| Result reports and printing | Doc 7 |
| HTML export of results | Doc 8 |
| Meet Manager result export | Doc 8 §2 |
