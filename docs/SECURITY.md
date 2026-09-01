# Security Architecture & Governance — Annotation Ops v1

Annotation Ops handles operational workflows, task distributions, and ML dataset generation. Security and governance are enforced server-side.

---

## 1. Authentication & Session Management

- **Password Storage**: Passwords are never stored in plaintext. They are hashed using PBKDF2 with SHA-256 and a unique 128-bit cryptographic salt per user (`hashlib.pbkdf2_hmac` with 100,000 iterations).
- **JWT Authorization Tokens**: Sessions are authenticated using signed JSON Web Tokens (HMAC-SHA256). Tokens encode the user's identity (`sub`) and expiration timestamp.
- **Header Transport**: Tokens are passed via standard `Authorization: Bearer <token>` HTTP headers.
- **Identity Isolation**: The server derives user identity solely from validated JWT claims—client-provided user IDs in request bodies are never trusted for authorization.

---

## 2. Role-Based Access Control (RBAC) Matrix

Annotation Ops enforces project-level roles. A user may hold different roles across different projects (e.g., Annotator on Project A, Reviewer on Project B, Product Owner on Project C).

| Permission Area | Admin | Product Owner | Project Manager | Annotator | Reviewer |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **System User Management** | YES | NO | NO | NO | NO |
| **System Settings** | YES | NO | NO | NO | NO |
| **Create Project** | YES | NO | NO | NO | NO |
| **Assign Project Roles** | YES | NO | NO | NO | NO |
| **Archive / Soft-Delete Project** | YES | NO | YES (with PO sign-off) | NO | NO |
| **Edit Annotation Schema & Guidelines**| YES | YES | NO | NO | NO |
| **Import Dataset / Validate Rows** | YES | NO | YES | NO | NO |
| **Auto-Assign & Rebalance Tasks** | YES | NO | YES | NO | NO |
| **Manually Reassign Task** | YES | NO | YES (reason required) | NO | NO |
| **Work on & Submit Assigned Tasks** | NO | NO | NO | YES | NO |
| **Self-Review Prevention** | ENFORCED | ENFORCED | ENFORCED | ENFORCED | ENFORCED |
| **Accept / Reject Submissions** | YES | NO | NO | NO | YES (comment req.) |
| **QA Sign-off (Lock Task)** | YES | NO | YES | NO | NO |
| **Reopen Locked Task** | YES (reason required) | NO | NO | NO | NO |
| **Create Dataset Snapshot** | YES | YES | YES | NO | NO |
| **Export Approved ML Datasets** | YES | YES | YES | NO | NO |
| **View Audit Trail & Export CSV** | YES | YES | YES | NO | NO |
| **View Project Dashboard & KPIs** | YES | YES | YES | Assigned tasks only | Queue only |
| **View PO Portfolio Dashboard** | YES | YES | NO | NO | NO |

### Server-Side Enforcement
Every protected route executes `check_project_role(project_id, current_user, allowed_roles)`. Frontend visibility is treated purely as UX convenience—unauthorized API requests result in HTTP `403 Forbidden` responses.

---

## 3. Immutability & Audit Trail

- **Non-Repudiation**: Every state-changing action generates an append-only `AuditLog` record containing:
  - `actor_id`: User ID of initiator
  - `action`: State transition or operation name
  - `entity_type`: Project, Task, SchemaVersion, Snapshot, Membership
  - `entity_id`: Primary key of affected entity
  - `timestamp`: UTC timestamp
  - `metadata_json`: Additional context (reasons, previous values, delta payload)
- **Immutable Task Versions**: Submitting a label does not overwrite prior versions. Every submission creates a new `TaskVersion` (Version 1, Version 2, ...). In the event of rejection, the defective version remains in the database for auditing and QA inspection alongside the corrected version.
- **Read-Only Locked Tasks**: Tasks that pass QA sign-off enter the `Locked` state and cannot be modified by any annotator or reviewer. Only an Admin can reopen a locked task with a documented rationale.

---

## 4. Input Validation & Data Protection

- **Pydantic Validation**: All API inputs are strictly typed and validated via Pydantic schemas.
- **SQL Injection Prevention**: All queries utilize SQLAlchemy 2.0 ORM parameterization.
- **File Upload Limits & Validation**: Dataset imports check MIME types, parse structured CSV/JSON, validate expected columns/keys, and return line-by-line error reports before creating database records.
- **Cross-Origin Resource Sharing (CORS)**: Configurable origin restriction via environment variables in production.
