# Sports Administrator — Software Specification

## Document 7: Reporting

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 7. Load with Documents 0, 1, 2.*

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.*

---

## 1. Overview

The reporting system provides two output channels:

1. **Server-rendered reports** (API endpoints returning structured data) — the web equivalent of the 42 Access print-preview reports.
2. **HTML export** — standalone HTML files for publishing results on a website, driven by a configuration table.

The Access application splits reports into two selection interfaces:

- **Generate Event Lists** — marshalling lists, lane draws, programs, entry sheets (filtered by event type, age, sex, final level, heat, status).
- **Generate Statistical Reports** — results summaries, age champions, records, standings, competitor results (filtered by selected event types and teams).

In the web version, these become a unified report-generation UI backed by API endpoints that return paginated, filtered data suitable for screen display, PDF export, or printing via the browser.

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `report_types` | Maps event types to report format categories |
| `misc_event_lists` | Persisted filter state for event list reports |
| `misc_statistics` | Persisted filter state & settings for statistical reports |

### Tables referenced (owned by other documents)

| Table | Owner Doc | Relationship |
|-------|-----------|--------------|
| `event_types` | Doc 5 | Report format (R_Code), event type flags |
| `events` | Doc 5 | Age, sex, records, include flag |
| `heats` | Doc 5 | Final level, heat number, status, event time |
| `comp_events` | Doc 5 | Places, results, points |
| `competitors` | Doc 4 | Names, ages, houses, total points |
| `houses` | Doc 3 | House names, codes, include/flag filters |
| `point_scales` | Doc 6 | Point scale values |
| `records` | Doc 6 | Event records |

---

## 2. Report Categories

### 2.1 Report Types Table

The `report_types` table maps event types to their appropriate report format. Each event type has an `r_code` FK that determines which marshalling list layout to use.

| R_Code | Description | Detailed Report | Summary Report | Limited Lanes | Relay |
|--------|-------------|-----------------|----------------|:---:|:---:|
| 1 | Limited Lanes (e.g., 100m sprint) | Track (Limited Lanes) | Track Small (Limited Lanes) | Yes | No |
| 2 | Unlimited Lanes (e.g., 800m, 1500m) | Track (Unlimited Lanes) | Track Small (Unlimited Lanes) | No | No |
| 3 | Field (3 attempts) | Field (3 attempts) | Track Small (Unlimited Lanes) | No | No |
| 4 | Field (High Jump) | Field (High Jump) | Track Small (Unlimited Lanes) | No | No |
| 5 | Results Entry Sheets | EventResultsEntrySheet | EventResultsEntrySheet | No | No |
| 6 | Relay (Limited Lanes) | Relay (Limited Lanes) | Relay Small (Limited Lanes) | Yes | Yes |

**In the web version:** Replace the Access report object names with API endpoint identifiers or report template names. The mapping from event type → report format remains the same.

### 2.2 Full Report Catalogue

All 42 reports, grouped by category:

#### Category A: Event Programs

| # | Report | Source Query | Description |
|---|--------|-------------|-------------|
| A1 | Program of Events | `Program of Events` | Full event schedule with times |
| A2 | Program of Events — 3 Column | `Program of Events` | Three-column compact variant |
| A3 | Program of Events — Summary | `Program of Events` | Condensed summary version |

#### Category B: Marshalling / Lane Lists

| # | Report | Source Query | Description |
|---|--------|-------------|-------------|
| B1 | Track (Limited Lanes) | `Lanes Limited` | Track event lane draws (assigned lanes) |
| B2 | Track Small (Limited Lanes) | `Lanes Limited` | Compact version of B1 |
| B3 | Track (Unlimited Lanes) | `Unlimited Lanes` | Track events without lane assignments |
| B4 | Track Small (Unlimited Lanes) | `Unlimited Lanes` | Compact version of B3 |
| B5 | Relay (Limited Lanes) | `Lanes Limited` | Relay event lane draws |
| B6 | Relay Small (Limited Lanes) | `Lanes Limited` | Compact version of B5 |
| B7 | Field (3 Attempts) | `Field Events` | Field event entry with 3-attempt grid |
| B8 | Field (High Jump) | `Field Events` | High jump specific format |

#### Category C: Competitor Lists

