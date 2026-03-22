# Sports Administrator — Software Specification

## Document 10: Deployment & Security

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| **Spec Document**  | 10                                         |
| **Domain**         | Authentication, authorisation, environment configuration, deployment, backup, operational concerns |
| **Access Objects** | `Security.bas`, `Database Maintenance.bas`, `_Startup.bas`, `CarnivalLinking.bas`, `Setup.nsi` |
| **Last Updated**   | 2026-03-20                                 |

---

## 1. What to Discard from the Access Application

The original desktop application has no authentication, no network deployment, and no multi-user access control. The following Access-specific infrastructure has **no equivalent** in the web rebuild and should not be reimplemented:

| Access Feature | Module/File | Why Irrelevant |
|---|---|---|
| Trusted Locations registry manipulation | `Security.bas` — `AddTrustedLocation()`, `DelTrustedLocation()` | Web apps don't use Windows registry |
| NSIS installer (setup wizard, UAC elevation) | `Setup.nsi`, `Sections.nsh`, `Uninstall.nsh`, `UninstallPages.nsh` | Deployed as a web service, not installed on desktops |
| Access Runtime detection | Installer checks for `msaccess.exe` | No dependency on Access Runtime |
| `.accdr` locked-down runtime mode | `SysCmd(acSysCmdRuntime)` checks | Application security is handled by auth, not file format |
| `UserMode()` — hide/show Access nav pane | `_Common Functions - Application.bas` | No database admin UI to hide; admin features are role-gated |
| Developer Mode toggle (`tgb_dev`) | Ribbon toggle button | Replace with role-based admin access |
| Database file-level operations (compact, attach, detach) | `Database Maintenance.bas`, `CarnivalLinking.bas` | Single relational database; no file linking |
| `Inventory Attached Tables` tracking | `CarnivalLinking.bas` | No linked external databases |
| `Wscript.Shell` COM automation | `Security.bas` | No COM/ActiveX in web apps |

---

## 2. Authentication

### 2.1 Requirements

| Requirement | Detail |
|---|---|
| Login required | All routes except public result views require authentication |
| Credential type | Email + password (minimum) |
| Password storage | Secure password hash (e.g., bcrypt, Argon2, scrypt); never store plaintext |
| Session management | Server-side sessions (with database-backed session store) or signed JWTs |
| Session lifetime | Configurable; default 8 hours of inactivity |
| OAuth (optional) | May support Google / Microsoft OAuth for school environments |
| Account recovery | Email-based password reset with time-limited token |

### 2.2 Users Table

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'coordinator', 'operator', 'viewer')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 Carnival Access Table

Users are assigned to one or more carnivals. All data access is scoped to the user's assigned carnivals.

```sql
CREATE TABLE user_carnivals (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  carnival_id INTEGER NOT NULL REFERENCES carnivals(id) ON DELETE CASCADE,
  UNIQUE (user_id, carnival_id)
);
```

**Rules:**
- Admin users can access all carnivals regardless of `user_carnivals` entries.
- Non-admin users can only access carnivals they are assigned to.
- The "active carnival" is stored in the user's session and can be switched via the UI.

---

## 3. Authorisation — Role Definitions

Four roles, from most to least privileged:

### 3.1 Admin

Full system access. Intended for IT staff or the application owner.

| Capability | Allowed |
|---|---|
| Create / delete carnivals | Yes |
| Manage users (create, assign roles, assign carnivals) | Yes |
| All Coordinator capabilities | Yes |
| Access Utilities destructive operations (delete all competitors, reset events) | Yes |
| View application settings and logs | Yes |

### 3.2 Coordinator

Full carnival setup and management. Intended for the carnival organiser.

| Capability | Allowed |
|---|---|
| Create / edit event types, heats, final levels | Yes |
| Import / manage competitors | Yes |
| Configure teams, point scales, carnival settings | Yes |
| Generate and view all reports | Yes |
| Promote events | Yes |
| Export data (carnival disks, Meet Manager) | Yes |
| All Operator capabilities | Yes |

### 3.3 Operator

Result entry during a live carnival. Intended for volunteers at the scoring table.

| Capability | Allowed |
|---|---|
| Enter / edit results for heats | Yes |
| View event lists, competitor lists | Yes |
| View reports | Yes |
| Modify carnival setup, competitors, events | No |
| Promote events | No |
| Access Utilities | No |

### 3.4 Viewer

Read-only access. Intended for spectators, teachers, or other stakeholders.

