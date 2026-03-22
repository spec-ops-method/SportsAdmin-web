# Sports Administrator — Functional Parity Test List

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

This document lists every user-facing function in the original Sports Administrator (Access/VBA) application. Each item describes a discrete operation that a user can perform. Use this as a checklist when testing the rebuilt system to verify functional parity.

**How to use this list:** For each item, verify that the new system can perform the described operation and produces equivalent outcomes (same data changes, same output, same validation behaviour). Items are grouped by functional area and ordered to reflect a natural setup-then-use workflow.

---

## 1. Carnival Management

### 1.1 Carnival CRUD

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 1.1.1 | Create carnival | User provides a name; system creates carnival with default settings (title, footer, open age = 99, alert to record = true). Duplicate names are rejected. |
| 1.1.2 | List carnivals | All carnivals displayed with name, creation date, and summary counts (competitors, events, heats). |
| 1.1.3 | View carnival details | Selected carnival shows full settings, progress indicators, and aggregate statistics. |
| 1.1.4 | Rename carnival | Name updated; uniqueness validated. |
| 1.1.5 | Delete carnival | Carnival and all associated data removed. Confirmation dialog presented. Cannot undo. |
| 1.1.6 | Copy carnival | Entire carnival duplicated — events, heats, point scales, teams, and optionally competitors and results. New carnival appears in list. |
| 1.1.7 | Select active carnival | Switch working context to a different carnival. All subsequent operations apply to the selected carnival. |
| 1.1.8 | Backup carnival | Export carnival data to a file for archiving. |

### 1.2 Carnival Settings

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 1.2.1 | Update carnival title | Title text updated; reflected on reports. |
| 1.2.2 | Update report footer | Footer text updated; appears on printed reports. |
| 1.2.3 | Set report column headers | Custom headers for "Lane" and "Time/Result" columns on marshalling lists. |
| 1.2.4 | Set open age | Maximum age value (default 99) for "open" age groups. |
| 1.2.5 | Set house type | Choose inter-house, inter-school, or other competition grouping type. |
| 1.2.6 | Toggle record alerts | Enable/disable automatic notification when a result breaks an event record. |
| 1.2.7 | Set Meet Manager top places | Number of top finishers to include in Meet Manager exports. |

### 1.3 House/Team Management

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 1.3.1 | Create house/team | Add team with code (short), full name, and optional competitor pool total. |
| 1.3.2 | List houses | All teams displayed with codes, names, current point totals, and extra points. |
| 1.3.3 | Update house | Modify code, name, or competitor pool total. |
| 1.3.4 | Delete house | Remove team. Competitor references cascade (competitors become unassigned or are deleted, depending on system rules). Confirmation required. |
| 1.3.5 | Award extra points | Add manual bonus or penalty points to a team (e.g., war-cry points, sportsmanship deductions) with a description. |
| 1.3.6 | View extra points | List all manual point adjustments for a team. |
| 1.3.7 | Delete extra points entry | Remove individual point adjustment. |

---

## 2. Competitor Management

### 2.1 Competitor CRUD

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 2.1.1 | Create competitor | Add competitor with given name, surname, sex, house, and either DOB or age. If DOB provided, age calculated automatically. |
| 2.1.2 | List competitors | Browsable list with search, sort by column, and filter by house/age/sex. |
| 2.1.3 | View competitor details | Display competitor profile with all event enrolments, results, and total points. |
| 2.1.4 | Update competitor | Modify any field (name, house, sex, age/DOB, include flag, PIN, comments). |
| 2.1.5 | Delete competitor | Remove competitor and all event enrolments/results. Confirmation required. |
| 2.1.6 | Quick Add competitor | Streamlined entry during heat setup. System checks for duplicates in real time and warns if a match is found. |

