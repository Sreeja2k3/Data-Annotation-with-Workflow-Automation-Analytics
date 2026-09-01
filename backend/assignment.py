import datetime
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from fastapi import HTTPException, status

from backend.models import Task, ProjectMembership, AssignmentHistory, Notification, User, ProjectSetting
from backend.workflow import log_audit_event, record_status_history

ACTIVE_STATUSES = ["Assigned", "In Progress", "Rejected", "Resubmitted"]

def get_eligible_annotators(db: Session, project_id: int) -> List[User]:
    """Retrieves all active users with the Annotator role on the project."""
    memberships = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == project_id,
        ProjectMembership.project_role == "Annotator"
    ).all()
    
    annotator_ids = [m.user_id for m in memberships]
    if not annotator_ids:
        return []
        
    return db.query(User).filter(User.id.in_(annotator_ids), User.is_active == True).all()

def find_best_annotator_for_task(db: Session, project_id: int, annotators: List[User]) -> Optional[User]:
    """
    Selects the best annotator using the load-balancing algorithm:
    1. Fewest active tasks (Assigned, In Progress, Rejected, Resubmitted)
    2. Oldest last assignment timestamp (or None if never assigned)
    3. Stable user ID (ascending)
    """
    if not annotators:
        return None

    # Calculate active task counts and last assigned timestamp for each annotator
    annotator_scores = []
    for ann in annotators:
        active_count = db.query(Task).filter(
            Task.project_id == project_id,
            Task.assigned_to == ann.id,
            Task.status.in_(ACTIVE_STATUSES)
        ).count()

        # Find latest assigned_at
        latest_task = db.query(Task).filter(
            Task.assigned_to == ann.id,
            Task.assigned_at.isnot(None)
        ).order_by(Task.assigned_at.desc()).first()

        last_assigned_ts = latest_task.assigned_at if latest_task else datetime.datetime.min

        # Tuple for deterministic sorting: (active_count ASC, last_assigned_ts ASC, user_id ASC)
        annotator_scores.append((active_count, last_assigned_ts, ann.id, ann))

    annotator_scores.sort(key=lambda x: (x[0], x[1], x[2]))
    return annotator_scores[0][3]

def auto_assign_tasks(
    db: Session,
    project_id: int,
    actor_id: Optional[int] = None,
    batch_size: Optional[int] = None
) -> int:
    """
    Auto-assigns Unassigned tasks to eligible annotators in a project using load-balancing.
    """
    annotators = get_eligible_annotators(db, project_id)
    if not annotators:
        return 0

    setting = db.query(ProjectSetting).filter(ProjectSetting.project_id == project_id).first()
    limit = batch_size or (setting.batch_size if setting else 20)

    unassigned_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == "Unassigned"
    ).order_by(
        # Priority order: Urgent -> High -> Normal -> Low
        case(
            (Task.priority == "Urgent", 1),
            (Task.priority == "High", 2),
            (Task.priority == "Normal", 3),
            (Task.priority == "Low", 4),
            else_=5
        ),
        Task.created_at.asc()
    ).limit(limit).all()

    assigned_count = 0
    now = datetime.datetime.utcnow()

    for task in unassigned_tasks:
        best_annotator = find_best_annotator_for_task(db, project_id, annotators)
        if not best_annotator:
            break

        old_status = task.status
        task.assigned_to = best_annotator.id
        task.status = "Assigned"
        task.assigned_at = now
        task.updated_at = now

        # Record assignment history
        history = AssignmentHistory(
            task_id=task.id,
            previous_assignee_id=None,
            new_assignee_id=best_annotator.id,
            assigned_by=actor_id,
            reason="Auto load-balancing assignment",
            created_at=now
        )
        db.add(history)

        record_status_history(db, task, old_status, "Assigned", actor_id, f"Auto-assigned to {best_annotator.name}")

        # Send in-app notification
        notif = Notification(
            user_id=best_annotator.id,
            title="New Task Assigned",
            message=f"Task #{task.id} (Priority: {task.priority}) has been assigned to you.",
            type="assignment",
            created_at=now
        )
        db.add(notif)

        log_audit_event(
            db,
            actor_id=actor_id,
            action="assign_task",
            entity_type="task",
            entity_id=task.id,
            metadata={"assigned_to": best_annotator.id, "annotator_name": best_annotator.name, "mode": "auto"}
        )

        assigned_count += 1

    db.commit()
    return assigned_count

def manually_reassign_task(
    db: Session,
    task_id: int,
    new_assignee_id: int,
    actor: User,
    reason: str
) -> Task:
    """
    Project Manager or Admin manual reassignment of a task to a different annotator.
    Requires an explicit mandatory reason.
    """
    if not reason or not reason.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A mandatory reason is required for manual reassignment")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if task.status == "Locked":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot reassign a locked task")

    new_assignee = db.query(User).filter(User.id == new_assignee_id).first()
    if not new_assignee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="New assignee user not found")

    # Verify membership
    membership = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == task.project_id,
        ProjectMembership.user_id == new_assignee_id
    ).first()
    if not membership or membership.project_role != "Annotator":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user is not an Annotator on this project")

    prev_assignee_id = task.assigned_to
    now = datetime.datetime.utcnow()

    task.assigned_to = new_assignee.id
    if task.status == "Unassigned":
        task.status = "Assigned"
    task.assigned_at = now
    task.updated_at = now

    # Record assignment history
    assign_record = AssignmentHistory(
        task_id=task.id,
        previous_assignee_id=prev_assignee_id,
        new_assignee_id=new_assignee.id,
        assigned_by=actor.id,
        reason=reason.strip(),
        created_at=now
    )
    db.add(assign_record)

    record_status_history(db, task, task.status, task.status, actor.id, f"Reassigned to {new_assignee.name}. Reason: {reason.strip()}")

    # Notify new assignee
    notif = Notification(
        user_id=new_assignee.id,
        title="Task Reassigned to You",
        message=f"Task #{task.id} was reassigned to you by {actor.name}. Reason: {reason.strip()}",
        type="reassignment",
        created_at=now
    )
    db.add(notif)

    log_audit_event(
        db,
        actor_id=actor.id,
        action="reassign_task",
        entity_type="task",
        entity_id=task.id,
        metadata={
            "previous_assignee_id": prev_assignee_id,
            "new_assignee_id": new_assignee.id,
            "reason": reason.strip(),
            "project_id": task.project_id
        }
    )

    db.commit()
    db.refresh(task)
    return task
