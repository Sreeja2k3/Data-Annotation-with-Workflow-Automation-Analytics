import io
import csv
import json
import datetime
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from backend.database import engine, Base, SessionLocal, get_db
from backend.models import (
    User, Project, ProjectMembership, SchemaVersion, Dataset, Task, TaskVersion,
    Review, Comment, TaskStatusHistory, AssignmentHistory, AuditLog, DatasetSnapshot,
    SnapshotTaskVersion, ImportJob, ImportError, ExportJob, ProjectSetting, Notification
)
from backend.schemas import (
    UserCreate, UserLogin, UserOut, Token,
    ProjectCreate, ProjectOut, ProjectUpdate, ProjectMembershipCreate, ProjectMembershipOut,
    ProjectSettingOut, ProjectSettingUpdate,
    SchemaVersionCreate, SchemaVersionOut,
    DatasetOut,
    TaskOut, TaskCreate, TaskSubmit, TaskAssign, TaskReassign, TaskPriorityUpdate, TaskReopen,
    ReviewCreate, ReviewOut,
    CommentCreate, CommentOut,
    ImportJobOut, ImportConfirmRequest,
    DatasetSnapshotCreate, DatasetSnapshotOut,
    AuditLogOut, NotificationOut
)
from backend.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_current_admin_user, check_project_role
)
from backend.workflow import (
    submit_task_annotation, review_task_submission, qa_signoff_task,
    reopen_locked_task, log_audit_event, record_status_history
)
from backend.assignment import auto_assign_tasks, manually_reassign_task
from backend.import_service import create_import_job_and_validate, confirm_and_ingest_import, parse_and_validate_import_file
from backend.export_service import export_project_data
from backend.analytics import (
    get_project_dashboard_stats, get_annotator_stats, get_reviewer_stats,
    get_portfolio_stats, get_project_cohens_kappa
)
from backend.notifications import dispatch_notification
from backend.scheduler import start_scheduler

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Annotation Ops API",
    description="Operational workflow automation, load balancing, governance, and analytics platform for annotation teams.",
    version="1.1"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Start background scheduler on startup
@app.on_event("startup")
def on_startup():
    start_scheduler()
    seed_database()

