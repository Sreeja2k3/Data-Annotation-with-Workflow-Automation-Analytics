# REST API Specification — Annotation Ops v1

All API endpoints reside under `/api` and require a valid Bearer JWT header (`Authorization: Bearer <token>`) unless marked public.

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register` (Public)
Creates a new user account.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "strongPassword123"
  }
  ```
- **Response** `201 Created`: User object without password hash.

### `POST /api/auth/login` (Public)
Authenticates credentials and returns a signed JWT token.
- **Request Body** (`application/json` or `OAuth2PasswordRequestForm`):
  ```json
  {
    "username": "jane@example.com",
    "password": "strongPassword123"
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "global_role": "user"
    }
  }
  ```

### `GET /api/auth/me`
Retrieves currently authenticated user profile and memberships.

---

## 2. Project Management (`/api/projects`)

### `GET /api/projects`
List all active projects the user has membership in (or all projects if System Admin).

### `POST /api/projects` (Admin Only)
Create a new project.
- **Request Body**:
  ```json
  {
    "name": "Self-Driving 2D Bounding Boxes",
    "description": "Pedestrian and obstacle labeling",
    "schema_json": "{\"categories\": [\"Car\", \"Pedestrian\", \"Cyclist\"]}",
    "po_id": 2,
    "pm_id": 3
  }
  ```

### `GET /api/projects/{id}`
Get project details, active schema, membership list, and technical settings.

### `PUT /api/projects/{id}` (Admin, PM, PO)
Update project name, description, or technical settings.

### `POST /api/projects/{id}/archive` (Admin, PM with PO Sign-off)
Archive a project. Requires PO sign-off if Approved/Locked tasks exist.

### `POST /api/projects/{id}/delete` (Admin Only)
Soft-deletes project with a 30-day recovery window.

### `POST /api/projects/{id}/recover` (Admin Only)
Restores a soft-deleted project within 30 days.

---

## 3. Project Memberships (`/api/projects/{id}/members`)

### `GET /api/projects/{id}/members`
List all users assigned to this project and their roles.

### `POST /api/projects/{id}/members` (Admin Only)
Assign a user to a project with a specific role (`Admin`, `Product Owner`, `Project Manager`, `Annotator`, `Reviewer`).

### `DELETE /api/projects/{id}/members/{user_id}` (Admin Only)
Remove a user from the project.

---

## 4. Schema Versions (`/api/projects/{id}/schemas`)

### `GET /api/projects/{id}/schemas`
List all schema revisions (version numbers, authors, taxonomy JSON, guidelines, creation timestamps).

### `POST /api/projects/{id}/schemas` (Product Owner Only)
Create a new immutable schema version. In-flight tasks retain their original schema version.
- **Request Body**:
  ```json
  {
    "taxonomy_json": "{\"categories\": [\"Car\", \"Truck\", \"Pedestrian\", \"Cyclist\"]}",
    "guidelines_text": "Updated rule: Tag delivery vans as Truck."
  }
  ```

---

## 5. Datasets & Imports (`/api/projects/{id}/imports`)

### `POST /api/projects/{id}/imports/upload` (Admin, PM)
Upload a dataset file (CSV, JSON, or archive) to stage and validate.
- **Response**: Validation summary with `total_rows`, `valid_rows`, `invalid_rows`, and row-level errors list:
  ```json
  {
    "import_job_id": 12,
    "total_rows": 100,
    "valid_rows": 98,
    "invalid_rows": 2,
    "errors": [
      { "row_index": 19, "error": "Missing required data reference" },
      { "row_index": 42, "error": "Unsupported media file extension" }
    ]
  }
  ```

### `POST /api/projects/{id}/imports/{job_id}/confirm` (Admin, PM)
Confirms ingestion of valid rows. Generates `Task` records linked to the project's latest schema version with status `Unassigned`.

---

## 6. Tasks & Workflow Transitions (`/api/projects/{id}/tasks`)

### `GET /api/projects/{id}/tasks` (Admin, PM, PO)
List tasks with pagination, search, priority filter, status filter, and assignee filter.

### `GET /api/projects/{id}/tasks/my` (Annotator)
List tasks assigned specifically to the calling annotator, sorted by priority (`Urgent` $\rightarrow$ `High` $\rightarrow$ `Normal` $\rightarrow$ `Low`) and creation time.

### `GET /api/projects/{id}/tasks/review-queue` (Reviewer, PM, Admin)
List tasks in `In Review` status ready for review.

### `GET /api/projects/{id}/tasks/qa-queue` (PM, Admin)
List tasks in `QA Pending` status ready for final QA sign-off.

