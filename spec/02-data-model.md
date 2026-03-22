# Sports Administrator — Software Specification

## Document 2: Data Model

| | |
|---|---|
| **Last Updated** | 2026-03-20 |

*See [Document 1 — Index & Overview](01-index-and-overview.md) for glossary, architecture, and conventions.*

---

## 1. Database Architecture

The system uses a **split-database** design with two storage tiers:

| Tier | File | Content |
|------|------|---------|
| **Main Database** | `Sports.accdb` | Application code, UI objects, configuration tables, carnival registry |
| **Carnival Database** | `<name>.accdb` (one per carnival) | All competition data — competitors, events, heats, results, records |

The main database stores **template tables** (prefixed `zz~`) that define the schema for carnival databases. When a new carnival is created, these templates are copied (without the `zz~` prefix) into a new `.accdb` file. The main database links to the active carnival's tables at runtime.

### 1.1 Table Inventory by Location

**Carnival database** (29 tables, copied from templates):

| Table | Category | Spec'd In | Build Step |
|-------|----------|-----------|------------|
| Competitors | Core competition | Doc 4 | 4 |
| CompEvents | Core competition | Doc 6 | 6 |
| Events | Core competition | Doc 5 | 5 |
| EventType | Core competition | Doc 5 | 5 |
| Heats | Core competition | Doc 5 | 5 |
| Final_Lev | Core competition | Doc 5 | 5 |
| House | Core competition | Doc 3 | 3 |
| Records | Core competition | Doc 6 | 6 |
| PointsScale | Core competition | Doc 6 | 6 |
| CompetitorEventAge | Core competition | Doc 4 | 4 |
| EventCat | Core competition | Doc 5 | 5 |
| Lanes | Lane management | Doc 5 | 5 |
| Lane Sub | Lane management | Doc 5 | 5 |
| Lane Template | Lane management | Doc 5 | 5 |
| Lane Promotion Allocation | Lane management | Doc 5 | 5 |
| Final Level Sub | Reference / lookup | Doc 5 | 1 (seed) |
| FinalStatus | Reference / lookup | Doc 5 | 1 (seed) |
| HouseTypes | Reference / lookup | Doc 3 | 1 (seed) |
| Promotion | Reference / lookup | Doc 5 | 1 (seed) |
| Sex Sub | Reference / lookup | Doc 4 | 1 (seed) |
| Units | Reference / lookup | Doc 6 | 1 (seed) |
| Miscellaneous | Configuration | Doc 3 | 3 |
| MiscHTML | Configuration | Doc 8 | 8 |
| Reports-Selected | Configuration | Doc 7 | 7 |
| House Points-Extra | Supplementary | Doc 3 | 3 |
| _AlwaysOpen | System | — | *(discard — see Doc 0 §2)* |
| EVERYONE1 | Staging / temporary | — | *(discard — see Doc 0 §2)* |
| TEMP1 | Staging / temporary | — | *(discard — see Doc 0 §2)* |
| ImportData | Staging / temporary | — | *(discard — see Doc 0 §2)* |

**Main database** (17 tables):

| Table | Category | Spec'd In | Build Step |
|-------|----------|-----------|------------|
| Carnivals | Carnival registry | Doc 3 | 3 |
| MiscellaneousLocal | Application settings | Doc 3 | 3 |
| ReportTypes | Report configuration | Doc 7 | 1 (seed) |
| ReportList | Report catalogue | Doc 7 | 7 |
| tblReportsHTML | HTML export config | Doc 8 | 8 |
| USysRibbons | Ribbon UI definition | — | *(discard — see Doc 0 §2)* |
| Operators | Reference data | — | *(discard — see Doc 0 §2)* |
| accRunCommands | Reference data | — | *(discard — see Doc 0 §2)* |
| ShowDialog | UI state | — | *(discard — see Doc 0 §2)* |
| Table Field Names | Metadata | — | *(discard — see Doc 0 §2)* |
| Inventory Attached Tables | System | — | *(discard — see Doc 0 §2)* |
| tmpCEAM | Temporary | — | *(discard — see Doc 0 §2)* |
| Competitors-Temp | Temporary | — | *(discard — see Doc 0 §2)* |
| EventType_Include | Temporary | — | *(discard — see Doc 0 §2)* |
| Import Competitors | Staging | — | *(discard — see Doc 0 §2)* |
| Temporary Memo | Staging | — | *(discard — see Doc 0 §2)* |
| Temporary Results-Place Order | Staging | — | *(discard — see Doc 0 §2)* |
| Temporary Record-Best in Full | Staging | — | *(discard — see Doc 0 §2)* |
| Temporary Table | Staging | — | *(discard — see Doc 0 §2)* |
| Misc-EnterCompetitorEvents | UI state | — | *(discard — see Doc 0 §2)* |
| zzz~Relationships Main | Template metadata | — | *(discard — see Doc 0 §2)* |
| zzz~Relationships Second | Template metadata |

---

## 2. Carnival Database Tables

### 2.1 Competitors

