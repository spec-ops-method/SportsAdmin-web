# Sports Administrator — Software Specification

## Document 8: HTML Export & Data Exchange

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*Covers Build Step 8. Load with Documents 0, 1, 2.*

> **Platform note:** Section 2 (HTML Export) is **likely redundant** in a web application — the app serves results directly via public URLs. See [Document 0 §15](00-platform-translation-notes.md) for the full rationale. Sections 3 (Meet Manager) and 4 (Carnival Disk) remain relevant. Builders should treat §2 as optional/deferred.

*See [Document 0](00-platform-translation-notes.md) for platform translation decisions.
See [Document 2](02-data-model.md) for column definitions of tables referenced here.
See [Document 7](07-reporting.md) for the report catalogue and query logic.*

---

## 1. Overview

This document covers three data exchange systems:

1. **HTML Export** — Generate a static website of carnival results for publishing.
2. **Meet Manager Export** — Export competitor/event data in Hy-Tek Meet Manager format.
3. **Carnival Disk Export** — Export competitor entry lists per house for distribution to participating schools.

### Tables owned by this document

| Table | Purpose |
|-------|---------|
| `misc_html` | HTML export settings (template paths, output directory, header) |
| `html_report_configs` | Per-report HTML export definitions (was `tblReportsHTML`) |

### Tables referenced (owned by other documents)

| Table | Owner Doc | Relationship |
|-------|-----------|--------------|
| `event_types` | Doc 5 | Event descriptions, `mevent` (Meet Manager event code) |
| `events` | Doc 5 | Age, sex |
| `competitors` | Doc 4 | Names, DOB, sex, house, PIN, ID |
| `comp_events` | Doc 5 | Places, results |
| `competitor_event_ages` | Doc 4 | Age mapping, `mdiv` (Meet Manager division) |
| `miscellaneous` | Doc 3 | `mteam`, `mcode`, `mtop`, `carnival_title` |

---

## 2. HTML Export System

### 2.1 Architecture

The HTML export generates standalone `.htm` files that can be uploaded to any web server. The system uses:

1. **Template files** — HTML shells with placeholder tokens.
2. **Report configurations** — Database-driven definitions mapping queries to field layouts.
3. **A CSS stylesheet** — Shared styling across all pages.
4. **An index page** — Manual or auto-generated table of contents.

In the Access version, two HTML generation approaches exist:

- **Modern approach (`ExportNamesHTML`):** Data-driven — reads configuration from `html_report_configs`, runs the configured query, and builds HTML from the result set. Used for age champions, competitor events, event times, and records.
- **Legacy approach (report events):** HTML is generated inline within Access report `Format` events as the report renders. Used for overall results, age/sex breakdowns, and event results. Each report's VBA code builds HTML alongside the print layout.

**In the web version:** Replace both approaches with a single server-side HTML renderer. Each report endpoint (Doc 7) can return `?format=html` to produce a standalone HTML page.

### 2.2 HTML Export Settings

**Endpoint:** `GET /carnivals/:carnival_id/settings/html-export`

Returns the HTML export configuration.

**Response:**

```json
{
  "output_directory": "/var/www/results/2026-carnival",
  "report_header": "My School",
  "template_file": "_template.htm",
  "template_file_summary": "_template_summary.htm"
}
```

**Update Settings:**

**Endpoint:** `PATCH /carnivals/:carnival_id/settings/html-export`

**Input:**

| Field | Type | Description |
|-------|------|-------------|
| `output_directory` | string | File system path or URL prefix for generated files |
| `report_header` | string | Text displayed as the site-wide header/link text |
| `template_file` | string | Path to the detail page template |
| `template_file_summary` | string | Path to the summary page template |

### 2.3 Template System

Templates are HTML files with six placeholder tokens (case-insensitive, enclosed in braces):

| Token | Replacement |
|-------|-------------|
| `{html}` | The generated report content (header + summary + results) |
| `{prev}` | Link to the previous page (for multi-page reports) |
| `{next}` | Link to the next page |
| `{titl}` | Report title text |
| `{head}` | Site-wide header text (from settings) |
| `{repn}` | Report short code (used as `<body id>` for CSS targeting) |

