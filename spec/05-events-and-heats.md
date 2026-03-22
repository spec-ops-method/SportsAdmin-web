# Sports Administrator — Software Specification

## Document 5: Events & Heats

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 5. Load with Documents 0, 1, 2, and 3.*

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.
See [Document 3](03-carnival-lifecycle.md) §4 for House management.
See [Document 4](04-competitor-management.md) for competitor management.*

---

## 1. Overview

Events are the central competitive units in a carnival. The data model uses a three-tier hierarchy:

```
EventType  (template: "100m Sprint")
  └── Event  (division: "100m Sprint — Boys 14")
        └── Heat  (instance: "100m Sprint — Boys 14, Semi-Final Heat 2")
              └── CompEvent  (entry: competitor × heat)
```

- **EventType** is a named event template (e.g., "100m Sprint", "Shot Put"). It defines the units of measurement, lane count, report style, and the heat/final structure.
- **Event** (also called a "division") is a specific sex + age variant of an EventType. An EventType with 3 ages × 2 sexes produces 6 Events.
- **Heat** is a single runnable unit — one heat at one final level of one Event. Heats hold the scheduling, point scale, promotion type, and status.
- **CompEvent** (junction table) links a competitor to a heat with their lane, result, place, and points.

This document covers EventType and Event CRUD, heat/final-level configuration, heat generation, event ordering, lane management, competitor entry and seeding, the heat status lifecycle, and competitor promotion between final levels.*CompEvent result entry and scoring are covered in Doc 6.*

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `event_types` | Named event templates |
| `events` | Sex/age divisions of event types |
| `heats` | Individual heats within events |
| `final_levels` | Heat progression structure per event type |
| `comp_events` | Competitor ↔ heat junction (structure; results in Doc 6) |
| `lane_templates` | Lane numbers available per event type |
| `lane_promotion_allocations` | Lane assignment rules for promoted competitors |
| `lanes` | Lane ↔ house mapping (reference data) |

### Reference tables (seed data, owned here)

| Table | Purpose |
|-------|---------|
| `final_statuses` | Heat status enum |
| `promotions` | Promotion type enum |
| `units` | Measurement unit enum |
| `final_level_labels` | Display names for final levels |

---

## 2. Reference Data

### 2.1 Heat Status Enum

| id | name | description |
|----|------|-------------|
| 0 | `future` | Heat has not started |
| 1 | `active` | Heat is currently being contested |
| 2 | `completed` | Heat is finished; results entered |
| 3 | `promoted` | Results from this heat have been promoted to the next final level |

### 2.2 Promotion Types

| code | description | example pattern (9 competitors, 3 heats) |
|------|-------------|------------------------------------------|
| `NONE` | No promotion | — |
| `Smooth` | Sequential allocation | Heat 1: {1,2,3}, Heat 2: {4,5,6}, Heat 3: {7,8,9} |
| `Staggered` | Distributed allocation | Heat 1: {1,4,7}, Heat 2: {2,5,8}, Heat 3: {3,6,9} |

### 2.3 Units of Measurement

| id | code | display | sort_order |
|----|------|---------|------------|
| 1 | `Seconds` | Secs | ascending (lower is better) |
| 2 | `Minutes` | Mins | ascending |
| 3 | `Hours` | Hrs | ascending |
| 4 | `Meters` | m | descending (higher is better) |
| 5 | `Kilometers` | Km | descending |
| 6 | `Points` | Pts | descending |

The `sort_order` determines how results are ranked: for time-based units, lower results win; for distance/points, higher results win.

### 2.4 Final Level Labels

| final_level | label |
|-------------|-------|
| 0 | Grand Final |
| 1 | Semi Final |
| 2 | Quarter Final |
| 3 | Round A |
| 4 | Round B |
| 5 | Round C |
| 6 | Round D |
| 7 | Round E |

**Important numbering convention:** Lower `final_level` values are *later* rounds. Competitors start at the highest `final_level` (initial heats) and promote *downward* toward 0 (Grand Final).

---

## 3. EventType CRUD

An EventType is a named event template that defines shared properties for all its divisions (Events).

### 3.1 Create EventType

