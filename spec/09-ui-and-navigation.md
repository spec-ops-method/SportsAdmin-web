# Sports Administrator — Software Specification

## Document 9: UI & Navigation

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| **Spec Document**  | 09                                         |
| **Domain**         | Screen inventory, navigation architecture, user task flows |
| **Access Objects** | 67 forms, 23 macros, ribbon XML, `basRibbonCallbacks` module |
| **Last Updated**   | 2026-03-20                                 |

---

## 1. Architecture Overview

The Access application uses a **ribbon + main menu hub** pattern:

1. **AutoExec macro** invokes `Startup()` on application open.
2. `Startup()` sets user mode, attaches the active carnival database, shows a splash screen, performs age updates, then opens the **Main Menu** form.
3. The **custom ribbon** ("SportsAdmin") provides persistent top-level navigation across two tabs.
4. The **Main Menu** form provides an alternate button-grid entry point to every major area.
5. Most data-entry and editing forms open as **modal dialogs** (`acDialog`); list/summary forms open in normal window mode.

### 1.1 Startup Sequence

```
AutoExec macro
  └─► Startup()                          [_Startup.bas]
        ├── Application.MenuBar = "Sports Menu"
        ├── UserMode(True)                  hide Access nav pane & toolbars
        ├── ShowPleaseWait macro            splash screen
        ├── AddTrustedLocation()            if runtime mode
        ├── CheckInventoryAttached()        verify/attach carnival DB
        ├── UpdateEventCompetitorAge()      recalculate ages
        ├── ClosePleaseWait macro
        ├── OpenForm "Main Menu"
        └── CreateReportShortcutMenu()      build report right-click menu
```

**Web equivalent:** Replace with a standard application bootstrap — authenticate user, load active carnival context from session/cookie, render the shell layout with top-level navigation.

### 1.2 Keyboard Shortcuts

| Shortcut   | Action                   |
|------------|--------------------------|
| Ctrl+F11   | `SportAddErrorCode()` (developer diagnostic) |
| F1         | Open context help        |
| Delete     | Delete selected item in list views |
| Enter      | Open/edit selected item in list views |
| Character keys | Search-as-you-type in list views (CompetitorsSummary, EventTypeSummary) |
| Escape     | Close current form       |

---

## 2. Ribbon Structure

The custom ribbon has **two tabs** (Results, Setup) defined in XML and dispatched through `basRibbonCallbacks.OnActionButton()`.

### 2.1 Results Tab (`tab_results`)

| Group       | Button ID         | Label                | Target Form / Action              |
|-------------|-------------------|----------------------|-----------------------------------|
| Enter       | `btn_entres`      | Enter Results        | `CompEventsSummary`               |
| Reports     | `btn_repstat`     | Reports & Statistics | `Statistical Reports`             |
| Reports     | `btn_repevntlist` | Starting Lists       | `Reports_Event`                   |
| Exit        | `btn_20`          | Quit Sports Admin    | Confirm → `DoCmd.Quit`            |

### 2.2 Setup Tab (`tab_setup`)

| Group        | Button ID          | Label                    | Target Form / Action              |
|--------------|--------------------|--------------------------|-----------------------------------|
| Carnival     | `btn_crnmtn`       | Maintain Carnivals       | `Carnivals Maintain`              |
| Carnival     | `btn_crnset`       | Setup Carnival           | `Setup Carnival`                  |
| Carnival     | `btn_crndskexp`    | Create Disks (menu)      | `ExportData` (dialog)             |
| Carnival     | `btn_crndskimp`    | Import Disks (menu)      | `Import Data` (dialog)            |
| Carnival     | `btn_crnstat`      | Statistics               | `Statistical Reports`             |
| Carnival     | `tgb_dev`          | Development (toggle)     | `UserMode()` toggle               |
| Setup        | `btn_setutil`      | Utilities                | `Utilities` (dialog)              |
| Setup        | `btn_setteams`     | Teams                    | `House Summary` (dialog)          |
| Setup        | `btn_setpoints`    | Point Scales             | `PointScale` (dialog)             |
| Competitors  | `btn_compimp`      | Import Competitors       | `Import Competitors`              |
| Competitors  | `btn_compman`      | Manage Competitors       | `CompetitorsSummary`              |
| Events       | `btn_evntdetail`   | Event Details            | `EventTypeSummary`                |
| Events       | `btn_evntcomp`     | Event Competitors        | `CompEventsSummary`               |
| Events       | `btn_evntord`      | Event Order              | `EventOrder`                      |
| Events       | `btn_evntlist`     | Generate Event Lists     | `Reports_Event`                   |

### 2.3 Development Toggle

The `tgb_dev` toggle button shows/hides the Access navigation pane and database window. Disabled when running in Access Runtime mode. 

**Web equivalent:** Replace with a role-based admin panel. No equivalent needed for the database‐nav toggle itself.

### 2.4 Web Translation

The ribbon maps directly to a **primary navigation bar** with two sections:

