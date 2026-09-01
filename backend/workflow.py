import json
import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Optional, Dict, Any

from backend.models import Task, TaskVersion, Review, TaskStatusHistory, AuditLog, Notification, ProjectSetting, User

VALID_TRANSITIONS = {
    "Unassigned": ["Assigned"],
    "Assigned": ["In Progress", "Unassigned"],
    "In Progress": ["Submitted", "Assigned"],
    "Submitted": ["In Review"],
    "In Review": ["QA Pending", "Rejected"],
    "Rejected": ["Resubmitted", "In Progress"],
    "Resubmitted": ["In Review"],
    "QA Pending": ["Approved", "In Review", "Rejected"],
    "Approved": ["Locked"],
    "Locked": ["In Progress"] # Only via explicit Admin reopen
}

def log_audit_event(
    db: Session,
    actor_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int],
    metadata: Optional[Dict[str, Any]] = None
) -> AuditLog:
    """Appends an immutable audit log record to the database."""
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=json.dumps(metadata) if metadata else None,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(log)
    db.flush()
    return log

def record_status_history(
    db: Session,
    task: Task,
    old_status: Optional[str],
    new_status: str,
    actor_id: Optional[int],
    reason: Optional[str] = None
) -> TaskStatusHistory:
    """Records a task status transition history item."""
    history = TaskStatusHistory(
        task_id=task.id,
        old_status=old_status,
        new_status=new_status,
        changed_by=actor_id,
        reason=reason,
        created_at=datetime.datetime.utcnow()
    )
    db.add(history)
    db.flush()
    return history

def submit_task_annotation(
    db: Session,
    task_id: int,
    user: User,
    payload_json: str
) -> Task:
    """
    Submits an annotation label by an annotator.
    Creates an immutable TaskVersion and transitions task into Review queue.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status == "Locked":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task is locked and cannot be modified")

    if task.assigned_to != user.id and user.global_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only submit work on your own assigned tasks")

    # Validate JSON payload
    try:
        json.loads(payload_json)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    # Determine version number
    latest_version = db.query(TaskVersion).filter(TaskVersion.task_id == task.id).order_by(TaskVersion.version_number.desc()).first()
    next_version_num = (latest_version.version_number + 1) if latest_version else 1

    # Create immutable version
    new_version = TaskVersion(
        task_id=task.id,
        submitted_by=user.id,
        payload_json=payload_json,
        version_number=next_version_num,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_version)

    old_status = task.status
    new_status = "In Review"
    task.status = new_status
    task.submitted_at = datetime.datetime.utcnow()
    task.updated_at = datetime.datetime.utcnow()

    # Record history & audit
    record_status_history(db, task, old_status, new_status, user.id, f"Submitted version {next_version_num}")
    log_audit_event(
        db,
        actor_id=user.id,
        action="submit_annotation",
        entity_type="task",
        entity_id=task.id,
        metadata={"version_number": next_version_num, "project_id": task.project_id}
    )

    db.commit()
    db.refresh(task)
    return task

def review_task_submission(
    db: Session,
    task_id: int,
    reviewer: User,
    decision: str, # "Accept" or "Reject"
    comment: Optional[str] = None
) -> Task:
    """
    Executes reviewer decision on a submitted task.
    Prevents self-review. Requires non-empty comment for rejection.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status not in ["Submitted", "In Review", "Resubmitted"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task is in status '{task.status}' and cannot be reviewed")

    # Prevent self-review (annotator reviewing own submission)
    latest_submission = db.query(TaskVersion).filter(TaskVersion.task_id == task.id).order_by(TaskVersion.version_number.desc()).first()
    if latest_submission and latest_submission.submitted_by == reviewer.id and reviewer.global_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-review prohibited: You cannot review an annotation that you submitted."
        )

    if decision not in ["Accept", "Reject"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be 'Accept' or 'Reject'")

    if decision == "Reject" and (not comment or not comment.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mandatory comment is required when rejecting a task")

    # Record review round
    prev_reviews_count = db.query(Review).filter(Review.task_id == task.id).count()
    review = Review(
        task_id=task.id,
        reviewer_id=reviewer.id,
        decision=decision,
        comment=comment.strip() if comment else None,
        review_round=prev_reviews_count + 1,
        created_at=datetime.datetime.utcnow()
    )
    db.add(review)

    old_status = task.status
    if decision == "Accept":
        # Check if project requires dual review
        setting = db.query(ProjectSetting).filter(ProjectSetting.project_id == task.project_id).first()
        if setting and setting.review_mode == "dual" and prev_reviews_count == 0:
            new_status = "In Review" # Needs second review
        else:
            new_status = "QA Pending"
    else:
        new_status = "Rejected"
        # Notify original annotator
        if task.assigned_to:
            notif = Notification(
                user_id=task.assigned_to,
                title="Task Rejected",
                message=f"Task #{task.id} was rejected by reviewer {reviewer.name}. Reason: {comment}",
                type="rejection",
                created_at=datetime.datetime.utcnow()
            )
            db.add(notif)

    task.status = new_status
    task.reviewed_at = datetime.datetime.utcnow()
    task.updated_at = datetime.datetime.utcnow()

    record_status_history(db, task, old_status, new_status, reviewer.id, f"Review decision: {decision}. Comment: {comment or 'None'}")
    log_audit_event(
        db,
        actor_id=reviewer.id,
        action="review_task",
        entity_type="task",
        entity_id=task.id,
        metadata={"decision": decision, "comment": comment, "project_id": task.project_id}
    )

    db.commit()
    db.refresh(task)
    return task

def qa_signoff_task(
    db: Session,
    task_id: int,
    actor: User
) -> Task:
    """
    Project Manager or Admin QA sign-off.
    Transitions task from QA Pending -> Approved -> Locked.
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status != "QA Pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task must be in 'QA Pending' status to sign-off (current: {task.status})")

    old_status = task.status
    now = datetime.datetime.utcnow()

    # Step 1: Approved
    task.status = "Approved"
    task.approved_at = now
    record_status_history(db, task, old_status, "Approved", actor.id, "QA sign-off approved")

    # Step 2: Locked
    task.status = "Locked"
    task.locked_at = now
    task.updated_at = now
    record_status_history(db, task, "Approved", "Locked", actor.id, "Task locked and finalized")

    log_audit_event(
        db,
        actor_id=actor.id,
        action="qa_signoff",
        entity_type="task",
        entity_id=task.id,
        metadata={"project_id": task.project_id, "final_status": "Locked"}
    )

    db.commit()
    db.refresh(task)
    return task

def reopen_locked_task(
    db: Session,
    task_id: int,
    admin: User,
    reason: str
) -> Task:
    """
    Admin-only operation to explicitly reopen a locked task with mandatory audit reason.
    """
    if admin.global_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only System Admins can reopen locked tasks")

    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mandatory reason is required to reopen a locked task")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status != "Locked":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Task is not locked (current status: {task.status})")

    old_status = task.status
    new_status = "In Progress"
    task.status = new_status
    task.locked_at = None
    task.approved_at = None
    task.updated_at = datetime.datetime.utcnow()

    record_status_history(db, task, old_status, new_status, admin.id, f"Admin Reopen: {reason.strip()}")
    log_audit_event(
        db,
        actor_id=admin.id,
        action="reopen_task",
        entity_type="task",
        entity_id=task.id,
        metadata={"reason": reason.strip(), "project_id": task.project_id}
    )

    db.commit()
    db.refresh(task)
    return task
