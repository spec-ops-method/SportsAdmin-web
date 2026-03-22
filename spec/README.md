# Sports Administrator — Specification Suite

This directory contains the authoritative specification for Sports Administrator. These documents serve two purposes:

1. **Initial build** — describe the system in enough detail to rebuild it on a modern web stack.
2. **Ongoing development** — act as the living source of truth for how the system works. All changes to the system begin here.

---

## Document Index

| # | Document | Scope |
|---|----------|-------|
| 00 | [Platform Translation Notes](00-platform-translation-notes.md) | Cross-cutting decisions for Access → web migration; build order |
| 01 | [Index & Overview](01-index-and-overview.md) | Purpose, architecture, glossary, conventions |
| 02 | [Data Model](02-data-model.md) | All entities, attributes, types, relationships, constraints, seed data |
| 03 | [Carnival Lifecycle](03-carnival-lifecycle.md) | Carnival CRUD, settings, houses, backup, import/export |
| 04 | [Competitor Management](04-competitor-management.md) | Registration, CSV import, bulk ops, age calculation, validation |
| 05 | [Events & Heats](05-events-and-heats.md) | Event hierarchy, final levels, heat generation, promotion, lanes |
| 06 | [Results & Scoring](06-results-and-scoring.md) | Result parsing, place calculation, point scales, record detection |
| 07 | [Reporting](07-reporting.md) | All reports as data query specifications |
| 08 | [HTML Export & Data Exchange](08-html-export-and-data-exchange.md) | HTML export, Meet Manager integration, carnival disk exchange |
| 09 | [UI & Navigation](09-ui-and-navigation.md) | Screen inventory, navigation, user task flows |
| 10 | [Deployment & Security](10-deployment-and-security.md) | Auth, roles, environment config, deployment, backup |
| 11 | [System Overview](11-system-overview.md) | High-level description of the system for newcomers |
| 12 | [Functional Parity Tests](12-functional-parity-tests.md) | 145 testable functions for verifying the rebuilt system |

---

## Spec-First Development Workflow

This project follows **specification-first development**. The spec documents are not just initial blueprints — they are the living, authoritative description of what the system does and how it behaves.

### The Rule

> **Change the spec first, then change the code.**

Every functional change — new feature, behaviour modification, bug fix that alters expected behaviour — follows this sequence:

```
1. Propose the change in the relevant spec document(s)
2. Review and approve the spec change
3. Implement the code to match the updated spec
4. Verify the implementation against the spec
5. Update Doc 12 (Functional Parity Tests) if the change adds, removes, or modifies a testable function
```

### Why Spec-First?

- **Shared understanding** — the spec is readable by humans, AI coding tools, and reviewers. Everyone works from the same definition.
- **AI-ready** — an AI coding assistant can be given one or more spec documents and produce an implementation without ambiguity.
- **Change impact is visible** — a diff to a spec document makes the scope of a change clear before any code is written.
- **Testability** — Doc 12 provides a concrete checklist. If a feature isn't in the spec and test list, it shouldn't be in the code. If it should be in the code, it should be in the spec first.

---

## How to Make Changes

### Adding a New Feature

1. **Doc 02 (Data Model)** — if the feature requires new tables or columns, add them here first. Include column names, types, constraints, and relationships.
2. **Domain doc (03–08)** — add the business rules, validation, processing logic, and API contract to the relevant domain document. Follow the existing patterns: input tables, processing steps, response format, error conditions.
3. **Doc 09 (UI & Navigation)** — if the feature introduces new screens or modifies navigation flows, update the screen inventory and task flows.
4. **Doc 12 (Functional Parity Tests)** — add numbered test items describing each user-facing operation the feature introduces. Include expected behaviour.
5. **Doc 11 (System Overview)** — if the feature changes what the system fundamentally does (not just how), update the overview.
6. **Doc 10 (Deployment & Security)** — if the feature has security, auth, or infrastructure implications, document them.