Stores individual athletes registered for the carnival.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `PIN` | AUTOINCREMENT | PK, UNIQUE, NOT NULL | Participant Identification Number |
| `Include` | BIT | | Whether competitor is active in carnival |
| `Gname` | VARCHAR(30) | | Given (first) name |
| `Surname` | VARCHAR(30) | | Surname (last name) |
| `Sex` | VARCHAR(1) | | Gender code: `M`, `F` |
| `H_Code` | VARCHAR(7) | FK → House.H_Code | House code |
| `H_ID` | LONG | FK → House.H_ID | House internal ID |
| `DOB` | DATETIME | | Date of birth |
| `TotPts` | DOUBLE | | Total points accumulated across events |
| `Comments` | VARCHAR(100) | | Free-text notes |
| `Address1` | VARCHAR(50) | | Address line 1 |
| `Address2` | VARCHAR(50) | | Address line 2 |
| `Suburb` | VARCHAR(50) | | Suburb/city |
| `State` | VARCHAR(50) | | State/province |
| `Postcode` | SHORT | | Postal code |
| `Hphone` | VARCHAR(50) | | Home phone |
| `Wphone` | VARCHAR(50) | | Work/mobile phone |
| `Age` | BYTE | | Calculated age in years |
| `ID` | VARCHAR(50) | | External/student ID |

**Notes:**
- `H_Code` is the display key for house; `H_ID` is the internal numeric key. Both reference the House table.
- `TotPts` is a denormalised aggregate, recalculated from CompEvents.
- `Age` is stored rather than always derived from DOB, because some imports provide age without DOB.

---

### 2.2 Events

A specific competitive event for a particular sex and age group. Each Event belongs to one EventType.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `E_Code` | AUTOINCREMENT | PK, UNIQUE, NOT NULL | Event identifier |
| `ET_Code` | LONG | FK → EventType.ET_Code | Parent event type |
| `Sex` | VARCHAR(1) | | Sex category: `M`, `F`, or `-` (both/mixed) |
| `Age` | VARCHAR(10) | | Age bracket (e.g., `12`, `14-16`, `99` for open) |
| `nRecord` | DOUBLE | | Current record as numeric value |
| `Include` | BIT | | Whether event is active |
| `Record` | VARCHAR(15) | | Current record as formatted text |
| `RecName` | VARCHAR(50) | | Current record holder name |
| `RecHouse` | LONG | | House ID of record holder |

**Notes:**
- The Age field accepts single ages (e.g., `12`), ranges with hyphen (`14-16`), and the configurable open-age value (default `99`).
- `nRecord` and `Record` store the same value in numeric and text form for sorting and display respectively.

---

### 2.3 EventType

A template defining a class of competition (e.g., "100m Sprint", "Shot Put"). Multiple Events are created from one EventType — one per sex/age division.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ET_Code` | AUTOINCREMENT | PK, UNIQUE, NOT NULL | Event type identifier |
| `ET_Des` | VARCHAR(30) | | Description (e.g., "100m Sprint") |
| `Units` | VARCHAR(10) | | Unit of measurement (FK → Units.Unit) |
| `Lane_Cnt` | SHORT | | Number of lanes for this event |
| `R_Code` | LONG | FK → ReportTypes.R_Code | Report format to use |
| `Include` | BIT | | Whether event type is active |
| `EntrantNum` | SHORT | | Number of entrants per event |
| `Flag` | BIT | | General-purpose flag |
| `PlacesAcrossAllHeats` | BIT | | If TRUE, places are calculated across all heats in a final level; if FALSE, within each heat only |
| `Mevent` | VARCHAR(10) | | Meet Manager event code mapping |

---

### 2.4 CompEvents

Junction table linking competitors to events. Each row represents one competitor's participation in one event at a specific heat and final level, including their result and placement.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `PIN` | LONG | FK → Competitors.PIN | Competitor |
| `E_Code` | LONG | FK → Events.E_Code | Event |
| `Place` | SHORT | | Finishing position |
| `TTres` | DOUBLE | | Legacy result field (time/total result) |
| `Heat` | SHORT | FK → Heats (composite) | Heat number |
| `Lane` | SHORT | FK → Lane Sub.Lane | Lane assignment |
| `Result` | VARCHAR(50) | | Formatted result text (e.g., "12.34") |
| `nResult` | SINGLE | | Numeric result for sorting/comparison |
| `F_Lev` | BYTE | FK → Heats (composite) | Final level |
| `Memo` | LONGTEXT | | Notes about this performance |
| `Points` | SINGLE | | Points awarded based on place and point scale |

**Composite foreign key:** `(E_Code, F_Lev, Heat)` references `Heats(E_Code, F_Lev, Heat)` with cascade update and cascade delete.

**Notes:**
- No single-column primary key. A competitor can appear in multiple final levels of the same event (e.g., heat then final).
- `nResult` is the normalised value used for sorting. For time events, lower is better; for distance/points, higher is better.
- `Result` is the display string; `nResult` is the machine-comparable value.

---

### 2.5 Heats

Defines individual heats within events. Each heat belongs to a specific event and final level.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `HE_Code` | AUTOINCREMENT | UNIQUE | Auto-generated surrogate key (not used as PK) |
| `E_Code` | LONG | FK → Events.E_Code | Parent event |
| `Heat` | SHORT | | Heat number within the final level |
| `PtScale` | VARCHAR(10) | FK → PointsScale.PtScale | Point scale applied to this heat |
| `E_Number` | LONG | | Sequential event number in the carnival programme |
| `E_Time` | DATETIME | | Scheduled start time |
| `F_Lev` | BYTE | | Final level (1 = initial heats, 2+ = subsequent rounds) |
| `Pro_Type` | VARCHAR(15) | FK → Promotion.ProType | Promotion strategy for this heat |
| `UseTimes` | BIT | | If TRUE, promotion considers times; if FALSE, places only |
| `Completed` | BIT | | Legacy completion flag |
| `Status` | BYTE | FK → FinalStatus.StatusID | Current status (0–3) |
| `AllNames` | BIT | | Display all competitor names on reports |
| `DontOverridePlaces` | BIT | | Prevent automatic recalculation of places |

**Primary Key:** `(E_Code, F_Lev, Heat)` — composite.

**Notes:**
- `HE_Code` exists as an auto-incrementing surrogate but the composite key `(E_Code, F_Lev, Heat)` is the true primary key.
- `Status` maps to the Event Status lifecycle: 0=Future, 1=Active, 2=Completed, 3=Promoted.

---

### 2.6 Final_Lev

Defines the heat progression structure for an event type. Each row specifies the number of heats and promotion rules for one final level.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ET_Code` | LONG | FK → EventType.ET_Code | Parent event type |
| `F_Lev` | BYTE | | Final level number (1, 2, 3…) |
| `NoHeats` | SHORT | | Number of heats at this level |
| `PtScale` | VARCHAR(10) | | Default point scale for heats at this level |
| `ProType` | VARCHAR(15) | | Default promotion type (NONE, Smooth, Staggered) |
| `UseTimes` | BIT | | Default: use times for promotion? |
| `ProNum` | SHORT | | Number of competitors promoted per heat |