| Ribbon Tab | Web Nav Section | Items |
|------------|-----------------|-------|
| Results    | **Run Carnival** | Enter Results, Reports & Statistics, Starting Lists |
| Setup      | **Setup** | Carnivals, Carnival Setup, Teams, Point Scales, Competitors, Events, Utilities |

---

## 3. Main Menu Form

A **non-data-bound popup** that serves as the application landing page after startup. Uses a decorative header image and button grid organised into functional sections.

### 3.1 Button Layout

| Section        | Button                   | Target Form              | Mode     |
|----------------|--------------------------|--------------------------|----------|
| **Carnival**   | Maintain Carnivals       | `Carnivals Maintain`     | Normal   |
|                | Setup                    | `Setup Carnival`         | Normal   |
|                | Create Carnival Disks    | `ExportData`             | Dialog   |
|                | Import Carnival Disks    | `Import Data`            | Dialog   |
|                | Teams                    | `House Summary`          | Dialog   |
|                | Point Scales             | `PointScale`             | Dialog   |
| **Competitors**| Maintain Competitors     | `CompetitorsSummary`     | Normal   |
|                | Import Competitors       | `Import Competitors`     | Normal   |
| **Events**     | Event Details            | `EventTypeSummary`       | Normal   |
|                | Event Competitors        | `CompEventsSummary`      | Normal   |
|                | Event Order              | `EventOrder`             | Normal   |
| **Results**    | Generate Event Lists     | `Reports_Event`          | Normal   |
|                | Statistics               | `Statistical Reports`    | Normal   |
| **Graph**      | WhichGraph combo         | —                        | —        |
|                | Update Graph             | Refresh graph subform    | —        |

The form also embeds a `CompEventsSummary` subform configured to display a summary graph.

**Web equivalent:** This becomes the **dashboard / home page**. The button grid maps to navigation cards or a sidebar. The graph widget translates to a chart component showing carnival progress.

---

## 4. Screen Inventory

The 67 Access forms are organized below by functional domain. Each entry notes the form name, its role, window mode, and the spec document that covers its business logic.

### 4.1 Carnival Management (Spec Doc 03)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `Carnivals Maintain` | List/select/create/delete carnivals | Normal | ListBox of carnival files; Make Active, New, Copy, Delete, Rename, Compact buttons |
| `Carnival Copy` | Create new carnival or copy existing | Dialog | Called from Carnivals Maintain |
| `Setup Carnival` | Tabbed wizard for carnival configuration | Normal | Tab pages for settings, age groups, event seeding, records. Uses ribbon reference. |
| `Setup Carnival Competitors` | Configure competitor import settings | Dialog | Subform of Setup Carnival |
| `Setup Carnival Disks` | Configure disk export settings | Dialog | Subform of Setup Carnival |

### 4.2 Team/House Management (Spec Doc 03)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `House Summary` | List all teams with CRUD buttons | Dialog | Subform `House Summary SF`; Add/Edit/Delete Team, Allocate Lanes, Allocate Extra Points |
| `Houses` | Detail form for single team | Dialog | Fields: H_Code, H_Name, Details, CompPool, Include. Subform: `House Points-Extra SF` |
| `House Points-Extra` | Manage bonus/extra points per team | Dialog | Linked to Houses via H_ID |
| `House Points-Extra SF` | Subform grid of extra points | Subform | — |
| `House Summary SF` | Subform listing teams | Subform | — |

### 4.3 Competitor Management (Spec Doc 04)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `CompetitorsSummary` | Master list of all competitors | Normal | ListBox with search-as-you-type; Add, Delete, Roll Over/Back, Bulk, Create Team Names |
| `Competitors` | Detail form for single competitor | Dialog | Fields: PIN, name, DOB, Age, Sex, H_Code, Comments. Subform shows event participation. |
| `Competitors Subform` | Event enrollment grid for a competitor | Subform | Columns: Event, Heat, Final, Place, Result, Points |
| `Competitors Bulk Maintain` | Bulk edit competitor attributes | Dialog | Grid-based mass update |
| `Competitors Bulk Maintain SF` | Subform for bulk editing | Subform | — |
| `Competitor-Check` | List competitors with missing data | Dialog | Auto-opens with warning; query filters on null required fields |
| `Competitor-QuickAdd` | Quick-add a competitor with duplicate detection | Dialog | Parses OpenArgs for pre-fill; similarity-matching listbox; ShowAll toggle |
| `Import Competitors` | Import competitors from text file | Normal | File picker, format detection, age cutoff config, preview grid. Subform: `Import Competitors SF` |
| `Import Competitors SF` | Preview of import data | Subform | — |

