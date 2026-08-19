"""
Auto-assignment engine.

Two strategies are supported per role:
  - ROUND_ROBIN: cycles through active users of the target role in a fixed
    order, based on who was assigned least recently (queried straight from
    task_assignments history, so no separate cursor table is needed and it
    survives restarts / horizontal scaling).
  - LOAD_BASED: assigns to whichever active user of the target role currently
    has the fewest open (non-terminal) tasks.

Both strategies only consider users with `is_active=True` for the requested role.
"""
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import User, Role, Task, TaskAssignment, TaskStatus, AssignmentStrategy

OPEN_STATUSES = {
    TaskStatus.ASSIGNED_ANNOTATOR,
    TaskStatus.ANNOTATING,
    TaskStatus.SUBMITTED_FOR_REVIEW,
    TaskStatus.REVIEWING,
    TaskStatus.SUBMITTED_FOR_QA,
    TaskStatus.QA_REVIEWING,
}

# which Task column holds "who currently owns this task for this role"
ROLE_TO_TASK_FIELD = {
    Role.ANNOTATOR: "current_annotator_id",
    Role.REVIEWER: "current_reviewer_id",
    Role.QA: "current_qa_id",
}


class NoEligibleUserError(Exception):
    pass


def _eligible_users(db: Session, role: Role):
    users = db.query(User).filter(User.role == role, User.is_active.is_(True)).all()
    if not users:
        raise NoEligibleUserError(f"No active users found with role '{role.value}'.")
    return users


def _pick_round_robin(db: Session, role: Role) -> User:
    """
    Pick the eligible user who was assigned to this role least recently
    (or never). Ties broken by user id for determinism.
    """
    users = _eligible_users(db, role)

    last_assigned = dict(
        db.query(TaskAssignment.user_id, func.max(TaskAssignment.assigned_at))
        .filter(TaskAssignment.role == role)
        .group_by(TaskAssignment.user_id)
        .all()
    )

    def sort_key(u: User):
        # Users never assigned come first (None sorts lowest via the tuple flag)
        ts = last_assigned.get(u.id)
        return (ts is not None, ts, u.id)

    users.sort(key=sort_key)
    return users[0]


def _pick_load_based(db: Session, role: Role) -> User:
    """Pick the eligible user with the fewest currently-open tasks for this role."""
    users = _eligible_users(db, role)
    field = ROLE_TO_TASK_FIELD[role]

    load = dict(
        db.query(getattr(Task, field), func.count(Task.id))
        .filter(Task.status.in_(OPEN_STATUSES))
        .group_by(getattr(Task, field))
        .all()
    )

    def sort_key(u: User):
        return (load.get(u.id, 0), u.id)

    users.sort(key=sort_key)
    return users[0]


def pick_assignee(
    db: Session,
    role: Role,
    strategy: AssignmentStrategy = AssignmentStrategy.LOAD_BASED,
) -> User:
    if strategy == AssignmentStrategy.ROUND_ROBIN:
        return _pick_round_robin(db, role)
    elif strategy == AssignmentStrategy.LOAD_BASED:
        return _pick_load_based(db, role)
    raise ValueError(f"Unknown assignment strategy: {strategy}")
