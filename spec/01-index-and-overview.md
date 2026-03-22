# Sports Administrator — Software Specification

## Document 1: Index & Overview

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| **Product**        | Sports Administrator                       |
| **Version Documented** | 5.3.2 (13 March 2026)                 |
| **Original Authors** | Andrew Rogers, James Rudd                |
| **License**        | MIT                                        |
| **Repository**     | https://github.com/ruddj/SportsAdmin      |
| **Spec Prepared**  | March 2026                                 |
| **Last Updated**   | 2026-03-20                                 |

---

## 1. Purpose

Sports Administrator is a desktop application for managing results at school athletics and swimming carnivals. It handles the full lifecycle of a carnival — from creating event structures, registering competitors, entering results, calculating places and points, promoting athletes through heats to finals, tracking records, and producing printed and web-published reports.

The application was originally developed for Christian Outreach College, Brisbane. It was commercially distributed as an Access 97 application before being open-sourced and migrated to Access 2010+ format in 2017.

### 1.1 Intended Users

- **Carnival coordinators** who define events, import competitor lists, and configure scoring.
- **Results entry operators** who enter times, distances, and places during a live carnival.
- **Administrators** who generate reports, export results to the web, and integrate with third-party timing systems (Meet Manager).

### 1.2 Goal of This Specification

This specification captures the functional and structural detail of the existing system at a level sufficient to **rebuild the application on a different technology stack** while preserving all current behaviour. It also serves as the **living, authoritative source of truth** for ongoing development — all functional changes to the system should be reflected in these documents before they are implemented in code. See the [spec README](README.md) for the spec-first development workflow.

The specification is organised as a set of modular documents, each covering a bounded domain.

---

## 2. Document Map

| # | Document | Scope |
|---|----------|-------|
| 0 | **Platform Translation Notes** | Cross-cutting decisions for rebuilding on a modern web stack; build order for AI agents |
| 1 | **Index & Overview** *(this document)* | Purpose, architecture, glossary, conventions |
| 2 | **Data Model** | All entities, attributes, data types, relationships, constraints, seed/reference data; table-to-document mapping |
| 3 | **Carnival Lifecycle** | Carnival CRUD operations, settings, create-with-seed-data flow, API endpoints |
| 4 | **Competitor Management** | Registration, bulk import, age calculation, house assignment, validation rules, API endpoints |
| 5 | **Events & Heats** | Event types, divisions, heat structure, final levels, lane allocation, promotion algorithms (with pseudocode), API endpoints |
| 6 | **Results & Scoring** | Result entry and parsing (with pseudocode and test vectors), place calculation, point scales, record detection, API endpoints |
| 7 | **Reporting** | All reports as data query specifications: fields, joins, filters, grouping, sorting, sample output |
| 8 | **HTML Export & Meet Manager Integration** | Export API contracts, output format schemas, Meet Manager file format field mappings |
| 9 | **UI & Navigation** | Screen inventory and user task flows, organised by domain (carnival, competitors, events, results, reports) |
| 10 | **Deployment & Security** | Auth, roles, environment config, CORS, rate limiting, backup strategy |
| 11 | **System Overview** | High-level description of the system, its users, and capabilities — for onboarding and external communication |
| 12 | **Functional Parity Tests** | 145 testable user-facing functions organised by area — verification checklist for the rebuilt system |

Documents are self-contained. An AI coding agent can work through the spec incrementally — see Document 0 §12 for the recommended build order. See the [spec README](README.md) for document conventions and the spec-first workflow.

---

## 3. High-Level Architecture

### 3.1 Split-Database Design

The system uses a **split-database architecture** with two tiers:

```
┌─────────────────────────────────┐
│  Sports.accdb  (Main Database)  │
│                                 │
│  • Application code (VBA)       │
│  • Forms, reports, queries      │
│  • Ribbon UI definition         │
│  • Report configuration tables  │
│  • Carnival registry            │
│  • Local settings               │
└──────────┬──────────────────────┘
           │  dynamic link (attach/detach at runtime)
           │
┌──────────▼──────────────────────┐
│  Carnival Database (.accdb)     │  ← one per carnival
│                                 │
│  • Competitors                  │
│  • Events & event types         │
│  • Heats & final levels         │
│  • Results (CompEvents)         │
│  • Houses/teams                 │
│  • Records                      │
│  • Point scales                 │
│  • Carnival-specific settings   │
└─────────────────────────────────┘
```

- The **main database** contains all application logic and UI. It is distributed as `Sports.accdr` (runtime-locked) to end users.
- **Carnival databases** are external `.accdb` files — one per carnival. They are created from template tables embedded in the main database and linked at runtime. Only one carnival is active at a time.
- This design allows carnivals to be archived, shared, or backed up independently.

### 3.2 Architectural Layers