### 4.4 Event Management (Spec Doc 05)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `EventTypeSummary` | Master list of event types | Normal (popup) | ListBox (Event, Units, Lanes, Report Type, Include); Add, Edit, Delete, Copy, Update Records |
| `EventType` | Detail form for single event type | Dialog | Fields: description, lane count, units, report style, Include, Sync checkboxes. Subforms: `ET_Sub1` (divisions), `ET_Sub2` (heats). Buttons: Setup Heats, Lane Promotion |
| `EventType-Wizard` | Wizard variant of event type creation | Dialog | Opened after event copy or add for initial setup |
| `EventTypeCopy` | Copy or create event type | Dialog | OpenArgs: "ADD" or "COPY" |
| `EventTypeSub1` | Subform: divisions for event type | Subform | — |
| `EventTypeSub2` | Subform: heats for selected division | Subform | — |
| `EventTypeSub3` | Subform: additional event details | Subform | — |
| `EventOrder` | Organise event numbering/ordering | Normal | 6 sort criteria combos with asc/desc toggles; AutoNumber, SlideUp, ClearAll. Subform: `EventOrderSub` |
| `EventOrderSub` | Subform: sorted event list | Subform | Drag-and-reorder or manual numbering |
| `EventOrderSub-New` | Alternate event order subform | Subform | — |
| `EventOrderSub-Orig` | Original event order subform | Subform | — |
| `Final_lev` | Setup heats and finals for an event | Dialog | Check: ClearExisting; Button: Create Heats and Finals. Subform: `Final_Lev_Sub` |
| `Final_Lev_Sub` | Subform: editable heats/finals list | Subform | — |
| `Final Level SF` | Final level substitution subform | Subform | Used in Utilities |
| `Lanes` | Allocate lane numbers to teams | Dialog | Subform: `Lanes SF`; Refresh Order, Update Lanes for All Events |
| `Lanes SF` | Subform: lane allocation grid | Subform | — |
| `Lane Promotion Allocation` | Map places to lanes for promotion | Dialog | Subform: `Lane Promotion Allocation SF`; Order by Place/Lane |
| `Lane Promotion Allocation SF` | Subform: place-to-lane mapping | Subform | — |
| `Lane Subtitution SF` | Lane substitution name mapping | Subform | Used in Utilities |

### 4.5 Results Entry & Promotion (Spec Doc 05, 06)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `CompEventsSummary` | Master grid of all heats across events | Normal | Complex filtering: status (Future/Active/Completed/Promoted), gender, age, event, level. Buttons: Promote, Promote Selected, Copy, Delete. Double-click opens EnterCompetitors. |
| `EnterCompetitors` | Enter results for a single heat | Normal | Header: event info, heat/final, status, lane count. Options: order-by, AllNames, DontOverridePlaces, PlacesAcrossAllHeats, EffectsRecords, QuickTab. Subform: `EC_Subform`. Buttons: Enter in Place Order, Calculate Places, Maintain Competitors |
| `Enter Competitors Subform1` | Subform: competitor result entry grid | Subform | — |
| `EnterCompetitorsAuto` | Auto-add competitors to heats | Dialog | Event picker, age filter, Create Heats option, AddCompet algorithm |
| `EnterCompetitor Memo` | Competitor memo/notes display | Dialog | — |
| `Temporary Results-Place Order` | Enter results in manual place order | Dialog | Launched from EnterCompetitors for place-first entry |
| `TemporaryResultsSF` | Subform for temporary results | Subform | — |
| `PromoteEvents` | Promotion confirmation dialog | Dialog | Yes/No/Cancel with "Yes to all" checkbox; OpenArgs provides message text |
| `CopyCompetitorsBetweenEvents` | Copy competitor enrollments between events | Dialog | From/To event selectors with filters; iterates and copies CompEvents records |
| `EventRecord` | View/edit event records | Dialog | — |
| `EventRecordHistory` | View record history for event | Dialog | — |
| `EventRecordsSF` | Subform: records grid | Subform | — |

### 4.6 Reporting & Statistics (Spec Doc 07)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `Reports_Event` | Generate event-based reports | Normal | Tabs: Common Lists / Misc Lists. Filters: Sex, Final, Heat, Age, Status (Future/Active/Completed/Promoted). Buttons: Generate Event Lists, Program of Events, Name Tags |
| `Statistical Reports` | Generate statistical / aggregate reports | Normal | Checkbox matrix of report types. Subforms: Events, Houses. Buttons: Preview, Print, Generate HTML, All/None toggles |
| `Statistical Reports - Team SF` | Subform: team selector for stat reports | Subform | — |
| `Report SF2` | Report filter subform | Subform | — |
| `ReportsPopUp` | Manage open report windows | Popup | ListBox of open reports; Close, Close All, Print, Print All. Position controls. Timer-based auto-refresh. |
| `ReportsPopUp-SF` | Subform for report popup | Subform | — |

### 4.7 Data Exchange (Spec Doc 08)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `ExportData` | Create carnival export disks | Dialog | Path picker, format options (PlainText/Excel/RTF), sex/heat format options. Subform: team selector. |
| `ExportTextSF1` | Subform: team selection for export | Subform | — |
| `Import Data` | Import results from carnival disks | Dialog | File picker, format detection (TXT/CSV), preview grid. Validates completeness, handles matching. |
| `Import Data SF` | Subform: import preview grid | Subform | — |
| `MeetManagerDivisions` | Map event ages to Meet Manager divisions | Popup (modal) | Temp table for editing; saves back on close |

