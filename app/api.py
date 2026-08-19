"""
FastAPI routes for Phase 3 — Core Workflow Engine.
Mount `router` from main.py.
"""
from typing import List, Optional
from uuid import uuid4
import csv
import io
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from .database import get_db
from .models import ImportedItem, Task, TaskStatus, TaskComment, AuditLog, Role, User, Project, Dataset
from .services import TaskService
from .state_machine import InvalidTransitionError, UnauthorizedTransitionError
from .assignment import NoEligibleUserError
from .auth import (
    verify_password,
    create_access_token,
    get_current_user,
    require_authenticated,
    require_role
)
from . import schemas

router = APIRouter()

MANAGER_ROLES = (Role.ADMIN, Role.PROJECT_MANAGER)


def _ensure_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _ensure_dataset(db: Session, dataset_id: str, project_id: Optional[str] = None) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if project_id is not None and dataset.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Dataset does not belong to the specified project",
        )
    return dataset

# --------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------

@router.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not user.password_hash or not verify_password(
        payload.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    access_token = create_access_token(
        data={
            "sub": user.id,
            "role": user.role.value,
            "email": user.email,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value,
        "is_active": current_user.is_active,
    }


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    """Create a platform user. Only administrators can create users."""
    email = payload.email.strip().lower()
    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(status_code=409, detail="Email is already registered")

    from .auth import hash_password
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    return db.query(User).order_by(User.name.asc()).all()


@router.patch("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: str,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        from .auth import hash_password
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user


def _get_task_or_404(db: Session, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _handle_workflow_errors(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except InvalidTransitionError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except UnauthorizedTransitionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except NoEligibleUserError as e:
        raise HTTPException(status_code=422, detail=str(e))


# --------------------------------------------------------------------
# Projects CRUD
# --------------------------------------------------------------------

@router.post(
    "/projects",
    response_model=schemas.ProjectOut,
    status_code=201
)
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    project = Project(
        name=payload.name,
        description=payload.description,
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    return project


@router.get(
    "/projects",
    response_model=List[schemas.ProjectOut]
)
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    return (
        db.query(Project)
        .order_by(Project.created_at.desc())
        .all()
    )


@router.get(
    "/projects/{project_id}",
    response_model=schemas.ProjectOut
)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    return project


@router.put(
    "/projects/{project_id}",
    response_model=schemas.ProjectOut
)
def update_project(
    project_id: str,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    if payload.name is not None:
        project.name = payload.name

    if payload.description is not None:
        project.description = payload.description

    db.commit()
    db.refresh(project)

    return project


@router.delete(
    "/projects/{project_id}",
    status_code=204
)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    db.delete(project)
    db.commit()

    return None


# --------------------------------------------------------------------
# Datasets CRUD
# --------------------------------------------------------------------

@router.post(
    "/datasets",
    response_model=schemas.DatasetOut,
    status_code=201
)
def create_dataset(
    payload: schemas.DatasetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    # Verify that the parent project exists
    project = db.get(Project, payload.project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    dataset = Dataset(
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
    )

    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return dataset


@router.get(
    "/datasets",
    response_model=List[schemas.DatasetOut]
)
def list_datasets(
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    query = db.query(Dataset)

    if project_id:
        query = query.filter(
            Dataset.project_id == project_id
        )

    return (
        query
        .order_by(Dataset.created_at.desc())
        .all()
    )


@router.get(
    "/datasets/{dataset_id}",
    response_model=schemas.DatasetOut
)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    dataset = db.get(Dataset, dataset_id)

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found"
        )

    return dataset


@router.put(
    "/datasets/{dataset_id}",
    response_model=schemas.DatasetOut
)
def update_dataset(
    dataset_id: str,
    payload: schemas.DatasetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    dataset = db.get(Dataset, dataset_id)

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found"
        )

    if payload.name is not None:
        dataset.name = payload.name

    if payload.description is not None:
        dataset.description = payload.description

    db.commit()
    db.refresh(dataset)

    return dataset


@router.delete(
    "/datasets/{dataset_id}",
    status_code=204
)
def delete_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    dataset = db.get(Dataset, dataset_id)

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found"
        )

    imported_count = (
        db.query(ImportedItem)
        .filter(ImportedItem.dataset_id == dataset_id)
        .count()
    )
    if imported_count:
        raise HTTPException(
            status_code=409,
            detail="Dataset cannot be deleted while imported items exist"
        )

    db.delete(dataset)
    db.commit()

    return None


# --------------------------------------------------------------------
# Import + task generation
# --------------------------------------------------------------------

@router.post("/items/import", response_model=List[str])
def import_items(
    payload: schemas.ImportItemsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    """Bulk-load raw items. Returns the new ImportedItem ids."""
    _ensure_project(db, payload.project_id)
    if payload.dataset_id:
        _ensure_dataset(db, payload.dataset_id, payload.project_id)

    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    created_ids = []
    for raw in payload.items:
        item = ImportedItem(
            project_id=payload.project_id,
            dataset_id=payload.dataset_id,
            import_batch_id=payload.import_batch_id,
            external_id=raw.get("external_id"),
            payload=raw,
        )
        db.add(item)
        db.flush()
        created_ids.append(item.id)
    db.commit()
    return created_ids


# --------------------------------------------------------------------
# File-based bulk data import
# --------------------------------------------------------------------

@router.post("/items/import-file", response_model=List[str])
async def import_items_from_file(
    project_id: str = Form(...),
    dataset_id: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    """
    Bulk import annotation items from CSV or JSON file.

    Supported formats:
        - .csv
        - .json
    """

    # --------------------------------------------------------------
    # Validate project
    # --------------------------------------------------------------

    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # --------------------------------------------------------------
    # Validate dataset
    # --------------------------------------------------------------

    dataset = db.get(Dataset, dataset_id)

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found"
        )

    if dataset.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Dataset does not belong to the specified project"
        )

    # --------------------------------------------------------------
    # Validate file
    # --------------------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required"
        )

    filename = file.filename.lower()

    if not (
        filename.endswith(".csv")
        or filename.endswith(".json")
    ):
        raise HTTPException(
            status_code=400,
            detail="Only CSV and JSON files are supported"
        )

    # --------------------------------------------------------------
    # Read file
    # --------------------------------------------------------------

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    # --------------------------------------------------------------
    # Generate import batch ID
    # --------------------------------------------------------------

    import_batch_id = str(uuid4())

    # --------------------------------------------------------------
    # Parse CSV
    # --------------------------------------------------------------

    if filename.endswith(".csv"):

        try:
            text = content.decode("utf-8-sig")

            reader = csv.DictReader(
                io.StringIO(text)
            )

            items = list(reader)

        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid CSV file: {str(e)}"
            )

    # --------------------------------------------------------------
    # Parse JSON
    # --------------------------------------------------------------

    else:

        try:
            data = json.loads(
                content.decode("utf-8")
            )

        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid JSON file: {str(e)}"
            )

        if isinstance(data, list):
            items = data

        elif isinstance(data, dict):
            items = data.get("items")

            if not isinstance(items, list):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "JSON object must contain an "
                        "'items' array"
                    )
                )

        else:
            raise HTTPException(
                status_code=400,
                detail="JSON must contain an array of items"
            )

    # --------------------------------------------------------------
    # Validate records
    # --------------------------------------------------------------

    if not items:
        raise HTTPException(
            status_code=400,
            detail="No records found in uploaded file"
        )

    for index, item in enumerate(items):

        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Record {index + 1} must be an object"
            )

    # --------------------------------------------------------------
    # Create ImportedItem records
    # --------------------------------------------------------------

    created_ids = []

    try:

        for raw in items:

            item = ImportedItem(
                project_id=project_id,
                dataset_id=dataset_id,
                import_batch_id=import_batch_id,
                external_id=raw.get("external_id"),
                payload=raw,
            )

            db.add(item)
            db.flush()

            created_ids.append(item.id)

        db.commit()

    except Exception:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Failed to import items"
        )

    # --------------------------------------------------------------
    # Return result
    # --------------------------------------------------------------

    return created_ids

# --------------------------------------------------------------------
# Folder / multiple-file bulk data import
# --------------------------------------------------------------------

@router.post("/items/import-folder", response_model=List[str])
async def import_items_from_folder(
    project_id: str = Form(...),
    dataset_id: str = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    """
    Bulk import annotation items from multiple CSV or JSON files.

    Supported formats:
        - .csv
        - .json
    """

    # --------------------------------------------------------------
    # Validate project
    # --------------------------------------------------------------

    project = db.get(Project, project_id)

    if project is None:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # --------------------------------------------------------------
    # Validate dataset
    # --------------------------------------------------------------

    dataset = db.get(Dataset, dataset_id)

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found"
        )

    if dataset.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Dataset does not belong to the specified project"
        )

    # --------------------------------------------------------------
    # Validate files
    # --------------------------------------------------------------

    if not files:
        raise HTTPException(
            status_code=400,
            detail="At least one file is required"
        )

    created_ids = []

    try:

        for file in files:

            if not file.filename:
                raise HTTPException(
                    status_code=400,
                    detail="File name is required"
                )

            filename = file.filename.lower()

            if not (
                filename.endswith(".csv")
                or filename.endswith(".json")
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Unsupported file: {file.filename}. "
                        "Only CSV and JSON files are supported."
                    )
                )

            # ------------------------------------------------------
            # Read file
            # ------------------------------------------------------

            content = await file.read()

            if not content:
                raise HTTPException(
                    status_code=400,
                    detail=f"Uploaded file is empty: {file.filename}"
                )

            # ------------------------------------------------------
            # Parse CSV
            # ------------------------------------------------------

            if filename.endswith(".csv"):

                try:
                    text = content.decode("utf-8-sig")

                    reader = csv.DictReader(
                        io.StringIO(text)
                    )

                    items = list(reader)

                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Invalid CSV file "
                            f"{file.filename}: {str(e)}"
                        )
                    )

            # ------------------------------------------------------
            # Parse JSON
            # ------------------------------------------------------

            else:

                try:
                    data = json.loads(
                        content.decode("utf-8")
                    )

                except Exception as e:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Invalid JSON file "
                            f"{file.filename}: {str(e)}"
                        )
                    )

                if isinstance(data, list):

                    items = data

                elif isinstance(data, dict):

                    items = data.get("items")

                    if not isinstance(items, list):
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"JSON file {file.filename} "
                                "must contain an 'items' array"
                            )
                        )

                else:

                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"JSON file {file.filename} "
                            "must contain an array of items"
                        )
                    )

            # ------------------------------------------------------
            # Validate records
            # ------------------------------------------------------

            if not items:
                raise HTTPException(
                    status_code=400,
                    detail=f"No records found in {file.filename}"
                )

            for index, raw in enumerate(items):

                if not isinstance(raw, dict):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Record {index + 1} in "
                            f"{file.filename} must be an object"
                        )
                    )

                item = ImportedItem(
                    project_id=project_id,
                    dataset_id=dataset_id,
                    import_batch_id=str(uuid4()),
                    external_id=raw.get("external_id"),
                    payload=raw,
                )

                db.add(item)
                db.flush()

                created_ids.append(item.id)

        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Failed to import files"
        )

    return created_ids