### `GET /api/projects/{id}/tasks/{taskId}`
Get full task workspace data including data reference, schema version guidelines, previous submission versions, reviews, comments, and audit timeline.

### `POST /api/projects/{id}/tasks/{taskId}/submit` (Annotator)
Submit an annotation label.
- **Request Body**:
  ```json
  {
    "payload_json": "{\"label\": \"Pedestrian\", \"confidence\": 1.0}"
  }
  ```
- **Result**: Creates immutable `TaskVersion`, transitions status $\rightarrow$ `In Review`, sends notification to Reviewer queue.

### `POST /api/projects/{id}/tasks/{taskId}/review` (Reviewer, PM, Admin)
Review a submitted task.
- **Request Body**:
  ```json
  {
    "decision": "Reject",
    "comment": "Pedestrian is riding a scooter; please change label to Cyclist."
  }
  ```
- **Result**:
  - If `Accept`: status $\rightarrow$ `QA Pending`.
  - If `Reject`: requires non-empty comment, status $\rightarrow$ `Rejected`, task returned to original annotator, notification dispatched.

### `POST /api/projects/{id}/tasks/{taskId}/qa-signoff` (PM, Admin)
Finalize and sign off task.
- **Result**: Transitions status $\rightarrow$ `Approved` $\rightarrow$ `Locked`. Task becomes read-only.

### `POST /api/projects/{id}/tasks/{taskId}/reopen` (Admin Only)
Reopens a locked task.
- **Request Body**:
  ```json
  {
    "reason": "Client revised guideline definitions for 2026 taxonomy update."
  }
  ```
- **Result**: Transitions status $\rightarrow$ `In Progress`, logs explicit audit event with reason.

---

## 7. Task Assignment & Load Balancing (`/api/projects/{id}/assignments`)

### `POST /api/projects/{id}/assignments/auto` (PM, Admin)
Runs the load-balancing assignment algorithm across all `Unassigned` tasks in the project.
- **Algorithm**: Assigns to the annotator with the fewest active tasks (`Assigned`, `In Progress`, `Rejected`, `Resubmitted`), with deterministic tie-breaking.
- **Optional Parameter**: `batch_size` (default 20).

### `POST /api/projects/{id}/tasks/{taskId}/reassign` (PM, Admin)
Manually reassigns a task to a different annotator.
- **Request Body**:
  ```json
  {
    "new_assignee_id": 5,
    "reason": "Annotator on medical leave; shifting urgent batch."
  }
  ```

---

## 8. Comments (`/api/projects/{id}/tasks/{taskId}/comments`)

### `GET /api/projects/{id}/tasks/{taskId}/comments`
List all threaded comments for a task.

### `POST /api/projects/{id}/tasks/{taskId}/comments`
Post a top-level or reply comment (`parent_id` optional).

---

## 9. Analytics (`/api/projects/{id}/analytics` & `/api/analytics`)

### `GET /api/projects/{id}/analytics/dashboard`
Project KPIs: Total tasks, completion %, status distribution counts, average time to completion, inter-annotator agreement (Cohen's Kappa).

### `GET /api/projects/{id}/analytics/annotators?start_date=&end_date=`
Annotator productivity metrics: Tasks completed, average time per item, rejection rate.

### `GET /api/projects/{id}/analytics/reviewers`
Reviewer metrics: Tasks reviewed, accept/reject ratio, average review turnaround.

### `GET /api/projects/{id}/analytics/agreement`
Inter-annotator agreement breakdown and Cohen's Kappa score for dual-annotated categorical tasks.

### `GET /api/analytics/portfolio` (Product Owner, Admin)
Portfolio-level dashboard rolling up completion %, rejection rate, agreement, and project health across all owned projects.

---

## 10. Dataset Snapshots & ML Exports (`/api/projects/{id}/snapshots` & `/api/projects/{id}/export`)

### `POST /api/projects/{id}/snapshots` (Product Owner, PM, Admin)
Create an immutable dataset snapshot capturing approved/locked task versions and manifest.

### `GET /api/projects/{id}/snapshots`
List all snapshots for a project.

### `GET /api/projects/{id}/export?format={COCO|YOLO|VOC|CoNLL|JSONL}&snapshot_id={id}`
Stream a downloadable ZIP package containing formatted annotation files and a complete `manifest.json`.

---

## 11. Audit Logs & Notifications (`/api/audit-logs` & `/api/notifications`)

### `GET /api/audit-logs?project_id=&entity_type=`
Query append-only audit trail.

### `GET /api/audit-logs/export-csv?project_id=`
Download full audit log in CSV format.

### `GET /api/notifications`
Get user's in-app notifications.

### `PUT /api/notifications/{id}/read` & `PUT /api/notifications/read-all`
Mark notifications as read.
