"""
Core data model for the data-annotation platform.

Tables:
    users              - annotators / reviewers / QA / admins
    imported_items      - raw items pulled in from an import job
    tasks               - one task per imported item; carries workflow status
    task_assignments    - full history of who was assigned to a task and when
    task_comments       - reviewer / QA feedback attached to a task
    audit_logs          - immutable record of every status transition
    annotations         - versioned annotation payloads attached to tasks
"""
import enum
import uuid

from sqlalchemy import (
    Column, String, Text, ForeignKey, DateTime, Enum, Integer, JSON, Boolean,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


# --------------------------------------------------------------------------
# Enums
# --------------------------------------------------------------------------

class Role(str, enum.Enum):
    ANNOTATOR = "annotator"
    REVIEWER = "reviewer"
    QA = "qa"                    # kept for the existing Phase 3 workflow
    PROJECT_MANAGER = "project_manager"
    ADMIN = "admin"


class TaskStatus(str, enum.Enum):
    PENDING = "pending"                        # created, not yet assigned
    ASSIGNED_ANNOTATOR = "assigned_annotator"   # assigned, annotator hasn't started
    ANNOTATING = "annotating"                   # annotator actively working
    SUBMITTED_FOR_REVIEW = "submitted_for_review"
    REVIEWING = "reviewing"                     # reviewer claimed / is reviewing
    REJECTED_BY_REVIEWER = "rejected_by_reviewer"  # transient -> routed back to ANNOTATING
    SUBMITTED_FOR_QA = "submitted_for_qa"
    QA_REVIEWING = "qa_reviewing"
    REJECTED_BY_QA = "rejected_by_qa"           # transient -> routed back for rework
    APPROVED = "approved"                       # terminal success
    COMPLETED = "completed"                     # terminal, fully closed out


class AssignmentStrategy(str, enum.Enum):
    ROUND_ROBIN = "round_robin"
    LOAD_BASED = "load_based"


# --------------------------------------------------------------------------
# Tables
# --------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=True)
    role = Column(Enum(Role), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    assignments = relationship("TaskAssignment", back_populates="user")


# --------------------------------------------------------------------------
# Projects & Datasets
# --------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    datasets = relationship(
        "Dataset",
        back_populates="project",
        cascade="all, delete-orphan"
    )


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)

    project_id = Column(
        UUID(as_uuid=False),
        ForeignKey("projects.id"),
        nullable=False,
        index=True
    )

    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    project = relationship(
        "Project",
        back_populates="datasets"
    )
    imported_items = relationship(
        "ImportedItem",
        back_populates="dataset"
    )


class ImportedItem(Base):
    __tablename__ = "imported_items"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    project_id = Column(String, nullable=False, index=True)
    dataset_id = Column(
        UUID(as_uuid=False),
        ForeignKey("datasets.id"),
        nullable=True,
        index=True,
    )
    external_id = Column(String, nullable=True)   # id from the source system, if any
    payload = Column(JSON, nullable=False)         # the raw item to be annotated
    import_batch_id = Column(String, nullable=False, index=True)
    imported_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="imported_items")
    task = relationship("Task", back_populates="item", uselist=False)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    item_id = Column(UUID(as_uuid=False), ForeignKey("imported_items.id"), nullable=False, unique=True)

    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.PENDING, index=True)

    current_annotator_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    current_reviewer_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    current_qa_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    rework_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    item = relationship("ImportedItem", back_populates="task")
    assignments = relationship("TaskAssignment", back_populates="task", order_by="TaskAssignment.assigned_at")
    comments = relationship("TaskComment", back_populates="task", order_by="TaskComment.created_at")
    audit_logs = relationship("AuditLog", back_populates="task", order_by="AuditLog.created_at")
    annotations = relationship(
        "Annotation",
        back_populates="task",
        order_by="Annotation.version",
        cascade="all, delete-orphan",
    )


class Annotation(Base):
    """Versioned annotation data produced while working on a task.

    A task may have multiple annotation versions because reviewer/QA
    rejection can send the task back for rework. Only one version should be
    marked as current by application logic.
    """
    __tablename__ = "annotations"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    task_id = Column(
        UUID(as_uuid=False),
        ForeignKey("tasks.id"),
        nullable=False,
        index=True,
    )
    annotator_id = Column(
        UUID(as_uuid=False),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    version = Column(Integer, nullable=False, default=1)
    data = Column(JSON, nullable=False)
    is_current = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    task = relationship("Task", back_populates="annotations")
    annotator = relationship("User")

    __table_args__ = (
        UniqueConstraint("task_id", "version", name="uq_annotation_task_version"),
    )


class TaskAssignment(Base):
    """Full history of assignment events — not overwritten, always appended."""
    __tablename__ = "task_assignments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    task_id = Column(UUID(as_uuid=False), ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(Enum(Role), nullable=False)
    strategy_used = Column(Enum(AssignmentStrategy), nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    unassigned_at = Column(DateTime(timezone=True), nullable=True)

    task = relationship("Task", back_populates="assignments")
    user = relationship("User", back_populates="assignments")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    task_id = Column(UUID(as_uuid=False), ForeignKey("tasks.id"), nullable=False, index=True)
    author_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    stage = Column(Enum(TaskStatus), nullable=False)   # which stage the comment was made at
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("Task", back_populates="comments")
    author = relationship("User")


class AuditLog(Base):
    """
    Immutable append-only record of every status transition.
    Nothing in this table is ever updated or deleted.
    """
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    task_id = Column(UUID(as_uuid=False), ForeignKey("tasks.id"), nullable=False, index=True)
    actor_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)  # null = system
    action = Column(String, nullable=False)          # e.g. "submit", "approve", "reject", "assign"
    from_status = Column(Enum(TaskStatus), nullable=True)
    to_status = Column(Enum(TaskStatus), nullable=False)
    event_metadata = Column(JSON, nullable=True)      # free-form context (e.g. rejection reason)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    task = relationship("Task", back_populates="audit_logs")
    actor = relationship("User")