**Primary Key:** `(ET_Code, F_Lev)` — composite.

**Notes:**
- Level with the lowest `F_Lev` value is the initial round (heats). The highest is the final.
- When heats are auto-created, values from this table are copied into the Heats table.

---

### 2.7 House

Teams or groupings to which competitors belong.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `H_Code` | VARCHAR(7) | PK, UNIQUE, NOT NULL | Short code (e.g., "RED", "BLU") |
| `H_NAme` | VARCHAR(50) | | Full name (e.g., "Red House") |
| `HT_Code` | LONG | FK → HouseTypes.HT_Code | House type category |
| `Include` | BIT | | Whether house is active in this carnival |
| `Details` | LONGTEXT | | Description or notes |
| `Lane` | SHORT | | Default lane assignment for this house |
| `CompPool` | LONG | | Competition pool/category grouping |
| `Flag` | BIT | | General-purpose flag |
| `H_ID` | AUTOINCREMENT | UNIQUE | Internal numeric ID |

**Notes:**
- `H_Code` is the primary key used in display and data entry.
- `H_ID` is an auto-incrementing surrogate used for internal references (e.g., in House Points-Extra, Competitors.H_ID, Events.RecHouse).
- The table has **two unique keys**: `H_Code` (business key) and `H_ID` (surrogate).

---

### 2.8 Records

Stores the best-ever performance records for events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `E_Code` | LONG | NOT NULL, FK → Events.E_Code | Event this record belongs to |
| `Surname` | VARCHAR(50) | | Record holder's surname |
| `Gname` | VARCHAR(50) | | Record holder's given name |
| `H_Code` | VARCHAR(50) | FK → House.H_Code | Record holder's house |
| `Date` | DATETIME | | Date the record was set |
| `Comments` | VARCHAR(50) | | Notes |
| `nResult` | SINGLE | | Numeric record value |
| `Result` | VARCHAR(50) | | Formatted text record value |

**Notes:**
- One record per Event (one-to-one with Events).
- When a competitor beats the existing record, the user is prompted before this row is updated.

---

### 2.9 PointsScale

Maps finishing place to points awarded. Multiple named scales can exist (e.g., "Olympic", "Standard") to be applied to different heat levels.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `PtScale` | VARCHAR(10) | | Scale name (e.g., "Olympic") |
| `Place` | SHORT | | Finishing position (1, 2, 3…) |
| `Points` | DOUBLE | | Points awarded for this place |

**No explicit primary key.** Logical key is `(PtScale, Place)`.

---

### 2.10 CompetitorEventAge

Maps competitor ages to event age categories. Used to determine which events a competitor is eligible for.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `Cage` | BYTE | PK (composite) | Competitor's actual age in years |
| `Eage` | VARCHAR(50) | PK (composite) | Event age category (e.g., "12", "14-16") |
| `Flag` | BIT | | Filtering flag |
| `Tag` | BIT | | Selection tag |
| `Mdiv` | VARCHAR(2) | | Meet Manager division mapping code |

**Primary Key:** `(Cage, Eage)`.

**Notes:**
- This table is rebuilt automatically when competitor or event definitions change.
- Enables age-range events (e.g., a 14-year-old maps to both "14" and "14-16" events).

---

### 2.11 Lanes

Maps lane numbers to houses. Used in limited-lane events to pre-assign which house runs in which lane.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `Lane` | SHORT | PK, UNIQUE, NOT NULL | Lane number |
| `H_Code` | LONG | | House assigned to this lane |

---

### 2.12 Lane Sub