| Capability | Allowed |
|---|---|
| View results, reports, standings | Yes |
| View event lists, competitor lists | Yes |
| Modify any data | No |

### 3.5 Public Access (Unauthenticated)

Optionally, specific carnival result views can be made public without login:

| Route Pattern | Access |
|---|---|
| `/carnivals/:id/public/results` | Results summary by event |
| `/carnivals/:id/public/standings` | Team point standings |

Public routes serve **read-only** rendered pages. They are opt-in per carnival via a `public_access` boolean in `carnival_settings`.

### 3.6 Middleware Implementation

```
Every API request:
  1. Extract session/token → identify user
  2. If no valid session → 401 Unauthorized
  3. Look up user role
  4. Check route's required role against user role
  5. If route includes :carnival_id → verify user has access to that carnival
  6. If insufficient role or no carnival access → 403 Forbidden
  7. Attach user + carnival context to request → proceed
```

---

## 4. Environment Configuration

All deployment-specific values are provided via **environment variables**, never hardcoded.

### 4.1 Required Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@localhost:5432/sportsadmin` or equivalent for your database |
| `SESSION_SECRET` | Secret for signing sessions/JWTs | (random 64-char string) |
| `PORT` | HTTP listen port | `3000` |
| `APP_ENV` | Environment | `development` / `production` |

### 4.2 Optional Variables

| Variable | Description | Default |
|---|---|---|
| `SESSION_MAX_AGE_MS` | Session timeout in milliseconds | `28800000` (8 hours) |
| `PASSWORD_HASH_COST` | Hash cost factor (bcrypt rounds, Argon2 memory, etc.) | `12` |
| `CORS_ORIGIN` | Allowed CORS origin(s) | `*` in dev; specific domain in prod |
| `LOG_LEVEL` | Logging verbosity | `info` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiter window | `60000` (1 minute) |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `SMTP_HOST` | Mail server for password reset | — |
| `SMTP_PORT` | Mail server port | `587` |
| `SMTP_USER` | Mail credentials | — |
| `SMTP_PASS` | Mail credentials | — |
| `PUBLIC_URL` | Base URL for links in emails | `https://sportsadmin.example.com` |

### 4.3 Configuration Loading

Use an environment-variable loading mechanism appropriate to your stack (e.g., `.env` files, platform-specific config injection). In production, inject variables via the hosting platform's configuration system (e.g., cloud provider secrets manager, container environment variables).

The `.env` file MUST be listed in `.gitignore`.

---

## 5. Database Configuration

### 5.1 Connection Pooling

| Parameter | Recommendation |
|---|---|
| Pool library | Use your framework's built-in connection pool or a dedicated pooling proxy |
| Min connections | 2 |
| Max connections | 10 (adjust per expected concurrency) |
| Idle timeout | 30 seconds |
| Connection timeout | 5 seconds |

### 5.2 Schema Migrations

Use a versioned migration tool appropriate to your stack (e.g., Flyway, Liquibase, Alembic, ActiveRecord migrations, Prisma Migrate, Knex migrations, or raw SQL migration scripts).

**Rules:**
- Every schema change is a numbered migration file in source control.
- Migrations run automatically on deploy (before the app starts accepting traffic).
- Migrations are **forward-only** in production (no `down` migrations in prod).
- Seed data (lookup tables, initial admin user, default point scales) is applied via migrations.
- The Access-era inline schema checks (`EnsureDatabaseVersionIsCurrent`, `AddField`, `ChangeAgeFieldType`) are historical context only. Do not reimplement.

### 5.3 Seed Data

The following data should be inserted by the initial migration:

| Data | Source | Notes |
|---|---|---|
| Final statuses | `FinalStatus` table (4 rows) | Or use an enum in code |
| Promotion types | `Promotion` table (3 rows) | Or use an enum in code |
| Gender options | `Sex Sub` table (3 rows) | Or use an enum in code |
| Units | `Units` table (6 rows) | With sort direction |
| Final level labels | `Final Level Sub` table (8 rows) | Display names |
| House types | `HouseTypes` table (6 rows) | Classification options |
| Report types | `ReportTypes` table | Report style definitions |
| Default point scale | Sample from demo carnival | Optional |
| Admin user | — | Email + hashed password from env var or interactive setup |

---

## 6. CORS (Cross-Origin Resource Sharing)

| Scenario | Configuration |
|---|---|
| API and frontend on same origin | CORS not needed |
| API and frontend on different origins | Whitelist the frontend origin |
| Development | Allow `http://localhost:*` |
| Production | Restrict to the production frontend domain |