**Template structure (standard report):**

```html
<!doctype html>
<html lang="en">
<head>
  <title>Sports Results</title>
  <link rel="stylesheet" href="sport.css">
</head>
<body id="{repn}">
  <div id="nav-header">
    <p><a href="index.htm">{head}</a></p>
    <table>
      <tr>
        <td class="nav-page-cell">{prev}</td>
        <td class="nav-page-center">{titl}</td>
        <td class="nav-page-cell">{next}</td>
      </tr>
    </table>
  </div>

  {html}

  <div id="nav-footer">
    <!-- prev/next navigation repeated -->
  </div>
  <div id="footer">
    <p>(Page created by Sports Administrator)</p>
  </div>
</body>
</html>
```

**Summary template** is similar but omits prev/next navigation.

**In the web version:** Templates can be server-side view templates (EJS, Handlebars, Nunjucks). The same token substitution pattern applies.

### 2.4 HTML Report Configurations

Each exportable report is defined in the `html_report_configs` table.

**Endpoint:** `GET /carnivals/:carnival_id/html-report-configs`

**Response:**

```json
[
  {
    "id": 1,
    "short_code": "agca",
    "title": "Age Champions (all divisions)",
    "caption": "",
    "query_name": "Statistics-Age Champion-AnyDivision",
    "fields": "_Position;Fullname;H_NAme;SumOfPoints",
    "headers": "#;Competitor;Team;Points",
    "group_field": "AgeSex",
    "group_header": "",
    "display_limit": 0,
    "is_age_champ": true,
    "final_level_field": null,
    "place_field": null
  }
]
```

**Configuration fields:**

| Field | Description |
|-------|-------------|
| `short_code` | Unique identifier, used as filename (e.g., `agca.htm`) and CSS body ID |
| `title` | Page title / `<h1>` content |
| `caption` | Optional subtitle / `<h3>` |
| `query_name` | Source query to execute |
| `fields` | Semicolon-delimited list of field names from the query result |
| `headers` | Semicolon-delimited list of column header labels (must match `fields` count) |
| `group_field` | Field name to group results by (each unique value creates a section) |
| `group_header` | Optional prefix before the group value in section headings |
| `display_limit` | Hard limit on rows per group (0 = use setting from misc_statistics) |
| `is_age_champ` | If true, uses `age_champion_number` setting instead of `number_of_records` |
| `final_level_field` | Field name containing final level (for place-based CSS classes) |
| `place_field` | Field name containing place (for place-based CSS classes) |

**Seed data (5 reports):**

| Short Code | Title | Query | Group Field |
|------------|-------|-------|-------------|
| `agca` | Age Champions (all divisions) | Statistics-Age Champion-AnyDivision | AgeSex |
| `agch` | Age Champions (division only) | Statistics-Age Champion | AgeSex |
| `etoa` | Event Results — Best | Statistics-EventTimesOverallAsc-EA | ET_Des |
| `coev` | Competitor Results | Statistics-CompetitorEvents | H_NAme |
| `rh` | Record Holders | Report-Records-Top | ET_Des |

**Special field:** `_Position` — Not a database field. The export engine generates a row counter (1, 2, 3...) that resets for each group.

### 2.5 HTML Generation Algorithm

**Endpoint:** `POST /carnivals/:carnival_id/html-export`

Generates all configured HTML reports and writes them to the output directory.

**Input (optional):**

```json
{
  "report_codes": ["agca", "coev", "rh"],
  "output_directory": "/override/path"
}
```

If `report_codes` is omitted, generates all configured reports plus any legacy reports that are ticked in the statistical reports settings.

**Algorithm for data-driven reports (per short code):**

