# Phase 2 — Data Model & Backend Foundation

This implementation completes the Phase 2 task list while keeping the existing
Phase 3 workflow engine intact. Phase 3 still owns task generation,
auto-assignment, the Annotator → Reviewer → QA state machine, rejection/rework,
comments, and audit logging.

## Phase 2 checklist

| Task | Implementation | Acceptance outcome |
|---|---|---|
| Draft ER diagram / DB schema | `docs/ER_DIAGRAM.md` + SQLAlchemy models | Schema documented and represented in code |
| Set up FastAPI + Docker project | `app/main.py`, `Dockerfile`, `docker-compose.yml` | Backend starts on port 8000 |
| Implement DB schema | `app/models.py` | Users, projects, datasets, imported items, tasks, annotations, assignments, comments, audit logs |
| Implement auth + role-based access | `app/auth.py` + protected Phase 2 routes | JWT login and Admin/Project Manager permissions |
| Set up PostgreSQL (local + cloud-ready) | `app/database.py`, Compose, `DATABASE_URL` | PostgreSQL connection configurable by environment |
| Build CRUD APIs for projects/datasets | `app/api.py` | Create/list/get/update/delete endpoints |
| Implement bulk data import (CSV/JSON/folder) | `app/api.py` | Raw, CSV, JSON and multi-file imports store records and batch IDs |

## Role model

Phase 3 requires `QA`, so that role remains unchanged. Phase 2 also adds the
`PROJECT_MANAGER` role required by the product workflow. The effective role set
is therefore:

- `admin` — full administrative/user-management control
- `project_manager` — projects, datasets, imports, task generation, assignment/monitoring
- `annotator` — annotation workflow actions owned by Phase 3
- `reviewer` — review workflow actions owned by Phase 3
- `qa` — existing Phase 3 final-quality stage

No Phase 3 transition or service method was removed or renamed.

## Authentication

`POST /api/v1/auth/login` returns a JWT. Send it in Swagger's **Authorize**
dialog as:

```text
Bearer <token>
```

Administrators can create/list/update users through `/api/v1/users`.
Project and dataset writes, file imports, raw imports, task generation and
manual annotator assignment require either `admin` or `project_manager`.
Read-only project/dataset/task/audit/comment endpoints require an authenticated
user.

## PostgreSQL

### Local Docker PostgreSQL

```bash
docker compose up --build
```

The API is available at:

```text
http://localhost:8000/docs
```

The database is persisted in the `postgres_data` Docker volume.

### Existing/local PostgreSQL

Set:

```text
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DATABASE
```

### Free-tier cloud PostgreSQL

The application is cloud-ready because the connection is controlled entirely by
`DATABASE_URL`. For a hosted PostgreSQL provider such as Neon, use the provider's
SQLAlchemy/psycopg2 connection string in `.env`. Do not commit credentials.

## Import behavior

Supported endpoints:

- `POST /api/v1/items/import` — JSON request containing raw items
- `POST /api/v1/items/import-file` — one `.csv` or `.json` file
- `POST /api/v1/items/import-folder` — multiple `.csv`/`.json` files

Every imported record stores its raw JSON payload, project, optional dataset,
external ID, import batch ID and timestamp. File imports generate a UUID batch
ID automatically.

CSV files use the first row as headers. JSON accepts either:

```json
[{"external_id":"1","text":"hello"}]
```

or:

```json
{"items":[{"external_id":"1","text":"hello"}]}
```

## Seed data for testing

After PostgreSQL is running:

```bash
python seed.py
```

Default development credentials:

```text
Admin: admin@example.com / Admin@123
PM:    pm@example.com / PM@123
Annotator: annotator1@example.com / Annotator@123
Reviewer: reviewer1@example.com / Reviewer@123
QA: qa1@example.com / QA@123
```

Change seed credentials through environment variables before using them outside
local development.

## Verification

Syntax check:

```bash
python -m py_compile app/*.py seed.py demo.py
```

Docker smoke test:

```bash
docker compose up --build
# open http://localhost:8000/health
# open http://localhost:8000/docs
```

Then run `python seed.py`, log in through Swagger, create a project/dataset,
and upload `test_items.csv` or `test_items.json`.

For Phase 3 verification, use the existing `demo.py`. Its QA workflow and
state-machine behavior are intentionally retained.