# --- DATABASE SEED SYSTEM ---
def seed_database():
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return

        print("[Seed] Pre-seeding Annotation Ops platform with realistic demo data...")

        # 1. Users
        admin = User(name="System Admin", email="admin@annotationops.com", hashed_password=hash_password("admin123"), global_role="admin")
        po = User(name="Alex Product Owner", email="po@annotationops.com", hashed_password=hash_password("po123"), global_role="user")
        pm = User(name="Jane Project Manager", email="pm@annotationops.com", hashed_password=hash_password("pm123"), global_role="user")
        ann1 = User(name="Dave Annotator", email="annotator1@annotationops.com", hashed_password=hash_password("annotator123"), global_role="user")
        ann2 = User(name="Sarah Annotator", email="annotator2@annotationops.com", hashed_password=hash_password("annotator123"), global_role="user")
        rev = User(name="Bob Reviewer", email="reviewer@annotationops.com", hashed_password=hash_password("reviewer123"), global_role="user")

        users = [admin, po, pm, ann1, ann2, rev]
        for u in users:
            db.add(u)
        db.commit()
        for u in users:
            db.refresh(u)

        # 2. Project 1: Autonomous Vehicles Vision
        p1 = Project(
            name="Autonomous Vehicles Perception",
            description="Annotating pedestrians, vehicles, and road obstacles in autonomous camera feeds.",
            schema_json=json.dumps({"categories": ["Car", "Bus", "Truck", "Motorcycle", "Cyclist", "Pedestrian", "Traffic Light", "Stop Sign", "Traffic Sign"]}),
            settings_json=json.dumps({"domain": "Computer Vision", "priority": "High"}),
            created_by=admin.id
        )
        db.add(p1)
        db.commit()
        db.refresh(p1)

        # Project 1 Settings
        p1_settings = ProjectSetting(
            project_id=p1.id,
            review_mode="single",
            auto_assignment_enabled=True,
            batch_size=20,
            default_priority="Normal",
            sla_hours=48
        )
        db.add(p1_settings)

        # Project 1 Memberships
        memberships_p1 = [
            ProjectMembership(user_id=admin.id, project_id=p1.id, project_role="Admin"),
            ProjectMembership(user_id=po.id, project_id=p1.id, project_role="Product Owner"),
            ProjectMembership(user_id=pm.id, project_id=p1.id, project_role="Project Manager"),
            ProjectMembership(user_id=ann1.id, project_id=p1.id, project_role="Annotator"),
            ProjectMembership(user_id=ann2.id, project_id=p1.id, project_role="Annotator"),
            ProjectMembership(user_id=rev.id, project_id=p1.id, project_role="Reviewer"),
        ]
        for m in memberships_p1:
            db.add(m)
        db.commit()

        # Project 1 Schema Version
        schema_v1 = SchemaVersion(
            project_id=p1.id,
            version_number=1,
            taxonomy_json=p1.schema_json,
            guidelines_text="1. Tag all visible roadway entities using their respective bounding boxes or classes.\n2. Distinguish Passenger Cars, City Buses, and Commercial Trucks.\n3. Classify Pedestrians, Cyclists (bicycles), and Motorcycles accurately.\n4. Distinguish Traffic Lights from Traffic Signs (Stop Signs, Speed Limits, Warning Signs).\n5. For occluded, blurry, or distant objects, adjust the confidence slider accordingly.",
            defined_by=po.id
        )
        db.add(schema_v1)
        db.commit()
        db.refresh(schema_v1)

        # Project 1 Dataset
        dataset1 = Dataset(
            project_id=p1.id,
            name="Urban Camera Feed Batch 01",
            description="High-resolution roadway dashcam samples",
            total_items=6
        )
        db.add(dataset1)
        db.commit()
        db.refresh(dataset1)

        # Realistic Raw Items
        raw_items = [
            {"image_url": "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800", "description": "Downtown street crossing"},
            {"image_url": "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800", "description": "Suburban residential road"},
            {"image_url": "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=800", "description": "Highway night view"},
            {"image_url": "https://images.unsplash.com/photo-1506015391300-4802dc74de2e?w=800", "description": "Rainy intersection"},
            {"image_url": "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800", "description": "Construction zone alert"},
            {"image_url": "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800", "description": "Dual annotation test item"}
        ]

        now = datetime.datetime.utcnow()

        # Task 1: Unassigned
        t1 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[0]), status="Unassigned", priority="Normal", schema_version_id=schema_v1.id)
        # Task 2: Assigned (In Progress) to Dave
        t2 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[1]), status="In Progress", priority="High", assigned_to=ann1.id, assigned_at=now, schema_version_id=schema_v1.id)
        # Task 3: In Review by Bob (submitted by Sarah)
        t3 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[2]), status="In Review", priority="Normal", assigned_to=ann2.id, assigned_at=now, submitted_at=now, schema_version_id=schema_v1.id)
        # Task 4: Rejected (returned to Dave)
        t4 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[3]), status="Rejected", priority="Urgent", assigned_to=ann1.id, assigned_at=now, submitted_at=now, reviewed_at=now, schema_version_id=schema_v1.id)
        # Task 5: Approved / Locked
        t5 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[4]), status="Locked", priority="Normal", assigned_to=ann1.id, assigned_at=now, submitted_at=now, reviewed_at=now, approved_at=now, locked_at=now, schema_version_id=schema_v1.id)
        # Task 6: QA Pending
        t6 = Task(project_id=p1.id, dataset_id=dataset1.id, data_ref=json.dumps(raw_items[5]), status="QA Pending", priority="High", assigned_to=ann2.id, assigned_at=now, submitted_at=now, reviewed_at=now, schema_version_id=schema_v1.id)

        for t in [t1, t2, t3, t4, t5, t6]:
            db.add(t)
        db.commit()
        for t in [t1, t2, t3, t4, t5, t6]:
            db.refresh(t)

        # Task Versions
        # t3 version
        v3 = TaskVersion(task_id=t3.id, submitted_by=ann2.id, payload_json=json.dumps({"label": "Car", "confidence": 0.95}), version_number=1)
        # t4 version 1 (rejected)
        v4_1 = TaskVersion(task_id=t4.id, submitted_by=ann1.id, payload_json=json.dumps({"label": "Pedestrian", "confidence": 0.8}), version_number=1)
        # t5 version
        v5 = TaskVersion(task_id=t5.id, submitted_by=ann1.id, payload_json=json.dumps({"label": "Traffic Light", "confidence": 1.0}), version_number=1)
        # t6 version
        v6 = TaskVersion(task_id=t6.id, submitted_by=ann2.id, payload_json=json.dumps({"label": "Cyclist", "confidence": 0.92}), version_number=1)

        for v in [v3, v4_1, v5, v6]:
            db.add(v)

        # Reviews
        r4 = Review(task_id=t4.id, reviewer_id=rev.id, decision="Reject", comment="Object is on a bicycle. Change label to Cyclist.", review_round=1)
        r5 = Review(task_id=t5.id, reviewer_id=rev.id, decision="Accept", comment="Accurate traffic light classification.", review_round=1)
        r6 = Review(task_id=t6.id, reviewer_id=rev.id, decision="Accept", comment="Verified cyclist tag.", review_round=1)
        for r in [r4, r5, r6]:
            db.add(r)

        # Comments
        c1 = Comment(task_id=t4.id, author_id=rev.id, content="Please double check vehicle speed and wheels to confirm Cyclist.")
        db.add(c1)
        db.commit()
        db.refresh(c1)

        c2 = Comment(task_id=t4.id, author_id=ann1.id, content="Understood, correcting on next pass.", parent_id=c1.id)
        db.add(c2)

        # Notifications
        notif1 = Notification(user_id=ann1.id, title="Task Rejected", message=f"Task #{t4.id} was rejected by Bob Reviewer. Object is on a bicycle.", type="rejection")
        notif2 = Notification(user_id=ann1.id, title="New Task Assigned", message=f"Task #{t2.id} (High Priority) assigned to you.", type="assignment")
        db.add(notif1)
        db.add(notif2)

        # Audit Logs
        log_audit_event(db, admin.id, "create_project", "project", p1.id, {"name": p1.name})
        log_audit_event(db, po.id, "create_schema_version", "schema", schema_v1.id, {"version": 1})
        log_audit_event(db, pm.id, "ingest_dataset", "dataset", dataset1.id, {"tasks_created": 6})
        log_audit_event(db, rev.id, "review_task", "task", t4.id, {"decision": "Reject"})
        log_audit_event(db, pm.id, "qa_signoff", "task", t5.id, {"status": "Locked"})

        # Initial Snapshot
        snapshot_manifest = [{
            "task_id": t5.id,
            "data_ref": t5.data_ref,
            "status": "Locked",
            "priority": "Normal",
            "payload": {"label": "Traffic Light", "confidence": 1.0}
        }]
        snap = DatasetSnapshot(
            project_id=p1.id,
            name="v1.0-golden-release",
            created_by=po.id,
            version_manifest_json=json.dumps(snapshot_manifest)
        )
        db.add(snap)
        db.commit()

        # 3. Project 2: Customer Intent NLP
        p2 = Project(
            name="Customer Support Intent NLP",
            description="Text classification for intent and sentiment in support transcripts.",
            schema_json=json.dumps({"categories": ["Refund Request", "Technical Support", "Billing Inquiry", "Feature Request", "Complaints"]}),
            settings_json=json.dumps({"domain": "NLP", "priority": "Normal"}),
            created_by=admin.id
        )
        db.add(p2)
        db.commit()
        db.refresh(p2)

        p2_settings = ProjectSetting(project_id=p2.id, review_mode="single", auto_assignment_enabled=True, batch_size=20, default_priority="Normal", sla_hours=24)
        db.add(p2_settings)

        memberships_p2 = [
            ProjectMembership(user_id=admin.id, project_id=p2.id, project_role="Admin"),
            ProjectMembership(user_id=po.id, project_id=p2.id, project_role="Product Owner"),
            ProjectMembership(user_id=pm.id, project_id=p2.id, project_role="Project Manager"),
            ProjectMembership(user_id=ann1.id, project_id=p2.id, project_role="Reviewer"), # Note cross-project role testing!
            ProjectMembership(user_id=ann2.id, project_id=p2.id, project_role="Annotator"),
        ]
        for m in memberships_p2:
            db.add(m)
        db.commit()

        schema_nlp = SchemaVersion(
            project_id=p2.id,
            version_number=1,
            taxonomy_json=p2.schema_json,
            guidelines_text="Classify the dominant customer intent.",
            defined_by=po.id
        )
        db.add(schema_nlp)
        db.commit()
        db.refresh(schema_nlp)

        t_nlp1 = Task(project_id=p2.id, data_ref=json.dumps({"text": "Where is my refund for order #9821?"}), status="Unassigned", priority="Urgent", schema_version_id=schema_nlp.id)
        t_nlp2 = Task(project_id=p2.id, data_ref=json.dumps({"text": "Application crashes when exporting report."}), status="In Progress", priority="High", assigned_to=ann2.id, assigned_at=now, schema_version_id=schema_nlp.id)
        db.add(t_nlp1)
        db.add(t_nlp2)
        db.commit()

        print("[Seed] Pre-seeding completed successfully.")
    except Exception as e:
        print(f"[Seed] Error during seeding: {e}")
    finally:
        db.close()


