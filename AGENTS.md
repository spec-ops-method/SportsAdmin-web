# AGENTS.md

## Workflow requirements

- Read `spec/00-platform-translation-notes.md` before any other spec document.
- Change the spec before changing code. Update the relevant `spec/` document(s) and merge the change first — the spec-ops workflow (`.github/workflows/spec-ops.yml`) creates a tracking issue automatically. Implement against the updated spec, referencing that issue.
- If asked to implement a feature not in the spec, update the spec first.
- Before marking any feature complete, verify it against `spec/12-functional-parity-tests.md`. If the feature isn't in Doc 12, add it there first.
- Do not close spec-change tracking issues until the corresponding implementation is complete and verified.

## Project-specific context

Do not build:
- The static HTML export system (`MiscHTML`, `tblReportsHTML`, `.htm` template files) — the web app serves results directly via URLs.
- Access staging/temp tables (`TEMP1`, `EVERYONE1`, `ImportData`, `Competitors-Temp`, etc.) — process in memory instead.
- Access-specific plumbing (`_AlwaysOpen`, `Inventory Attached Tables`, `USysRibbons`, runtime schema checks).

The `legacy/` directory is a git submodule of the original Access application. Use it for reference only.

## Commit Message Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
type: description

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Code Quality

- Write tests for new functionality
- Follow language-specific conventions (see instruction files)
- Keep commits atomic and reviewable