**Endpoint:** `POST /carnivals/:carnival_id/event-types`

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `description` | string | Yes | Non-empty, max 30 chars, unique within carnival |
| `units` | string | Yes | Must be a valid unit code (see §2.3) |
| `lane_count` | integer | No | Default: 0. 0 = unlimited competitors per heat |
| `report_type_id` | integer | No | FK → report types. Defaults to first available report type |
| `include` | boolean | No | Default: `true` |
| `entrant_count` | integer | No | Default: 1. Number of entrants per house per event |
| `places_across_all_heats` | boolean | No | Default: `false`. If true, places are calculated across all heats in a final level rather than per-heat |
| `meet_manager_event` | string | No | Max 10 chars. Meet Manager event mapping code |

**Processing:**

1. Validate `description` is unique within the carnival (case-insensitive).
2. Insert into `event_types`.
3. If `lane_count > 0`, generate `lane_templates` entries (see §8.1).
4. Return the created event type with its auto-generated `id`.

**Response:** `201 Created` with event type object.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Description empty | 400 | "Event type description is required" |
| Description already exists | 409 | "An event type with this description already exists" |
| Invalid units | 400 | "Invalid unit code" |

---

### 3.2 List EventTypes

**Endpoint:** `GET /carnivals/:carnival_id/event-types`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_only` | boolean | false | If true, only return event types with `include = true` |

**Response:**

```json
[
  {
    "id": 1,
    "description": "100m Sprint",
    "units": "Seconds",
    "units_display": "Secs",
    "lane_count": 8,
    "report_type_id": 1,
    "report_type_description": "Standard Results",
    "include": true,
    "entrant_count": 1,
    "places_across_all_heats": false,
    "meet_manager_event": "1",
    "division_count": 6,
    "heat_count": 18
  }
]
```

- `division_count`: `COUNT(*)` of events for this event type.
- `heat_count`: `COUNT(*)` of heats across all events for this event type.

---

### 3.3 Get EventType

**Endpoint:** `GET /carnivals/:carnival_id/event-types/:id`

**Response:** Single event type object (same as list item), plus:

- `divisions`: Array of events (see §4.2 for event shape).
- `final_levels`: Array of final level configuration (see §5.2).

---

### 3.4 Update EventType

**Endpoint:** `PATCH /carnivals/:carnival_id/event-types/:id`

**Input:** Partial update.

**Side effects:**
- If `lane_count` changes, regenerate `lane_templates` for this event type (see §8.1).
- If `description` changes, validate uniqueness.

---

### 3.5 Delete EventType

**Endpoint:** `DELETE /carnivals/:carnival_id/event-types/:id`

**Processing:**
1. Delete all dependent records in cascade order:
   - `comp_events` → `heats` → `events`
   - `final_levels`
   - `lane_templates`, `lane_promotion_allocations`
   - `event_types`
2. Implement via `ON DELETE CASCADE`.

**Confirmation:** Require `?confirm=true`.

**Response:** `204 No Content`.

---

### 3.6 Copy EventType

**Endpoint:** `POST /carnivals/:carnival_id/event-types/:id/copy`

**Input:**

| Field | Type | Required |
|-------|------|----------|
| `description` | string | Yes |

**Processing:**

1. Validate new `description` is unique.
2. Copy the event type row with the new description.
3. Copy all `final_levels` rows, mapping to the new event type.
4. Copy all `lane_promotion_allocations` rows, mapping to the new event type.
5. Copy all `lane_templates` rows, mapping to the new event type.
6. Copy all `events` (divisions) rows, mapping to the new event type. Clear record values (`record`, `numeric_record`, `record_name`, `record_house`).
7. For each copied event, copy all `heats` rows, mapping to the new event. Clear `event_number` and `event_time`. Set `completed = false`, `status = active`.
8. Do NOT copy `comp_events` — the copied event starts with no competitors.

**Response:** `201 Created` with the new event type and its ID.

---

## 4. Event (Division) CRUD

An Event is a specific sex + age division of an EventType.

### 4.1 Create Event

**Endpoint:** `POST /carnivals/:carnival_id/event-types/:event_type_id/events`

**Input:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `sex` | enum | Yes | `M`, `F`, or `-` (mixed/both) |
| `age` | string | Yes | Max 10 chars. E.g., `"12"`, `"14-16"`, `"OPEN"` |
| `include` | boolean | No | Default: `true` |

**Processing:**

1. Validate the `(sex, age)` combination is unique within the event type.
2. Insert into `events` with `record = null`, `numeric_record = null`.
3. Return the created event.

**Response:** `201 Created`.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Duplicate sex+age | 409 | "A division for this sex and age already exists" |

---

### 4.2 List Events (Divisions)

**Endpoint:** `GET /carnivals/:carnival_id/event-types/:event_type_id/events`

**Response:**

```json
[
  {
    "id": 101,
    "event_type_id": 1,
    "sex": "M",
    "age": "14",
    "include": true,
    "record": "12.34",
    "numeric_record": 12.34,
    "record_name": "John Smith",
    "record_house_id": 3,
    "record_house_code": "RED",
    "heat_count": 3
  }
]
```

---

### 4.3 Update Event

**Endpoint:** `PATCH /carnivals/:carnival_id/event-types/:event_type_id/events/:id`

**Input:** Partial update of `sex`, `age`, `include`, `record`, `numeric_record`, `record_name`, `record_house_id`.

**Validation:** If `sex` or `age` changed, check uniqueness within the event type.

---

### 4.4 Delete Event

**Endpoint:** `DELETE /carnivals/:carnival_id/event-types/:event_type_id/events/:id`

**Processing:** Cascade delete `comp_events` → `heats` → event.

**Confirmation:** Require `?confirm=true`.

---

## 5. Final Levels (Heat Progression Template)

Final levels define the round structure for an event type — how many levels of heats/finals exist and how competitors promote between them.

### 5.1 Concept

A simple event has one final level (level 0 = Grand Final) with N heats. A complex event might have:

| final_level | label | heats | promotion | point_scale |
|-------------|-------|-------|-----------|-------------|
| 2 | Quarter Final | 4 | Staggered, by times | *(none)* |
| 1 | Semi Final | 2 | Smooth, by place | *(none)* |
| 0 | Grand Final | 1 | NONE | "Olympic" |

Competitors start at the highest `final_level` (2 = Quarter Final) and promote downward toward 0 (Grand Final).

### 5.2 CRUD

**Endpoint:** `GET /carnivals/:carnival_id/event-types/:event_type_id/final-levels`

**Response:**

```json
[
  {
    "event_type_id": 1,
    "final_level": 0,
    "label": "Grand Final",
    "num_heats": 1,
    "point_scale": "Olympic",
    "promotion_type": "NONE",
    "use_times": false,
    "promote_count": 0,
    "effects_records": true
  },
  {
    "event_type_id": 1,
    "final_level": 1,
    "label": "Semi Final",
    "num_heats": 2,
    "point_scale": null,
    "promotion_type": "Smooth",
    "use_times": true,
    "promote_count": 4,
    "effects_records": false
  }
]
```

**Endpoint:** `PUT /carnivals/:carnival_id/event-types/:event_type_id/final-levels`

Bulk replace — submit the complete set of final levels. This is a full replacement (delete all existing, insert new).

**Input:** Array of final level objects:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `final_level` | integer | Yes | 0–7 |
| `num_heats` | integer | Yes | 1–999 |
| `point_scale` | string | No | FK → point_scales. Scale name |
| `promotion_type` | enum | Yes | `NONE`, `Smooth`, or `Staggered` |
| `use_times` | boolean | No | Default: `true` |
| `promote_count` | integer | No | Default: 0. Number of competitors to promote per heat |
| `effects_records` | boolean | No | Default: `true`. Whether results at this level affect event records |

**Validation:**
- Level 0 MUST have `promotion_type = "NONE"` (Grand Final has no further promotion).
- `num_heats` must be between 1 and 999.
- Levels must be contiguous starting from 0.

**After updating final levels, the heats for all events of this event type SHOULD be regenerated (see §6).**

---

## 6. Heat Generation

### 6.1 Auto-Generate Heats

**Endpoint:** `POST /carnivals/:carnival_id/event-types/:event_type_id/generate-heats`

**Input:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clear_existing` | boolean | No | `true` | If true, delete existing heats and comp_events first |