| # | Report | Source Query | Description |
|---|--------|-------------|-------------|
| C1 | Competitor List | `Competitor List` | Full competitor roster |
| C2 | CompetitorList — By Team/Age | `CompetitorList-ByTeamAge` | Grouped by house then age |
| C3 | Competitor Events | `CompetitorEvents` | Competitor with event assignments |
| C4 | Name Tags | `(competitors query)` | Printable name tags |
| C5 | Event Results Entry Sheet | `EventEntryLists` | Blank result recording sheets |

#### Category D: Records

| # | Report | Source Query | Description |
|---|--------|-------------|-------------|
| D1 | RecordDetails — Current | `Record-Best in Full` | Current event records |
| D2 | RecordDetailsMini — Current | `Records-Mini SF` | Compact current records |
| D3 | RecordDetails — By Day | `Record-Best in Full` | Records grouped by date set |

#### Category E: House/Team Points

| # | Report | Source Query | Description |
|---|--------|-------------|-------------|
| E1 | Summary — Points | `House Points — GrandTotal` | House point totals with extras and percentages |

#### Category F: Statistical Reports — Standings

| # | Report | Source Query | Description | HTML |
|---|--------|-------------|-------------|:---:|
| F1 | Statistics — Overall | `Report Base` | Overall house standings | — |
| F2 | Statistics — Age | `Report Base` | Standings by age group | — |
| F3 | Statistics — Sex | `Report Base` | Standings by gender | — |
| F4 | Statistics — AgeGender | `Report Base` | Standings by age and gender | — |
| F5 | Statistics — byPlace | `Report Base` | Results grouped by finishing place | — |
| F6 | Statistics — PointByEventNumber | `Cumulative Points by House` | Cumulative points graph by event number | — |

#### Category G: Statistical Reports — Events

| # | Report | Source Query | Description | HTML |
|---|--------|-------------|-------------|:---:|
| G1 | Statistics — Event | `Statistics-Event` | Results by event | — |
| G2 | Statistics — EventPlaces | `Statistics-EventPlaces` | Place distribution by event | — |
| G3 | Statistics — EventTimesOverallAsc | `Statistics-EventTimesOverallAsc` | Best results across all events (sorted) | Yes (`etoa`) |
| G4 | Statistics — CompetitorEvents | `Statistics-CompetitorEvents` | Individual competitor results | Yes (`coev`) |
| G5 | Statistics — CompetitorResultsByEventTeam | `Report-CompetitorResultsByEventTeam` | Results cross-tabulated by team and event | — |

#### Category H: Statistical Reports — Champions & Misc

| # | Report | Source Query | Description | HTML |
|---|--------|-------------|-------------|:---:|
| H1 | Statistics — AgeChampions | `Statistics-Age Champion` | Top competitor per age group (division only) | Yes (`agch`) |
| H2 | Statistics — AgeChampions — AcrossAllDivisions | `Statistics-Age Champion-AnyDivision` | Age champions across all divisions | Yes (`agca`) |
| H3 | RecordDetails — Current | `Report-Records-Top` | Current records (statistical version) | Yes (`rh`) |
| H4 | Misc — Non Participators | `(competitors query)` | Competitors who didn't participate | — |

---

## 3. Event List Reports — Filter & Generation

### 3.1 Filter Model

Event list reports use a shared filter state stored in the `misc_event_lists` singleton table. In the web version, these filters are passed as query parameters.

**Filter dimensions:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `age` | string | `*` (all) | Age group filter (e.g., `"8"`, `"OPEN"`, `"*"`) |
| `sex` | string | `*` (all) | Gender filter: `"M"`, `"F"`, or `"*"` |
| `final_level` | string | `*` (all) | Final level: `"0"` (heats), `"1"`, `"2"`, or `"*"` |
| `heat` | string | `*` (all) | Specific heat number or `"*"` |
| `statuses` | array | `["active"]` | Heat status filter: `future`, `active`, `completed`, `promoted` |
| `event_type_ids` | array | (all flagged) | Selected event type IDs to include |
| `detail_level` | string | `"detailed"` | `"detailed"`, `"summary"`, or `"both"` |

### 3.2 Status Filter Construction

The status checkboxes map to heat status values:

| Checkbox | Status Value | Numeric Code |
|----------|-------------|:---:|
| Future | `future` | 0 |
| Active | `active` | 1 |
| Completed | `completed` | 2 |
| Promoted | `promoted` | 3 |

The filter is constructed as: `status IN (:selected_statuses)`.

When a checkbox is unchecked, the corresponding status code is replaced with `9` (a non-existent status), effectively excluding those heats.

### 3.3 Event List Generation Endpoint