Substitution labels for lanes (allows renaming lanes for display).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `Lane` | SHORT | PK, UNIQUE, NOT NULL | Lane number |
| `Lane_Sub` | SHORT | | Display label for lane |

**Seed Data:** Lanes 0–30 with identity mapping (Lane_Sub = Lane number).

---

### 2.13 Lane Template

Defines which lanes exist for each event type, based on that event type's lane count.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ET_Code` | LONG | FK → EventType.ET_Code | Event type |
| `Lanes` | SHORT | | Lane number |

**Notes:**
- Populated programmatically when `Lane_Cnt` is set on EventType.
- One row per lane per event type (e.g., a 6-lane event creates entries for lanes 1-6).

---

### 2.14 Lane Promotion Allocation

Defines which lane a competitor moves to when promoted, based on their finishing place.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ET_Code` | LONG | FK → EventType.ET_Code | Event type |
| `Place` | SHORT | | Original finishing place |
| `Lane` | SHORT | | Lane to assign in the next final level |

---

### 2.15 House Points-Extra

Manual point adjustments for houses (bonus or penalty points).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `H_ID` | LONG | FK → House.H_ID | House internal ID |
| `NumPts` | SINGLE | | Points to add (positive) or subtract (negative) |
| `Reason` | LONGTEXT | | Explanation for the adjustment |

---

### 2.16 EventCat

Event categories for classification/grouping.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `EC_Code` | VARCHAR(7) | PK, UNIQUE, NOT NULL | Category code |
| `Desc` | VARCHAR(50) | | Description |
| `Comments` | VARCHAR(50) | | Notes |

---

### 2.17 Miscellaneous

Carnival-level configuration. **Single-row** table (singleton pattern).

| Column | Type | Description |
|--------|------|-------------|
| `OpenAge` | BYTE | Age value representing "open" category (default: 99) |
| `ImportLocation` | VARCHAR(100) | Default import file path |
| `ExportLocation` | VARCHAR(50) | Default export file path |
| `ImportFormat` | BYTE | Import format selector |
| `ExcelFormat` | BIT | Import from Excel flag |
| `TextFormat` | BIT | Import from text flag |
| `CESfuture` | BIT | Competitor-Event filter: show future heats |
| `CESactive` | BIT | Competitor-Event filter: show active heats |
| `CEScompleted` | BIT | Competitor-Event filter: show completed heats |
| `CESpromoted` | BIT | Competitor-Event filter: show promoted heats |
| `CESflevel` | VARCHAR(5) | Competitor-Event filter: final level |
| `CESmale` | BIT | Competitor-Event filter: show males |
| `CESfemale` | BIT | Competitor-Event filter: show females |
| `CESage` | VARCHAR(20) | Competitor-Event filter: age |
| `CESevent` | VARCHAR(30) | Competitor-Event filter: event |
| `CESheatcomplete` | VARCHAR(2) | Competitor-Event filter: heat completion |
| `CESevent#` | VARCHAR(20) | Competitor-Event filter: event number |
| `Rage` | VARCHAR(10) | Report filter: age |
| `Rsex` | VARCHAR(2) | Report filter: sex |
| `Rfinal` | VARCHAR(3) | Report filter: final level |
| `Rheat` | VARCHAR(3) | Report filter: heat |
| `Rfuture` | BIT | Report filter: include future |
| `Ractive` | BIT | Report filter: include active |
| `Rcompleted` | BIT | Report filter: include completed |
| `Rpromoted` | BIT | Report filter: include promoted |
| `CarnivalTitle` | VARCHAR(100) | Display title for reports (default: "Carnival Title") |
| `CarnivalFooter` | VARCHAR(100) | Footer text for reports (default: "Hosted by") |
| `Rsummary` | BIT | Report option: include summary |
| `Rdetailed` | BIT | Report option: include detailed results |
| `Rentry` | BIT | Report option: include entry forms |
| `Rhead1` | VARCHAR(50) | Report column header 1 (default: "Lane") |
| `Rhead2` | VARCHAR(50) | Report column header 2 (default: "Time") |
| `Rresults` | BIT | Report option: include results |
| `HouseType` | LONG | Active house type (FK → HouseTypes.HT_Code) |
| `Mteam` | VARCHAR(30) | Meet Manager team name |
| `Mcode` | VARCHAR(4) | Meet Manager team code |
| `Mtop` | SHORT | Meet Manager: number of top results to export (default: 3) |

**Default values** (from seed data): `OpenAge=99`, `CarnivalTitle="Carnival Title"`, `CarnivalFooter="Hosted by"`, `Rhead1="Lane"`, `Rhead2="Time"`, `HouseType=2`, `Mtop=3`.

---

### 2.18 MiscHTML

HTML export configuration for the carnival. **Single-row** table.

| Column | Type | Description |
|--------|------|-------------|
| `TemplateFileSummary` | VARCHAR(150) | Path to summary page HTML template |
| `TemplateFile` | VARCHAR(150) | Path to detail page HTML template |
| `HTMLlocation` | VARCHAR(150) | Output directory for generated HTML files |
| `ReportHeader` | VARCHAR(50) | Header text for HTML reports |
| `GenerateHTML` | BIT | Whether HTML export is enabled |

---

### 2.19 Reports-Selected