**Processing:**

This is equivalent to the Access `AutomaticallyCreateHeatsAndFinals()` function.

```
PRE-CHECKS:
  1. Verify at least one Event (division) exists for this event type.
     IF none: return 400 "No divisions set up for this event"
  2. Verify at least one Final Level is configured.
     IF none: return 400 "Heat and final level information has not been provided"

IF clear_existing:
  3. Show confirmation: "This will remove all competitors from the [event_type].
     Do you want to continue?"
     (In API: require ?confirm=true)
  4. DELETE all comp_events WHERE event.event_type_id = :event_type_id
  5. DELETE all heats WHERE event.event_type_id = :event_type_id

GENERATE:
  6. Read final_levels for this event type, ORDER BY final_level DESC
     (start from the highest level — initial heats — down to 0 — grand final)

  7. FOR each event (division) in the event type:
       is_first_level = true
       FOR each final_level (ordered DESC — highest first):
         FOR i = 1 TO final_level.num_heats:
           INSERT INTO heats:
             event_id    = event.id
             heat_number = i
             point_scale = final_level.point_scale
             event_number = null (set later via event ordering)
             event_time  = null
             final_level = final_level.final_level
             promotion_type = final_level.promotion_type
             use_times   = final_level.use_times
             effects_records = final_level.effects_records
             completed   = false
             status      = IF is_first_level THEN 'active' ELSE 'future'
             dont_override_places = false
         is_first_level = false
```

