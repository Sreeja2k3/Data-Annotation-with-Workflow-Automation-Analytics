# Testing Strategy & Verification Plan — Annotation Ops v1

Annotation Ops includes automated unit, integration, RBAC, mathematical agreement, and end-to-end (E2E) workflow tests.

---

## 1. Test Architecture

The automated test suite is built on **pytest** and **httpx** using an in-memory SQLite database initialized with the full SQLAlchemy schema.

```
backend/tests/
├── conftest.py             # Test database session, mock clients, auth tokens
├── test_auth.py            # Login, password hashing, JWT expiry, invalid credentials
├── test_rbac.py            # Server-side project role authorization & cross-project isolation
├── test_state_machine.py   # Complete 10-status transition cycle, rejection, QA, locking
├── test_assignment.py      # Load-balancing algorithm, tie-breaking, batching, reassignments
├── test_import.py          # CSV/JSON validation, row-level error reporting, task generation
├── test_export.py          # COCO, YOLO, Pascal VOC, CoNLL, JSONL generation & manifests
├── test_analytics.py       # Cohen's Kappa mathematical accuracy & KPI calculations
└── test_e2e_flow.py        # Complete 27-step lifecycle scenario
```

---

## 2. Tested Functional Areas

### 2.1 Authentication & Security (`test_auth.py`)
- Password hashing verification (PBKDF2/SHA-256).
- Rejection of invalid passwords and unregistered emails.
- JWT token decoding and expiration handling.
- Protection of private endpoints against missing/invalid Bearer tokens.

### 2.2 Role-Based Access Control (`test_rbac.py`)
- Verifies permission matrices for all 5 roles (`Admin`, `Product Owner`, `Project Manager`, `Annotator`, `Reviewer`).
- Verifies that Product Owners cannot submit annotations or assign tasks.
- Verifies that Annotators cannot view or act on tasks assigned to other annotators.
- Verifies that Reviewers cannot review their own submitted tasks (self-review prevention).
- Verifies that only Admins can create projects and reopen locked tasks.

### 2.3 Workflow State Machine (`test_state_machine.py`)
- Tests sequential valid transitions:
  `Unassigned` $\rightarrow$ `Assigned` $\rightarrow$ `In Progress` $\rightarrow$ `Submitted` $\rightarrow$ `In Review` $\rightarrow$ `QA Pending` $\rightarrow$ `Approved` $\rightarrow$ `Locked`.
- Tests rejection loop:
  `In Review` $\rightarrow$ `Rejected` (requires non-empty comment) $\rightarrow$ `Resubmitted` $\rightarrow$ `In Review`.
- Tests invalid status jumps (e.g., `Unassigned` $\rightarrow$ `Approved` rejected with HTTP 400).
- Verifies creation of immutable `TaskVersion` records on every submission.

### 2.4 Auto-Assignment & Load Balancing (`test_assignment.py`)
- Tests fewest-active load-balancing algorithm: distributes tasks to annotators with the lowest count of in-flight tasks.
- Tests deterministic tie-breaking (fewest tasks $\rightarrow$ oldest assignment timestamp $\rightarrow$ lowest user ID).
- Tests configurable task batching.
- Tests manual reassignment with mandatory reason requirement.

### 2.5 Import Validation & Error Detection (`test_import.py`)
- Valid CSV/JSON import leading to task generation.
- Invalid CSV/JSON containing missing fields or invalid format.
- Verification of row-level error reporting before database ingestion.

### 2.6 Inter-Annotator Agreement Math (`test_analytics.py` & `verify.py`)
- Mathematical accuracy of Cohen's Kappa:
  - Perfect agreement ($\kappa = 1.0$)
  - Complete disagreement ($\kappa = 0.0$ or $\kappa < 0$)
  - Mixed partial agreement ($0.0 < \kappa < 1.0$)
  - Empty dataset handling ($\kappa = 0.0$)
  - Unsupported schema types returning explicit error notices.

### 2.7 ML Export Formatting (`test_export.py`)
- COCO format structure (`info`, `images`, `annotations`, `categories`).
- YOLO Darknet format (`classes.txt` and `labels/task_*.txt`).
- Pascal VOC XML format (`<annotation>`, `<size>`, `<object>`, `<bndbox>`).
- CoNLL format for NLP sequence/token classification.
- JSONL format with one JSON record per line.
- Verification of `manifest.json` inclusion with metadata and row count.

---

## 3. End-to-End 27-Step Scenario (`test_e2e_flow.py`)

A comprehensive integration test executing all 27 steps sequentially:
1. Admin registers/logs in
2. Admin creates project
3. Admin assigns Product Owner and Project Manager
4. Product Owner creates version 1 schema & guidelines
5. PM uploads raw dataset
6. System validates dataset and reports row statuses
7. PM confirms ingestion, generating tasks
8. System auto-assigns tasks via load balancer
9. Annotator logs in and queries `/api/projects/{id}/tasks/my`
10. Annotator opens assigned task
11. Annotator labels the task
12. Annotator submits label (creating TaskVersion 1)
13. Reviewer receives notification
14. Reviewer opens task in review queue
15. Reviewer rejects task with detailed comment
16. Annotator receives rejection notification
17. Annotator corrects label based on reviewer feedback
18. Annotator resubmits label (creating TaskVersion 2)
19. Reviewer inspects diff and accepts task
20. PM/Admin opens QA queue
21. PM/Admin signs off task
22. Task transitions to `Approved` and becomes `Locked`
23. Audit logs record all transitions with timestamps and actor IDs
24. Analytics and completion metrics update
25. Product Owner creates named dataset snapshot `"v1.0-release"`
26. PM/PO exports dataset in COCO, YOLO, Pascal VOC, and JSONL formats
27. Traceability `manifest.json` verified inside export ZIP archive

---

## 4. Running the Tests

To run the automated test suite locally:

```powershell
# Run the complete test suite with pytest
.venv\Scripts\python.exe -m pytest backend/tests -v

# Run the standalone math verification script
.venv\Scripts\python.exe verify.py
```