Persists user's checkbox selections on the HTML export report form. **Single-row** table.

| Column | Type | Description |
|--------|------|-------------|
| `Overall Results` | BIT | Export overall results |
| `by Age` | BIT | Export results by age |
| `by Sex` | BIT | Export results by sex |
| `by Age/Sex` | BIT | Export results by age and sex |
| `by Event` | BIT | Export results by event |
| `Age Champions` | BIT | Export age champion report |
| `Comp Events` | BIT | Export competitor events report |

---

### 2.20 _AlwaysOpen

System flag table. **Single-row** table.

| Column | Type | Description |
|--------|------|-------------|
| `AlwaysOpen` | BIT | Whether to keep carnival database connection open |

---

## 3. Reference / Lookup Tables (Carnival Database)

These tables contain seed data that is copied with the carnival template.

### 3.1 FinalStatus

| StatusID | Status |
|----------|--------|
| 0 | Future |
| 1 | Active |
| 2 | Completed |
| 3 | Promoted |

**Schema:** `StatusID` BYTE (PK), `Status` VARCHAR(10).

### 3.2 HouseTypes

| HT_Code | Desc |
|---------|------|
| 1 | Inter-House |
| 2 | Inter-School |
| 3 | Inter-Class |
| 4 | Inter-Country |
| 5 | Inter-Youth Group |
| 6 | Inter-Church |

**Schema:** `HT_Code` AUTOINCREMENT (PK), `Desc` VARCHAR(50).

### 3.3 Promotion

| ProType | Desc |
|---------|------|
| NONE | *(empty)* |
| Smooth | {1,2,3} {4,5,6} {7,8,9} |
| Staggered | {1,4,7} {2,5,8} {3,6,9} |

**Schema:** `ProType` VARCHAR(10) (PK), `Desc` VARCHAR(30).

### 3.4 Sex Sub

| Sex | Sex Sub |
|-----|---------|
| - | Both |
| F | Female |
| M | Male |

**Schema:** `Sex` VARCHAR(1) (PK), `Sex Sub` VARCHAR(15).

### 3.5 Units

| Unit_ID | Unit | DisplayUnit | Order |
|---------|------|-------------|-------|
| 1 | Seconds | Secs | Asc |
| 2 | Minutes | Mins | Asc |
| 3 | Hours | Hrs | Asc |
| 4 | Meters | m | Desc |
| 5 | Kilometers | Km | Desc |
| 6 | Points | Pts | Desc |

**Schema:** `Unit_ID` AUTOINCREMENT (PK), `Unit` VARCHAR(50), `DisplayUnit` VARCHAR(50), `Order` VARCHAR(4).

### 3.6 Final Level Sub

| F_Lev | F_Lev_Sub |
|-------|-----------|
| 0 | Grand Final |
| 1 | Semi Final |
| 2 | Quarter Final |
| 3 | Round A |
| 4 | Round B |
| 5 | Round C |
| 6 | Round D |
| 7 | Round E |

**Schema:** `F_Lev` BYTE (PK), `F_Lev_Sub` VARCHAR(20).

**Note:** Lower `F_Lev` values are *later* rounds (0 = Grand Final). This is an inverted numbering scheme — the initial heats have the highest `F_Lev` and competitors promote *downward* toward 0.

---

## 4. Staging / Temporary Tables (Carnival Database)

### 4.1 ImportData

Staging table for disk import operations.

| Column | Type | Description |
|--------|------|-------------|
| `HE_Code` | LONG | Heat code |
| `H_Code` | VARCHAR(7) | House code |
| `Sex` | VARCHAR(50) | Gender |
| `Age` | VARCHAR(10) | Age category |
| `ET_Des` | VARCHAR(30) | Event type description |
| `Heat` | VARCHAR(3) | Heat number |
| `Competitor` | SHORT | Competitor number within heat |
| `G_Name` | VARCHAR(30) | Given name |
| `S_Name` | VARCHAR(30) | Surname |
| `Memo` | LONGTEXT | Notes |

### 4.2 TEMP1

Staging table for competitor import.

| Column | Type |
|--------|------|
| `Given` | VARCHAR(19) |
| `Surname` | VARCHAR(29) |
| `DOB` | DATETIME |
| `Sex` | VARCHAR(5) |
| `House` | VARCHAR(10) |
| `Age` | VARCHAR(10) |

### 4.3 EVERYONE1

Staging table for export/report generation.

| Column | Type |
|--------|------|
| `House` | VARCHAR(20) |
| `Sex` | VARCHAR(2) |
| `Age` | VARCHAR(50) |
| `Event` | VARCHAR(255) |
| `Heat` | VARCHAR(10) |
| `Gname` | VARCHAR(100) |
| `Sname` | VARCHAR(50) |

---

## 5. Main Database Tables

### 5.1 Carnivals

Registry of all known carnival databases.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `Carnival` | VARCHAR(50) | PK, UNIQUE, NOT NULL | Carnival display name |
| `Filename` | VARCHAR(255) | | Full path to `.accdb` file |
| `Relative Directory` | VARCHAR(150) | | Path relative to main database |
| `Available` | BIT | | Whether the file exists and is accessible |

---

### 5.2 MiscellaneousLocal

