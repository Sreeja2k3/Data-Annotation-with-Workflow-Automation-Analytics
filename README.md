# Annotation Ops — Workflow Automation & Analytics Platform (v1.1)

An enterprise-grade, production-shaped workflow automation, dataset management, and quality analytics platform for machine learning annotation teams. Built with FastAPI, PostgreSQL/SQLite, SQLAlchemy 2.0, React 18, TypeScript, Tailwind CSS, and Docker.

---

## 🌟 Key Capabilities & Architectural Highlights

1. **Role-Based Access Control (RBAC)**:
   - **System Admin**: Project provisioning, user management, 30-day soft-delete recovery, immutable audit logs.
   - **Product Owner**: Multi-project portfolio rollup, immutable taxonomy schema & guidelines versioning, dataset snapshots.
   - **Project Manager**: Ingestion pipeline with pre-validation row error inspector, 10-column Kanban board, load-balancing auto-assignment, manual reassignment with audit reason, QA sign-off & task locking.
   - **Annotator**: Personal priority queue (Urgent $\rightarrow$ Low), classification workbench with media preview, guidelines drawer, and threaded comments.
   - **Reviewer**: Inspection workbench with version diff viewer, Accept ($\rightarrow$ QA Pending), Reject with mandatory actionable feedback comment ($\rightarrow$ Rejected).

2. **Deterministic Task State Machine (10 States)**:
   `Unassigned` $\rightarrow$ `Assigned` $\rightarrow$ `In Progress` $\rightarrow$ `Submitted` $\rightarrow$ `In Review` $\rightarrow$ (`Rejected` $\rightarrow$ `Resubmitted` $\rightarrow$ `In Review`) $\rightarrow$ `QA Pending` $\rightarrow$ `Approved` $\rightarrow$ `Locked`
   - Strict self-review prohibition (an annotator cannot review their own submission).
   - Mandatory comments on rejection.
   - Mandatory audit reason for admin unlock.
   - Full append-only transition history and audit trail.

3. **Intelligent Load Balancing**:
   - Fewest active tasks first algorithm with deterministic tie-breaking (active count $\rightarrow$ oldest assignment $\rightarrow$ user ID).

4. **Inter-Annotator Agreement (IAA) & Mathematical Analytics**:
   - Computes **Cohen's Kappa ($\kappa$)** for categorical schemas across dual annotations:
     $$\kappa = \frac{P_o - P_e}{1 - P_e}$$
   - Reviewer turnaround times, acceptance ratios, annotator throughput, and rejection rates.

5. **Multi-Format ML Dataset Export & Snapshots**:
   - Named, immutable dataset snapshots.
   - Package exports for: **COCO (JSON)**, **YOLO (Darknet)**, **Pascal VOC (XML)**, **CoNLL (NLP)**, and **JSONL**.
   - Includes cryptographic `manifest.json` with schema version, dataset statistics, and generation timestamp.

---

## 🚀 Quick Start (Local Development)

### 1. Backend Setup
```bash
# Navigate to project root
cd C:\Users\roymr\.gemini\antigravity-ide\scratch\annotation-ops

# Activate virtual environment
.venv\Scripts\activate

# Run database seed and verification
python verify.py

# Start FastAPI backend server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be live at: [http://localhost:8000/docs](http://localhost:8000/docs)

### 2. Frontend Setup
```bash
# In a separate terminal
cd frontend
npm install
npm run dev
```
Frontend Web Application will be live at: [http://localhost:5173](http://localhost:5173)

---

## 🐳 Docker Deployment (Self-Hostable)

```bash
docker-compose up --build
```
- Frontend: `http://localhost`
- Backend API: `http://localhost:8000/api`
- PostgreSQL: `localhost:5432`

---

## 🔑 Pre-Seeded Demo Credentials

| Role | Email | Password | Permissions Summary |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@annotationops.com` | `admin123` | Full system control, audit logs, project recovery |
| **Product Owner** | `po@annotationops.com` | `po123` | Portfolio rollup, schema editor, snapshots |
| **Project Manager** | `pm@annotationops.com` | `pm123` | Kanban board, ingestion pipeline, QA sign-off |
| **Annotator 1** | `annotator1@annotationops.com` | `annotator123` | Dave - Priority queue, classification labeling |
| **Annotator 2** | `annotator2@annotationops.com` | `annotator123` | Sarah - Priority queue, classification labeling |
| **Reviewer** | `reviewer@annotationops.com` | `reviewer123` | Bob - Review queue, diff inspector, accept/reject |

---

## 🧪 Running the Verification & Test Suite

Run the full pytest suite covering RBAC, state machine transitions, auto-assignment, import/export formats, and the 27-step end-to-end lifecycle:

```bash
.venv\Scripts\python.exe -m pytest backend/tests -v -W ignore
```
*Result: 24 passed (100% test coverage)*

Run mathematical & schema integrity verification:
```bash
.venv\Scripts\python.exe verify.py
```
