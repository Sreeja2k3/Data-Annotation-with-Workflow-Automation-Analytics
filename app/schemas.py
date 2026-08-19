from datetime import datetime
from typing import Optional, Any, List
from pydantic import BaseModel, ConfigDict

from .models import TaskStatus, Role, AssignmentStrategy


class ImportItemsRequest(BaseModel):
    project_id: str
    dataset_id: Optional[str] = None
    import_batch_id: str
    items: List[dict]              # raw payloads; external_id optional inside each dict


class GenerateTasksRequest(BaseModel):
    item_ids: List[str]
    auto_assign: bool = True
    strategy: AssignmentStrategy = AssignmentStrategy.LOAD_BASED


class ActorRequest(BaseModel):
    actor_id: str


class RejectRequest(BaseModel):
    actor_id: str
    reason: str


class CommentRequest(BaseModel):
    author_id: str
    body: str

# --------------------------------------------------------------------------
# User / RBAC schemas
# --------------------------------------------------------------------------

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: Role
    is_active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str
    role: Role
    is_active: bool


# --------------------------------------------------------------------------
# Project schemas
# --------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------
# Dataset schemas
# --------------------------------------------------------------------------

class DatasetCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DatasetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: str
    status: TaskStatus
    current_annotator_id: Optional[str]
    current_reviewer_id: Optional[str]
    current_qa_id: Optional[str]
    rework_count: int
    created_at: datetime
    updated_at: datetime


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    author_id: str
    stage: TaskStatus
    body: str
    created_at: datetime


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    actor_id: Optional[str]
    action: str
    from_status: Optional[TaskStatus]
    to_status: TaskStatus
    event_metadata: Optional[Any]
    created_at: datetime


# --------------------------------------------------------------------------
# Authentication schemas
# --------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