### Modifying Existing Behaviour

1. **Find the current spec** — locate the section(s) in the domain doc that describe the behaviour being changed.
2. **Update in place** — modify the spec text to reflect the new behaviour. Do not delete the old text without reason — if the change is significant, add a brief note (e.g., "Changed in v2.1: previously X, now Y").
3. **Update Doc 12** — revise the expected behaviour description for affected test items.
4. **Update the `Last Updated` field** in the metadata block of every document you changed.

### Removing a Feature

1. **Mark as deprecated** in the relevant domain doc rather than deleting the section outright. Prefix the section heading with `[DEPRECATED]` and add a note explaining when and why it was removed.
2. **Update Doc 12** — mark the corresponding test items as `[REMOVED]` with a note.
3. **Update Doc 11** if the removal changes the system's fundamental capabilities.
4. Features marked deprecated may be deleted from the spec in a future cleanup pass after the code has been updated.

---

## Document Conventions

All spec documents follow consistent structural patterns. Maintain these when making changes.

### Metadata Block

Documents 01, 09, and 10 have a metadata table at the top. All documents have a `Last Updated` field tracking the most recent revision date.

### Section Patterns

| Pattern | Used For | Example |
|---------|----------|---------|
| **Input table** | Defining fields for a create/update operation | Field, Type, Required, Validation columns |
| **Processing steps** | Describing business logic | Numbered list of steps the system performs |
| **Response format** | API output | JSON or table showing returned fields |
| **Error table** | Validation/error cases | Condition, Status, Message columns |
| **Pseudocode block** | Algorithms | Fenced code block with language-neutral logic |
| **Test vectors** | Verifying parsing/calculation | Input → Expected Output tables |

### Cross-References

- Reference other documents with relative links: `[Document 2](02-data-model.md)`
- Reference specific sections: `See Document 5 §3.2`
- When a section depends on another document's content, note this in the italicised preamble at the top of the document

---

## Using These Documents with AI Coding Tools

The documents are designed to be loaded by an AI coding assistant as context for implementation tasks. Recommendations:

| Task | Load These Documents |
|------|---------------------|
| Set up the database schema | 00, 02 |
| Implement carnival management | 00, 01, 02, 03, 09 (§Carnival screens) |
| Implement competitor features | 00, 01, 02, 03, 04, 09 (§Competitor screens) |
| Implement events and heats | 00, 01, 02, 03, 05, 09 (§Event screens) |
| Implement results and scoring | 00, 01, 02, 05, 06, 09 (§Results screens) |
| Implement reporting | 00, 01, 02, 07 |
| Implement exports/integrations | 00, 01, 02, 08 |
| Set up deployment and auth | 10 |
| Verify completeness | 12 |
| Understand the system (onboarding) | 11, 01 |

For the recommended build order during initial development, see Document 00 §12.

---

## History

This specification suite was created in March 2026 through a systematic analysis of the original Sports Administrator codebase (Microsoft Access 2010+ / VBA) and its GitHub wiki. The process followed these steps:

Time spent: ~4-5 hours
Models used: Claude Opus 4.6

1. **Project analysis** — examined the source code (VBA modules, forms, tables, queries, reports) and project wiki to understand the system.
2. **Spec strategy** — established a modular document structure where each document covers a bounded domain and is self-contained enough for an AI coding assistant to work with independently.
3. **Document authoring (Docs 00–10)** — systematically wrote eleven specification documents covering every aspect of the system.
4. **Redundancy identification** — identified that HTML export becomes partially redundant in a web application and annotated the specs accordingly.
5. **Technology neutrality** — revised all documents to be stack-agnostic, removing references to specific frameworks and databases so the specs are useful for any modern web stack.
6. **Overview and test list (Docs 11–12)** — produced a high-level system overview and a checklist of 145 testable functions for verifying functional parity.