**Endpoint:** `GET /carnivals/:carnival_id/reports/event-lists`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `age` | string | Age filter |
| `sex` | string | Sex filter |
| `final_level` | string | Final level filter |
| `heat` | string | Heat filter |
| `statuses` | string (CSV) | Comma-separated status codes |
| `event_type_ids` | string (CSV) | Comma-separated event type IDs |
| `detail_level` | string | `detailed`, `summary`, or `both` |

**Processing:**

1. Query all flagged and included event types matching the `event_type_ids` filter.
2. Group by `r_code` (report type).
3. For each report type group, build the report data:
   - Join event types → events → heats → comp_events → competitors.
   - Apply age/sex/final_level/heat/status filters.
   - Apply event-type-specific formatting (lanes, attempts, etc.).
4. Return one report per distinct `r_code`.

**Response:**

```json
{
  "reports": [
    {
      "report_type": "track_limited_lanes",
      "r_code": 1,
      "detail_level": "detailed",
      "events": [
        {
          "event_type": "100m Sprint",
          "age": "12",
          "sex": "M",
          "final_level": 0,
          "heat": 1,
          "status": "active",
          "event_number": 5,
          "event_time": "10:30 AM",
          "record": "12.34",
          "record_holder": "Smith (RED)",
          "competitors": [
            {
              "lane": 1,
              "name": "Johnson, Sarah",
              "house": "RED",
              "house_code": "RED"
            }
          ]
        }
      ]
    }
  ]
}
```

### 3.4 Marshalling List Layouts

Each report type has a specific column layout:

**Track (Limited Lanes) — R_Code 1:**

| Column | Source |
|--------|-------|
| Lane | `comp_events.lane` |
| Team | `houses.name` |
| Competitor | `competitors.surname`, `given_name` |
| Result | *(blank — for writing in)* |
| Place | *(blank)* |

Grouped by: Event Type → Age → Sex → Final Level → Heat.
Header includes: Event description, age, sex, heat number, event time, current record.

**Track (Unlimited Lanes) — R_Code 2:**
Same as above but without lane column. Competitors listed alphabetically or by house.

**Field (3 Attempts) — R_Code 3:**
Adds three attempt columns for recording throws/jumps. Includes Best column.

**Field (High Jump) — R_Code 4:**
Adds height increment columns for progressive elimination format.

**Relay (Limited Lanes) — R_Code 6:**
Groups competitors by house within each lane, showing team composition.

**Summary variants** use a compact single-line-per-event format with fewer columns.

### 3.5 Program of Events Report

**Endpoint:** `GET /carnivals/:carnival_id/reports/program`

Returns the event schedule ordered by event number.

**Response columns:** Event Number | Event Time | Event Description | Age | Sex | Final Level | Heat

**Variants:**
- Standard: Full-width single column.
- 3-Column: Three events per row (compact).
- Summary: One line per event type/age/sex combination (no heat breakdown).

### 3.6 Name Tags Report

**Endpoint:** `GET /carnivals/:carnival_id/reports/name-tags`

Returns competitor data formatted for printing name tags.

**Response per competitor:** Competitor name, house, age group, competitor PIN.

### 3.7 Event Results Entry Sheet

**Endpoint:** `GET /carnivals/:carnival_id/reports/entry-sheets`

Returns blank entry sheets with competitor names pre-filled, designed for manual result recording during the carnival.

---

## 4. Statistical Reports — Filter & Generation

### 4.1 Filter Model

Statistical reports use two filter mechanisms:

1. **Event type selection** — Same as event lists (checkbox per event type with Include/Flag toggles).
2. **Team/house selection** — Checkboxes per house with Include/Flag toggles.
3. **Settings** from `misc_statistics` singleton:

| Setting | Type | Description |
|---------|------|-------------|
| `number_of_records` | integer | Max rows to display in top-N reports |
| `age_champion_number` | integer | Number of places to show in age champion reports |
| `record_date` | date | Filter date for "records set on" report |

### 4.2 Report Selection Model

Unlike event lists (which generate by report type), statistical reports use a checkbox-per-report model. The user ticks which reports to generate, then clicks "Preview" or "Print".

**Available report checkboxes (grouped):**

**Group 1 — Standings (filtered by selected events):**

