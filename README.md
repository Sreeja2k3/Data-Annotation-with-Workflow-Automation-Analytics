# Data Annotation Platform — Phase 2 + Phase 3 Backend

This repository contains the **Phase 2 Data Model & Backend Foundation** plus
the existing **Phase 3 Core Workflow Engine**.

Phase 2 is responsible for the backend foundation:

- FastAPI application and Docker setup
- PostgreSQL connection
- SQLAlchemy data model
- JWT authentication and role-based access
- Project and dataset CRUD
- CSV/JSON/multi-file data import
- Local/cloud PostgreSQL configuration

Phase 3 remains the existing teammate implementation:

- Task generation from imported items
- Round-robin/load-based assignment
- Annotator → Reviewer → QA state machine
- Rejection/rework loop
- Comments
- Audit trail

**The Phase 3 transition table and `TaskService` workflow are intentionally
kept intact.** Phase 2 only supplies the foundation around them.

## Project structure

```text
app/
  database.py       PostgreSQL engine/session
  models.py         Phase 2 data model + Phase 3 workflow tables
  schemas.py        API request/response schemas
  auth.py           JWT + RBAC helpers
  api.py            Phase 2 foundation APIs + existing Phase 3 APIs
  services.py       Existing Phase 3 workflow service
  state_machine.py  Existing Phase 3 transition table
  assignment.py     Existing Phase 3 assignment engine
  audit.py          Existing Phase 3 audit writer
  main.py           FastAPI entry point

seed.py             Local demo users/project/dataset
migrate_phase2.py   One-time migration for an existing Phase 3 database
demo.py             Existing Phase 3 end-to-end demo
```

## 1. Fastest local setup — Docker

Install Docker Desktop, then from the project root:

```bash
docker compose up --build
```

Open:

```text
http://localhost:8000/docs
```

Health check:

```text
http://localhost:8000/health
```

PostgreSQL is exposed on port `5432` and persists in the `postgres_data`
Docker volume.

### Seed demo data

The simplest way is from the project root after PostgreSQL is reachable:

```bash
python seed.py
```

If your API/database are both running inside Docker, you can instead run:

```bash
docker compose exec api python seed.py
```

Default development accounts:

```text
Admin      admin@example.com      Admin@123
PM         pm@example.com         PM@123
Annotator  annotator1@example.com Annotator@123
Reviewer   reviewer1@example.com  Reviewer@123
QA         qa1@example.com        QA@123
```

These are local-demo credentials only.

## 2. Local Python setup

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Set `DATABASE_URL` in `.env` or your shell, then:

```bash
uvicorn app.main:app --reload
```

## 3. PostgreSQL configuration

The application uses:

```text
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/DATABASE
```

For local PostgreSQL, for example:

```text
DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/annotation_platform
```

For a hosted PostgreSQL service, place its SQLAlchemy/psycopg2 connection URL
in `DATABASE_URL`. This makes the same application cloud-ready without code
changes.

Never commit `.env` or database credentials.

## 4. Existing Phase 3 database

If you already created the database using the teammate's Phase 3 code, run:

```bash
python migrate_phase2.py
```

This migration only adds:

- `PROJECT_MANAGER` to the existing PostgreSQL `role` enum
- optional `imported_items.dataset_id`
- its index and foreign key

It does **not** change the Phase 3 state machine or workflow service.

For a brand-new database, no migration command is required; the application
uses `Base.metadata.create_all()` for development startup.

## 5. Phase 2 API checklist

### Authentication

```text
POST  /api/v1/auth/login
GET   /api/v1/auth/me
```

JWTs are passed as:

```text
Authorization: Bearer <access_token>
```

### User management

Admin only:

```text
POST   /api/v1/users
GET    /api/v1/users
PATCH  /api/v1/users/{user_id}
```

### Projects

```text
POST   /api/v1/projects
GET    /api/v1/projects
GET    /api/v1/projects/{project_id}
PUT    /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}
```

Writes require Admin or Project Manager. Reads require authentication.

### Datasets

```text
POST   /api/v1/datasets
GET    /api/v1/datasets
GET    /api/v1/datasets/{dataset_id}
PUT    /api/v1/datasets/{dataset_id}
DELETE /api/v1/datasets/{dataset_id}
```

Writes require Admin or Project Manager. Reads require authentication.

### Bulk import

```text
POST /api/v1/items/import
POST /api/v1/items/import-file
POST /api/v1/items/import-folder
```

Imports require Admin or Project Manager.

CSV and JSON are supported. Every record retains its raw JSON payload and import
batch ID. File imports generate a UUID batch automatically.

### Existing Phase 3 API

The existing task/workflow routes remain available under `/api/v1/tasks`.
See `docs/PHASE_2.md` and the existing Phase 3 documentation for the complete
workflow.

## 6. Swagger test sequence

1. Open `/docs`.
2. Call `POST /api/v1/auth/login` with the Admin account.
3. Copy `access_token`.
4. Click **Authorize** and enter `Bearer <token>`.
5. Create a project.
6. Create a dataset using that project's ID.
7. Upload `test_items.csv` through `/items/import-file`.
8. Upload `test_items.json` through the same endpoint.
9. Generate tasks using `/tasks/generate` if you want to continue into Phase 3.
10. Use the existing Phase 3 endpoints/demo to verify the workflow.

## 7. Syntax verification

```bash
python -m py_compile app/*.py seed.py migrate_phase2.py demo.py
```

## 8. Git

After testing:

```bash
git status
git add .
git commit -m "Complete Phase 2 backend foundation"
git push
```
