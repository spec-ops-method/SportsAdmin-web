# Using AI to Reverse-Engineer a Legacy Application into a Modern Software Specification

## The Starting Point: A 25-Year-Old Access Application

Sports Administrator is an open-source application for managing school [athletics and swimming carnivals in Australia](https://en.wikipedia.org/wiki/Sports_carnival). Originally developed around 2000 by Andrew Rogers as a commercial Microsoft Access 97 application, it was later open-sourced and migrated to Access 2010+ by [James Rudd](https://github.com/ruddj), who had been using it to run his school's carnivals since 2001.

Despite its age and outdated technology stack, Sports Administrator is a surprisingly capable piece of software. It handles the full lifecycle of a school sports carnival — creating events, registering competitors, entering results, calculating places and points, promoting athletes through heats to finals, tracking records, and producing printed and web-published reports. It supports both athletics (track and field) and swimming carnivals, handles multiple final levels with automated promotion algorithms, and can export data to industry-standard timing systems.

The goal of the initial phase of work was to take this legacy application and produce a specification detailed enough to rebuild it on a modern web stack — and to accelerate that process with AI assistance.

## Why This Legacy System Was a Good Candidate Project

Not every legacy system is created equally. Sports Administrator has several things going for it.

The code is well-structured. The VBA codebase is organized into logical modules — separate files for event routines, carnival linking, result calculation, reporting, and so on. The Access database uses a clean split-database architecture, with a main application database and separate per-carnival data files. There are 90+ saved queries, 30+ reports, and 40+ forms — all named clearly enough to deduce their purpose.

The project was well-documented. [The GitHub repository](https://github.com/ruddj/SportsAdmin) includes a [comprehensive wiki](https://github.com/ruddj/SportsAdmin/wiki) with page-by-page guides covering installation, carnival creation, team setup, point scale configuration, event management, competitor import, result entry, report generation, and Meet Manager integration. This wiki is super valuable — not just for understanding the system, but for its potential use later in validating that our specification accurately captured the application's behavior.

The domain is bounded. School sports carnival management is a well-defined domain with clear terminology, predictable workflows, and finite scope. There is no ambiguity about what the system is supposed to do — it runs carnivals for schools. That clarity made it much easier to produce a complete specification.

This is a point worth emphasising: the quality of the existing documentation and code organization directly affected the quality of the specification we were able to produce — and the speed at which we could produce it. The entire specification took roughly 4–5 hours of collaborative work. That speed was a direct result of having clear code and comprehensive documentation to work from.

### What If Your Legacy System Isn't Well-Documented?

Many legacy systems are not this fortunate. Documentation may be sparse, outdated, scattered across wikis and email threads, or simply nonexistent. It may exist only as tribal knowledge in the heads of a few people who built or maintained the system years and years ago.

This doesn't make the process impossible — it makes it different and a bit harder. If you're facing a poorly documented legacy system, there are strategies you can use to fill the gaps:

- Interviews with subject matter experts — people who built, maintained, or use the system daily often carry knowledge that was never written down. Structured interviews can surface business rules, edge cases, and workflow expectations that the code alone won't reveal.
- Aggregating fragmented documentation — even undocumented systems often have *some* artifacts: README files, inline code comments, issue trackers, old emails, training materials, or user-facing help text. Pulling these fragments together gives your AI tools a richer context to work from.
- Exploratory testing — running the legacy application and systematically exercising its features can reveal behavior that isn't documented anywhere. Screen recordings or annotated screenshots can then serve as reference material.
- Incremental specification — rather than trying to specify the entire system at once, start with the best-understood areas and expand outward. Each completed spec document builds context that makes the next one easier.

The key point is that the AI tools can work with whatever context you provide — but the less context it has, the more a human needs to fill in, validate, and correct. Well-documented systems let the AI do more of the heavy lifting. Poorly documented systems shift more of the burden to the human collaborator, but the process still works.

## Process Overview

The entire specification was produced over approximately 4–5 hours of collaborative work between a human and an AI assistant (Claude Opus 4.6, working in VS Code via GitHub Copilot). It's worth noting, however, that even a process to generate a comprehensive specification that takes four to five days (or even four to five weeks) could be easily justified if it served as the foundation for modernizing a critical legacy system.

Here's how it went.

### Step 1: Exploration and Understanding

We started by having the AI examine the source code — VBA modules, form definitions, table structures, saved queries, and report layouts — alongside the project's GitHub wiki. The goal was to build a mental model of the system before writing anything.

The AI read through the codebase systematically: the startup routines, the carnival linking logic, the event and heat management modules, the result parsing engine, the reporting queries, and the export routines. It cross-referenced what it found in the code with the user-facing documentation in the wiki.

This exploration phase was where the wiki really proved its value. The code told us *how* things worked; the wiki told us *why* and *what users expected*. Together they provided a much more complete picture than either source alone.

### Step 2: Establishing a Modular Document Strategy

Rather than producing a single monolithic specification, we chose to break it into a set of modular documents, each covering a bounded functional domain. This was a deliberate design decision driven by three considerations:

1. Human review — reviewers shouldn't need to read a 200-page document to check whether the competitor import rules are correct. They should be able to open the competitor management spec and find everything they need.

2. AI context window management — every AI model has a finite context window — a limit on how much text it can process at once. A single massive specification document risks exceeding that limit or diluting the model's attention with irrelevant detail. By keeping each document focused on a single domain, we ensured that an AI coding assistant could load the relevant spec document(s) alongside the implementation code it was working on, without bumping up against context limits. This is a practical constraint that directly affects output quality: when an AI's context is overloaded, it starts losing track of details, producing inconsistencies, or ignoring instructions buried deep in the input.

3. AI implementation — beyond context limits, modular documents make AI-assisted development more effective in general. An AI working on competitor import doesn't need to know about report formatting. Scoping the context to what's relevant produces better, more focused output.

We settled on thirteen documents, each self-contained, with cross-references to related documents where needed.

### Step 3: Systematic Document Authoring

We then worked through each spec document one at a time. For each domain, the AI would:

- Read the relevant VBA modules and form code
- Read the relevant wiki pages
- Examine the database table structures and saved queries
- Draft the specification, capturing business rules, validation logic, processing steps, data structures, and edge cases
- Present the draft for human review

The human's role was to guide priorities, validate domain understanding, catch misinterpretations, and make judgment calls about how Access-specific behaviors should translate to a web context.

The thirteen documents we produced were:

| Document | Scope |
|:----------|:-------|
| Platform Translation Notes | Cross-cutting decisions for Access → web migration; phased build order |
| Index & Overview | System purpose, architecture, glossary, conventions |
| Data Model | Complete database schema (~30 tables) with columns, types, relationships, constraints |
| Carnival Lifecycle | Carnival CRUD, settings, house/team management, backup, import/export |
| Competitor Management | Registration, CSV import, bulk operations, age calculation, validation |
| Events & Heats | Three-tier event hierarchy, final levels, heat generation, promotion algorithms |
| Results & Scoring | Result parsing engine, place calculation, point scales, record detection |
| Reporting | All reports as data query specifications |
| HTML Export & Data Exchange | HTML export, Meet Manager integration, carnival disk exchange |
| UI & Navigation | Screen inventory, navigation flows, form-by-form translation guidance |
| Deployment & Security | Authentication, roles, environment configuration |
| System Overview | High-level description for newcomers |
| Functional Parity Tests | 145 testable functions for verifying the rebuilt system |

### Step 4: Identifying What Changes When We Move to Modernization

As we worked through the specification, we identified places where the original desktop behavior doesn't translate directly to a web application. The most significant example was HTML export — the original Access app exports reports as static HTML files for publishing on a school intranet. In a web application, that's largely redundant because the app *is* the web interface. We annotated the spec accordingly rather than pretending the requirement still existed unchanged.

This kind of judgment — knowing what to preserve, what to adapt, and what to mark as unnecessary — required human input. The AI could identify the technical facts, but deciding what mattered for the new system required understanding the users and their context.

### Step 5: Making the Spec Technology-Agnostic

Our initial drafts referenced specific notional technologies (Node.js, PostgreSQL) as the target stack. This was useful because we wanted to frame the spec generation task for the AI tool, to give it a sense of what our overall objective was. This seemed to help, but then we ended up with specific technology choices referenced in different parts of the spec documents. So we then revised all documents to be technology-stack agnostic — replacing framework-specific references with generic terms like "server-side application framework" and "relational database." This made the spec useful regardless of which modern stack someone chooses for the rebuild.

Now, whether a new version of this application targets Node.js, or Ruby, or Python, or the .NET framework is completely up to whomever leverages the generated specification. The specification itself should do its absolute best to describe what the system does in technology-agnostic terms. How the functions of the system get implemented in a specific technology stack is an implementation detail.

### Step 6: Preparing for Ongoing Use

Finally, we added infrastructure to support specification-first development — the practice of updating the spec before changing the code. We added:

- [A README](spec/README.md) serving as a contributor guide with the spec-first workflow, instructions for adding/modifying/removing features, and guidance for using the documents with AI coding tools
- `Last Updated` metadata on every document for change tracking
- [A functional parity test list](spec/12-functional-parity-tests.md) (145 items) that serves as both a rebuild verification checklist and a living inventory of system capabilities
- [A GitHub action that supports spec-first development](https://github.com/spec-ops-method/spec-ops-action), which creates a new issue in the GitHub repository for this work, any time one of the spec documents changes and that change is committed to the repo.

## What We Learned

**Documentation quality impacts speed, not feasibility**. The single most important factor in the quality and speed of our AI-generated specification was the quality of the existing documentation. The legacy project wiki gave us user-facing context that the code alone couldn't provide, and it let us complete the work in roughly 4–5 hours. 

But poor documentation doesn't make this process impossible — it makes it slower and shifts more responsibility to the human collaborator. Strategies like interviewing subject matter experts, aggregating fragmented documentation, and exploratory testing can compensate for gaps. The AI can work with whatever context you give it; the question is how much of that context-gathering falls on the human versus being already available in existing docs.

**Modular spec documents beat monoliths**, and respect AI constraints. Breaking the spec into bounded documents made the work manageable for both humans and AI. Each document could be drafted, reviewed, and revised independently. Equally important, keeping documents focused and bounded respects the context window limits of AI tools. Overloading an AI with a single massive document degrades output quality. Smaller, domain-specific documents produce better results during both specification and implementation.

**The AI is fast at extraction; the human is essential for judgment**. The AI excelled at reading code and producing structured documentation from it — extracting table structures, tracing logic through VBA modules, identifying validation rules, and formatting everything consistently. The human was essential for deciding what mattered, catching domain misunderstandings, and making translation decisions that required understanding the users and their context.

Spec-first pays forward. By establishing the spec documents as the living source of truth — not just initial blueprints — we set up a development practice where future changes start with a spec update, then (and only then) a code change. This makes every change reviewable, testable, and unambiguous, whether the implementation is done by a human developer, an AI coding assistant, or both. This will ensure that the new system and the documentation describing how and why that system works the way it does are never out of alignment.

## The Result

The output is a suite of 13 specification documents that capture the complete behavior of a 25-year-old Microsoft Access application in enough detail to rebuild it on any modern web stack. The process took roughly 4–5 hours of human-AI collaboration — a fraction of what manual specification writing would have required.

[The specification is available in the project repository](https://github.com/spec-ops-method/SportsAdmin-web) and will serve as the foundation for building a modern web version of Sports Administrator, which will be the next phase of the project.