| Checkbox | Report | Description |
|----------|--------|-------------|
| Overall Results | Statistics-Overall | Total house points ranking |
| Overall Results by Age | Statistics-Age | House points grouped by age |
| Overall Results by Gender | Statistics-Sex | House points grouped by gender |
| Overall Res. by Gender/Age | Statistics-AgeGender | House points by gender and age |
| Overall Res. by Place | Statistics-byPlace | Results grouped by place |
| Cumulative Res. by Event # | Statistics-PointByEventNumber | Running point total by event number |

**Group 2 — Events & Competitors (filtered by selected events AND teams):**

| Checkbox | Report | Description |
|----------|--------|-------------|
| Event Results | Statistics-EventPlaces | Results organized by event/place |
| Competitors Results (by Team/Event) | Statistics-CompetitorResultsByEventTeam | Cross-tabulated results |
| Current Records | RecordDetails-Current | Full current records listing |
| Current Records (Mini) | RecordDetailsMini-Current | Compact records listing |
| Records set on [date] | RecordDetails-ByDay | Records from a specific date |
| Competitor Places | Statistics-EventPlaces | Place distribution analysis |
| Event Results — Best | Statistics-EventTimesOverallAsc | Best performances across events |

**Group 3 — Other (filtered by selected events):**

| Checkbox | Report | Description |
|----------|--------|-------------|
| Age Champions (division only) | Statistics-AgeChampions | Top performers per age, own division |
| Age Champions (all divisions) | Statistics-AgeChampions-AcrossAllDivisions | Top performers per age, any division |
| Competitor List (by Team) | CompetitorList-ByTeamAge | Roster grouped by team and age |
| Competitor Events | Statistics-CompetitorEvents | Individual competitor results |
| Non-Participants | Misc-Non Participators | Who didn't compete |

### 4.3 Statistical Report Endpoint

**Endpoint:** `GET /carnivals/:carnival_id/reports/statistics/:report_name`

**Common Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `event_type_ids` | string (CSV) | Filter to selected event types |
| `house_ids` | string (CSV) | Filter to selected houses/teams |
| `max_records` | integer | Limit rows returned (for top-N) |
| `age_champion_count` | integer | Number of champions to show |
| `record_date` | date | Filter date (for records-by-day) |

**Valid `report_name` values:**

| report_name | Category |
|-------------|----------|
| `overall` | F1 |
| `by-age` | F2 |
| `by-sex` | F3 |
| `by-age-gender` | F4 |
| `by-place` | F5 |
| `cumulative-by-event-number` | F6 |
| `event-results` | G1 |
| `event-places` | G2 |
| `event-times-best` | G3 |
| `competitor-events` | G4 |
| `competitor-results-by-team-event` | G5 |
| `age-champions` | H1 |
| `age-champions-all-divisions` | H2 |
| `current-records` | H3 |
| `non-participants` | H4 |

---

## 5. Key Report Queries

### 5.1 House Points — Grand Total

The flagship summary report. Calculates total points per house including extra (manual) points.

```sql
SELECT
  h.code AS house_code,
  h.name AS house_name,
  COALESCE(SUM(ce.points), 0) AS event_points,
  COALESCE(ep.extra_points, 0) AS extra_points,
  COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0) AS grand_total,
  ROUND(
    (COALESCE(SUM(ce.points), 0) + COALESCE(ep.extra_points, 0))::numeric
    / NULLIF(SUM(SUM(ce.points)) OVER (), 0) * 100, 1
  ) AS percentage
FROM houses h
LEFT JOIN competitors c ON c.house_code = h.code AND c.carnival_id = :carnival_id
LEFT JOIN comp_events ce ON ce.competitor_id = c.id
LEFT JOIN (
  SELECT house_id, SUM(points) AS extra_points
  FROM house_points_extra
  WHERE carnival_id = :carnival_id
  GROUP BY house_id
) ep ON ep.house_id = h.id
WHERE h.carnival_id = :carnival_id
  AND h.include = true
GROUP BY h.code, h.name, ep.extra_points
ORDER BY grand_total DESC;
```

### 5.2 Age Champion Query

Determines the top competitor per age/sex division by summing their points across flagged events.

