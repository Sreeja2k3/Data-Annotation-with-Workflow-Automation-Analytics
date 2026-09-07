import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(512), nullable=False)
    global_role = Column(String(50), default="user", nullable=False) # "admin" or "user"
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    memberships = relationship("ProjectMembership", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    task_versions = relationship("TaskVersion", back_populates="user")
    reviews = relationship("Review", back_populates="reviewer")
    comments = relationship("Comment", back_populates="author")
    audit_logs = relationship("AuditLog", back_populates="actor")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    settings_json = Column(Text, nullable=True) # Technical settings (e.g. storage bucket, tags)
    schema_json = Column(Text, nullable=True) # Current schema JSON representation
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    archived_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime, nullable=True) # For 30-day soft-delete recovery

    # Relationships
    memberships = relationship("ProjectMembership", back_populates="project", cascade="all, delete-orphan")
    schema_versions = relationship("SchemaVersion", back_populates="project", cascade="all, delete-orphan")
    datasets = relationship("Dataset", back_populates="project", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    snapshots = relationship("DatasetSnapshot", back_populates="project", cascade="all, delete-orphan")
    settings = relationship("ProjectSetting", back_populates="project", uselist=False, cascade="all, delete-orphan")
    import_jobs = relationship("ImportJob", back_populates="project", cascade="all, delete-orphan")


class ProjectMembership(Base):
    __tablename__ = "project_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    project_role = Column(String(50), nullable=False) # "Admin", "Product Owner", "Project Manager", "Annotator", "Reviewer"
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="memberships")
    project = relationship("Project", back_populates="memberships")

    __table_args__ = (
        Index("ix_project_user", "project_id", "user_id", unique=True),
    )


class SchemaVersion(Base):
    __tablename__ = "schema_versions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    taxonomy_json = Column(Text, nullable=False) # JSON taxonomy (categories, classes, attributes)
    guidelines_text = Column(Text, nullable=True)
    defined_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="schema_versions")
    author = relationship("User")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String(512), nullable=True)
    total_items = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="datasets")
    tasks = relationship("Task", back_populates="dataset", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True)
    data_ref = Column(Text, nullable=False) # JSON string with item content (e.g. {"image_url": "...", "text": "..."})
    status = Column(String(50), default="Unassigned", nullable=False, index=True) 
    # "Unassigned", "Assigned", "In Progress", "Submitted", "In Review", "Rejected", "Resubmitted", "QA Pending", "Approved", "Locked"
    priority = Column(String(50), default="Normal", nullable=False, index=True) # "Low", "Normal", "High", "Urgent"
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    schema_version_id = Column(Integer, ForeignKey("schema_versions.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    locked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="tasks")
    dataset = relationship("Dataset", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])
    schema_version = relationship("SchemaVersion")
    versions = relationship("TaskVersion", back_populates="task", cascade="all, delete-orphan", order_by="TaskVersion.version_number")
    reviews = relationship("Review", back_populates="task", cascade="all, delete-orphan", order_by="Review.created_at")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    status_history = relationship("TaskStatusHistory", back_populates="task", cascade="all, delete-orphan", order_by="TaskStatusHistory.created_at")
    assignment_history = relationship("AssignmentHistory", back_populates="task", cascade="all, delete-orphan", order_by="AssignmentHistory.created_at")

    __table_args__ = (
        Index("ix_tasks_project_status", "project_id", "status"),
        Index("ix_tasks_project_assignee", "project_id", "assigned_to"),
        Index("ix_tasks_priority_created", "priority", "created_at"),
    )


class TaskVersion(Base):
    __tablename__ = "task_versions"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    payload_json = Column(Text, nullable=False) # Immutable annotation state JSON
    version_number = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    task = relationship("Task", back_populates="versions")
    user = relationship("User", back_populates="task_versions")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    decision = Column(String(50), nullable=False) # "Accept", "Reject"
    comment = Column(Text, nullable=True) # Mandatory when decision == "Reject"
    review_round = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    task = relationship("Task", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    task = relationship("Task", back_populates="comments")
    author = relationship("User", back_populates="comments")
    parent = relationship("Comment", remote_side=[id], back_populates="replies")
    replies = relationship("Comment", back_populates="parent", cascade="all, delete-orphan")


class TaskStatusHistory(Base):
    __tablename__ = "task_status_history"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    # Relationships
    task = relationship("Task", back_populates="status_history")
    user = relationship("User")


class AssignmentHistory(Base):
    __tablename__ = "assignment_history"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    new_assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=True) # Required for manual reassignment
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    # Relationships
    task = relationship("Task", back_populates="assignment_history")
    previous_assignee = relationship("User", foreign_keys=[previous_assignee_id])
    new_assignee = relationship("User", foreign_keys=[new_assignee_id])
    actor = relationship("User", foreign_keys=[assigned_by])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True) # "create_project", "change_status", "assign_task", "submit_annotation", "review_task", "qa_signoff", "reopen_task", "create_snapshot", "export", etc.
    entity_type = Column(String(100), nullable=False, index=True) # "project", "task", "user", "snapshot", "schema"
    entity_id = Column(Integer, nullable=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    metadata_json = Column(Text, nullable=True)

    # Relationships
    actor = relationship("User", back_populates="audit_logs")


class DatasetSnapshot(Base):
    __tablename__ = "dataset_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    version_manifest_json = Column(Text, nullable=False) # JSON dump of all approved/locked task payloads
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="snapshots")
    author = relationship("User")
    snapshot_versions = relationship("SnapshotTaskVersion", back_populates="snapshot", cascade="all, delete-orphan")


class SnapshotTaskVersion(Base):
    __tablename__ = "snapshot_task_versions"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("dataset_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    task_version_id = Column(Integer, ForeignKey("task_versions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    snapshot = relationship("DatasetSnapshot", back_populates="snapshot_versions")
    task = relationship("Task")
    task_version = relationship("TaskVersion")


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="Pending", nullable=False) # "Pending", "Validated", "Completed", "Failed"
    total_rows = Column(Integer, default=0, nullable=False)
    valid_rows = Column(Integer, default=0, nullable=False)
    invalid_rows = Column(Integer, default=0, nullable=False)
    raw_valid_data_json = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="import_jobs")
    errors = relationship("ImportError", back_populates="import_job", cascade="all, delete-orphan")


class ImportError(Base):
    __tablename__ = "import_errors"

    id = Column(Integer, primary_key=True, index=True)
    import_job_id = Column(Integer, ForeignKey("import_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    row_index = Column(Integer, nullable=False)
    error_message = Column(Text, nullable=False)
    raw_data_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)

    # Relationships
    import_job = relationship("ImportJob", back_populates="errors")


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    format_type = Column(String(50), nullable=False) # "COCO", "YOLO", "VOC", "CoNLL", "JSONL"
    snapshot_id = Column(Integer, ForeignKey("dataset_snapshots.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="Completed", nullable=False)
    file_url = Column(String(512), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)


class ProjectSetting(Base):
    __tablename__ = "project_settings"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    review_mode = Column(String(50), default="single", nullable=False) # "single" or "dual"
    auto_assignment_enabled = Column(Boolean, default=True, nullable=False)
    batch_size = Column(Integer, default=20, nullable=False)
    default_priority = Column(String(50), default="Normal", nullable=False)
    sla_hours = Column(Integer, default=48, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="settings")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(50), nullable=False) # "assignment", "rejection", "reassignment", "sla_warning", "qa_pending", "approved"
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="notifications")
