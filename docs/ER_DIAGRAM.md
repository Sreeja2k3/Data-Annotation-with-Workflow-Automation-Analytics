# Phase 2 — ER Diagram / Database Schema

The schema below is the shared foundation used by Phase 2 and the existing
Phase 3 workflow engine.

```mermaid
erDiagram
    USERS {
        uuid id PK
        string name
        string email UK
        string password_hash
        enum role
        boolean is_active
    }

    PROJECTS {
        uuid id PK
        string name
        text description
        datetime created_at
        datetime updated_at
    }

    DATASETS {
        uuid id PK
        uuid project_id FK
        string name
        text description
        datetime created_at
        datetime updated_at
    }

    IMPORTED_ITEMS {
        uuid id PK
        string project_id
        uuid dataset_id FK
        string external_id
        json payload
        string import_batch_id
        datetime imported_at
    }

    TASKS {
        uuid id PK
        uuid item_id FK
        enum status
        uuid current_annotator_id FK
        uuid current_reviewer_id FK
        uuid current_qa_id FK
        int rework_count
        datetime created_at
        datetime updated_at
    }

    ANNOTATIONS {
        uuid id PK
        uuid task_id FK
        uuid annotator_id FK
        int version
        json data
        boolean is_current
        datetime created_at
        datetime updated_at
    }

    TASK_ASSIGNMENTS {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        enum role
        enum strategy_used
        datetime assigned_at
        datetime unassigned_at
    }

    TASK_COMMENTS {
        uuid id PK
        uuid task_id FK
        uuid author_id FK
        enum stage
        text body
        datetime created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid task_id FK
        uuid actor_id FK
        string action
        enum from_status
        enum to_status
        json event_metadata
        datetime created_at
    }

    PROJECTS ||--o{ DATASETS : contains
    DATASETS ||--o{ IMPORTED_ITEMS : contains
    IMPORTED_ITEMS ||--o| TASKS : creates
    TASKS ||--o{ ANNOTATIONS : has
    USERS ||--o{ ANNOTATIONS : creates
    TASKS ||--o{ TASK_ASSIGNMENTS : has
    USERS ||--o{ TASK_ASSIGNMENTS : receives
    TASKS ||--o{ TASK_COMMENTS : has
    USERS ||--o{ TASK_COMMENTS : writes
    TASKS ||--o{ AUDIT_LOGS : records
    USERS ||--o{ AUDIT_LOGS : acts
```

## Role set

- `admin`
- `project_manager`
- `annotator`
- `reviewer`
- `qa` — retained because the existing Phase 3 engine uses a QA stage.

## Phase 2 acceptance mapping

- **Users** — JWT authentication and role information.
- **Projects / datasets** — project hierarchy and dataset ownership.
- **Imported items** — raw CSV/JSON data waiting to be annotated.
- **Tasks** — workflow unit created from an imported item.
- **Annotations** — versioned annotation payloads attached to tasks.
- **Task assignments** — assignment history used by the Phase 3 engine.
- **Task comments** — reviewer/QA feedback.
- **Audit logs** — append-only workflow history.

`imported_items.project_id` intentionally remains a string for compatibility
with the existing Phase 3 implementation. The Phase 2 import APIs validate the
project and dataset relationship before inserting data.