```
# Example (pseudocode):
cors_middleware({
  allowed_origin: APP_ENV.CORS_ORIGIN,
  allow_credentials: true
})
```

---

## 7. Rate Limiting

Protect against brute-force attacks and abuse.

| Route Group | Window | Max Requests | Notes |
|---|---|---|---|
| `/auth/login` | 15 minutes | 10 | Prevent credential stuffing |
| `/auth/reset-password` | 1 hour | 5 | Prevent email spam |
| All other API routes | 1 minute | 100 | General protection |

Use a rate-limiting middleware or library appropriate to your framework. For distributed deployments, back the limiter with a shared store (e.g., Redis or database-based).

---

## 8. Input Validation & Sanitisation

### 8.1 General Rules

| Rule | Implementation |
|---|---|
| Validate all input on the server | Never trust client-side validation alone |
| Use parameterised queries | Prevent SQL injection — no string concatenation in queries |
| Sanitise HTML output | Prevent XSS — use template engine auto-escaping |
| Validate file uploads | Check MIME type, file extension, and size for competitor/data imports |
| Limit request body size | 1 MB default; 10 MB for file uploads |
| Validate numeric ranges | Ages (0–99), lane counts (1–50), point values (0–999), etc. |

### 8.2 Result Entry Validation

The result entry field accepts freeform text (see Spec Doc 06 for the parser). Server-side validation must:
1. Apply the result parser (`Calculate_Results` equivalent) and reject unparseable input
2. Validate that the parsed numeric result is within reasonable bounds for the unit
3. Accept the special tokens `FOUL` and `PARTICIPATE` (case-insensitive)

### 8.3 Import File Validation

CSV/text imports (competitors, carnival disks) must:
1. Check file size (reject files over a configurable limit, e.g., 5 MB)
2. Parse and validate each row before committing
3. Return a structured error report (row number + field + error message) for invalid rows
4. Never execute file contents as code

---

## 9. Error Handling & Logging

### 9.1 Error Handling Strategy

The Access application uses a mix of `On Error GoTo` handlers and a central `DisplayErrMsg()` function with case-specific messages for known Access error codes (e.g., 3078 = missing table, 2501 = report cancelled).

**Web equivalent:**

| Layer | Strategy |
|---|---|
| Route handlers | Try/catch with appropriate HTTP status codes |
| Business logic | Throw typed errors (e.g., `ValidationError`, `ConflictError`, `NotFoundError`) |
| Global error handler | Framework error-handling middleware that maps error types to HTTP responses |
| Client errors (4xx) | Return structured JSON: `{ error: { code, message, details } }` |
| Server errors (5xx) | Log full stack trace; return generic message to client (no internal details) |

### 9.2 Logging

| What to Log | Level | Notes |
|---|---|---|
| Every HTTP request (method, path, status, duration) | `info` | Use a request logger middleware |
| Authentication events (login, logout, failed login) | `info` | Include user email and IP |
| Authorisation failures (403) | `warn` | Include user, requested resource |
| Data mutations (create, update, delete) | `info` | Include user, resource type, resource ID |
| Promotion operations | `info` | Include carnival, event, from/to final level |
| Destructive operations (Utilities tab actions) | `warn` | Include user, carnival, operation name |
| Unhandled errors | `error` | Full stack trace |
| Sensitive data (passwords, tokens) | **never** | — |

### 9.3 Audit Trail (Optional)

For accountability in a multi-user environment, consider an `audit_log` table:

```sql
CREATE TABLE audit_log (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  carnival_id INTEGER REFERENCES carnivals(id),
  action      TEXT NOT NULL,        -- 'create', 'update', 'delete', 'promote', 'import', 'reset'
  resource    TEXT NOT NULL,        -- 'competitor', 'heat', 'result', 'event_type', etc.
  resource_id INTEGER,
  details     JSONB,               -- changed fields, old/new values
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This replaces the Access application's implicit audit (single user, no logging) with explicit change tracking.

---

## 10. Backup Strategy

### 10.1 Access Application (Original)

The Access application supports:
- **Manual backup:** `BackupCurrentCarnival()` compacts and copies the carnival `.accdb` file to a backup path
- **Configurable path:** backup to the same folder as the carnival or a custom directory
- **Compact on backup:** runs `DBEngine.CompactDatabase` before copying

### 10.2 Web Application

| Concern | Recommendation |
|---|---|
| Database backups | Automated database dump on a schedule (daily at minimum) |
| Backup storage | Off-site (cloud object storage or equivalent); retain for 30+ days |
| Point-in-time recovery | Enable write-ahead log archiving if your database supports it (allows recovery to any point in time) |
| Backup verification | Periodically restore backups to a test database to verify integrity |
| Exported files | Store generated exports (Meet Manager, carnival disks) in a transient store; re-generate on demand |
| User-triggered backup | Optionally allow Admin users to trigger and download a database dump of their carnival's data |

### 10.3 Backup Automation Example

```bash
# Daily backup via cron (example using pg_dump; adapt for your database)
0 2 * * * db_dump "$DATABASE_URL" | gzip > /backups/sportsadmin_$(date +\%Y\%m\%d).sql.gz
```

Pair with a retention policy to delete backups older than the retention window.

---

## 11. Deployment Architecture

### 11.1 Minimum Viable Deployment

```
┌────────────┐      ┌───────────────┐      ┌──────────────┐
│  Browser   │◄────►│  Web Server / │◄────►│  Relational  │
│  (Client)  │ HTTP │  Application  │  TCP │  Database    │
└────────────┘      └───────────────┘      └──────────────┘
```

Single server running the application and database processes. Suitable for a single school's carnival with 1–5 concurrent users.

### 11.2 Production Deployment

```
┌────────────┐      ┌───────────┐      ┌───────────────┐      ┌──────────────┐
│  Browser   │◄────►│  Reverse  │◄────►│  Web Server / │◄────►│  Relational  │
│  (Client)  │HTTPS │  Proxy /  │ HTTP │  Application  │  TCP │  Database    │
└────────────┘      │  LB       │      │  (1+ inst.)   │      │  (managed)   │
                    └───────────┘      └───────────────┘      └──────────────┘
```

| Component | Recommendation |
|---|---|
| Reverse proxy | Reverse proxy or cloud load balancer; handles TLS termination |
| TLS certificate | Required in production; use Let's Encrypt or cloud-managed certs |
| Application process | Use a process manager or container orchestration |
| Database | Managed database service preferred for automatic backups and HA |
| Static assets | Serve via reverse proxy or CDN |

### 11.3 Hosting Options

The application is a standard web application with a relational database. Suitable platforms:

| Platform | Effort | Notes |
|---|---|---|
| PaaS (Railway, Render, Fly.io, Heroku, etc.) | Low | Auto-deploy from Git, managed database add-ons |
| Cloud IaaS (AWS, GCP, Azure) | Medium | More control, higher ops burden |
| VPS (DigitalOcean, Linode, etc.) | Medium | Manual setup of reverse proxy, process manager, database |
| School on-premises server | Variable | Requires local IT support; containerisation simplifies deployment |

### 11.4 Containerisation (Optional)

Containerisation is recommended for reproducible deployments. A `Dockerfile` and `docker-compose.yml` should be provided regardless of the chosen language/framework. Example structure:

```yaml
# docker-compose.yml (development)
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/sportsadmin
      SESSION_SECRET: dev-secret
    depends_on: [db]
  db:
    image: postgres:16-alpine   # or mysql, mariadb, etc.
    environment:
      POSTGRES_DB: sportsadmin
      POSTGRES_PASSWORD: postgres
    volumes: ["dbdata:/var/lib/postgresql/data"]
volumes:
  dbdata:
```

Adapt the database image, environment variables, and volume paths to match your chosen database.

---

## 12. HTTPS & Transport Security

| Requirement | Detail |
|---|---|
| TLS in production | Mandatory. All traffic over HTTPS. |
| HTTP redirect | Redirect all HTTP requests to HTTPS (301). |
| HSTS header | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| Secure cookies | Set `Secure` and `HttpOnly` flags on session cookies. |
| SameSite cookies | Set `SameSite=Lax` (or `Strict` if no third-party integrations). |

---

## 13. Security Headers

Apply via security-header middleware appropriate to your framework:

| Header | Value | Purpose |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` | Restrict resource loading |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer information |
| `X-XSS-Protection` | `0` | Disable legacy XSS filter (CSP is preferred) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable unused browser APIs |

---

## 14. Data Privacy Considerations

The application handles **student data** (names, dates of birth, ages, team/house assignments). Schools are subject to privacy regulations (e.g., Australian Privacy Principles, state-level student data requirements).