**Key behaviour:**
- The **first** (highest-numbered) final level's heats get status `active`.
- All subsequent (lower-numbered) final levels' heats get status `future`.
- When `clear_existing = false`, existing heats are preserved and only missing heats are added (matched by `event_id + final_level + heat_number`).

**Response:**

```json
{
  "heats_created": 18,
  "events_processed": 6,
  "existing_heats_cleared": true
}
```

---

### 6.2 Heat Status Lifecycle

```
┌──────────┐     all heats at           ┌───────────┐    promotion      ┌──────────┐
│  future  │──── this level ──────────► │  active   │──── executed ───► │ promoted │
└──────────┘     become active           └───────────┘                   └──────────┘
                                              │
                                              │ results entered
                                              │ heat marked complete
                                              ▼
                                        ┌───────────┐
                                        │ completed │
                                        └───────────┘
```

**Status transitions:**

| From | To | Trigger |
|------|----|---------|
| `future` | `active` | All heats at the next higher level are promoted |
| `active` | `completed` | All competitors in the heat have results |
| `completed` | `promoted` | Competitor promotion executed (§7) |

**Setting heat status:**

**Endpoint:** `PATCH /carnivals/:carnival_id/heats/:heat_id`

Updating the `status` field on a heat also updates ALL heats at the same final level and event:

```sql
UPDATE heats
SET status = :new_status
WHERE event_id = :event_id
  AND final_level = :final_level;
```

This is equivalent to the Access `SetAllFinalToSameValue()` function — all heats in the same final level of the same event share one status.

### 6.3 Heat Completion

A heat is marked as completed when:
1. The `completed` checkbox (boolean) is set to `true`, OR
2. All competitors in the heat have a non-zero result.

When all heats at a final level are completed (checked via `SELECT WHERE completed = false AND event_id = :event_id AND final_level = :final_level` returns no rows), the final level is ready for promotion.

---

## 7. Competitor Promotion

Promotion moves top competitors from one final level to the next (lower) level.

### 7.1 Promotion Process

**Endpoint:** `POST /carnivals/:carnival_id/events/:event_id/promote`

**Input:**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `from_final_level` | integer | Yes | — |
| `confirm_all` | boolean | No | `false` |

**Processing:**