```
1. Load config from html_report_configs by short_code.
2. Validate fields count = headers count.

3. Determine display limit:
   IF display_limit > 0:
     max_rows = display_limit
   ELSE IF is_age_champ:
     max_rows = misc_statistics.age_champion_number
   ELSE:
     max_rows = misc_statistics.number_of_records

4. Execute the configured query.
5. Build three HTML sections:

   pHTML (Page Header):
     <div class="header">
       <h1>{title}</h1>
       <div class="caption"><h3>{caption}</h3></div>  (if caption set)
     </div>

   sHTML (Summary Navigation):
     <div id="summary">
       <h2>Summary of Results</h2>
       <ul class="main">
         <li><a href="#grp-{css_safe_group}">{group_value}</a></li>
         ...
       </ul>
     </div>

   rHTML (Results):
     FOR each group (unique value of group_field):
       <div class="grp-results" id="grp-{css_safe_group}">
         <div class="hdr-{css_safe_group}">
           <h3>{group_header} {group_value}</h3>
         </div>
         <div class="data-{css_safe_group}">
           <table class="{css_safe_group}">
             <thead><tr>
               <th class="{field_name}">{header}</th> ...
             </tr></thead>
             FOR each row (up to max_rows):
               <tr class="{css_class}">
                 <td class="{field_name}">{value}</td> ...
               </tr>
           </table>
         </div>
         <div class="grp-return"><a href="#summary">Return to Summary</a></div>
       </div>

6. CSS class for each row:
   IF final_level_field AND place_field are set:
     class = "place-{final_level}-{place}"
   ELSE:
     class = "position-{row_number}"

7. Merge pHTML + sHTML + rHTML.
8. Substitute into template:
     {html} → merged content
     {titl} → title
     {head} → report_header (from misc_html settings)
     {repn} → short_code
     {prev}, {next} → links or empty (for single-page reports)
9. Write to output_directory/{short_code}.htm
```

**For multi-page reports (legacy approach):**

Reports that generate multiple pages (e.g., Statistics-Event, Statistics-Overall) create files named `{code}1.htm`, `{code}2.htm`, etc., plus a `_{code}.htm` summary page.

Each page gets `{prev}` and `{next}` links pointing to adjacent pages:
- Page 1: prev = summary, next = page 2
- Page N: prev = page N−1, next = summary

### 2.6 CSS Styling

The generated pages link to a shared `sport.css` file. Key CSS features:

| Selector | Purpose |
|----------|---------|
| `#nav-header`, `#nav-footer` | Navigation bars with amber background |
| `#summary ul.main` | 4-column list layout for group navigation |
| `.place-0-1 td` | First place highlight (light red background) |
| `.results table` | Fixed table layout |
| `tr:nth-child(even)` | Alternating row colours (grey/white) |
| `thead th` | Cream header background |
| `td._Position`, `td.SumOfPoints` | Centered alignment |
| `th.competitor` | Left-aligned, 40% width |
| `@media print` | Hides navigation, summary, and footer for printing |
| `div.grp-results` | Page-break control for printing |

The `<body id="{repn}">` attribute allows per-report CSS overrides using `#agca`, `#coev`, etc.

### 2.7 Generated File Manifest

A full HTML export produces these files:

| File | Content | Source |
|------|---------|--------|
| `index.htm` | Table of contents with links to all reports | Manual or auto-generated |
| `agca.htm` | Age Champions (all divisions) | ExportNamesHTML |
| `agch.htm` | Age Champions (division only) | ExportNamesHTML |
| `etoa.htm` | Event Results — Best | ExportNamesHTML |
| `coev.htm` | Competitor Events | ExportNamesHTML |
| `rh.htm` | Record Holders | ExportNamesHTML |
| `over1.htm` ... `overN.htm` | Overall Results (multi-page) | Legacy report |
| `_over.htm` | Overall Results summary | Legacy report |
| `_age.htm` | Overall Results by Age | Legacy report |
| `_sex.htm` | Overall Results by Gender | Legacy report |
| `_agsx.htm` | Overall Results by Age/Gender | Legacy report |
| `evnt1.htm` ... `evntN.htm` | Event Results (multi-page) | Legacy report |
| `_evnt.htm` | Event Results summary | Legacy report |
| `sport.css` | Stylesheet | Static file (copied) |

**In the web version:** Eliminate the multi-page legacy approach. Generate single-page HTML files per report, with client-side pagination if needed.

### 2.8 Index Page Generation