Application-level settings. **Single-row** table. Shares many fields with the carnival-level Miscellaneous table, plus application-specific fields.

| Column | Type | Description |
|--------|------|-------------|
| `OpenAge` | BYTE | Default open-age value |
| `ImportLocation` | VARCHAR(100) | Default import path |
| `ExportLocation` | VARCHAR(50) | Default export path |
| `ImportFormat` | BYTE | Import format |
| `ExcelFormat` | BIT | Excel import flag |
| `TextFormat` | BIT | Text import flag |
| `CESfuture` | BIT | Default filter: future |
| `CESactive` | BIT | Default filter: active |
| `CEScompleted` | BIT | Default filter: completed |
| `CESpromoted` | BIT | Default filter: promoted |
| `CESflevel` | VARCHAR(5) | Default filter: final level |
| `CESmale` | BIT | Default filter: males |
| `CESfemale` | BIT | Default filter: females |
| `CESmixed` | BIT | Default filter: mixed events |
| `CESage` | VARCHAR(20) | Default filter: age |
| `CESevent` | VARCHAR(30) | Default filter: event |
| `CESheatcomplete` | VARCHAR(2) | Default filter: heat completion |
| `CESevent#` | VARCHAR(20) | Default filter: event number |
| `License` | VARCHAR(100) | License information |
| `CarnivalFooter` | VARCHAR(100) | Default carnival footer |
| `HouseType` | LONG | Default house type |
| `ActiveCarnival` | VARCHAR(50) | Currently active carnival name |
| `CompetitorPlaces` | SHORT | Number of competitor places to display |
| `AgeChampions` | SHORT | Number of age champions to display |
| `CompBulkField` | VARCHAR(50) | Bulk update: target field |
| `CompBulkOp` | VARCHAR(50) | Bulk update: operator |
| `CompBulkValue` | VARCHAR(50) | Bulk update: value |
| `ShowDialog` | BIT | Show dialogs on startup |
| `AlertToRecord` | BIT | Alert user when records are broken |
| `Date` | DATETIME | Application date |

---

### 5.3 ReportTypes

Defines the available report formats and links them to Access report objects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `R_Code` | AUTOINCREMENT | PK | Report type ID |
| `Desc` | VARCHAR(50) | | Human-readable description |
| `Report` | VARCHAR(50) | | Access Report object name |
| `EventReport` | BIT | | Whether this is an event-level report |
| `LimitedLanes` | BIT | | Whether this is a limited-lane report format |
| `Flag` | BIT | | General flag |
| `Relay` | BIT | | Whether this is a relay event format |
| `SummaryReport` | VARCHAR(50) | | Name of the corresponding summary report |

**Seed Data:**

| R_Code | Desc | Report | LimitedLanes | Relay | SummaryReport |
|--------|------|--------|:---:|:---:|---------------|
| 1 | Limited Lanes (ie. 100m etc) | Track (Limited Lanes) | Yes | No | Track Small (Limited Lanes) |
| 2 | Unlimited lanes (ie 800m, 1500m) | Track (unlimited Lanes) | No | No | Track Small (Unlimited Lanes) |
| 3 | Field (3 attempts) | Field (3 attempts) | No | No | Track Small (Unlimited Lanes) |
| 4 | Field (High Jump) | Field (High Jump) | No | No | Track Small (Unlimited Lanes) |
| 5 | Results Entry Sheets | EventResultsEntrySheet | No | No | EventResultsEntrySheet |
| 6 | Relay (Limited Lanes) | Relay (Limited Lanes) | Yes | Yes | Relay Small (Limited Lanes) |

**Note:** The carnival database also receives a copy of ReportTypes (with `R_Code` starting at 7) via `zz~ReportTypes`. The main database copy has `R_Code` 1–6.

---

### 5.4 ReportList