```
1. Determine the target level: to_level = from_final_level - 1
   IF to_level < 0: return 400 "Cannot promote from Grand Final"

2. Read the heat configuration for from_final_level:
   - promotion_type (Smooth or Staggered)
   - use_times (promote by result time vs. by place)
   - promote_count (how many competitors per heat to promote)

3. FOR each heat at from_final_level (ordered by heat_number):
   
   a. Get competitors, sorted by:
      - IF use_times: ORDER BY numeric_result (ASC for time units, DESC for distance/points)
      - ELSE: ORDER BY place ASC
   
   b. Select top promote_count competitors from this heat.

4. Allocate promoted competitors to target heats based on promotion_type:

   IF promotion_type = "Smooth":
     Competitors are allocated sequentially:
     Heat 1 qualifiers → Target Heat 1 first slots
     Heat 2 qualifiers → Target Heat 1 remaining, then Heat 2
     (Fill each target heat before moving to the next)

   IF promotion_type = "Staggered":
     Competitors are distributed evenly:
     1st qualifier from each heat → Target Heat 1
     2nd qualifier from each heat → Target Heat 2
     3rd qualifier from each heat → Target Heat 3
     (Round-robin across target heats)

5. FOR each promoted competitor:
   a. Confirm promotion (if confirm_all = false, prompt per competitor).
   b. INSERT INTO comp_events:
        competitor_id = competitor.id
        event_id = event.id (same event)
        heat_number = assigned target heat
        final_level = to_level
        lane = determined by lane_promotion_allocation (§8.3) or next available
        place = 0 (not yet placed)
        result = null
        numeric_result = 0
        points = 0

6. Update status of heats at from_final_level to 'promoted'.
7. Update status of heats at to_level to 'active'.
```

**Response:**

```json
{
  "promoted_count": 8,
  "from_level": 2,
  "from_level_label": "Quarter Final",
  "to_level": 1,
  "to_level_label": "Semi Final",
  "heats_promoted": [
    {
      "heat_number": 1,
      "competitors_promoted": ["JOHNSON, Sarah", "SMITH, Tom"]
    }
  ]
}
```

### 7.2 Promotion Eligibility

Promotion can only proceed when:
- All heats at the source level are `completed`.
- The target level exists and has heats defined.
- Heats at the target level are `future` or `active` (not already promoted through).

---

## 8. Lane Management

### 8.1 Lane Templates

Lane templates record which lane numbers are available for an event type. They are auto-generated when `lane_count` is set on an event type.

**Generation logic (equivalent to `UpdateLaneTemplate()`):**

```
DELETE FROM lane_templates WHERE event_type_id = :event_type_id
FOR i = 1 TO lane_count:
  INSERT INTO lane_templates (event_type_id, lane_number) VALUES (:event_type_id, i)
```

**Endpoint:** `GET /carnivals/:carnival_id/event-types/:event_type_id/lane-templates`

**Response:** Array of `{ lane_number }`.

---

### 8.2 Lane ↔ House Mapping

The `lanes` reference table maps lane numbers to houses so events can pre-assign lanes by house.

**Endpoint:** `GET /carnivals/:carnival_id/lanes`

**Endpoint:** `PUT /carnivals/:carnival_id/lanes` — Bulk set lane-to-house mappings.

**Input:** Array of `{ lane_number, house_id }`.

Used to assign: "Red House always runs in Lane 3."

---

### 8.3 Lane Promotion Allocation

Defines which lane a promoted competitor receives based on their finishing place.

**Endpoint:** `GET /carnivals/:carnival_id/event-types/:event_type_id/lane-promotion-allocations`

**Response:**

```json
[
  { "place": 1, "lane": 4 },
  { "place": 2, "lane": 5 },
  { "place": 3, "lane": 3 },
  { "place": 4, "lane": 6 },
  { "place": 5, "lane": 2 },
  { "place": 6, "lane": 7 },
  { "place": 7, "lane": 1 },
  { "place": 8, "lane": 8 }
]
```

This allocation follows standard sporting conventions where the fastest qualifiers receive the most favourable centre lanes in the next round.

**Endpoint:** `PUT /carnivals/:carnival_id/event-types/:event_type_id/lane-promotion-allocations`

**Input:** Array of `{ place, lane }` objects.

---

## 9. Competitor Entry into Events

### 9.1 Manual Entry