The index page is a manually-maintained table of contents linking to all generated reports. In the web version, auto-generate it from the configured reports.

**Endpoint:** `POST /carnivals/:carnival_id/html-export/index`

**Generated structure:**

```html
<table>
  <tr>
    <td><a href="agca.htm"><strong>Age Champions</strong></a></td>
    <td>Points gained by each competitor ordered by age group</td>
  </tr>
  <tr>
    <td><a href="coev.htm"><strong>Competitor Events</strong></a></td>
    <td>Points gained by each competitor ordered by name</td>
  </tr>
  <!-- ... one row per configured report ... -->
</table>
```

---

## 3. Meet Manager Export

### 3.1 Overview

Hy-Tek Meet Manager is a widespread swimming/athletics meet management application. SportsAdmin exports competitor and entry data in Hy-Tek's semicolon-delimited text format, enabling data transfer to Meet Manager for timing-system integration.

### 3.2 Meet Manager Settings

Stored in the `miscellaneous` settings table (Doc 3):

| Setting | Column | Example | Description |
|---------|--------|---------|-------------|
| Team Name | `mteam` | "Springfield School" | Full team name |
| Team Code | `mcode` | "SPR" | 2–4 character team abbreviation |
| Top N | `mtop` | 3 | Number of top-placed competitors to export per event |

### 3.3 Division Mapping

Each event age must be mapped to a Hy-Tek division number before export.

**Stored in:** `competitor_event_ages.mdiv` column (VARCHAR(2)).

**Endpoint:** `GET /carnivals/:carnival_id/meet-manager/divisions`

**Response:**

```json
[
  { "event_age": "8", "mdiv": "01" },
  { "event_age": "9", "mdiv": "02" },
  { "event_age": "10", "mdiv": "03" },
  { "event_age": "OPEN", "mdiv": "10" }
]
```

**Update Mapping:**

**Endpoint:** `PUT /carnivals/:carnival_id/meet-manager/divisions`

**Input:**

```json
[
  { "event_age": "8", "mdiv": "01" },
  { "event_age": "9", "mdiv": "02" }
]
```

### 3.4 Export Format — Entry Records

Exports competitors with their event entries and results. Each line represents one competitor-event combination.

**Endpoint:** `GET /carnivals/:carnival_id/meet-manager/export/entries`

**File format:** Semicolon-delimited text. Each line has the format:

```
D;{Surname};{GivenName};;{Sex};{DOB};{TeamCode};{TeamName};;;{MeetEvent};{Result};M;{Division};
```

| Field | Source | Format |
|-------|--------|--------|
| Record type | Hard-coded | `D` (entry/result record) |
| Surname | `competitors.surname` | Text |
| Given Name | `competitors.given_name` | Text |
| (empty) | — | Always empty |
| Sex | `competitors.sex` | `M` or `F` |
| DOB | `competitors.dob` | `MM/DD/YY` |
| Team Code | `miscellaneous.mcode` | 2–4 chars |
| Team Name | `miscellaneous.mteam` | Text |
| (3 empty fields) | — | Always empty |
| Meet Event | `event_types.mevent` | Hy-Tek event code |
| Result | `comp_events.result` | Time with `:` delimiter (apostrophes converted) |
| Entry type | Hard-coded | `M` |
| Division | `competitor_event_ages.mdiv` | 2-digit division |

**Filters applied:**

- `competitors.given_name <> 'Team'` (exclude relay team entries)
- `comp_events.place <= miscellaneous.mtop` (top N only)
- `comp_events.final_level = 0` (base heats only)
- `event_types.include = true AND event_types.flag = true`
- `events.include = true`
- `event_types.mevent <> ''` (only events with Meet Manager mapping)

**Ordered by:** Age DESC, Surname, Given Name.

**Response:** Returns a text file download with `.txt` extension.

### 3.5 Export Format — Athlete Records

Exports competitor information without event assignments.

**Endpoint:** `GET /carnivals/:carnival_id/meet-manager/export/athletes`

**File format:**

```
I;{Surname};{GivenName};;{Sex};{DOB};{TeamCode};{TeamName};
```