| Layer | Responsibility |
|-------|----------------|
| **UI** | Ribbon XML (2 tabs, 5 groups), 40+ Access forms, right-click context menus |
| **Business Logic** | 16 VBA code modules, 40+ form code-behind modules |
| **Data Access** | DAO (primary), with ADO/ADOX for auxiliary operations |
| **Queries** | 90+ saved queries providing filtered/joined views of carnival data |
| **Reporting** | 30+ Access reports, plus HTML template-based web export |
| **External Integration** | Meet Manager Swimming (RE1 registration files), Meet Manager Track & Field (semicolon-delimited export) |

### 3.3 Application Lifecycle

```
Startup
  │
  ├─ Set UI to user mode (hide development surfaces)
  ├─ Show "Please Wait" splash
  ├─ If Access Runtime → add current folder to Trusted Locations
  ├─ Verify carnival database is attached
  │    └─ If missing → prompt user to select or create one
  ├─ Synchronise CompetitorEventAge table
  ├─ Build report right-click menu
  └─ Open Main Menu form
       │
       ├─ Setup workflow ──► Create/select carnival → configure
       │                     houses → configure events → import
       │                     competitors
       │
       ├─ Entry workflow ──► Select event → enter results →
       │                     calculate places → promote to
       │                     next final level → repeat
       │
       └─ Reporting workflow ──► Select report(s) → preview/print
                                 or export to HTML / Meet Manager
```

---

## 4. Glossary

These terms have specific meanings throughout the specification.

| Term | Definition |
|------|------------|
| **Carnival** | A single sporting competition (e.g., "2026 Inter-House Athletics"). Stored as a standalone database file. |
| **Competitor** | An individual athlete. Identified by a PIN (auto-generated). Belongs to one House. |
| **House** | A team grouping (e.g., school house, club, country). Competitors belong to exactly one House within a carnival. |
| **House Type** | The kind of grouping in use (Inter-House, Inter-School, Inter-Class, Inter-Country, Inter-Youth Group, Inter-Church). |
| **Event Type** | A template for a class of events (e.g., "100m Sprint", "High Jump"). Defines the unit of measurement, lane count, and report format. |
| **Event** | A specific instance of an Event Type for a given sex and age group (e.g., "100m Sprint — Boys U14"). |
| **Division** | A sex + age combination that defines a competitive category. |
| **Heat** | A single run of an event at a specific final level. An event may have multiple heats at each level. |
| **Final Level** | A stage in the progression hierarchy. Level 1 is the initial heats; level 2 might be semi-finals; the highest level is the final. |
| **Promotion** | Moving top-placing competitors from one final level to the next. |
| **Smooth Promotion** | Fills heats sequentially: qualifiers 1-3 go to heat 1, 4-6 to heat 2, etc. |
| **Staggered Promotion** | Fills lanes sequentially across heats: qualifier 1 to heat 1 lane 1, qualifier 2 to heat 2 lane 1, etc. |
| **Lane** | A physical lane assignment. In limited-lane events, lanes are mapped to houses. |
| **CompEvent** | A junction record linking a Competitor to an Event, holding their result, place, heat, lane, and points. |
| **Result** | A competitor's performance measurement. May be time (seconds, minutes, hours), distance (meters, kilometers), or points. Stored as both text and a normalised numeric value. |
| **nResult** | The numeric representation of a result, used for sorting and comparison. Lower-is-better for time events, higher-is-better for distance/point events. |
| **Place** | A competitor's finishing position within a heat (or across all heats, if configured). |
| **Point Scale** | A named mapping from place to points awarded (e.g., "Olympic": 1st=10, 2nd=8, 3rd=6…). |
| **Record** | The best-ever performance for a specific event. Tracked with the holder's name, house, date, and result. |
| **Event Status** | The state of a heat: **Future** (not yet run), **Active** (in progress or ready for entry), **Completed** (results entered), **Promoted** (competitors advanced to next level). |
| **Open Age** | A special age category with no upper limit. |
| **Age Range** | An event age bracket spanning multiple years (e.g., "14-16"). |
| **Meet Manager** | Third-party timing software by Hy-Tek. Sports Administrator can export competitor registrations and results in Meet Manager's import formats. |
| **Carnival Database** | The external `.accdb` file containing all data for one carnival. |
| **Template Table** | A table in the main database (prefixed `zz~`) that serves as the schema blueprint for tables created in new carnival databases. |
| **Trusted Location** | A Windows registry entry that tells Access to suppress security warnings for files in that folder. |
| **Runtime Mode** | Running the application via Access Runtime (free), which hides the development interface and uses `.accdr` file extension. |
| **Developer Mode** | A toggle within the app that shows/hides the Access navigation pane and development toolbars. |

---

## 5. Units of Measurement

The system supports six result units. The sort order determines whether a lower or higher result is better.

| Unit ID | Internal Name | Display Label | Sort Order | Example |
|---------|---------------|---------------|------------|---------|
| 1 | Seconds | Secs | Ascending (lower is better) | 12.34 |
| 2 | Minutes | Mins | Ascending | 4:32.10 |
| 3 | Hours | Hrs | Ascending | 1:23:45.00 |
| 4 | Meters | m | Descending (higher is better) | 5.62 |
| 5 | Kilometers | Km | Descending | 3.21 |
| 6 | Points | Pts | Descending | 42 |