### 4.8 Point Scales (Spec Doc 06)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `PointScale` | Manage point allocation scales | Dialog | ListBox of scales; Add, Delete, Rename. Subform: place/points details. Quick creation (NumPlaces, NumPoints). |
| `PointScale Add` | Add new point scale | Dialog | — |
| `PointScaleSubform` | Subform: place/points grid | Subform | — |

### 4.9 Utilities (Cross-cutting)

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `Utilities` | Tabbed utility panel | Dialog | 7 tabs — see §5.9 |
| `Utilities 2` | Remove empty heats subform | Subform | — |
| `Utilities 3` | Titles/headings management subform | Subform | — |
| `Utilities-Export` | Export utilities subform | Subform | — |
| `Utilities-HTML` | HTML settings subform | Subform | — |

### 4.10 Application Chrome

| Form | Role | Mode | Notes |
|------|------|------|-------|
| `Main Menu` | Application hub / dashboard | Normal (popup) | Button grid + graph subform. See §3. |
| `About` | About dialog | Modal | Version display, MIT license, author attribution |
| `PleaseWait` | Loading/progress splash | Popup | Embedded image; shown/hidden via macros |
| `WhiteScreen` | Blank overlay | Popup | Used during transitions |
| `SexSub` | Gender substitution names | Subform | Used in Utilities |

---

## 5. Key Screen Specifications

This section details the behaviour and controls of the most complex screens, providing enough detail for a web rebuild.

### 5.1 Carnivals Maintain

**Purpose:** Select, create, and manage carnival database files.

**Layout:**
- Header: "Active Carnival" text display (read-only, shows currently attached carnival)
- Body: ListBox showing all carnivals with columns: Carnival Name, Directory, Filename, Available (Yes/No based on file existence)
- Side buttons: New, Copy, Add, Delete, Rename, Change File, Compact, Make Active, Import Carnival List

**Behaviours:**
- On Open: checks file existence for each carnival entry, updates Available flag
- Double-click list item: makes carnival active and closes form
- Make Active: attaches selected carnival DB, runs `CheckRelationships` and `FinaliseCarnivalSelection`
- Compact: runs `CompactDatabase` on the carnival file
- Unload blocked if no valid carnival is selected
- Minimum window size enforced on resize

**Web equivalent:** A `/carnivals` list page with a table. "Active" carnival stored in session or URL context. No file-system operations needed — carnivals are rows scoped by `carnival_id`.

### 5.2 CompEventsSummary (Enter Results Hub)

**Purpose:** Central grid for viewing all heats across all events. Primary entry point for results entry.

**Layout:**
- Filter bar (top): Status checkboxes (Future, Active, Completed, Promoted), Gender checkboxes (Male, Female, Mixed), Level/Age/Event/Event# dropdowns, Heat Complete filter
- Body: ListBox with 7 columns: Event#, Event Description, Sex, Age, Final/Heat, Completed (Yes/No), Status
- Side buttons: Edit (or double-click), Promote, Promote Selected, Update Final Status, Copy, Delete, Refresh

**Behaviours:**
- Each filter checkbox toggles a hidden text field between a real value and 99 (never-match sentinel), then requeries the ListBox
- Double-click a heat row → shows PleaseWait → opens `EnterCompetitors` filtered to that heat (`[HE_Code] = selected`)
- Promote: iterates all completed final levels and calls `PromoteEventFinal()` for each, with progress meter
- Promote Selected: promotes only the selected heat's final level
- The query joins `EventType`, `Events`, and `Heats` with applied filters

**Web equivalent:** A `/results` or `/heats` list page. Filters become query parameters or client-side filter controls. Each row links to `/results/:heatId/enter`. Promotion becomes a server-side action with progress feedback (SSE or polling).

### 5.3 EnterCompetitors (Results Entry)

**Purpose:** Enter times/distances/places for competitors in a single heat.

**Layout:**
- Header section (read-only): Event type, Sex, Age, Heat number, Final level, Status, Lane count
- Options bar: Order by (Lane/Name/Place/Not), AllNames checkbox, DontOverridePlaces, PlacesAcrossAllHeats, EffectsRecords, QuickTab
- Body: Subform grid (`EC_Subform`) with competitor rows showing: Lane, Name, Result, Place, Points
- Bottom buttons: Enter Results in Place Order, Calculate Places, Maintain Competitors, Help, Done

**Behaviours:**
- On Current: updates heat/final navigation, hides lane controls if unlimited lanes, refreshes subform
- Subform Exit: auto-calculates places (unless DontOverridePlaces is checked), checks for broken records
- Calculate Places: invokes the result parsing engine (`Calculate_Results`) and point allocation (`DeterminePoints`) — see Spec Doc 06
- Enter Results in Place Order: opens `Temporary Results-Place Order` dialog for place-first entry
- Maintain Competitors: opens `CompetitorsSummary` to manage competitor roster
- On Close: checks if all heats are marked complete, updates final status

**Web equivalent:** A `/results/:heatId/enter` page. The subform grid becomes an editable table or form array. Auto-calculation triggers on blur/save rather than on subform exit. Real-time record-breaking detection via API call.

### 5.4 EventTypeSummary (Event Types List)

**Purpose:** Master list for managing event type definitions.

