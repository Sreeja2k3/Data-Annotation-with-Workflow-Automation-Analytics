"""
Annotator -> Reviewer -> QA state machine.

Design notes:
- Every transition is expressed as (current_status, action) -> next_status.
- Each transition also declares which Role is allowed to trigger it, so the
  service layer can authorize before applying it.
- REJECTED_BY_REVIEWER / REJECTED_BY_QA are transient statuses: the engine
  immediately routes them back into a working status (rework loop) rather
  than leaving a task sitting in a "rejected" state. They still get their
  own row in the audit log so the rejection itself is visible in history.
"""
from dataclasses import dataclass
from typing import Optional

from .models import TaskStatus, Role


class InvalidTransitionError(Exception):
    pass


class UnauthorizedTransitionError(Exception):
    pass


@dataclass(frozen=True)
class Transition:
    from_status: TaskStatus
    action: str
    to_status: TaskStatus
    allowed_role: Optional[Role]  # None = system-triggered, no human role required


# The full transition table for the workflow.
TRANSITIONS = [
    # --- assignment / annotation ---
    Transition(TaskStatus.PENDING, "assign_annotator", TaskStatus.ASSIGNED_ANNOTATOR, None),
    Transition(TaskStatus.ASSIGNED_ANNOTATOR, "start_annotation", TaskStatus.ANNOTATING, Role.ANNOTATOR),
    Transition(TaskStatus.ANNOTATING, "submit_for_review", TaskStatus.SUBMITTED_FOR_REVIEW, Role.ANNOTATOR),

    # --- review stage ---
    Transition(TaskStatus.SUBMITTED_FOR_REVIEW, "assign_reviewer", TaskStatus.REVIEWING, None),
    Transition(TaskStatus.REVIEWING, "reviewer_approve", TaskStatus.SUBMITTED_FOR_QA, Role.REVIEWER),
    Transition(TaskStatus.REVIEWING, "reviewer_reject", TaskStatus.REJECTED_BY_REVIEWER, Role.REVIEWER),

    # rework loop: rejection by reviewer sends the task back to the annotator
    Transition(TaskStatus.REJECTED_BY_REVIEWER, "route_for_rework", TaskStatus.ASSIGNED_ANNOTATOR, None),

    # --- QA stage ---
    Transition(TaskStatus.SUBMITTED_FOR_QA, "assign_qa", TaskStatus.QA_REVIEWING, None),
    Transition(TaskStatus.QA_REVIEWING, "qa_approve", TaskStatus.APPROVED, Role.QA),
    Transition(TaskStatus.QA_REVIEWING, "qa_reject", TaskStatus.REJECTED_BY_QA, Role.QA),

    # rework loop: QA can bounce back to the annotator (default) — see
    # TaskService.qa_reject() for the optional "send to reviewer instead" path.
    Transition(TaskStatus.REJECTED_BY_QA, "route_for_rework", TaskStatus.ASSIGNED_ANNOTATOR, None),

    # --- closeout ---
    Transition(TaskStatus.APPROVED, "complete", TaskStatus.COMPLETED, None),
]

_TABLE = {(t.from_status, t.action): t for t in TRANSITIONS}


def get_transition(current_status: TaskStatus, action: str) -> Transition:
    key = (current_status, action)
    if key not in _TABLE:
        raise InvalidTransitionError(
            f"Action '{action}' is not valid from status '{current_status.value}'."
        )
    return _TABLE[key]


def apply_transition(current_status: TaskStatus, action: str, actor_role: Optional[Role]) -> TaskStatus:
    """
    Validates and returns the resulting status for (current_status, action).
    Raises InvalidTransitionError if the action doesn't exist from this status,
    or UnauthorizedTransitionError if actor_role isn't permitted to trigger it.
    """
    transition = get_transition(current_status, action)
    if transition.allowed_role is not None and actor_role != transition.allowed_role:
        raise UnauthorizedTransitionError(
            f"Role '{actor_role}' cannot perform '{action}' "
            f"(requires '{transition.allowed_role.value}')."
        )
    return transition.to_status