Catalogue of all available Access report objects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ReportName` | VARCHAR(255) | PK | Report object name |
| `ReportCaption` | VARCHAR(255) | | Display caption |
| `Open` | BIT | | Whether report is currently open |

**Contains 31 reports.** See Document 7 (Reporting) for full list with descriptions.

---

### 5.5 tblReportsHTML

Defines HTML export report configurations. Each row maps a short code to a query, field list, and grouping rules for HTML generation.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `repID` | AUTOINCREMENT | PK | Report config ID |
| `repShortCode` | VARCHAR(10) | UNIQUE | Short identifier (e.g., "agca", "etoa") |
| `repTitle` | VARCHAR(255) | | Report page title |
| `repCaption` | VARCHAR(255) | | Descriptive caption |
| `repQuery` | VARCHAR(255) | | Source query name |
| `repFields` | VARCHAR(255) | | Semicolon-delimited field list |
| `repHeaders` | VARCHAR(255) | | Semicolon-delimited column headers |
| `repGroup` | VARCHAR(255) | | Grouping field name |
| `repGroupHeader` | VARCHAR(255) | | Grouping header label prefix |
| `repDisplayLimit` | LONG | | Max rows to display (0 = unlimited) |
| `repAgeChamp` | BIT | | Whether this is an age champion report |
| `repFinalLev` | VARCHAR(255) | | Field name containing final level (for CSS classes) |
| `repPlace` | VARCHAR(255) | | Field name containing place (for CSS classes) |

**Seed Data (5 HTML report configs):**

| repShortCode | repTitle | repQuery |
|--------------|----------|----------|
| agca | Age Champions (all divisions) | Statistics-Age Champion-AnyDivision |
| agch | Age Champions (division only) | Statistics-Age Champion |
| etoa | Event Results - Best | Statistics-EventTimesOverallAsc-EA |
| coev | Competitor Results by House/Name | Statistics-CompetitorEvents |
| rh | Record Holders | Report-Records-Top |

---

### 5.6 USysRibbons

Stores custom ribbon XML definitions. Access system table convention.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `lngID` | AUTOINCREMENT | PK | Ribbon ID |
| `RibbonName` | VARCHAR(255) | | Ribbon identifier |
| `RibbonXml` | LONGTEXT | | Full XML definition |

**Contains 3 ribbons:** `SportsAdmin` (dev mode), `SportsMenu` (user mode, startFromScratch=true), `SportPrint` (print preview).

---

### 5.7 Operators

Comparison operators for filter UIs.

| Operator |
|----------|
| `<` |
| `<=` |
| `=` |
| `>` |
| `>=` |
| `Like` |

**Schema:** `Operator` VARCHAR(50). No primary key.

---

### 5.8 Inventory Attached Tables

Tracks which carnival tables should be linked. Used to validate the carnival database connection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `Table Name` | VARCHAR(50) | PK | Name of linked table (without `zz~` prefix) |
| `IF ID` | LONG | | Identifier flag (all set to 2) |

**Contains 29 entries** — one for each carnival template table.

---

### 5.9 Additional Main-Database Tables

| Table | Purpose |
|-------|---------|
| `ShowDialog` | Single BIT field; UI state flag |
| `Table Field Names` | Maps field names to display names and types for competitors |
| `accRunCommands` | Access command IDs for zoom/preview controls |
| `tmpCEAM` | Temporary cache for CompetitorEventAge with Meet Manager mapping |
| `Competitors-Temp` | Local copy of linked Competitors table (same schema, `Age` as VARCHAR(10)) |
| `EventType_Include` | Temporary storage for event type include flags during operations |
| `Import Competitors` | Staging table for competitor import from external files |
| `Temporary Memo` | Single LONGTEXT field for clipboard/temporary text |
| `Temporary Record-Best in Full` | Staging for record comparison calculations |
| `Temporary Results-Place Order` | Staging for place assignment with lane mapping |
| `Temporary Table` | General-purpose temporary storage |
| `Misc-EnterCompetitorEvents` | UI state for competitor event entry form |
| `zzz~Relationships Main` | Metadata: defines relationships to create in carnival databases |
| `zzz~Relationships Second` | Metadata: field mappings for those relationships |

---

## 6. Relationships

### 6.1 Carnival Database Relationships

The following relationships are established in each carnival database. They are defined in the `zzz~Relationships Main` and `zzz~Relationships Second` metadata tables and recreated when a new carnival is created or when relationship validation detects discrepancies.

**Relationship type codes:**
- **0** = Join only (no referential integrity enforced)
- **3** = Referential integrity enforced
- **4096** = Referential integrity + cascade updates
- **4352** = Referential integrity + cascade updates + cascade deletes

| # | Relationship | Parent → Child | Join Fields | Type | Behaviour |
|---|-------------|----------------|-------------|------|-----------|
| 0 | ReportTypes → EventType | ReportTypes.R_Code → EventType.R_Code | R_Code | 3 | Referential integrity |
| 2 | Promotion → Heats | Promotion.ProType → Heats.Pro_Type | ProType / Pro_Type | 0 | Join only |
| 3 | Final Level Sub → Heats | Final Level Sub.F_Lev → Heats.F_Lev | F_Lev | 0 | Join only |
| 4 | EventType → Final_Lev | EventType.ET_Code → Final_Lev.ET_Code | ET_Code | 4096 | Cascade update |
| 5 | House → House Points-Extra | House.H_ID → House Points-Extra.H_ID | H_ID | 3 | Referential integrity |
| 6 | EventType → Lane Promotion Allocation | EventType.ET_Code → Lane Promotion Allocation.ET_Code | ET_Code | 4096 | Cascade update |
| 7 | FinalStatus → Heats | FinalStatus.StatusID → Heats.Status | StatusID / Status | 0 | Join only |
| 8 | Competitors → CompEvents | Competitors.PIN → CompEvents.PIN | PIN | 4096 | Cascade update |
| 9 | EventType → Events | EventType.ET_Code → Events.ET_Code | ET_Code | 4096 | Cascade update |
| 10 | Events → Heats | Events.E_Code → Heats.E_Code | E_Code | 4096 | Cascade update |
| 11 | Heats → CompEvents | Heats.(E_Code, F_Lev, Heat) → CompEvents.(E_Code, F_Lev, Heat) | E_Code, F_Lev, Heat | 4352 | Cascade update + delete |
| 12 | Events → Records | Events.E_Code → Records.E_Code | E_Code | 4096 | Cascade update |
| 13 | Lane Sub → CompEvents | Lane Sub.Lane → CompEvents.Lane | Lane | 0 | Join only |
| 14 | House → Competitors | House.H_Code → Competitors.H_Code | H_Code | 4352 | Cascade update + delete |
| 15 | PointsScale → Heats | PointsScale.PtScale → Heats.PtScale | PtScale | 3 | Referential integrity |
| 16 | House → Records | House.H_Code → Records.H_Code | H_Code | 4352 | Cascade update + delete |

### 6.2 Entity-Relationship Diagram (Textual)

```
                    ┌──────────────┐
                    │  HouseTypes  │
                    └──────┬───────┘
                           │ HT_Code
                    ┌──────▼───────┐      ┌──────────────────┐
                    │    House     │──────►│ House Points-    │
                    │              │ H_ID  │ Extra            │
                    └──┬───┬───┬──┘       └──────────────────┘
                H_Code │   │   │ H_Code
           ┌───────────┘   │   └──────────────────┐
           │               │                      │
    ┌──────▼───────┐       │               ┌──────▼───────┐
    │ Competitors  │       │               │   Records    │
    └──────┬───────┘       │               └──────▲───────┘
       PIN │               │                  E_Code │
           │               │                      │
    ┌──────▼───────┐       │               ┌──────┴───────┐
    │  CompEvents  │◄──────┼───────────────│   Events     │
    │  (junction)  │       │               └──────▲───────┘
    └──────▲───────┘       │               ET_Code │
           │               │                      │
    ┌──────┴───────┐       │               ┌──────┴───────┐     ┌────────────┐
    │    Heats     │       │               │  EventType   │────►│ ReportTypes│
    └──────▲───────┘       │               └──┬───┬───┬───┘     └────────────┘
           │               │            ET_Code│   │   │
   ┌───────┼───────┐       │                   │   │   │
   │       │       │       │      ┌────────────┘   │   └────────────┐
   │       │       │       │      │                │                │