### 2.2 Competitor Import

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 2.2.1 | Upload import file | Select CSV/text file in format: `Given Name, Surname, House Code, Sex, Age, DOB, PIN`. |
| 2.2.2 | Preview import data | File parsed and displayed in staging grid. Validation warnings shown (missing fields, unknown house codes, duplicate names). |
| 2.2.3 | Clear staging data | Remove previously loaded import data from temporary table. |
| 2.2.4 | Commit import | Validated records created as competitors. Houses auto-created if code doesn't exist. Sex values normalised (Male→M, Female→F, Boy→M, Girl→F). Duplicates skipped or merged. |
| 2.2.5 | View import errors | Structured error report showing row number, field, and error message for each rejected row. |

### 2.3 Competitor Bulk Operations

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 2.3.1 | Bulk update include flag | Select multiple competitors and toggle their include/exclude status. Excluded competitors don't appear in event entry lists. |
| 2.3.2 | Age roll over | Increment all competitors' ages by 1. Used when reusing a carnival from a previous year. |
| 2.3.3 | Age roll back | Decrement all competitors' ages by 1. |
| 2.3.4 | Create team placeholders | Auto-generate relay placeholder entries for each house/age group. |
| 2.3.5 | Recalculate total points | Re-aggregate all points earned across all events for every competitor. |

---

## 3. Event Management

### 3.1 Event Type CRUD

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.1.1 | Create event type | Add event type with name, unit of measurement (time/distance/points), lane count, number of attempts, and report style. |
| 3.1.2 | List event types | All event types displayed with usage counts (number of divisions and heats). |
| 3.1.3 | View event type details | Display all divisions (events) and their heat configurations. |
| 3.1.4 | Update event type | Modify name, units, lane count, attempts, report style, Meet Manager event code. |
| 3.1.5 | Delete event type | Remove event type and cascade-delete all divisions, heats, and results. Confirmation required. |
| 3.1.6 | Copy event type | Duplicate event type including all divisions, final-level configurations, and lane allocations. User provides new name. |

### 3.2 Event Division CRUD

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.2.1 | Create event division | Add age/sex combination to an event type (e.g., "14yr Girls"). Age supports suffixes: `14` (exact), `13_U` (13 and under), `17_O` (17 and over). |
| 3.2.2 | List event divisions | All divisions for an event type displayed with age, sex, heat count, and record. |
| 3.2.3 | Update event division | Modify age, sex, or include flag. |
| 3.2.4 | Delete event division | Remove division and all its heats/results. |

### 3.3 Final Level and Heat Configuration

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.3.1 | Configure final levels | Define the progression structure: for each final level, specify number of heats, point scale, promotion method (Smooth/Staggered/None), and whether promotion uses results or places. |
| 3.3.2 | Auto-generate heats | Based on final-level configuration, system creates all heat records for every division in one batch operation. Existing heats can be optionally cleared first. |
| 3.3.3 | Clear heats | Delete all heats and competitor enrolments for an event type. Confirmation required. |
| 3.3.4 | Set heat status | Change heat status: Future → Active → Completed → Promoted. |
| 3.3.5 | Mark heat completed | Flag heat as finished. Auto-detected when all competitors have a result. |
| 3.3.6 | Update heat details | Modify point scale, promotion type, or `effects_records` flag on individual heats. |
| 3.3.7 | Set "Don't Override Places" | Prevent auto-calculation from overwriting manually entered places. |
| 3.3.8 | Set "Places Across All Heats" | Calculate overall placing using results from all heats at the same final level, not just within a single heat. |

### 3.4 Event Ordering

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.4.1 | Set event order | Assign event numbers to races for the carnival programme. |
| 3.4.2 | Auto-number events | System assigns sequential numbers based on selected sort criteria (event type, age, sex, final level). |
| 3.4.3 | Slide event numbers up | Remove gaps in the numbering sequence while preserving relative order. |
| 3.4.4 | Clear all event numbers | Remove all event numbering. |
| 3.4.5 | Auto-renumber on insert | When enabled, inserting a number automatically renumbers subsequent events. |

### 3.5 Lane Management

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.5.1 | Allocate default lanes to houses | Assign each team default lanes (e.g., Team 1 → lanes 1 and 5). When a competitor is added to a heat, they are auto-placed in their team's default lane. |
| 3.5.2 | Configure lane promotion table | Define which finishing places map to which lanes in the next final level (e.g., 1st place → lane 4, 2nd → lane 5). |
| 3.5.3 | Refresh lane assignments | Re-apply lane assignments after competitors have been added or removed. |