**Layout:**
- Body: ListBox with columns: Event Description, Units, Lanes, Report Type, Include
- Side buttons: Add Event, Edit Event, Copy Event, Delete Event, Update Event Records, Help, Done

**Behaviours:**
- Add: opens `EventTypeCopy` (ADD mode) → on success opens `EventType-Wizard` for initial configuration
- Edit / Double-click: opens `EventType` filtered to selected ET_Code
- Delete: counts connected competitors, records, and heats; shows warning with counts; cascading delete
- Copy: opens `EventTypeCopy` (COPY mode) → duplicates event type
- Update Records: iterates all heats across all events, calls `CheckIfRecordBroken` for each, with progress meter
- Search-as-you-type and keyboard delete supported
- On Unload: triggers `UpdateEventCompetitorAge()` if ages were modified

**Web equivalent:** `/events` list page. CRUD operations via API calls. Update Records becomes a background job with progress indicator.

### 5.5 CompetitorsSummary (Competitor List)

**Purpose:** Master list for managing all competitors.

**Layout:**
- Body: ListBox with columns: Name (formatted `SURNAME, Given`), Age, Sex, Team
- Side buttons: Add, Delete, Roll Over, Roll Back, Bulk, Create Team Names, Help, Done

**Behaviours:**
- **Search-as-you-type:** typing characters calls `ScrollSummary()` to find first matching surname; Backspace removes last character
- Add: opens `Competitors` form in ADD mode via `MaintainCompetitor("ADD", 0)`
- Double-click / Enter: opens `Competitors` form in EDIT mode, filtered to selected PIN
- Delete: warns if competitor is enrolled in events (shows count), cascading delete with `TransferToCompetitorOrdered`
- Roll Over/Back: run action queries to increment/decrement all competitor ages
- Bulk: opens `Competitors Bulk Maintain` for mass attribute editing
- Create Team Names: auto-generates placeholder team-entry competitors (Gname="Team", Surname=H_Code) for each house × age group

**Web equivalent:** `/competitors` list page with search input, sortable columns, pagination. Roll Over/Back become bulk API operations with confirmation.

### 5.6 EventOrder

**Purpose:** Organise the display/print numbering of events.