| Concern | Recommendation |
|---|---|
| Data minimisation | Only collect fields necessary for carnival operations. The existing Access schema's optional fields (phone numbers, addresses in Comments) should remain optional. |
| Access control | Enforce carnival-scoped access (§3). No user should see data from carnivals they are not assigned to. |
| Public views | Public result pages (§3.5) should display the minimum necessary: competitor name, team, event, result, place. Do not expose DOB, PIN, or comments. |
| Data retention | Allow Admin users to archive or delete carnival data. Provide a "delete carnival" function that cascades to all related data. |
| Export controls | Export features (CSV, Meet Manager) should be restricted to Coordinator and Admin roles. |
| Audit logging | The audit log (§9.3) provides accountability for who accessed or modified student data. |

---

## 15. Operational Monitoring

### 15.1 Health Check Endpoint

```
GET /health
Response: { "status": "ok", "version": "1.0.0", "database": "connected" }
```

Returns 200 if the app is running and can reach the database. Used by load balancers, uptime monitors, and deployment pipelines.

### 15.2 Metrics (Optional)

For larger deployments, expose or collect:

| Metric | Purpose |
|---|---|
| Request count by route and status code | Traffic patterns, error rates |
| Response time percentiles (p50, p95, p99) | Performance monitoring |
| Active database connections | Pool saturation detection |
| Login success/failure rate | Security monitoring |
| Background job duration (if any) | Promotion, report generation performance |

---

## 16. Version Management

### 16.1 Access Application (Original)

Version tracked via `VersionNumber` and `VersionDate` constants in `VersionDetails.bas`. Displayed in the About dialog and version information form. Version history spans from 3.0 (August 2000) through 5.3.2 (March 2026).

### 16.2 Web Application

| Concern | Recommendation |
|---|---|
| Version source | Project manifest file (e.g., `package.json`, `pyproject.toml`, `build.gradle`) using semver |
| Display | Show version on About page and in `/health` response |
| Changelog | Maintain a `CHANGELOG.md` in the repository |
| Database version | Track via migration sequence number (implicit in migration tool) |
| Deployment | Tag releases in Git; deploy from tags or main branch |

---

## 17. Development Environment Setup

### 17.1 Prerequisites

| Tool | Notes |
|---|---|
| Language runtime | Current LTS or stable release of your chosen language |
| Package manager | As appropriate for your language/framework |
| Relational database | Current stable release (e.g., PostgreSQL 15+, MySQL 8+, etc.) |
| Git | 2.x |

### 17.2 Getting Started

```bash
git clone <repository-url>
cd sportsadmin-web
cp .env.example .env          # Edit with local database credentials
<install-dependencies>         # Language-specific dependency install
<run-migrations>               # Run database migrations
<run-seed>                     # Load seed data (optional)
<start-dev-server>             # Start development server with hot reload
```

### 17.3 Testing

| Test Type | Scope | Notes |
|---|---|---|
| Unit tests | Business logic (result parser, place calculation, promotion algorithm) | Use your framework's standard test runner |
| Integration tests | API endpoints, database interactions | Test against a real (or test-containerised) database |
| End-to-end tests | Critical user flows (login, enter results, promote, generate report) | Use a browser automation tool |

**Priority test coverage** (based on complexity and risk in the Access codebase):
1. Result parser — `Calculate_Results` equivalent (Spec Doc 06 §2 test vectors)
2. Place calculation with ties
3. Promotion algorithm — `PromoteEventFinal` (Spec Doc 05 §10)
4. Heat auto-creation — `AutomaticallyCreateHeatsAndFinals` (Spec Doc 05 §9)
5. Record detection — `CheckIfRecordBroken`
6. Competitor import with duplicate handling

---

## 18. Cross-Reference to Other Documents

| Topic | Document |
|-------|----------|
| Carnival isolation and `carnival_id` scoping | Doc 00 — Platform Translation Notes §1 |
| Data model and table definitions | Doc 02 — Data Model |
| Carnival CRUD and settings | Doc 03 — Carnival Lifecycle |
| Competitor import validation rules | Doc 04 — Competitor Management |
| Promotion algorithm (requires atomic transaction) | Doc 05 — Events & Heats §10 |
| Result parser (input validation reference) | Doc 06 — Results & Scoring §2 |
| Report generation (access control on exports) | Doc 07 — Reporting |
| Meet Manager export (role-restricted) | Doc 08 — HTML Export & Data Exchange |
| Route map and role guarding by route | Doc 09 — UI & Navigation §9 |