```sql
SELECT
  c.surname || ', ' || c.given_name || ' (' || c.age || ')' AS full_name,
  e.age || ' ' || e.sex AS age_sex_division,
  h.name AS house_name,
  SUM(ce.points) AS total_points
FROM competitors c
JOIN comp_events ce ON ce.competitor_id = c.id
JOIN heats ht ON ht.id = ce.heat_id
JOIN events e ON e.id = ht.event_id
JOIN event_types et ON et.id = e.event_type_id
JOIN houses h ON h.code = c.house_code AND h.carnival_id = c.carnival_id
WHERE c.carnival_id = :carnival_id
  AND et.flag = true AND h.flag = true
  AND UPPER(c.given_name) <> 'TEAM'
  AND c.age IS NOT NULL
GROUP BY c.id, c.surname, c.given_name, c.age, e.age, e.sex, h.name
ORDER BY age_sex_division, total_points DESC;
```

The report shows the top N competitors per division (N = `age_champion_number`).

**Variant — Across All Divisions:** Uses a `CompetitorEventAge` cross-join to credit points from events where the competitor's age falls within the event's age range, not limited to only their own age division.

### 5.3 Cumulative Points by Event Number

Generates a running total of house points as events progress, useful for showing how the competition unfolded.

**Algorithm:**

1. Query all completed events ordered by event number.
2. For each house, calculate cumulative point total after each event.
3. Return series data suitable for a line chart.

```json
{
  "event_numbers": [1, 2, 3, 4, 5],
  "series": [
    {
      "house": "RED",
      "cumulative_points": [10, 18, 24, 32, 40]
    },
    {
      "house": "BLUE",
      "cumulative_points": [8, 20, 26, 30, 38]
    }
  ]
}
```

### 5.4 Lanes Limited Query

The core marshalling list query for lane-based events. Joins event types, events, heats, lane templates, and lane substitutions.

**Filters applied from report parameters:**

```sql
WHERE et.flag = true AND et.include = true AND e.include = true
  AND (:age = '*' OR e.age::text LIKE :age)
  AND (:sex = '*' OR e.sex LIKE :sex)
  AND (:final_level = '*' OR ht.final_level::text LIKE :final_level)
  AND (:heat = '*' OR ht.heat::text LIKE :heat)
  AND ht.status IN (:selected_statuses)
ORDER BY e.event_type_id, e.age, e.sex, ht.final_level, ht.heat;
```

**Output columns:** Event type, age, sex, final level, heat, lane count, event number, status, record, record holder, units, event time.

### 5.5 House Points by Breakdown

Multiple breakdown queries provide sub-views of house points:

| Query | Groups By | Purpose |
|-------|----------|---------|
| House Points — Total (All Events) | House | Overall event points |
| HousePoints — Total — Sex | House, Sex | Points by gender |
| HousePoints — Total — Age | House, Age | Points by age group |
| HousePoints — Total — Sex — Age | House, Sex, Age | Full breakdown |
| HousePoints — Total — Event | House, Event | Points by event |
| Points by EventNumber and Team | Event Number, House | For cumulative chart |

All filter by `event_type.include = true`, `house.include = true`, `events.include = true`.

---

## 6. House Extra Points

### 6.1 Concept

Houses can receive manually-awarded extra points (e.g., for sportsmanship, cheering, team spirit) that are added to their event-earned points in the grand total.

### 6.2 Manage Extra Points

**Endpoint:** `GET /carnivals/:carnival_id/houses/:house_id/extra-points`

**Response:**

```json
[
  {
    "id": 1,
    "points": 5.0,
    "reason": "Best team spirit"
  }
]
```

**Add Extra Points:**

**Endpoint:** `POST /carnivals/:carnival_id/houses/:house_id/extra-points`

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `points` | number | Yes | Points to award |
| `reason` | string | No | Reason for the award |

**Delete Extra Points:**

**Endpoint:** `DELETE /carnivals/:carnival_id/houses/:house_id/extra-points/:id`

---

## 7. Report Output Formats

### 7.1 Screen Preview (Default)

All report endpoints return JSON data. The frontend renders these using appropriate templates (tables, grids, charts).

### 7.2 PDF Export

**Endpoint suffix:** Add `?format=pdf` to any report endpoint.

The Access version supports PDF via "Save as PDF/XPS" from the report right-click menu. The web version should use a server-side PDF renderer (e.g., Puppeteer, wkhtmltopdf, or a PDF library).

### 7.3 Browser Print

The frontend should provide a "Print" button that opens the browser's print dialog with appropriate print CSS applied.

### 7.4 Email as Attachment

The Access version supports emailing reports as attachments. In the web version, this could be:

**Endpoint:** `POST /carnivals/:carnival_id/reports/:report_name/email`

**Input:**

| Field | Type | Required |
|-------|------|----------|
| `to` | string | Yes |
| `subject` | string | No |
| `format` | string | No (default: `pdf`) |

