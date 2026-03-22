# SportsAdmin-web

A modern web application rebuild of [Sports Administrator](https://github.com/ruddj/SportsAdmin), an open-source school athletics and swimming carnival management system.

## Background

Sports Administrator was originally developed around 2000 by Andrew Rogers for Christian Outreach College, Brisbane. It was commercially distributed as a Microsoft Access 97 application before being open-sourced and migrated to Access 2010+ by James Rudd in 2017. The application manages the complete lifecycle of a school sports carnival — event setup, competitor registration, results entry, automatic place and points calculation, promotion through heats to finals, record tracking, and reporting.

The goal of this project is to rebuild Sports Administrator as a modern web application while preserving full functional parity with the original.

## Repository Structure

```
├── spec/          # Authoritative software specification (13 documents)
├── legacy/        # Original Access application (git submodule)
└── README.md
```

### `spec/`

Contains a comprehensive, modular specification suite that describes the existing system in enough detail to rebuild it on a modern web stack. The spec covers the data model, carnival lifecycle, competitor management, events and heats, results and scoring, reporting, HTML export, UI flows, deployment, and security. It includes 145 testable functions for verifying the rebuilt system against the original.

This project follows **spec-first development** — all functional changes are documented in the spec before they are implemented in code. See [spec/README.md](spec/README.md) for the full workflow and document index.

### `legacy/`

A git submodule pointing to the [original SportsAdmin repository](https://github.com/ruddj/SportsAdmin). This provides direct access to the Access database source for reference during development.

## What the Application Does

Sports Administrator handles school athletics and swimming carnivals for Australian schools, supporting both intra-school (inter-house) and inter-school competitions. Key capabilities:

- **Carnival setup** — create carnivals, define teams/houses, configure point scales, set up events in a three-tier hierarchy (event type → division → heat)
- **Competitor management** — manual entry, quick add, and bulk CSV import with validation and duplicate detection
- **Results entry** — flexible input parsing for times, distances, and special tokens (FOUL, PARTICIPATE) with automatic place calculation and tie handling
- **Scoring** — configurable point scales mapping places to points, with different scales for heats vs. finals
- **Promotion** — automated advancement of competitors through final levels (quarter-finals → semi-finals → grand final) with smooth and staggered methods
- **Record detection** — automatic alerts when a result breaks a standing record
- **Reporting** — team standings, cumulative results, event results, competitor cards, records, marshalling lists, and administrative reports
- **HTML export** — static website generation for publishing results via template-based rendering
- **External integration** — carnival disk exchange for inter-school events and Hy-Tek Meet Manager export for district/regional competitions

## License

MIT