┌──┴──┐ ┌──┴──┐ ┌──┴──────┐│  ┌───▼──────┐  ┌─────▼──────┐  ┌─────▼────────────┐
│Fin  │ │Prom │ │Points   ││  │Final_Lev │  │Lane        │  │Lane Promotion    │
│Stat │ │otion│ │Scale    ││  │          │  │Template    │  │Allocation        │
└─────┘ └─────┘ └─────────┘│  └──────────┘  └────────────┘  └──────────────────┘
                            │
                    ┌───────┴──────┐
                    │  Lane Sub    │
                    └──────────────┘
```

### 6.3 Key Cascade Behaviours

These cascading rules are critical to preserve in any rebuild:

1. **Deleting a House** cascade-deletes all its Competitors and Records (type 4352).
2. **Deleting a Heat** (via its composite key) cascade-deletes all CompEvents in that heat (type 4352).
3. **Updating an EventType.ET_Code** cascades to Events, Final_Lev, and Lane Promotion Allocation (type 4096).
4. **Updating an Event's E_Code** cascades to Heats and Records (type 4096).
5. **Updating a Competitor's PIN** cascades to CompEvents (type 4096).

---

## 7. Data Integrity Rules

Beyond foreign keys, the application enforces these rules in code:

| Rule | Enforcement | Scope |
|------|-------------|-------|
| One active carnival at a time | Application code (CarnivalLinking) | Main DB |
| Singleton pattern for Miscellaneous, MiscHTML, Reports-Selected, _AlwaysOpen | Single-row tables, no PK | Carnival DB |
| CompetitorEventAge rebuilt from Competitors × Events | Application code (UpdateEventCompetitorAge) | Carnival DB |
| nResult calculated from Result text | Application code (Calculate_Results) | CompEvents |
| TotPts recalculated from sum of CompEvents.Points | Application code | Competitors |
| Record only updated with user confirmation | Application code (CheckIfRecordBroken) | Records |
| Heat status follows lifecycle (Future→Active→Completed→Promoted) | Application code (SetCurrentFinal) | Heats |
| Age field accepts single values, ranges (14-16), and open (99) | Application code (AgeFilter) | Events |
| Lane assignments respect Lane Promotion Allocation | Application code (Calculate_Competitor_Lane) | CompEvents |

---

## 8. Schema Migration

When the application opens a carnival database, it validates the schema and applies migrations for missing elements. The following additions are checked and applied if absent (see Document 3 for full migration logic):

| Element | Table | Description |
|---------|-------|-------------|
| `_AlwaysOpen` table | — | Added if missing |
| `CompetitorEventAge` table | — | Added if missing |
| `MiscHTML` table | — | Added if missing |
| `nResult` field | CompEvents | SINGLE, added if missing |
| `ProNum` field | Final_Lev | SHORT, added if missing |
| `Age` field type | Competitors | Changed from TEXT to BYTE if needed |
| `Mevent` field | EventType | VARCHAR(10), added if missing |
| `Mteam` field | Miscellaneous | VARCHAR(30), added if missing |
| `Mcode` field | Miscellaneous | VARCHAR(4), added if missing |
| `Mtop` field | Miscellaneous | SHORT, added if missing |
| `Mdiv` field | CompetitorEventAge | VARCHAR(2), added if missing |
| Relationships | All | Validated against template; recreated if discrepancies found |

---

*Previous: [Document 1 — Index & Overview](01-index-and-overview.md)*
*Next: [Document 3 — Carnival Lifecycle](03-carnival-lifecycle.md)*