**Endpoint:** `POST /carnivals/:carnival_id/heats/:heat_id/competitors`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `competitor_id` | integer | Yes | FK → competitors |
| `lane` | integer | No | Lane assignment. Auto-assigned if omitted. |

**Processing:**

1. Validate the competitor belongs to this carnival.
2. Validate the competitor is not already in this heat (same `event_id + final_level + heat_number`).
3. Determine lane: if `lane` not provided, assign the next available lane from the event type's lane template.
4. Insert into `comp_events`:
   - `competitor_id`, `event_id` (from heat), `heat_number` (from heat), `final_level` (from heat)
   - `lane` = assigned lane
   - `place = 0`, `result = null`, `numeric_result = 0`, `points = 0`
5. Return the created comp_event entry.

**Response:** `201 Created`.

**Errors:**

| Condition | Status | Message |
|-----------|--------|---------|
| Competitor not found | 404 | "Competitor not found" |
| Already in heat | 409 | "Competitor is already entered in this heat" |

### 9.2 Competitor Eligibility Filter

When adding competitors to a heat, the frontend should filter the competitor list by the event's sex and age.

The default filter shows only competitors matching the event's sex AND whose age maps to the event's age category (via `competitor_event_age`):

```sql
SELECT c.id, c.surname, c.given_name, c.house_code
FROM competitors c
JOIN competitor_event_age cea ON c.age = cea.competitor_age
WHERE c.carnival_id = :carnival_id
  AND c.include = true
  AND c.sex = :event_sex
  AND cea.event_age = :event_age
  AND cea.flag = true
ORDER BY UPPER(c.surname), c.given_name;
```

If the heat's `all_names` flag is true, the age filter is removed — all competitors of the matching sex are shown (equivalent to `GenerateSexFilter()` in Access).

### 9.3 Automatic Competitor Entry (Seeding)

**Endpoint:** `POST /carnivals/:carnival_id/event-types/:event_type_id/auto-enter`

Automatically populates events/heats with eligible competitors.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `age` | string | No | Filter to specific age division. Omit for all ages. |
| `heat_strategy` | enum | Yes | How to distribute competitors across heats |

**Heat strategies:**

| Strategy | Description |
|----------|-------------|
| `fill_sequentially` | Fill Heat 1 to capacity, then Heat 2, etc. |
| `distribute_evenly` | Spread competitors evenly across all heats |
| `by_house` | Group competitors by house within heats |

**Processing:**

1. Identify all events (divisions) for this event type matching the age filter.
2. For each event:
   a. Query eligible competitors (by sex + age mapping) who are not already entered.
   b. Determine target heats at the highest (initial) final level.
   c. Distribute competitors into heats per the selected strategy.
   d. For each assignment, insert a `comp_events` record with default values.

**Response:**

```json
{
  "events_processed": 6,
  "competitors_entered": 120,
  "breakdown": [
    {
      "event": "100m Sprint — Boys 14",
      "competitors_added": 24,
      "heats_used": 3
    }
  ]
}
```

---

### 9.4 Remove Competitor from Heat

**Endpoint:** `DELETE /carnivals/:carnival_id/heats/:heat_id/competitors/:competitor_id`

**Processing:** Delete the `comp_events` row.

**Response:** `204 No Content`.

---

### 9.5 Copy Competitors Between Events

**Endpoint:** `POST /carnivals/:carnival_id/events/copy-competitors`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_event_id` | integer | Yes | Source event |
| `to_event_type_id` | integer | Yes | Destination event type |
| `from_final_level` | integer | No | Filter source by final level |
| `from_heat` | integer | No | Filter source by heat number |

**Processing:**

1. Find the destination event matching the source event's sex and age within the target event type.
2. Copy all `comp_events` entries from the source, mapping to the destination event.
3. Reset `place`, `result`, `numeric_result`, `points` to defaults on the copies.

This is used to move competitors between related events (e.g., from 100m Sprint to 200m Sprint for the same age/sex division).

**Response:**

```json
{
  "competitors_copied": 24,
  "from_event": "100m Sprint — Boys 14",
  "to_event": "200m Sprint — Boys 14"
}
```

---

## 10. Event Ordering

Events need a running order (programme sequence) for the carnival.

### 10.1 Concept

Each heat has an `event_number` field and an optional `event_time` field. The event number determines the order in which events run during the carnival. Event time is the scheduled start time.

### 10.2 List Event Order

**Endpoint:** `GET /carnivals/:carnival_id/event-order`

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sort` | string | `event_number` | Primary sort. Options: `event_number`, `description`, `age`, `sex`, `final_level`, `heat` |
| `sort2` | string | `description` | Secondary sort |
| `sort3` | string | `age` | Tertiary sort |