| Field | Source | Format |
|-------|--------|--------|
| Record type | Hard-coded | `I` (info/athlete record) |
| Remaining | Same as entry export | — |

Same filters as entry export but without event-specific data. One line per competitor (deduplicated).

### 3.6 Export Format — RE1 Registration

Exports in Hy-Tek's RE1 registration file format (`.re1`). This is a more structured format with a header line.

**Endpoint:** `GET /carnivals/:carnival_id/meet-manager/export/re1`

**File format:**

**Header line:**

```
"{CarnivalTitle}";"{MM/DD/YYYY}";"Sports Administrator";"{Version}"
```

**Athlete lines:**

```
"{ID}";"{Surname}";"{GivenName}";;"{Sex}";"{MM/DD/YYYY}";"{TeamCode}";"{TeamName}";"{GivenName}";"N"
```

| Field | Source | Format | Max Length |
|-------|--------|--------|-----------|
| ID | `competitors.id` or generated | See below | — |
| Surname | `competitors.surname` | Text | 20 chars |
| Given Name | `competitors.given_name` | Text | 20 chars |
| Sex | `competitors.sex` | `M` or `F` | — |
| DOB | `competitors.dob` | `MM/DD/YYYY` | — |
| Team Code | `miscellaneous.mcode` | — | 4 chars |
| Team Name | `miscellaneous.mteam` | — | — |
| Nickname | `competitors.given_name` | Repeated | — |
| Citizen | Hard-coded | `N` | — |

**ID generation logic:**

```
IF competitors.id IS NOT NULL AND competitors.id <> '':
  id = competitors.id
ELSE:
  id = FORMAT(dob, 'YYMMDD') + LEFT(given_name, 3) + sex + LEFT(surname, 3)
  
  Example: Born 1998-03-15, John Smith → "980315JohMSmi"
```

**Response:** Returns a file download with `.re1` extension.

### 3.7 Meet Manager Event Code Setup

Each event type can have a Hy-Tek event code (`mevent` field on `event_types`). This must be configured before export.

**Endpoint:** `PATCH /carnivals/:carnival_id/event-types/:id`

```json
{
  "mevent": "50FR"
}
```

Only event types with a non-empty `mevent` value will appear in Meet Manager exports.

---

## 4. Carnival Disk Export

### 4.1 Purpose

Creates entry files for distribution to participating schools/houses. Each house receives a file listing the events and competitor slots available, which they can fill in and return.

### 4.2 Export Settings

**Endpoint:** `GET /carnivals/:carnival_id/settings/carnival-disk`

**Response:**

```json
{
  "output_directory": "/exports/carnival-disks",
  "sex_format": "boys_girls",
  "heat_format": "numeric"
}
```

| Setting | Options | Description |
|---------|---------|-------------|
| `sex_format` | `boys_girls`, `male_female` | How to display gender |
| `heat_format` | `numeric` (1,2,3,4), `alpha` (A,B,C,D) | How to display heat numbers |

### 4.3 Export Endpoint

**Endpoint:** `POST /carnivals/:carnival_id/carnival-disk/export`

**Input:**

```json
{
  "house_ids": [1, 2, 3],
  "format": "csv",
  "sex_format": "boys_girls",
  "heat_format": "numeric"
}
```

| Field | Type | Required | Options |
|-------|------|----------|---------|
| `house_ids` | array | No (default: all flagged) | House IDs to export |
| `format` | string | Yes | `csv`, `txt`, `rtf` |
| `sex_format` | string | No | `boys_girls`, `male_female` |
| `heat_format` | string | No | `numeric`, `alpha` |

**Processing:**

For each selected house:

1. Query all events where the house's competitors can participate.
2. For each event, generate rows with entrant slots (based on `event_types.entrant_num`).
3. For relay events, use "Team Relay" as the competitor name.
4. Export one file per house: `{house_code}.{ext}`.

**Output columns:**

