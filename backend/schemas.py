from pydantic import BaseModel, EmailStr, ConfigDict, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# --- USER SCHEMAS ---
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    global_role: Optional[str] = "user"
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    global_role: str
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- PROJECT MEMBERSHIP SCHEMAS ---
class ProjectMembershipCreate(BaseModel):
    user_id: int
    project_role: str # "Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ProjectMembershipOut(BaseModel):
    id: int
    user_id: int
    project_id: int
    project_role: str
    user: Optional[UserOut] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- PROJECT SCHEMAS ---
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    schema_json: Optional[str] = None
    settings_json: Optional[str] = None
    po_id: Optional[int] = None
    pm_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    settings_json: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ProjectSettingOut(BaseModel):
    id: int
    project_id: int
    review_mode: str
    auto_assignment_enabled: bool
    batch_size: int
    default_priority: str
    sla_hours: int
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ProjectSettingUpdate(BaseModel):
    review_mode: Optional[str] = None
    auto_assignment_enabled: Optional[bool] = None
    batch_size: Optional[int] = None
    default_priority: Optional[str] = None
    sla_hours: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    schema_json: Optional[str] = None
    settings_json: Optional[str] = None
    created_by: Optional[int] = None
    is_archived: bool
    archived_at: Optional[datetime] = None
    is_deleted: bool
    deleted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    memberships: Optional[List[ProjectMembershipOut]] = None
    settings: Optional[ProjectSettingOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- SCHEMA VERSION SCHEMAS ---
class SchemaVersionCreate(BaseModel):
    taxonomy_json: str
    guidelines_text: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class SchemaVersionOut(BaseModel):
    id: int
    project_id: int
    version_number: int
    taxonomy_json: str
    guidelines_text: Optional[str] = None
    defined_by: int
    author: Optional[UserOut] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- DATASET SCHEMAS ---
class DatasetOut(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = None
    total_items: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- TASK VERSION SCHEMAS ---
class TaskVersionOut(BaseModel):
    id: int
    task_id: int
    submitted_by: int
    payload_json: str
    version_number: int
    created_at: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- REVIEW SCHEMAS ---
class ReviewCreate(BaseModel):
    decision: str # "Accept" or "Reject"
    comment: Optional[str] = None # Mandatory if Reject
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ReviewOut(BaseModel):
    id: int
    task_id: int
    reviewer_id: int
    decision: str
    comment: Optional[str] = None
    review_round: int
    created_at: datetime
    reviewer: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- COMMENT SCHEMAS ---
class CommentCreate(BaseModel):
    content: str
    parent_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class CommentOut(BaseModel):
    id: int
    task_id: int
    author_id: int
    content: str
    parent_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    author: Optional[UserOut] = None
    replies: Optional[List['CommentOut']] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- TASK SCHEMAS ---
class TaskSubmit(BaseModel):
    payload_json: str # JSON string of annotations
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskAssign(BaseModel):
    assigned_to: int
    reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskReassign(BaseModel):
    new_assignee_id: int
    reason: str # Mandatory reason for audit
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskPriorityUpdate(BaseModel):
    priority: str # "Low", "Normal", "High", "Urgent"
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskReopen(BaseModel):
    reason: str # Mandatory reason for admin reopen
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskStatusTransition(BaseModel):
    new_status: str
    reason: Optional[str] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskStatusHistoryOut(BaseModel):
    id: int
    task_id: int
    old_status: Optional[str] = None
    new_status: str
    changed_by: Optional[int] = None
    reason: Optional[str] = None
    created_at: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class AssignmentHistoryOut(BaseModel):
    id: int
    task_id: int
    previous_assignee_id: Optional[int] = None
    new_assignee_id: Optional[int] = None
    assigned_by: Optional[int] = None
    reason: Optional[str] = None
    created_at: datetime
    previous_assignee: Optional[UserOut] = None
    new_assignee: Optional[UserOut] = None
    actor: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class TaskOut(BaseModel):
    id: int
    project_id: int
    dataset_id: Optional[int] = None
    data_ref: str
    status: str
    priority: str
    assigned_to: Optional[int] = None
    schema_version_id: Optional[int] = None
    assigned_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    assignee: Optional[UserOut] = None
    schema_version: Optional[SchemaVersionOut] = None
    versions: Optional[List[TaskVersionOut]] = None
    reviews: Optional[List[ReviewOut]] = None
    comments: Optional[List[CommentOut]] = None
    status_history: Optional[List[TaskStatusHistoryOut]] = None
    assignment_history: Optional[List[AssignmentHistoryOut]] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- IMPORT SCHEMAS ---
class ImportErrorOut(BaseModel):
    id: int
    row_index: int
    error_message: str
    raw_data_json: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ImportJobOut(BaseModel):
    id: int
    project_id: int
    dataset_id: Optional[int] = None
    status: str
    total_rows: int
    valid_rows: int
    invalid_rows: int
    created_at: datetime
    errors: Optional[List[ImportErrorOut]] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class ImportConfirmRequest(BaseModel):
    dataset_name: Optional[str] = None
    priority: Optional[str] = "Normal"
    auto_assign: Optional[bool] = True
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- DATASET SNAPSHOT SCHEMAS ---
class DatasetSnapshotCreate(BaseModel):
    name: str
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

class DatasetSnapshotOut(BaseModel):
    id: int
    project_id: int
    name: str
    created_by: Optional[int] = None
    version_manifest_json: str
    created_at: datetime
    author: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- AUDIT LOG SCHEMAS ---
class AuditLogOut(BaseModel):
    id: int
    actor_id: Optional[int] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    timestamp: datetime
    metadata_json: Optional[str] = None
    actor: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

# --- NOTIFICATION SCHEMAS ---
class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    message: str
    type: str
    read: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