**Layout:**
- Sort controls: 6 ComboBox dropdowns (sort criteria: Event#, Description, Age, Sex, Final Level, Heat) each with ascending/descending checkbox
- Options: AutoNumber, ShowAll, SingleClickOption checkboxes
- Buttons: Refresh, Default Order, Slide Up, Clear All Numbers
- Body: Subform (`EventOrderSub`) showing sorted events with editable event numbers

**Behaviours:**
- `OrderEvents` builds a complex SQL ORDER BY clause from the 6 selected criteria
- Slide Up: renumbers events sequentially, removing gaps
- Clear All Numbers: removes all event numbers
- AutoNumber: assigns sequential numbers based on current sort order
- ShowAll toggle filters between included-only and all events

**Web equivalent:** `/events/order` page with drag-and-drop reordering or a sortable table with inline number editing.

### 5.7 Reports_Event (Event Reports)

**Purpose:** Generate and preview event-based reports with flexible filtering.

**Layout:**
- Tabs: Common Lists, Misc Lists
- Filters: Sex, Final Level, Heat, Age dropdowns; Status checkboxes (Future, Active, Completed, Promoted); Detailed/Summary toggles
- Buttons: Generate Event Lists, Program of Events, Name Tags, various special list buttons
- Subforms: Event selector, House selector

**Behaviours:**
- `GenerateFinalStatusFilter` builds a dynamic WHERE clause from status checkboxes
- Report buttons open Access report objects with applied filters
- Supports both preview and direct print modes

**Web equivalent:** `/reports/events` page. Filters drive query parameters; reports render as HTML pages or downloadable PDFs.

### 5.8 Statistical Reports

**Purpose:** Generate aggregate statistical and analysis reports.

**Layout:**
- Body: Checkbox matrix of 15+ report types organised in two columns:
  - Overall results (by Age, Gender, Gender/Age, Place)
  - Event results, Competitor events/places/results
  - Current records, Age champions, Cumulative results
  - Name tags, Competitor lists, Non-participants
- Subforms: Event selector (multi-select), House/Team selector (multi-select)
- Buttons: Preview Selected, Print Selected, Generate HTML, All/None toggles

**Behaviours:**
- Preview/Print iterates checked report types and opens each matching Access report
- Generate HTML: calls `ExportNamesHTML()` module with template processing
- Cumulative report has its own dedicated code path (`PrintPreviewCumulativeReport`)
- All/None toggles set all checkboxes at once

**Web equivalent:** `/reports/statistics` page. Report checkboxes become a selection UI; server generates reports on demand as rendered pages or PDFs.

### 5.9 Utilities

**Purpose:** Collection of maintenance and configuration tools in a tabbed dialog.

**Tabs:**

| # | Tab Label           | Contents                                                                                            |
|---|---------------------|-----------------------------------------------------------------------------------------------------|
| 1 | Substitutions       | Three subforms: Lane Substitution (label mapping), Final Level Substitution (label mapping), Gender Substitution (label mapping) |
| 2 | Misc                | Destructive maintenance buttons: Delete All Competitors, Clear All Results, Reset All Events, Recreate All Heats, Reset Points |
| 3 | Titles              | Subform (`Utilities 3`) for managing report titles/headings                                          |
| 4 | HTML Settings       | Subform (`Utilities-HTML`) for configuring HTML export templates and paths                            |
| 5 | Remove Empty Heats  | Subform (`Utilities 2`) for cleaning up heats with no competitors                                    |
| 6 | Copy Competitors    | Subform (`CopyCompetitorsBetweenEvents`) for copying competitor enrollments between events            |
| 7 | Backup              | Backup path configuration, BackupToCarnivalPath checkbox, manual backup trigger                       |

**Misc tab operations:**
- **Delete All Competitors:** `DELETE FROM Competitors` — use when re-importing from fresh file
- **Clear All Results:** `DELETE FROM CompEvents` — removes enrollments but keeps competitor records
- **Reset All Events:** Sets all heats back to incomplete, first final levels to Active, others to Future
- **Recreate All Heats:** Clears competitors from events, re-runs `AutomaticallyCreateHeatsAndFinals`, clears event numbers
- **Reset Points:** Clears all extra house points

All destructive operations require confirmation dialogs.

**Web equivalent:** `/admin/utilities` page. Destructive operations become API endpoints with confirmation modals. Substitution tables become an `/admin/settings` or `/admin/labels` page.

---

## 6. Form Interaction Patterns

### 6.1 Master–Detail Navigation

The application consistently uses a **summary list → detail dialog** pattern:

```
Summary Form (ListBox)          Detail Form (Dialog)
─────────────────────           ────────────────────
CompetitorsSummary     ──►      Competitors
EventTypeSummary       ──►      EventType / EventType-Wizard
House Summary          ──►      Houses
CompEventsSummary      ──►      EnterCompetitors
PointScale             ──►      PointScaleSubform / PointScale Add
```

**Pattern:**
1. Summary form shows a ListBox bound to a query
2. Double-click or Edit button opens detail form as `acDialog` with a WHERE filter (`[PK] = selectedValue`)
3. Detail form loads filtered record(s) for editing
4. On close, summary form requeries its ListBox

**Web equivalent:** List pages with rows linking to `/resource/:id` detail pages. Use client-side navigation; requery is replaced by API refetch or optimistic UI update on return.

### 6.2 Modal Confirmation Dialogs

The `PromoteEvents` form exemplifies the custom confirmation pattern:

```
Caller                                 PromoteEvents Dialog
──────                                 ────────────────────
GlobalCancel = True                    Opens with message via OpenArgs
DoCmd.OpenForm "PromoteEvents"         User clicks Yes → GlobalCancel=False
  (acDialog blocks caller)             User clicks No  → GlobalNo=True
                                       User clicks Cancel → form closes
If Not GlobalCancel Then ...           "Yes to all" checkbox → skip future prompts
```

Global variables `GlobalCancel`, `GlobalNo`, and `GlobalVariable` serve as return channels from modal dialogs.

**Web equivalent:** Use JavaScript `await` with a modal dialog component. Return values via Promises rather than global variables.

### 6.3 Progress Feedback

Long operations use a two-tier feedback system:

1. **PleaseWait form:** shown/hidden via macros for simple "working…" indication
2. **Status bar meter:** `SysCmd(acSysCmdInitMeter, message, total)` for operations with known iteration counts (e.g., promoting events, updating records)
3. **Hourglass cursor:** `ShowHourGlass()` / `HideHourGlass()` with reference counting for nested operations

**Web equivalent:** Replace with:
- Spinner/loading overlay for quick operations
- Progress bar component with percentage for batch operations
- Server-Sent Events or polling for long-running server tasks

### 6.4 Search-as-you-type

`CompetitorsSummary` and `EventTypeSummary` implement keyboard-driven search:

```
KeyDown event:
  Character key → append to search buffer → ScrollSummary(buffer)
  Backspace     → remove last char from buffer → ScrollSummary(buffer)
  Escape        → close form
  Delete        → delete selected item
  Enter         → open selected item
```

`ScrollSummary` finds the first ListBox entry whose display text starts with the buffer string.

**Web equivalent:** A standard search/filter input above the list. Filter client-side for small datasets, or debounced server-side search for large ones.

### 6.5 Subform Linking

Access subforms use `LinkChildFields` / `LinkMasterFields` to synchronise parent–child data:

| Parent Form | Subform | Link Fields |
|-------------|---------|-------------|
| `EventType` | `ET_Sub1` (divisions) | `ET_Code` |
| `EventType` | `ET_Sub2` (heats) | `ET_Code` + selected division |
| `EnterCompetitors` | `EC_Subform` | `E_Code`, `Heat`, `F_Lev` |
| `Houses` | `House Points-Extra SF` | `H_ID` |
| `PointScale` | `PointScaleSubform` | Selected scale name |
| `Competitors` | `Competitors Subform` | `PIN` |

**Web equivalent:** Parent component passes IDs to child components via props/URL params. Child components fetch their own data filtered by parent context.

---

## 7. Navigation Graph

### 7.1 Primary Navigation Flow

```
                              ┌─────────────┐
                              │  Main Menu   │
                              │  (Hub)       │
                              └──────┬───────┘
          ┌──────────┬──────────┬────┴────┬──────────┬──────────┐
          ▼          ▼          ▼         ▼          ▼          ▼
     Carnivals   Competitors  Events   Results    Reports   Utilities
     Maintain    Summary      Summary  (CompEvt   Event/     (Tabbed)
                                       Summary)   Stats
```

### 7.2 Detailed Form Graph

```
Carnivals Maintain ──► Carnival Copy
                   ──► CompEventsSummary (post-activate)

Setup Carnival ──► (tabbed subforms for settings)

CompetitorsSummary ──► Competitors (ADD/EDIT)
                   ──► Competitors Bulk Maintain
                   ──► Competitor-Check (validation)

EventTypeSummary ──► EventTypeCopy (ADD/COPY)
                 ──► EventType-Wizard (post-add)
                 ──► EventType (EDIT)
                       ├──► Final_lev (Setup Heats)
                       └──► Lane Promotion Allocation

CompEventsSummary ──► EnterCompetitors (per heat)
                  ──► PromoteEvents (confirmation)
                  ──► CompetitorsSummary

EnterCompetitors ──► Temporary Results-Place Order
                 ──► CompetitorsSummary (maintain)
                 ──► Competitor-QuickAdd (not-in-list)
                 ──► EventRecordHistory

Reports_Event ──► (opens Access reports)
Statistical Reports ──► (opens Access reports)
                    ──► HTML export

ReportsPopUp ──► (manages open report windows)

Utilities ──► CopyCompetitorsBetweenEvents (tab)
          ──► Lane/Final/Gender substitution (tabs)

House Summary ──► Houses (ADD/EDIT)
              ──► Lanes
              ──► House Points-Extra

PointScale ──► PointScale Add
           ──► PointScaleSubform

ExportData ──► (file system output)
Import Data ──► (file system input)
Import Competitors ──► (file system input)
```

---

## 8. Global UI State

### 8.1 Global Variables Used for UI Communication

| Variable | Type | Purpose |
|----------|------|---------|
| `GlobalCancel` | Boolean | Return channel from modal dialogs — True = cancelled |
| `GlobalNo` | Boolean | Return channel — True = user clicked No |
| `GlobalVariable` | Variant | Return channel — carries a value (e.g., new record PK, selected name) |
| `GlobalChange` | Boolean | Dirty flag — set True by any AfterUpdate event on competitor fields |
| `HourGlassCount` | Integer | Reference counter for nested hourglass calls |
| `m_blResize` | Boolean | Guard against recursive resize events |
| `DevelopmentModeSet` | Boolean | Tracks whether developer UI is visible |
| `PleaseWaitMsg` | String | Message to display in PleaseWait form |
| `DoUpdateEventCompetitorAge` | Boolean | Deferred flag — update ages on form close |

**Web equivalent:** Replace global variables with:
- Modal dialog return values via Promises / callbacks
- Component-level state (framework-managed component state)
- Application state store for cross-component communication

### 8.2 Custom Message Box

The application uses `MsgBox2()` as an enhanced message box:

```vb
Public Function MsgBox2(Prompt, Optional Buttons, Optional Title) As Long
  DoCmd.OpenForm "MsgboxForm", , , , , acDialog, Buttons & "|" & Title & "|" & Prompt
  MsgBox2 = ReturnVar
End Function
```

This opens a custom form (styled like a standard MsgBox) and returns the user's choice via the `ReturnVar` global.

**Web equivalent:** A reusable confirmation/alert modal component that returns a Promise resolving to the user's choice.

---

## 9. Web Application Page Map

The following table maps the Access form inventory to a proposed web page/route structure:

| Route | Page Title | Source Form(s) | Key Components |
|-------|-----------|----------------|----------------|
| `/` | Dashboard | `Main Menu` | Nav cards, progress chart, active carnival display |
| `/carnivals` | Carnivals | `Carnivals Maintain` | Table with CRUD, active carnival indicator |
| `/carnivals/new` | New Carnival | `Carnival Copy` | Form: name, copy-from selector |
| `/carnivals/:id/setup` | Carnival Setup | `Setup Carnival` + tabs | Tabbed settings pages |
| `/teams` | Teams | `House Summary` | Table with CRUD buttons |
| `/teams/:id` | Team Detail | `Houses` | Form: code, name, details, pool; extra points table |
| `/teams/:id/lanes` | Lane Allocation | `Lanes` | Editable lane-team mapping grid |
| `/competitors` | Competitors | `CompetitorsSummary` | Searchable table, bulk actions menu |
| `/competitors/new` | Add Competitor | `Competitors` (ADD mode) | Form: name, DOB, age, sex, team |
| `/competitors/:id` | Edit Competitor | `Competitors` (EDIT mode) | Form + event participation table |
| `/competitors/import` | Import Competitors | `Import Competitors` | File upload, preview table, import action |
| `/competitors/bulk` | Bulk Edit | `Competitors Bulk Maintain` | Editable grid |
| `/competitors/check` | Data Validation | `Competitor-Check` | Table of competitors with incomplete data |
| `/events` | Event Types | `EventTypeSummary` | Table with CRUD buttons |
| `/events/new` | Add Event Type | `EventTypeCopy` + `EventType-Wizard` | Multi-step form |
| `/events/:id` | Edit Event Type | `EventType` | Form + divisions/heats subpanels |
| `/events/:id/heats` | Setup Heats | `Final_lev` | Editable heats/finals list, create button |
| `/events/:id/lane-promotion` | Lane Promotion | `Lane Promotion Allocation` | Place-to-lane mapping grid |
| `/events/order` | Event Order | `EventOrder` | Sortable table, drag-and-drop or number editing |
| `/results` | Results Hub | `CompEventsSummary` | Filterable heat grid, promotion controls |
| `/results/:heatId/enter` | Enter Results | `EnterCompetitors` | Editable competitor grid, calculate actions |
| `/results/copy` | Copy Competitors | `CopyCompetitorsBetweenEvents` | From/To event selectors, copy action |
| `/reports/events` | Event Reports | `Reports_Event` | Filter controls, report generation buttons |
| `/reports/statistics` | Statistical Reports | `Statistical Reports` | Checkbox matrix, event/team selectors, generate/export |
| `/point-scales` | Point Scales | `PointScale` | List with CRUD, place-points detail grid |
| `/admin/utilities` | Utilities | `Utilities` | Tabbed panel: substitutions, maintenance, titles, backup |
| `/admin/settings` | Settings | `Utilities-HTML`, `Setup Carnival` settings | Label substitutions, HTML/export config |
| `/about` | About | `About` | Version info, attribution |

### 9.1 Route Guarding

All routes except `/` and `/about` require an active carnival in context. If no carnival is selected, redirect to `/carnivals`.

Operations on the Misc tab of Utilities (Delete All Competitors, Reset All Events, etc.) should require an Admin role confirmation — see Spec Doc 10 for role definitions.

---

## 10. UI Helper Functions (Module Reference)

These utility functions from the Access modules need web equivalents:

| Access Function | Module | Purpose | Web Equivalent |
|----------------|--------|---------|----------------|
| `ShowHourGlass()` / `HideHourGlass()` | `_Common Functions - Application` | Nested loading indicator | Loading state counter in app store |
| `MsgBox2()` | `_Common Functions - Application` | Custom confirmation dialog | Async modal component |
| `glrMinWindowSize()` | `_Common Functions - Application` | Enforce minimum form dimensions | CSS `min-width` / `min-height` |
| `DontUseWheelMouse()` | `_Common Functions - Application` | Prevent scroll-wheel navigation | Not needed (web forms don't have this issue) |
| `UserMode()` | `_Common Functions - Application` | Toggle developer UI visibility | Role-based conditional rendering |
| `DisplayErrMsg()` | `_Common Functions - Error Messages` | Contextual error display | Global error handler / toast notifications |
| `AddToFilter()` | `_Common Functions - String` | Build WHERE clause strings | Query builder / ORM filter chaining |
| `StringParse()` | `_Common Functions - String` | Extract nth delimited item | `String.split()[n]` |
| `BrowseFolder()` | `API Calls - Open Folder` | Windows folder picker | File input with `webkitdirectory` or server-side path config |
| `GetOpenFile()` | `API Calls - Open-Save File Dialog` | Windows file picker | `<input type="file">` |
| `CreateReportShortcutMenu()` | `ReportPopup Routines` | Custom right-click menu for reports | Context menu component |
| `ScrollSummary()` | `CompetitorsSummary` | Search-as-you-type in list | Search input with filter |

---

## 11. Form Window Modes Reference

The Access application uses specific window modes that affect user interaction:

| Mode | Access Constant | Behaviour | Web Equivalent |
|------|----------------|-----------|----------------|
| Normal | `acWindowNormal` | Non-blocking, user can interact with other forms | Standard page navigation |
| Dialog | `acDialog` | Modal — blocks caller until closed | Modal overlay or dedicated route with "back" navigation |
| Popup | n/a (form property) | Stays on top of Access window | Fixed-position panel or toast |
| Hidden | `acHidden` | Form loaded but not visible | Background data fetch (no UI) |

---

## 12. Cross-Reference to Other Documents

| Topic | Document |
|-------|----------|
| Carnival settings and configuration forms | Doc 03 — Carnival Lifecycle |
| Competitor data fields and validation rules | Doc 04 — Competitor Management |
| Heat/event structure managed through EventType/Final_lev forms | Doc 05 — Events & Heats |
| Result parsing triggered from EnterCompetitors form | Doc 06 — Results & Scoring |
| Report generation triggered from Reports_Event / Statistical Reports | Doc 07 — Reporting |
| Export forms and Meet Manager integration | Doc 08 — HTML Export & Data Exchange |
| Authentication, roles, and route guarding | Doc 10 — Deployment & Security |