| Column | Source | Description |
|--------|--------|-------------|
| Reference# | `heats.he_code` | Heat reference code |
| House | `house.code` (uppercase) | House code |
| Gender | Formatted sex | "Boys"/"Girls" or "Male"/"Female" |
| Age | `events.age` | Age group |
| Event | `event_types.description` | Event description |
| Heats | Formatted heat | "1"/"2" or "A"/"B" |
| Competitor | Slot number | 1, 2, 3... (blank for their school to fill in) |
| GName | Pre-filled for relays | " Team" for relays, blank otherwise |
| SName | Pre-filled for relays | " Relay" for relays, blank otherwise |

**Response:**

```json
{
  "files_created": 4,
  "files": [
    { "house": "RED", "filename": "RED.csv", "rows": 145 },
    { "house": "BLU", "filename": "BLU.csv", "rows": 138 }
  ]
}
```

**Ordered by:** House, Event Description, Sex, Age, Heat, Competitor Slot.

---

## 5. General Export Utilities

### 5.1 Format Helpers

These utility functions convert internal codes to display formats:

| Function | Input | Output (Format 1) | Output (Format 2) |
|----------|-------|-------------------|-------------------|
| `SetSexFormat(sex)` | `"M"` | `"Boys"` | `"Male"` |
| | `"F"` | `"Girls"` | `"Female"` |
| `SetHeatFormat(heat)` | `1` | `"1"` | `"A"` |
| | `2` | `"2"` | `"B"` |
| | `3` | `"3"` | `"C"` |
| | `4` | `"4"` | `"D"` |

### 5.2 CSS-Safe Identifiers

Group names used in HTML `id` and `class` attributes must be sanitized:

```
AlphaNumericDashOnly(input):
  Keep only: A-Z, a-z, 0-9, dash (-)
  Strip all other characters
  
  Example: "Boys 8 & Under" → "Boys8Under"
  Example: "100m Sprint" → "100mSprint"
```

### 5.3 File Dialog (Access-specific)

The Access version uses Windows API file dialogs for save-as operations. In the web version, use standard HTTP file download responses with `Content-Disposition: attachment` headers.

---

## 6. Validation & Error Handling

### 6.1 HTML Export Validation

| Check | Error |
|-------|-------|
| Template file(s) not configured | "You must set HTML template files before generating web page reports" |
| Output directory not configured | "You must set a folder for web pages" |
| Output directory does not exist | Prompt: "Folder does not exist. Create it?" |
| Report has no data | "No records for HTML export" (skip silently in batch mode) |
| Fields count ≠ headers count | "Report fields and headers do not match" |
| Query not found | "No matching query entry found" |

### 6.2 Meet Manager Export Validation

| Check | Error |
|-------|-------|
| `mcode` not set | "Team code must be configured before export" |
| `mteam` not set | "Team name must be configured before export" |
| `mevent` not set on any event type | Events without mevent are silently excluded |
| `mdiv` not mapped for an age | Division field will be empty (export proceeds) |
| No matching competitors | Empty file with header only (RE1) or empty file |

### 6.3 Carnival Disk Export Validation

| Check | Error |
|-------|-------|
| No format selected | "You must choose a format for the Carnival file" |
| Output directory not set | "Specify the output directory" |
| No flagged houses | No files generated |

---

## 7. Overwrite Confirmation

All export operations that write to the file system should prompt before overwriting existing files:

> "This action may overwrite files in [directory]. Do you want to continue?"

In the web version, API endpoints should accept a `confirm=true` parameter for destructive overwrites, or always generate unique filenames with timestamps.

---

## 8. Cross-Document References

| Topic | See |
|-------|-----|
| Report queries and data sources | Doc 7 §5 |
| Statistical report selection | Doc 7 §4 |
| HTML report configs table schema | Doc 2 §5.5 |
| MiscHTML table schema | Doc 2 §2.18 |
| Meet Manager fields on EventType | Doc 2 §2.3, Doc 5 §2 |
| Meet Manager fields on Miscellaneous | Doc 2 §2.17, Doc 3 §7 |
| CompetitorEventAge and Mdiv field | Doc 2 §2.10, Doc 4 §6 |
| Competitor data model | Doc 4 §2 |
| Event type configuration | Doc 5 §2 |
| UI for export forms | Doc 9 |
