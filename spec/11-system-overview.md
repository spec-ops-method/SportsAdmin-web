# Sports Administrator — System Overview

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

## What It Is

Sports Administrator is an open-source application for managing school athletics and swimming carnivals. Originally developed around 2000 by Andrew Rogers for Christian Outreach College, Brisbane, it was commercially distributed as a Microsoft Access 97 application through CottonSoft and later School Pro software. After the original author changed careers, James Rudd — who had used the software since 2001 — obtained the source code, migrated it to Access 2010+, and released it as open source under the MIT licence.

The application runs on Windows with Microsoft Access 2010 or higher (including the free Access Runtime). Each carnival's data is stored in its own `.accdb` file, linked at runtime to a main application database that contains all forms, reports, VBA code, and UI definitions.

## Who Uses It

Sports Administrator is designed for **Australian schools** running athletics carnivals (track and field) and swimming carnivals. It supports both intra-school (inter-house) and inter-school competitions. Three categories of user interact with the system:

| Role | Typical Person | What They Do |
|------|---------------|--------------|
| **Carnival Coordinator** | PE teacher, sports coordinator | Creates the carnival structure, defines events, imports competitor lists, configures scoring rules, generates reports |
| **Results Operator** | Volunteer, teacher aide | Enters times, distances, and places during the live carnival as events finish |
| **Administrator / IT** | School IT staff | Installs the software, manages backups, exports data to external systems |

## What It Does

Sports Administrator handles the **complete lifecycle** of a school sports carnival, from initial setup months before the event through to final reporting and record-keeping after the carnival concludes.

### Carnival Setup

A carnival is the top-level container — everything belongs to exactly one carnival. The coordinator creates a carnival, then works through a guided setup:

1. **Create the carnival** — give it a name and storage location.
2. **Define teams** — the competing houses or schools, each with a code, full name, and optional competitor pool size (used for percentile scoring when teams have unequal sizes).
3. **Configure point scales** — scoring tables that map finishing places to points. Most carnivals use at least two scales (one for heats, one for finals). Relays often have a separate, higher-value scale.
4. **Set up events** — organised in a three-tier hierarchy:
   - **Event Type**: the sport itself (e.g., 100m Sprint, 50m Freestyle, High Jump, Discus)
   - **Event (Division)**: a sex/age-specific instance (e.g., 14yr Girls 100m Sprint)
   - **Heat (Race)**: a specific race within that division, assigned to a **Final Level** — level 0 is the grand final, level 1 is semi-finals, level 2 is quarter-finals, and so on
5. **Auto-generate heats** — based on the final-level configuration, the system creates all heats and finals for every division in one operation.
6. **Allocate default lanes** — each team can be assigned default lanes so competitors are automatically placed in the correct lane when enrolled.
7. **Set event order** — assign event numbers for the carnival programme, with auto-numbering and gap-removal tools.

### Competitor Management

Competitors are the athletes participating in the carnival. They can be added in several ways:

- **Manual entry** — one at a time via a form.
- **Quick Add** — a streamlined entry during heat setup, with real-time duplicate detection.
- **Bulk import from CSV/text file** — the most common method. A text file from the school administration system in the format `Given Name, Surname, House Code, Sex, Age, DOB, PIN` is loaded, previewed in a staging grid, validated, and then committed. The system normalises sex values, calculates ages from dates of birth, auto-creates missing houses, and detects duplicates.

Once competitors exist in the carnival, they are enrolled into events — either manually, or using auto-entry which distributes eligible competitors across heats based on age and sex restrictions.

### Running the Carnival — Results Entry

On carnival day, operators enter results as events complete:

- **Result parsing** — the system accepts flexible input formats. Times can be entered as `12.34` (seconds), `1:05.23` (minutes:seconds), or `1:02:05.23` (hours). Distances are entered as plain numbers. Special tokens `FOUL` and `PARTICIPATE` are supported.
- **Automatic place calculation** — once results are entered, places are calculated automatically. Ties are handled correctly (two competitors with the same time share a place, and the next place is skipped).
- **Points calculation** — the system looks up the applicable point scale for the heat's final level and assigns points based on finishing place.
- **Record detection** — when a result is entered, the system checks if it breaks the standing record for that event and alerts the operator.
- **Heat completion** — a heat is automatically flagged as complete when all competitors have a result.