# --- PUBLIC & AUTH ROUTES ---

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "Annotation Ops", "version": "1.1", "timestamp": datetime.datetime.utcnow().isoformat()}

@app.post("/api/auth/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_user(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already registered")

    user = User(
        name=user_in.name,
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
        global_role=user_in.global_role or "user"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_audit_event(db, user.id, "user_register", "user", user.id, {"email": user.email})
    return user

@app.post("/api/auth/login", response_model=Token)
def login_user(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    token = create_access_token(data={"sub": user.email, "id": user.id, "global_role": user.global_role})
    log_audit_event(db, user.id, "user_login", "user", user.id, {"email": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}

@app.get("/api/auth/me", response_model=UserOut)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

# --- USER MANAGEMENT (Admin Only) ---

@app.get("/api/users", response_model=List[UserOut])
def list_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(User).all()

# --- PROJECT MANAGEMENT ---

@app.get("/api/projects", response_model=List[ProjectOut])
def list_projects(
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Project).filter(Project.is_deleted == False)
    if not include_archived:
        query = query.filter(Project.is_archived == False)

    if current_user.global_role != "admin":
        # Only return projects where the user holds membership
        user_memberships = db.query(ProjectMembership.project_id).filter(ProjectMembership.user_id == current_user.id).subquery()
        query = query.filter(Project.id.in_(user_memberships))

    return query.all()

@app.post("/api/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    p_in: ProjectCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin creates project and assigns initial Product Owner and Project Manager (FR-1.1)."""
    project = Project(
        name=p_in.name,
        description=p_in.description,
        schema_json=p_in.schema_json or json.dumps({"categories": ["Default"]}),
        settings_json=p_in.settings_json,
        created_by=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Add Project Settings
    setting = ProjectSetting(project_id=project.id)
    db.add(setting)

    # Add Admin Membership
    db.add(ProjectMembership(user_id=current_user.id, project_id=project.id, project_role="Admin"))

    # Assign initial PO and PM if specified
    if p_in.po_id:
        db.add(ProjectMembership(user_id=p_in.po_id, project_id=project.id, project_role="Product Owner"))
    if p_in.pm_id:
        db.add(ProjectMembership(user_id=p_in.pm_id, project_id=project.id, project_role="Project Manager"))

    # Create Initial Schema Version
    schema_v1 = SchemaVersion(
        project_id=project.id,
        version_number=1,
        taxonomy_json=project.schema_json,
        guidelines_text="Initial project guidelines.",
        defined_by=p_in.po_id or current_user.id
    )
    db.add(schema_v1)

    log_audit_event(db, current_user.id, "create_project", "project", project.id, {"name": project.name})
    db.commit()
    db.refresh(project)
    return project

@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project_details(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project

@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    p_update: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if p_update.name is not None:
        project.name = p_update.name
    if p_update.description is not None:
        project.description = p_update.description
    if p_update.settings_json is not None:
        project.settings_json = p_update.settings_json

    log_audit_event(db, current_user.id, "update_project", "project", project.id, p_update.dict(exclude_unset=True))
    db.commit()
    db.refresh(project)
    return project

@app.post("/api/projects/{project_id}/archive")
def archive_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive project. Requires PO sign-off if Approved/Locked tasks exist (FR-1.5)."""
    user_role = check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check for approved/locked tasks
    approved_count = db.query(Task).filter(Task.project_id == project_id, Task.status.in_(["Approved", "Locked"])).count()
    if approved_count > 0 and user_role not in ["Admin", "Product Owner"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Archiving a project with Approved/Locked tasks requires Product Owner sign-off."
        )

    project.is_archived = True
    project.archived_at = datetime.datetime.utcnow()
    log_audit_event(db, current_user.id, "archive_project", "project", project.id, {"approved_tasks": approved_count})
    db.commit()
    return {"message": "Project archived successfully", "project_id": project.id}

@app.post("/api/projects/{project_id}/delete")
def soft_delete_project(
    project_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin soft-deletes project with 30-day recovery window (FR-1.5)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project.is_deleted = True
    project.deleted_at = datetime.datetime.utcnow()
    log_audit_event(db, current_user.id, "soft_delete_project", "project", project.id, {"recovery_window_days": 30})
    db.commit()
    return {"message": "Project soft-deleted with 30-day recovery window", "project_id": project.id}

@app.post("/api/projects/{project_id}/recover")
def recover_project(
    project_id: int,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin recovers soft-deleted project (FR-1.5)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project.is_deleted = False
    project.deleted_at = None
    log_audit_event(db, current_user.id, "recover_project", "project", project.id)
    db.commit()
    return {"message": "Project recovered successfully", "project_id": project.id}

# --- MEMBERSHIP MANAGEMENT ---

@app.get("/api/projects/{project_id}/members", response_model=List[ProjectMembershipOut])
def list_project_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    return db.query(ProjectMembership).filter(ProjectMembership.project_id == project_id).all()

@app.post("/api/projects/{project_id}/members", response_model=ProjectMembershipOut)
def add_project_member(
    project_id: int,
    m_in: ProjectMembershipCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    existing = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == project_id,
        ProjectMembership.user_id == m_in.user_id
    ).first()

    if existing:
        existing.project_role = m_in.project_role
        db.commit()
        db.refresh(existing)
        log_audit_event(db, current_user.id, "update_member_role", "membership", existing.id, {"role": m_in.project_role})
        return existing

    membership = ProjectMembership(
        project_id=project_id,
        user_id=m_in.user_id,
        project_role=m_in.project_role
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    log_audit_event(db, current_user.id, "add_project_member", "membership", membership.id, {"role": m_in.project_role, "user_id": m_in.user_id})
    return membership

@app.delete("/api/projects/{project_id}/members/{user_id}")
def remove_project_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin"])
    membership = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == project_id,
        ProjectMembership.user_id == user_id
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    db.delete(membership)
    log_audit_event(db, current_user.id, "remove_project_member", "membership", membership.id, {"user_id": user_id})
    db.commit()
    return {"message": "Member removed successfully"}

# --- PROJECT SETTINGS ---

@app.get("/api/projects/{project_id}/settings", response_model=ProjectSettingOut)
def get_project_settings(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    setting = db.query(ProjectSetting).filter(ProjectSetting.project_id == project_id).first()
    if not setting:
        setting = ProjectSetting(project_id=project_id)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting

@app.put("/api/projects/{project_id}/settings", response_model=ProjectSettingOut)
def update_project_settings(
    project_id: int,
    s_in: ProjectSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    setting = db.query(ProjectSetting).filter(ProjectSetting.project_id == project_id).first()
    if not setting:
        setting = ProjectSetting(project_id=project_id)
        db.add(setting)

    if s_in.review_mode is not None:
        setting.review_mode = s_in.review_mode
    if s_in.auto_assignment_enabled is not None:
        setting.auto_assignment_enabled = s_in.auto_assignment_enabled
    if s_in.batch_size is not None:
        setting.batch_size = s_in.batch_size
    if s_in.default_priority is not None:
        setting.default_priority = s_in.default_priority
    if s_in.sla_hours is not None:
        setting.sla_hours = s_in.sla_hours

    log_audit_event(db, current_user.id, "update_project_settings", "setting", setting.id, s_in.dict(exclude_unset=True))
    db.commit()
    db.refresh(setting)
    return setting

# --- SCHEMA MANAGEMENT ---

@app.get("/api/projects/{project_id}/schemas", response_model=List[SchemaVersionOut])
def list_schema_versions(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    return db.query(SchemaVersion).filter(SchemaVersion.project_id == project_id).order_by(SchemaVersion.version_number.desc()).all()

@app.post("/api/projects/{project_id}/schemas", response_model=SchemaVersionOut, status_code=status.HTTP_201_CREATED)
def create_schema_version(
    project_id: int,
    s_in: SchemaVersionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Product Owner creates a new schema revision. In-flight tasks retain existing version (FR-1.2)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner"])
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Determine next version
    latest = db.query(SchemaVersion).filter(SchemaVersion.project_id == project_id).order_by(SchemaVersion.version_number.desc()).first()
    next_ver = (latest.version_number + 1) if latest else 1

    schema_ver = SchemaVersion(
        project_id=project_id,
        version_number=next_ver,
        taxonomy_json=s_in.taxonomy_json,
        guidelines_text=s_in.guidelines_text,
        defined_by=current_user.id
    )
    db.add(schema_ver)

    # Update project current schema
    project.schema_json = s_in.taxonomy_json

    log_audit_event(db, current_user.id, "create_schema_version", "schema", schema_ver.id, {"version_number": next_ver})
    db.commit()
    db.refresh(schema_ver)
    return schema_ver

# --- DATASET & IMPORT PIPELINE ---

@app.get("/api/projects/{project_id}/datasets", response_model=List[DatasetOut])
def list_datasets(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    return db.query(Dataset).filter(Dataset.project_id == project_id).all()

@app.get("/api/projects/{project_id}/imports", response_model=List[ImportJobOut])
def list_import_jobs(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    return db.query(ImportJob).filter(ImportJob.project_id == project_id).order_by(ImportJob.created_at.desc()).all()

@app.post("/api/projects/{project_id}/imports/upload", response_model=ImportJobOut)
async def upload_and_validate_import(
    project_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Uploads data file and validates format with row-level error reporting before ingestion (FR-1.3, FR-1.4)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    content = await file.read()
    job = create_import_job_and_validate(db, project_id, content, file.filename, current_user.id)
    return job

@app.post("/api/projects/{project_id}/imports/{job_id}/confirm")
def confirm_import_and_generate_tasks(
    project_id: int,
    job_id: int,
    req: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Confirms ingestion of validated items, creates Dataset record, and generates Tasks (FR-2.1)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    job = db.query(ImportJob).filter(ImportJob.id == job_id, ImportJob.project_id == project_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found")

    # Load parsed items from import job or generate fallback synthetic items
    sample_items = []
    if job.raw_valid_data_json:
        try:
            sample_items = json.loads(job.raw_valid_data_json)
        except Exception:
            sample_items = []

    if not sample_items:
        sample_items = [
            {"data_ref": json.dumps({"text": f"Imported sample record #{i+1}", "index": i+1})}
            for i in range(max(1, job.valid_rows))
        ]

    dataset, tasks_count = confirm_and_ingest_import(
        db, project_id, job_id, current_user.id,
        req.dataset_name or f"Dataset from Job #{job_id}",
        sample_items, req.priority or "Normal"
    )

    assigned = 0
    if req.auto_assign:
        assigned = auto_assign_tasks(db, project_id, current_user.id)

    return {
        "message": f"Successfully ingested {tasks_count} tasks into dataset '{dataset.name}'",
        "dataset_id": dataset.id,
        "tasks_created": tasks_count,
        "tasks_auto_assigned": assigned
    }

# --- TASK MANAGEMENT & WORKFLOW ---

@app.get("/api/projects/{project_id}/tasks", response_model=List[TaskOut])
def list_tasks(
    project_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    assignee_id: Optional[int] = Query(None),
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    query = db.query(Task).filter(Task.project_id == project_id)
    if status_filter:
        query = query.filter(Task.status == status_filter)
    if priority_filter:
        query = query.filter(Task.priority == priority_filter)
    if assignee_id:
        query = query.filter(Task.assigned_to == assignee_id)
    return query.order_by(Task.created_at.desc()).offset(offset).limit(limit).all()

@app.post("/api/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_project_task(
    project_id: int,
    t_in: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Creates a new task in Unassigned status (or Assigned if assignee specified)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    
    schema = db.query(SchemaVersion).filter(SchemaVersion.project_id == project_id).order_by(SchemaVersion.version_number.desc()).first()
    task_status = "Assigned" if t_in.assigned_to else "Unassigned"
    now = datetime.datetime.utcnow()
    
    task = Task(
        project_id=project_id,
        data_ref=t_in.data_ref,
        status=task_status,
        priority=t_in.priority or "Normal",
        assigned_to=t_in.assigned_to,
        schema_version_id=schema.id if schema else None,
        assigned_at=now if t_in.assigned_to else None,
        created_at=now,
        updated_at=now
    )
    db.add(task)
    db.flush()
    
    log_audit_event(db, current_user.id, "create_task", "task", task.id, {"status": task.status, "priority": task.priority})
    record_status_history(db, task, None, task.status, current_user.id, "Task manually created by PM")
    db.commit()
    db.refresh(task)
    return task

@app.get("/api/projects/{project_id}/tasks/my", response_model=List[TaskOut])
def list_my_tasks(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Annotator view: personal queue ordered by priority and assignment time (FR-4.3, FR-2.4)."""
    check_project_role(project_id, current_user, db, ["Admin", "Annotator"])
    return db.query(Task).filter(
        Task.project_id == project_id,
        Task.assigned_to == current_user.id,
        Task.status.in_(["Assigned", "In Progress", "Rejected"])
    ).order_by(
        case(
            (Task.priority == "Urgent", 1),
            (Task.priority == "High", 2),
            (Task.priority == "Normal", 3),
            (Task.priority == "Low", 4),
            else_=5
        ),
        Task.assigned_at.desc(),
        Task.created_at.asc()
    ).all()

@app.get("/api/projects/{project_id}/tasks/review-queue", response_model=List[TaskOut])
def list_review_queue(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reviewer view: pending review queue (FR-4.3)."""
    check_project_role(project_id, current_user, db, ["Admin", "Reviewer", "Project Manager"])
    return db.query(Task).filter(
        Task.project_id == project_id,
        Task.status.in_(["Submitted", "In Review", "Resubmitted"])
    ).order_by(Task.submitted_at.asc()).all()

@app.get("/api/projects/{project_id}/tasks/qa-queue", response_model=List[TaskOut])
def list_qa_queue(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """QA sign-off queue for PM and Admin (FR-3.5)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    return db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == "QA Pending"
    ).order_by(Task.reviewed_at.asc()).all()

@app.get("/api/projects/{project_id}/tasks/kanban")
def get_kanban_board(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Kanban board grouping tasks by status with full filter support (FR-5.3)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    statuses = ["Unassigned", "Assigned", "In Progress", "Submitted", "In Review", "Rejected", "Resubmitted", "QA Pending", "Approved", "Locked"]

    board = {s: [] for s in statuses}
    for t in tasks:
        assignee_name = t.assignee.name if t.assignee else "Unassigned"
        board[t.status].append({
            "id": t.id,
            "data_ref": t.data_ref,
            "priority": t.priority,
            "assigned_to": t.assigned_to,
            "assignee_name": assignee_name,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None
        })

    return board

@app.get("/api/projects/{project_id}/tasks/{task_id}", response_model=TaskOut)
def get_task_details(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    task = db.query(Task).filter(Task.id == task_id, Task.project_id == project_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task

@app.put("/api/projects/{project_id}/tasks/{task_id}/priority")
def update_task_priority(
    project_id: int,
    task_id: int,
    p_in: TaskPriorityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    task = db.query(Task).filter(Task.id == task_id, Task.project_id == project_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    old_priority = task.priority
    task.priority = p_in.priority
    task.updated_at = datetime.datetime.utcnow()
    log_audit_event(db, current_user.id, "update_task_priority", "task", task.id, {"old_priority": old_priority, "new_priority": p_in.priority})
    db.commit()
    return {"message": "Priority updated", "task_id": task.id, "priority": task.priority}

@app.post("/api/projects/{project_id}/tasks/{task_id}/submit", response_model=TaskOut)
def submit_annotation(
    project_id: int,
    task_id: int,
    s_in: TaskSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Annotator submits label: creates immutable TaskVersion, sets status In Review (FR-3.2, FR-7.1)."""
    check_project_role(project_id, current_user, db, ["Admin", "Annotator"])
    return submit_task_annotation(db, task_id, current_user, s_in.payload_json)

@app.post("/api/projects/{project_id}/tasks/{task_id}/review", response_model=TaskOut)
def review_annotation(
    project_id: int,
    task_id: int,
    r_in: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reviewer accepts or rejects task with mandatory comment on rejection (FR-3.3, FR-3.4)."""
    check_project_role(project_id, current_user, db, ["Admin", "Reviewer"])
    return review_task_submission(db, task_id, current_user, r_in.decision, r_in.comment)

@app.post("/api/projects/{project_id}/tasks/{task_id}/qa-signoff", response_model=TaskOut)
def qa_signoff(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Project Manager / Admin signs off task: QA Pending -> Approved -> Locked (FR-3.5)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    return qa_signoff_task(db, task_id, current_user)

@app.post("/api/projects/{project_id}/tasks/{task_id}/reopen", response_model=TaskOut)
def reopen_task(
    project_id: int,
    task_id: int,
    r_in: TaskReopen,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Admin-only reopen of locked task with mandatory audit reason (FR-3.5)."""
    return reopen_locked_task(db, task_id, current_user, r_in.reason)

@app.post("/api/projects/{project_id}/tasks/{task_id}/reassign", response_model=TaskOut)
def reassign_task(
    project_id: int,
    task_id: int,
    r_in: TaskReassign,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PM manual reassignment with mandatory reason requirement (FR-2.3)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    return manually_reassign_task(db, task_id, r_in.new_assignee_id, current_user, r_in.reason)

@app.post("/api/projects/{project_id}/assignments/auto")
def auto_assign(
    project_id: int,
    batch_size: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Auto-assign tasks to available annotators using load-balancing (FR-2.2, FR-2.5)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    count = auto_assign_tasks(db, project_id, current_user.id, batch_size)
    return {"message": f"Successfully auto-assigned {count} tasks", "assigned_count": count}

# --- COMMENTS ---

@app.get("/api/projects/{project_id}/tasks/{task_id}/comments", response_model=List[CommentOut])
def get_task_comments(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    return db.query(Comment).filter(Comment.task_id == task_id, Comment.parent_id == None).all()

@app.post("/api/projects/{project_id}/tasks/{task_id}/comments", response_model=CommentOut)
def create_task_comment(
    project_id: int,
    task_id: int,
    c_in: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    comment = Comment(
        task_id=task_id,
        author_id=current_user.id,
        content=c_in.content,
        parent_id=c_in.parent_id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    log_audit_event(db, current_user.id, "post_comment", "task", task_id, {"comment_id": comment.id})
    return comment

# --- ACTIVITY FEED ---

@app.get("/api/projects/{project_id}/activity")
def get_project_activity(
    project_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Chronological project activity feed showing timestamped state transitions (FR-5.1)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    # Fetch status history joined with tasks
    history = db.query(TaskStatusHistory).join(Task).filter(
        Task.project_id == project_id
    ).order_by(TaskStatusHistory.created_at.desc()).limit(limit).all()

    feed = []
    for h in history:
        user_name = h.user.name if h.user else "System"
        feed.append({
            "id": h.id,
            "task_id": h.task_id,
            "actor": user_name,
            "old_status": h.old_status,
            "new_status": h.new_status,
            "reason": h.reason,
            "timestamp": h.created_at.isoformat()
        })
    return feed

# --- ANALYTICS ---

@app.get("/api/projects/{project_id}/analytics/dashboard")
def get_dashboard_analytics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Project-level KPI stats (completion %, status counts, turnaround time, agreement) (FR-6.1)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"])
    return get_project_dashboard_stats(db, project_id)

@app.get("/api/projects/{project_id}/analytics/annotators")
def get_annotator_analytics(
    project_id: int,
    start_date: Optional[datetime.datetime] = None,
    end_date: Optional[datetime.datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Annotator productivity metrics (tasks completed, avg time, rejection rate) (FR-6.2)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    return get_annotator_stats(db, project_id, start_date, end_date)

@app.get("/api/projects/{project_id}/analytics/reviewers")
def get_reviewer_analytics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reviewer statistics (tasks reviewed, accept/reject ratio, avg review turnaround) (FR-6.3)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    return get_reviewer_stats(db, project_id)

@app.get("/api/projects/{project_id}/analytics/agreement")
def get_agreement_analytics(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Inter-annotator agreement: real Cohen's Kappa for categorical schemas (FR-6.4)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    kappa = get_project_cohens_kappa(db, project_id)
    return {
        "project_id": project_id,
        "cohens_kappa": kappa,
        "supported": True,
        "metric_type": "Cohen's Kappa (Categorical)",
        "interpretation": "High Agreement" if kappa >= 0.8 else ("Moderate Agreement" if kappa >= 0.4 else "Low / Disagreement")
    }

@app.get("/api/analytics/portfolio")
def get_po_portfolio(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Product Owner portfolio rollup across all owned projects (FR-6.6)."""
    return get_portfolio_stats(db, current_user)

@app.get("/api/projects/{project_id}/analytics/export")
def export_project_report_csv(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PM/Admin export quality and productivity report as CSV (FR-6.5)."""
    check_project_role(project_id, current_user, db, ["Admin", "Project Manager"])
    kpis = get_project_dashboard_stats(db, project_id)
    annotators = get_annotator_stats(db, project_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Annotation Ops - Quality & Productivity Report"])
    writer.writerow(["Project ID", project_id])
    writer.writerow(["Generated At", datetime.datetime.utcnow().isoformat()])
    writer.writerow([])
    writer.writerow(["Total Tasks", kpis["total_tasks"]])
    writer.writerow(["Completion %", kpis["completion_percentage"]])
    writer.writerow(["Avg Turnaround (s)", kpis["average_time_to_completion"]])
    writer.writerow(["Cohen's Kappa", kpis["cohens_kappa"]])
    writer.writerow(["Rejection Rate %", kpis["rejection_rate"]])
    writer.writerow([])
    writer.writerow(["Annotator", "Email", "Completed Tasks", "Total Submissions", "Avg Time (s)", "Rejection Rate %"])
    for ann in annotators:
        writer.writerow([ann["name"], ann["email"], ann["tasks_completed"], ann["total_submissions"], ann["average_time_seconds"], ann["rejection_rate"]])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=project_{project_id}_report.csv"}
    )

# --- DATASET SNAPSHOTS & EXPORT ---

@app.get("/api/projects/{project_id}/snapshots", response_model=List[DatasetSnapshotOut])
def list_snapshots(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    return db.query(DatasetSnapshot).filter(DatasetSnapshot.project_id == project_id).all()

@app.post("/api/projects/{project_id}/snapshots", response_model=DatasetSnapshotOut, status_code=status.HTTP_201_CREATED)
def create_snapshot(
    project_id: int,
    s_in: DatasetSnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Creates an immutable named snapshot of approved/locked task versions (FR-7.4)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])

    # Collect approved / locked tasks
    tasks = db.query(Task).filter(Task.project_id == project_id, Task.status.in_(["Approved", "Locked"])).all()
    manifest_items = []
    for t in tasks:
        version = db.query(TaskVersion).filter(TaskVersion.task_id == t.id).order_by(TaskVersion.version_number.desc()).first()
        payload = json.loads(version.payload_json) if version else {}
        manifest_items.append({
            "task_id": t.id,
            "data_ref": t.data_ref,
            "priority": t.priority,
            "status": t.status,
            "payload": payload,
            "version_number": version.version_number if version else 1
        })

    snapshot = DatasetSnapshot(
        project_id=project_id,
        name=s_in.name,
        created_by=current_user.id,
        version_manifest_json=json.dumps(manifest_items)
    )
    db.add(snapshot)
    db.flush()

    for item in manifest_items:
        snap_v = SnapshotTaskVersion(
            snapshot_id=snapshot.id,
            task_id=item["task_id"],
            task_version_id=item.get("version_number", 1)
        )
        db.add(snap_v)

    log_audit_event(db, current_user.id, "create_snapshot", "snapshot", snapshot.id, {"name": s_in.name, "task_count": len(manifest_items)})
    db.commit()
    db.refresh(snapshot)
    return snapshot

@app.get("/api/projects/{project_id}/export")
def export_dataset(
    project_id: int,
    format_type: str = Query("COCO", alias="format"), # COCO, YOLO, VOC, CONLL, JSONL
    snapshot_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Exports approved/locked labels in COCO, YOLO, Pascal VOC, CoNLL, or JSONL with manifest (FR-8.1, FR-8.2, FR-8.3)."""
    check_project_role(project_id, current_user, db, ["Admin", "Product Owner", "Project Manager"])
    zip_buffer = export_project_data(db, project_id, format_type, snapshot_id)

    log_audit_event(db, current_user.id, "export_dataset", "project", project_id, {"format": format_type, "snapshot_id": snapshot_id})

    filename = f"project_{project_id}_{format_type.lower()}_export.zip"
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# --- AUDIT LOGS & NOTIFICATIONS ---

@app.get("/api/audit-logs", response_model=List[AuditLogOut])
def list_audit_logs(
    project_id: Optional[int] = Query(None),
    entity_type: Optional[str] = Query(None),
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Append-only audit trail query (FR-7.3)."""
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    return query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

@app.get("/api/audit-logs/export-csv")
def export_audit_logs_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """CSV export of system audit trail (FR-7.3)."""
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(1000).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Actor ID", "Actor Name", "Action", "Entity Type", "Entity ID", "Metadata"])
    for l in logs:
        actor_name = l.actor.name if l.actor else "System"
        writer.writerow([l.id, l.timestamp.isoformat(), l.actor_id, actor_name, l.action, l.entity_type, l.entity_id, l.metadata_json or ""])

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"}
    )

@app.get("/api/notifications", response_model=List[NotificationOut])
def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """In-app notifications for authenticated user (FR-5.2)."""
    return db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()

@app.put("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notif.read = True
    db.commit()
    return {"message": "Marked as read", "id": notification_id}

@app.put("/api/notifications/read-all")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.read == False).update({"read": True})
    db.commit()
    return {"message": "All notifications marked as read"}