### 3.6 Competitor Enrolment in Events

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 3.6.1 | Add competitor to heat | Select competitor from filtered list (matching event's age/sex). System assigns lane using house default or next available. |
| 3.6.2 | Remove competitor from heat | Delete competitor's enrolment in a specific heat. |
| 3.6.3 | Auto-enter competitors | System enrols all eligible competitors (by age and sex) into appropriate heats, distributing across heats evenly. |
| 3.6.4 | Copy competitors between events | Duplicate competitor enrolments from one event to another (e.g., copy all 12yr Boys from 100m heats to 200m heats). |
| 3.6.5 | "Select from all names" override | Bypass age/sex filtering to show all competitors in the carnival for manual enrolment. |

---

## 4. Results and Scoring

### 4.1 Result Entry

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.1.1 | Enter result for competitor in heat | Type freeform result text. System parses and validates (see 4.2). |
| 4.1.2 | Enter result as place order | Alternative entry mode: enter results by finishing position (1st, 2nd, 3rd…) rather than by competitor row. |
| 4.1.3 | Clear a result | Remove result for a competitor in a heat. |
| 4.1.4 | Enter FOUL | Record that competitor committed a foul (non-qualifying). Entered as text token "FOUL". |
| 4.1.5 | Enter PARTICIPATE | Record that competitor participated but did not achieve a competitive result. Entered as text token "PARTICIPATE". |
| 4.1.6 | Keyboard-only entry | Navigate between lanes, competitors, places, and results using Tab, Shift+Tab, and Alt+Down. No mouse required. |

### 4.2 Result Parsing

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.2.1 | Parse seconds | `12.34` → 12.34 seconds. |
| 4.2.2 | Parse minutes:seconds | `1:05.23` → 65.23 seconds. |
| 4.2.3 | Parse hours:minutes:seconds | `1:02:05.23` → 3725.23 seconds. |
| 4.2.4 | Parse distance | `5.67` → 5.67 metres (or applicable unit). |
| 4.2.5 | Parse FOUL token | `FOUL` (case-insensitive) → foul flag, no numeric result. |
| 4.2.6 | Parse PARTICIPATE token | `PARTICIPATE` (case-insensitive) → participation flag, no numeric result. |
| 4.2.7 | Reject invalid input | Unparseable text produces a clear error message. |

### 4.3 Place Calculation

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.3.1 | Auto-calculate places | Places determined from numeric results (lowest time = 1st, longest distance = 1st, depending on unit sort direction). |
| 4.3.2 | Handle ties | Tied results receive the same place. Next place is skipped (e.g., two 1st places → no 2nd, next is 3rd). |
| 4.3.3 | Manual place override | Places can be entered manually. If "Don't Override Places" is set, auto-calculation respects manual entries. |
| 4.3.4 | Places across all heats | When enabled, places calculated using results from all heats at the same final level combined. |
| 4.3.5 | FOUL/PARTICIPATE placement | FOUL and PARTICIPATE entries are excluded from place calculation (no place assigned). |

### 4.4 Points Calculation

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.4.1 | Auto-assign points | Points looked up from the heat's assigned point scale using the competitor's place. |
| 4.4.2 | Bulk recalculate points | Recompute all competitor points across the entire carnival (used after point scale changes). |
| 4.4.3 | No points for FOUL/PARTICIPATE | Competitors with FOUL or PARTICIPATE results receive zero points. |

### 4.5 Point Scale Management

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.5.1 | Create point scale | Add named scoring table (e.g., "Finals", "Heats", "Relays"). |
| 4.5.2 | List point scales | Display all point scales in the carnival. |
| 4.5.3 | Define place-to-points mapping | For each scale, enter place number and corresponding points (e.g., 1st = 10, 2nd = 8, 3rd = 6…). |
| 4.5.4 | Auto-create place entries | Bulk-create *N* place entries with a fixed point value (e.g., 20 places all worth 1 point). |
| 4.5.5 | Update point scale entries | Modify individual place/point values. |
| 4.5.6 | Rename point scale | Change scale name; cascades to all heats using it. |
| 4.5.7 | Delete point scale | Remove scale. Blocked if any heats reference it. |

### 4.6 Records

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 4.6.1 | Automatic record detection | When a result is entered and record alerts are enabled, system checks if the result beats the standing event record. User is notified. |
| 4.6.2 | View event record | Display current record holder, year, result, and team for an event. |
| 4.6.3 | Create record manually | Enter a record performance (competitor, year, result, team) directly. |
| 4.6.4 | Update record | Modify record entry details. |
| 4.6.5 | Delete record | Remove record entry. System recalculates best from remaining history. |
| 4.6.6 | View record history | Display all historical records for an event. |
| 4.6.7 | Add record comments | Attach notes to a record entry. |

---

## 5. Promotion

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 5.1 | Promote competitors to next final level | After all heats at a final level are completed, select top finishers to advance to the next level's heats. |
| 5.2 | Smooth promotion | Top *N* competitors overall (by result) advance regardless of which heat they were in. |
| 5.3 | Staggered promotion | Equal number of competitors advance from each heat, ensuring balanced representation. |
| 5.4 | Promote by results vs. places | System can use either raw results (e.g., fastest times) or finishing places to determine who advances. |
| 5.5 | Apply lane promotion table | Promoted competitors assigned to lanes based on their ranking and the lane promotion mapping. |
| 5.6 | Confirm individual promotions | Coordinator can review and accept/reject each promoted entry before committing. |
| 5.7 | Bulk promote | Advance all eligible competitors in one operation. |
| 5.8 | Verify heats complete before promotion | System blocks promotion if any heat at the source final level is not marked completed. |

---

## 6. Reporting

### 6.1 Marshalling / Event Lists

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.1.1 | Track events — limited lanes | Marshalling sheet with lane assignments, competitor names, teams. |
| 6.1.2 | Track events — unlimited lanes | Marshalling sheet without fixed lane columns. |
| 6.1.3 | Field events — 3 attempts | Entry sheet with columns for three attempt results. |
| 6.1.4 | Field events — high jump | Height-based recording format with progressive height columns. |
| 6.1.5 | Relay events — limited lanes | Lane-assigned relay team marshalling list. |
| 6.1.6 | Generate event lists with filters | Filter by age, sex, final level, heat number, and event status. Select specific events or wildcards. |

### 6.2 Competitor Reports

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.2.1 | Competitor list | Full roster of all competitors in the carnival. |
| 6.2.2 | Competitor list by team and age | Roster grouped by house then age group. |
| 6.2.3 | Competitor events report | Individual competitor card showing all events, results, and places. |
| 6.2.4 | Competitor results by team/event | Cross-tabulated view of results by house and event. |
| 6.2.5 | Name tags | Printable name tags for each competitor. |
| 6.2.6 | Non-participants report | List competitors enrolled but who did not compete in selected events. |

### 6.3 Team/House Reports

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.3.1 | Overall results | Total house points ranking with bar graph. |
| 6.3.2 | Overall results by age | House standings grouped by age. |
| 6.3.3 | Overall results by gender | House standings grouped by gender. |
| 6.3.4 | Overall results by age and gender | House standings cross-tabulated by age and gender. |
| 6.3.5 | Overall results by place | Distribution of places won per team. |
| 6.3.6 | Cumulative results | Running point totals showing competition progression over time. |
| 6.3.7 | House points summary | Grand total points per team including extra points. |

### 6.4 Event Reports

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.4.1 | Event results detailed | Full results per event showing all placements, times/distances. |
| 6.4.2 | Event result entry sheet | Blank form for manual result recording at the event. |
| 6.4.3 | Age champions — division only | Top competitor per age/gender group within their own division. |
| 6.4.4 | Age champions — all divisions | Top competitor per age/gender across all divisions. |

### 6.5 Records Reports

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.5.1 | Current records — full | Complete listing of all event records with holder, year, result, team. |
| 6.5.2 | Current records — mini | Compact records summary. |
| 6.5.3 | Records set on date | Records filtered by the date they were set. Date selectable from dropdown. |

### 6.6 Report Options

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 6.6.1 | Preview report | Display report on screen before printing. |
| 6.6.2 | Print report | Send report to printer. |
| 6.6.3 | Filter reports by event type | Include or exclude specific event types. |
| 6.6.4 | Filter reports by team | Include or exclude specific houses. |
| 6.6.5 | Limit detail rows | Set maximum number of records displayed (e.g., top 10 competitors). |
| 6.6.6 | Batch report generation | Select multiple reports and generate all at once. |
| 6.6.7 | Programme of events | Ordered schedule of all races for carnival day. |
| 6.6.8 | Programme of events — 3 column | Compact three-column layout of event programme. |
| 6.6.9 | Programme of events — summary | Condensed version with essential details only. |

---

## 7. HTML Export

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 7.1 | Configure HTML export paths | Set output directory and template file locations. |
| 7.2 | Select reports for HTML export | Choose which reports to include in the HTML output. |
| 7.3 | Generate HTML files | Produce static HTML report files from templates. Token substitution replaces `{html}`, `{titl}`, `{head}`, `{repn}` placeholders. |
| 7.4 | Generate HTML index page | Auto-create table of contents linking all exported report pages. |
| 7.5 | Apply CSS styling | All HTML reports styled with `sport.css`. |
| 7.6 | Multi-page reports | Large reports split across pages with prev/next navigation. |
| 7.7 | HTML summary pages | Overview pages generated for multi-page report sets. |

---

## 8. Meet Manager Integration

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 8.1 | Configure Meet Manager export | Set team name, team code, and number of top places to export. |
| 8.2 | Map ages to Meet Manager divisions | Create mapping between carnival age groups and Hy-Tek division numbers. |
| 8.3 | Assign event codes | Add Hy-Tek event codes to event types (e.g., "100", "HJ", "SP"). |
| 8.4 | Export T&F competitors and events | Generate semicolon-delimited file with competitor details, event codes, and final results. |
| 8.5 | Export competitors only | Generate competitor list without event/result data. |
| 8.6 | Export swimming RE1 file | Generate Hy-Tek RE1 registration file with competitor details. |
| 8.7 | Auto-generate competitor IDs | Create IDs from DOB and name components when PIN is missing. |

---

## 9. Carnival Disk Exchange

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 9.1 | Configure carnival disk format | Set sex code format and heat assignment rules for export. |
| 9.2 | Export carnival disks | Generate one entry file per team containing event structures. External teams fill in competitor entries. |
| 9.3 | Import carnival disk | Read returned file, preview data, validate, and import competitors into events. |
| 9.4 | Auto-create houses on import | If a team code in the import file doesn't exist, create the house automatically. |
| 9.5 | Duplicate detection on import | Identify competitors already in the carnival; skip or merge. |

---

## 10. Utilities and Administration

| # | Function | Expected Behaviour |
|---|----------|--------------------|
| 10.1 | Delete all competitors | Remove all competitor records from the active carnival. Confirmation required. |
| 10.2 | Reset all events | Clear all results and competitor enrolments from events. Confirmation required. |
| 10.3 | Compact and repair database | Optimise carnival database file. |
| 10.4 | About dialog | Display application version, build date, and credits. |
| 10.5 | Version information | Show version number and version history. |

---

## Summary

| Area | Count |
|------|-------|
| Carnival Management | 18 |
| Competitor Management | 16 |
| Event Management | 25 |
| Results and Scoring | 25 |
| Promotion | 8 |
| Reporting | 29 |
| HTML Export | 7 |
| Meet Manager Integration | 7 |
| Carnival Disk Exchange | 5 |
| Utilities and Administration | 5 |
| **Total** | **145** |

Each numbered item represents a testable function. A complete functional parity test should verify all 145 items produce equivalent outcomes in the rebuilt system.