**Response:** Ordered array of heats with event metadata:

```json
[
  {
    "heat_id": 42,
    "event_number": 1,
    "event_time": "09:00",
    "event_type_description": "100m Sprint",
    "sex": "M",
    "age": "12",
    "final_level": 0,
    "final_level_label": "Grand Final",
    "heat_number": 1,
    "status": "active",
    "completed": false
  }
]
```

Heats with `event_number = null` are unscheduled and appear at the end.

---

### 10.3 Update Event Order

**Endpoint:** `PUT /carnivals/:carnival_id/event-order`

**Input:** Array of `{ heat_id, event_number, event_time }` objects.

```json
[
  { "heat_id": 42, "event_number": 1, "event_time": "09:00" },
  { "heat_id": 43, "event_number": 2, "event_time": "09:10" },
  { "heat_id": 44, "event_number": 3, "event_time": null }
]
```

**Processing:** Update each heat's `event_number` and `event_time` fields.

**Response:** `200 OK`.

---

### 10.4 Auto-Number Events

**Endpoint:** `POST /carnivals/:carnival_id/event-order/auto-number`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sort_by` | string[] | Yes | Ordered list of sort fields to determine sequence |
| `start_number` | integer | No | Default: 1 |

**Processing:**

1. Sort all heats (for included event types/events only) by the specified sort fields.
2. Assign sequential `event_number` values starting from `start_number`.
3. Update all heats.

**Response:**

```json
{
  "heats_numbered": 52,
  "start": 1,
  "end": 52
}
```

---

## 11. Heat CRUD

### 11.1 List Heats for Event

**Endpoint:** `GET /carnivals/:carnival_id/events/:event_id/heats`

**Response:**

```json
[
  {
    "id": 42,
    "heat_id_auto": 1001,
    "event_id": 101,
    "heat_number": 1,
    "final_level": 0,
    "final_level_label": "Grand Final",
    "point_scale": "Olympic",
    "event_number": 5,
    "event_time": "10:30",
    "promotion_type": "NONE",
    "use_times": false,
    "completed": false,
    "status": "active",
    "status_label": "Active",
    "all_names": false,
    "dont_override_places": false,
    "effects_records": true,
    "competitor_count": 8
  }
]
```

### 11.2 Get Heat Detail

**Endpoint:** `GET /carnivals/:carnival_id/heats/:heat_id`

**Response:** Heat object (same as list item) plus `competitors` array:

```json
{
  "...heat fields...",
  "competitors": [
    {
      "comp_event_id": 201,
      "competitor_id": 42,
      "name": "JOHNSON, Sarah",
      "house_code": "RED",
      "house_id": 3,
      "lane": 4,
      "place": 0,
      "result": null,
      "numeric_result": 0,
      "points": 0,
      "memo": null
    }
  ]
}
```

Competitors are ordered by: lane (if lanes used), then surname, then given_name.

### 11.3 Update Heat

**Endpoint:** `PATCH /carnivals/:carnival_id/heats/:heat_id`

**Updatable fields:** `event_number`, `event_time`, `point_scale`, `promotion_type`, `use_times`, `completed`, `status`, `all_names`, `dont_override_places`, `effects_records`.

**Side effect:** Changing `status` applies to ALL heats at the same final level and event (see §6.2).

### 11.4 Add / Remove Heats

Individual heats can be added or removed from the `EventTypeSub2` subform in Access. In the web version:

**Add heat:** `POST /carnivals/:carnival_id/events/:event_id/heats`

| Field | Type | Required |
|-------|------|----------|
| `final_level` | integer | Yes |
| `heat_number` | integer | Yes |
| `point_scale` | string | No |
| `promotion_type` | enum | No |

**Delete heat:** `DELETE /carnivals/:carnival_id/heats/:heat_id` — cascades to `comp_events`.

---

## 12. CompEvents Summary / Event List View

The CompEventsSummary form is the primary navigation screen for event management. It shows all heats across all events with filters.

### 12.1 List All Heats (Filterable)

**Endpoint:** `GET /carnivals/:carnival_id/heats`

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `event_number` | string | Filter by event number (supports `*` wildcard) |
| `event_description` | string | Filter by event type description (supports `*` wildcard) |
| `sex` | string | Filter: `M`, `F`, `-`, or omit for all |
| `age` | string | Filter by age (supports `*` wildcard) |
| `final_level` | string | Filter by final level (supports `*` wildcard) |
| `status` | integer[] | Filter by status codes (e.g., `[0,1]` for future+active) |
| `completed` | boolean | Filter by completion flag |
| `sort` | string | Sort order field |

**Response:** Array of heat objects with event metadata, same shape as §10.2.

This endpoint powers the main "Enter Competitors in Events" screen, where double-clicking a heat opens the event entry/results form.

---

## 13. Places Calculation

Place calculation determines competitor places based on results. This is triggered from the event entry form.

### 13.1 Calculate Places

**Endpoint:** `POST /carnivals/:carnival_id/heats/:heat_id/calculate-places`

**Processing (equivalent to Access `CalculatePoints("PLACE")`):**

```
1. Read all comp_events for this heat WHERE numeric_result <> 0 OR result = "PARTICIPATE"

