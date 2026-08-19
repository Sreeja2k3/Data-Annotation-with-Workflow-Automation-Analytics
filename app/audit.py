"""
Audit trail writer. Called by TaskService on every single status change,
assignment, and comment so the full history of a task can be reconstructed.
"""
from typing import Optional
from sqlalchemy.orm import Session

from .models import AuditLog, TaskStatus


def log_event(
    db: Session,
    task_id: str,
    action: str,
    to_status: TaskStatus,
    from_status: Optional[TaskStatus] = None,
    actor_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> AuditLog:
    entry = AuditLog(
        task_id=task_id,
        actor_id=actor_id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        event_metadata=metadata or {},
    )
    db.add(entry)
    db.flush()  # get entry.id / created_at without committing yet
    return entry