### 7.5 Report Context Menu

The Access version provides a right-click context menu on reports with:

1. Quick Print
2. Select Pages
3. Page Setup
4. Email Report as Attachment
5. Save as PDF/XPS
6. Close Report

In the web version, provide equivalent toolbar buttons on the report viewer.

---

## 8. Report Headers and Layout

### 8.1 Common Report Header

All reports display a common header:

| Element | Source | Description |
|---------|--------|-------------|
| Carnival Title | `miscellaneous.carnival_title` | Top of every report |
| Report Title | Hard-coded per report | e.g., "Program of Events" |
| Custom Headers | `misc_event_lists.rhead1`, `rhead2` | Optional user-defined header lines |
| Page Number | System | "Page X of Y" |
| Date | System | Current date |

### 8.2 Grouping and Page Breaks

Reports use grouping with optional page breaks between groups:

| Report | Group 1 | Group 2 | Group 3 | Page Break |
|--------|---------|---------|---------|:---:|
| Lane lists | Event Type | Age/Sex | Heat | Per event |
| Statistics — Overall | — | — | — | — |
| Statistics — Age | Age Group | — | — | Per age |
| Statistics — AgeGender | Sex | Age | — | Per sex |
| Age Champions | Age/Sex Division | — | — | Per division |
| Records — Current | Event Type | — | — | — |
| Records — By Day | Date | — | — | Per date |
| Summary — Points | — (sorted by total DESC) | — | — | — |

### 8.3 Sort Orders

| Report | Primary Sort | Secondary Sort |
|--------|-------------|----------------|
| Lane lists | Event number | Lane |
| Competitor list | Surname | Given name |
| CompetitorList — By Team/Age | House | Age, Surname |
| Statistics — Overall | Total points DESC | — |
| Age Champions | Division | Total points DESC |
| Records | Event type | — |
| Summary — Points | Grand total DESC | — |

---

## 9. Batch Report Generation

### 9.1 Multiple Report Generation

Both the Event Lists and Statistical Reports interfaces support generating multiple reports in one action.

**Event Lists:** Iterates through selected event types grouped by `r_code`. For each distinct report type, generates one report containing all matching events.

**Statistical Reports:** Iterates through all ticked report checkboxes and generates each selected report sequentially.

**Endpoint:** `POST /carnivals/:carnival_id/reports/batch`

**Input:**

```json
{
  "reports": ["overall", "by-age", "age-champions", "current-records"],
  "filters": {
    "event_type_ids": [1, 2, 3],
    "house_ids": [1, 2, 3, 4],
    "max_records": 10,
    "age_champion_count": 3
  },
  "format": "pdf"
}
```

**Response:** Returns a combined PDF or a ZIP of individual report files.

### 9.2 Print All Open Reports

**Endpoint:** `POST /carnivals/:carnival_id/reports/print-all`

Prints all currently previewed reports. In the web version, this generates a combined PDF of all recently-generated reports.

---

## 10. Worked Example — Generating Lane Lists

**Scenario:** User wants to print marshalling lists for all active 12-year-old track events.

1. **Set filters:**
   - Age: `12`
   - Sex: `*` (both)
   - Final Level: `*` (all)
   - Heat: `*` (all)
   - Status: Active only
   - Event types: All track types selected (R_Code 1 and 2)
   - Detail level: Detailed

2. **API call:**
   ```
   GET /carnivals/1/reports/event-lists?age=12&sex=*&final_level=*&heat=*&statuses=active&event_type_ids=1,2,3&detail_level=detailed
   ```

3. **System processing:**
   - Finds all events with age=12, any sex, active heats.
   - Groups by R_Code: Limited lane events → Track report; Unlimited lane events → Field report.
   - For each event/heat: fetches competitors, lane assignments, house codes.
   - Returns two report datasets (one per R_Code).

4. **Output:** Two print-ready reports, each containing multiple events with competitors listed by lane.

---

## 11. Cross-Document References

| Topic | See |
|-------|-----|
| Event types and report type assignment | Doc 5 §2 |
| Heat status values | Doc 5 §6.2 |
| House configuration and flags | Doc 3 §4 |
| House extra points form | Doc 3 §4 |
| Competitor data model | Doc 4 §2 |
| Point scales and scoring | Doc 6 §4, §5 |
| Event records | Doc 6 §6 |
| HTML export system | Doc 8 |
| Report UI and navigation | Doc 9 |