2. Sort by numeric_result:
   - IF units are time-based (Seconds, Minutes, Hours): ASC (lower is better)
   - IF units are distance/points (Meters, Km, Points): DESC (higher is better)

3. IF event_type.places_across_all_heats = true:
     Include competitors from ALL heats at this final level (not just this heat)

4. Assign places, handling ties:
   place = 1
   FOR each group of competitors with the same numeric_result:
     Assign all competitors in the group: place = current_place
     Advance place by the count of competitors in the group
     (e.g., two 2nd places → next is 4th, not 3rd)

5. Handle special results:
   - "PARTICIPATE": Place = null, Points = minimum from the point scale
   - "FOUL": Place = null, Points = minimum from the point scale

6. Look up the point scale for this heat.

7. FOR each placed competitor:
   points = point_scale_lookup(place, heat.point_scale)
   IF place not in point scale: points = 0

8. Update all comp_events records with calculated place and points.

9. Recalculate competitor total_points (see Doc 4 §5).
```

**Response:**

```json
{
  "competitors_placed": 8,
  "places_calculated": true
}
```

### 13.2 Don't Override Places Flag

If `heat.dont_override_places = true`, automatic place calculation is suppressed. Places are only set manually. This flag is offered to the user when they have manually edited places and the system detects potential conflicts.

---

## 14. Enter Results in Place Order

An alternative results entry mode where the user enters results by finishing order rather than by competitor.

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

1. For each entry, identify the competitor by lane in this heat.
2. Parse the result string and calculate `numeric_result` (see Doc 6 §2 for result parsing).
3. Update the `comp_events` record: set `place`, `result`, `numeric_result`.
4. Calculate points based on the assigned places and point scale.
5. If all places are allocated, mark the heat as completed.

**Response:**

```json
{
  "results_entered": 8,
  "heat_completed": true
}
```

---

## 15. Cross-Document References

| Topic | See |
|-------|-----|
| Result entry and parsing | Doc 6 §2 |
| Scoring and point scales | Doc 6 §3 |
| Record checking and breaking | Doc 6 §4 |
| Points calculation from places | Doc 6 §3 |
| Competitor total points update | Doc 4 §5 |
| Competitor eligibility by age | Doc 4 §7 |
| House points from events | Doc 3 §4.5 |
| Event reports | Doc 7 |
| Event HTML export | Doc 8 |
| Meet Manager event export | Doc 8 §2 |
| Event Order screen layout | Doc 9 |