@router.post("/tasks/generate", response_model=List[schemas.TaskOut])
def generate_tasks(
    payload: schemas.GenerateTasksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    """Task generation from imported items, with optional immediate auto-assignment."""
    service = TaskService(db, default_strategy=payload.strategy)
    tasks = _handle_workflow_errors(
        service.generate_tasks_from_items, payload.item_ids, payload.auto_assign
    )
    return tasks


# --------------------------------------------------------------------
# Task queries
# --------------------------------------------------------------------

@router.get("/tasks", response_model=List[schemas.TaskOut])
def list_tasks(
    status: Optional[TaskStatus] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    q = db.query(Task)
    if status:
        q = q.filter(Task.status == status)
    return q.order_by(Task.created_at.desc()).limit(200).all()


@router.get("/tasks/{task_id}", response_model=schemas.TaskOut)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    return _get_task_or_404(db, task_id)


@router.get("/tasks/{task_id}/audit-log", response_model=List[schemas.AuditLogOut])
def get_audit_log(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    _get_task_or_404(db, task_id)
    return (
        db.query(AuditLog)
        .filter(AuditLog.task_id == task_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )


@router.get("/tasks/{task_id}/comments", response_model=List[schemas.CommentOut])
def get_comments(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_authenticated),
):
    _get_task_or_404(db, task_id)
    return (
        db.query(TaskComment)
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
        .all()
    )


# --------------------------------------------------------------------
# Annotator actions
# --------------------------------------------------------------------

@router.post("/tasks/{task_id}/assign-annotator", response_model=schemas.TaskOut)
def assign_annotator(
    task_id: str,
    body: schemas.ActorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*MANAGER_ROLES)),
):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)

    user = service._assign(task, Role.ANNOTATOR)
    service._transition(task, "assign_annotator", actor_role=None, actor_id=None)

    db.commit()
    return task