The result parser accepts flexible input: a value entered as `1:30.2` in a seconds-unit event is converted to `90.2` seconds. Accepted time separators are `:` `'` `"` `-` `|`.

The standard display format for time results is `H:MM:SS.cc` (centiseconds), with leading components omitted when zero.

---

## 6. Event Status Lifecycle

Heats move through four states:

```
Future ──► Active ──► Completed ──► Promoted
  (0)        (1)         (2)           (3)
```

| Status | Meaning |
|--------|---------|
| **Future (0)** | Heat has not yet been run. No results expected. |
| **Active (1)** | Heat is open for result entry. This is the default for the first final level. |
| **Completed (2)** | All results have been entered and places calculated. |
| **Promoted (3)** | Top competitors from this heat have been advanced to the next final level. |

Only active heats accept result entry. Promotion is available only from completed heats. The system prevents re-promotion of already-promoted heats.

---

## 7. Promotion Strategies

When competitors are promoted from one final level to the next, lane assignments follow one of two strategies:

### Smooth
Fills each heat fully before moving to the next.

```
Qualifiers:  1  2  3  4  5  6  7  8  9
Heat 1:     [1, 2, 3]
Heat 2:     [4, 5, 6]
Heat 3:     [7, 8, 9]
```

### Staggered
Distributes competitors across heats before filling lanes.

```
Qualifiers:  1  2  3  4  5  6  7  8  9
Heat 1:     [1, 4, 7]
Heat 2:     [2, 5, 8]
Heat 3:     [3, 6, 9]
```

A **Lane Promotion Allocation** table can further override which lane a competitor is assigned to based on their finishing place.

---

## 8. Key Behavioural Rules

These cross-cutting rules apply across multiple domains. Detailed specifications appear in the per-domain documents.

1. **One active carnival at a time.** The main database links to exactly one carnival database. Switching carnivals detaches the current one and attaches the new one.

2. **Schema migration on attach.** When a carnival database is opened, the system checks for missing tables, fields, and relationships, and adds them if necessary. This ensures older carnival files work with newer application versions.

3. **Competitor-Event-Age synchronisation.** Whenever the competitor list or event definitions change, the `CompetitorEventAge` mapping table is rebuilt. This table determines which competitors are eligible for which events based on their age.

4. **Record detection is interactive.** When a result beats the current record, the user is prompted to confirm before the record is updated. Records store the holder's name, house, date, and both text and numeric result values.

5. **Place calculation respects configuration.** Places can be calculated within a single heat, or across all heats in a final level, depending on the `PlacesAcrossAllHeats` flag on the event type.

6. **Points follow the configured scale.** Each heat references a named point scale. Points are awarded based on place using the mapping in that scale.

7. **House points aggregate.** Total house points are the sum of all individual competitor points plus any manual adjustments from the House Points-Extra table.

8. **HTML export is template-driven.** A set of HTML template files define the page structure. The application merges generated content into placeholders, producing static HTML files suitable for web hosting.

9. **Meet Manager export uses division mapping.** Before exporting, the user maps age categories to Meet Manager division codes via a dedicated mapping form.

10. **Access Runtime compatibility.** The application works in full Access and Access Runtime. In Runtime mode, it adds the data folder to Trusted Locations and hides all development surfaces.

---

## 9. Version History Summary

| Version | Date | Significance |
|---------|------|--------------|
| 3.0 | Aug 2000 | Setup Carnival wizard, Add Event wizard |
| 3.5 | Mar 2001 | Web export with graph images, quick-add competitor |
| 4.0 | Mar 2010 | Open age import fix |
| **5.0** | **Apr 2017** | **Open-source release (MIT). Migrated from Access 97 .MDB to Access 2010+ .ACCDB. Ribbon UI. CSS-based HTML export. 64-bit support.** |
| 5.1 | May 2017 | Meet Manager export (Track & Field and Swimming) |
| 5.2 | Feb 2018 | Access x64 support, improved result entry UX |
| 5.3 | Dec 2023 | Age range support for events (e.g., 14-16) |
| 5.3.2 | Mar 2026 | Rewritten result interpreter/formatter, standardised time display |

---

## 10. Conventions Used in This Specification

- **Table names** appear in `PascalCase` or their original Access names (e.g., `CompEvents`, `Final_Lev`).
- **Field names** appear in `PascalCase` matching the source schema (e.g., `ET_Code`, `nResult`).
- **Form names** are written as they appear in the Access object list (e.g., "Enter Competitors", "Setup Carnival").
- **SHALL** indicates a mandatory behaviour that must be preserved in a rebuild.
- **SHOULD** indicates a recommended behaviour that may be adapted to the target platform.
- **MAY** indicates optional behaviour.
- **See [Document #]** cross-references point to the relevant specification document by number.

---

*Next: [Document 2 — Data Model](02-data-model.md)*