### Promotion Through Final Levels

One of the system's most powerful features is **automated promotion** of competitors from heats to finals:

- After heats at a given final level are complete, the coordinator triggers promotion.
- The system collects results from all heats at that level and selects the top competitors to advance.
- Two promotion methods are supported:
  - **Smooth**: the top *N* competitors overall (by result or place) advance, regardless of which heat they were in.
  - **Staggered**: an equal number of competitors advance from each heat, ensuring representation.
- Promoted competitors are placed into the next final level's heats with lane assignments determined by a configurable **lane promotion table** (e.g., fastest goes to lane 4, second-fastest to lane 5).
- The process repeats through as many final levels as the carnival structure defines (quarter-finals → semi-finals → grand final).

### Reporting and Statistics

The system produces a comprehensive set of reports, both printed and optionally exported as HTML web pages:

- **Team standings**: overall results, broken down by age, gender, or age+gender, with bar graphs
- **Cumulative results**: running point totals showing how the competition unfolded over time
- **Event results**: detailed results per event including times/distances and places
- **Competitor reports**: individual result cards, competitor event summaries, age champion rankings
- **Records**: current records by event, records broken on a specific date
- **Marshalling lists**: event-specific entry sheets formatted for the type of event (lane-based track, unlimited field, relay, high jump with height columns, three-attempt field events)
- **Administrative**: competitor lists by team, non-participant reports, name tags

Reports can be filtered by event type, team, age, gender, final level, and heat status. Multiple reports can be generated and previewed in a single batch.

### HTML Web Export

Selected reports can be exported as a static HTML website using customisable templates. This allows results to be published to a school intranet or website so students and parents can check results remotely. The system uses token-based templates (with replaceable placeholders for content, titles, headers) and applies CSS styling.

### External System Integration

- **Carnival Disks**: the system can generate export files for each team containing event structures. External teams fill in their competitor entries and return the files, which are then imported — saving hours of manual data entry for inter-school carnivals.
- **Meet Manager Export**: results and competitor data can be exported in formats compatible with Hy-Tek Meet Manager, the industry-standard timing system used at district, regional, and state-level competitions:
  - **Track & Field**: semicolon-delimited files with event codes and division mappings
  - **Swimming**: RE1 registration files with competitor details and event entries

### Data Management

- **Carnival copying**: an entire carnival (structure, events, and optionally competitors and results) can be duplicated to create next year's carnival — the coordinator never needs to set up from scratch twice.
- **Backup**: carnival databases can be compacted and backed up to a specified location.
- **Multiple simultaneous carnivals**: the system maintains a registry of all carnivals and allows switching between them. Only one is active at a time, but data from all carnivals is preserved indefinitely, enabling historical record and statistics lookups years after a carnival.

## Key Design Concepts

| Concept | Description |
|---------|-------------|
| **Carnival isolation** | All data belongs to exactly one carnival. There is no cross-carnival data sharing during operations. |
| **Final levels** | A numbering system where 0 = grand final, 1 = semi-final, 2 = quarter-final, etc. Every heat is assigned a final level. |
| **Point scales** | Named scoring tables mapping place → points. Different scales can apply at different final levels (e.g., heats worth less than finals). |
| **Promotion** | The automated process of advancing top competitors from one final level to the next, with configurable methods (smooth vs. staggered) and lane assignments. |
| **Event types vs. events vs. heats** | A three-tier hierarchy: the sport (Event Type), the age/sex division (Event), and the individual race (Heat). |
| **Flexible result parsing** | A single text input field accepts times, distances, and special tokens, with automatic format detection and normalisation. |
| **Reusable carnival templates** | Copy last year's carnival to create this year's — all event structures, point scales, and team definitions carry forward. |