@router.post("/tasks/{task_id}/start", response_model=schemas.TaskOut)
def start_annotation(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)

    return _handle_workflow_errors(
        service.start_annotation,
        task,
        current_user.id
    )


@router.post("/tasks/{task_id}/submit", response_model=schemas.TaskOut)
def submit_for_review(task_id: str, body: schemas.ActorRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    return _handle_workflow_errors(service.submit_for_review, task, body.actor_id)


# --------------------------------------------------------------------
# Reviewer actions
# --------------------------------------------------------------------

@router.post("/tasks/{task_id}/review/approve", response_model=schemas.TaskOut)
def reviewer_approve(task_id: str, body: schemas.ActorRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    return _handle_workflow_errors(service.reviewer_approve, task, body.actor_id)


@router.post("/tasks/{task_id}/review/reject", response_model=schemas.TaskOut)
def reviewer_reject(task_id: str, body: schemas.RejectRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    return _handle_workflow_errors(service.reviewer_reject, task, body.actor_id, body.reason)


# --------------------------------------------------------------------
# QA actions
# --------------------------------------------------------------------

@router.post("/tasks/{task_id}/qa/approve", response_model=schemas.TaskOut)
def qa_approve(task_id: str, body: schemas.ActorRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    return _handle_workflow_errors(service.qa_approve, task, body.actor_id)


@router.post("/tasks/{task_id}/qa/reject", response_model=schemas.TaskOut)
def qa_reject(task_id: str, body: schemas.RejectRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    return _handle_workflow_errors(service.qa_reject, task, body.actor_id, body.reason)


# --------------------------------------------------------------------
# Comments
# --------------------------------------------------------------------

@router.post("/tasks/{task_id}/comments", response_model=schemas.CommentOut)
def add_comment(task_id: str, body: schemas.CommentRequest, db: Session = Depends(get_db)):
    task = _get_task_or_404(db, task_id)
    service = TaskService(db)
    comment = service.add_comment(task, body.author_id, task.status, body.body)
    db.commit()
    return comment
