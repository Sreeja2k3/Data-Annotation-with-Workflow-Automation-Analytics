"""
TaskService — the single place where Phase 3 behavior lives:

  1. Build task generation from imported items        -> generate_tasks_from_items()
  2. Implement auto-assignment (round-robin/load-based) -> _assign()
  3. Annotator -> Reviewer -> QA state machine          -> _transition()
  4. Rejection / rework loop                            -> reviewer_reject(), qa_reject()
  5. Comments / reviewer feedback                       -> add_comment()
  6. Audit trail on every transition                    -> audit.log_event(), called throughout
"""
from typing import List, Optional

from sqlalchemy.orm import Session

from . import audit
from .assignment import pick_assignee, NoEligibleUserError
from .models import (
    ImportedItem, Task, TaskAssignment, TaskComment,
    TaskStatus, Role, AssignmentStrategy,
)
from .state_machine import apply_transition, InvalidTransitionError, UnauthorizedTransitionError


class TaskService:
    def __init__(self, db: Session, default_strategy: AssignmentStrategy = AssignmentStrategy.LOAD_BASED):
        self.db = db
        self.default_strategy = default_strategy

    # ------------------------------------------------------------------
    # 1. Task generation from imported items
    # ------------------------------------------------------------------
    def generate_tasks_from_items(self, item_ids: List[str], auto_assign: bool = True) -> List[Task]:
        """
        Creates one Task per ImportedItem (idempotent: skips items that
        already have a task), then optionally auto-assigns each new task
        to an annotator immediately.
        """
        created: List[Task] = []
        for item_id in item_ids:
            item = self.db.get(ImportedItem, item_id)

            if item is None:
                raise ValueError(f"ImportedItem {item_id} does not exist.")
            if item.task is not None:
                continue  # already has a task -> skip, keeps this call idempotent

            task = Task(item_id=item.id, status=TaskStatus.PENDING)
            self.db.add(task)
            self.db.flush()  # assign task.id

            audit.log_event(
                self.db, task.id, action="task_created",
                to_status=TaskStatus.PENDING,
                metadata={"item_id": item.id, "import_batch_id": item.import_batch_id},
            )
            created.append(task)

        if auto_assign:
            for task in created:
                self.assign_annotator(task)

        self.db.commit()
        for t in created:
            self.db.refresh(t)
        return created

    # ------------------------------------------------------------------
    # 2. Auto-assignment
    # ------------------------------------------------------------------
    def _assign(self, task: Task, role: Role, strategy: Optional[AssignmentStrategy] = None):
        strategy = strategy or self.default_strategy
        user = pick_assignee(self.db, role, strategy)

        record = TaskAssignment(task_id=task.id, user_id=user.id, role=role, strategy_used=strategy)
        self.db.add(record)

        field = {"annotator": "current_annotator_id", "reviewer": "current_reviewer_id",
                  "qa": "current_qa_id"}[role.value]
        setattr(task, field, user.id)

        audit.log_event(
            self.db, task.id, action=f"assign_{role.value}",
            from_status=task.status, to_status=task.status,  # assignment doesn't change status by itself
            actor_id=None, metadata={"assigned_user_id": user.id, "strategy": strategy.value},
        )
        return user

    def assign_annotator(self, task: Task, strategy: Optional[AssignmentStrategy] = None) -> Task:
        self._assign(task, Role.ANNOTATOR, strategy)
        self._transition(task, "assign_annotator", actor_role=None, actor_id=None)
        return task

    def assign_reviewer(self, task: Task, strategy: Optional[AssignmentStrategy] = None) -> Task:
        self._assign(task, Role.REVIEWER, strategy)
        self._transition(task, "assign_reviewer", actor_role=None, actor_id=None)
        return task

    def assign_qa(self, task: Task, strategy: Optional[AssignmentStrategy] = None) -> Task:
        self._assign(task, Role.QA, strategy)
        self._transition(task, "assign_qa", actor_role=None, actor_id=None)
        return task

    # ------------------------------------------------------------------
    # 3. State machine transition helper (also drives #6 audit trail)
    # ------------------------------------------------------------------
    def _transition(self, task: Task, action: str, actor_role: Optional[Role],
                     actor_id: Optional[str], metadata: Optional[dict] = None) -> Task:
        try:
            new_status = apply_transition(task.status, action, actor_role)
        except (InvalidTransitionError, UnauthorizedTransitionError):
            raise

        old_status = task.status
        task.status = new_status

        audit.log_event(
            self.db, task.id, action=action,
            from_status=old_status, to_status=new_status,
            actor_id=actor_id, metadata=metadata,
        )
        return task

    # ------------------------------------------------------------------
    # Annotator actions
    # ------------------------------------------------------------------
    def start_annotation(self, task: Task, actor_id: str) -> Task:
        self._transition(task, "start_annotation", Role.ANNOTATOR, actor_id)
        self.db.commit()
        return task

    def submit_for_review(self, task: Task, actor_id: str, strategy: Optional[AssignmentStrategy] = None) -> Task:
        self._transition(task, "submit_for_review", Role.ANNOTATOR, actor_id)
        self.assign_reviewer(task, strategy)
        self.db.commit()
        return task

    # ------------------------------------------------------------------
    # Reviewer actions
    # ------------------------------------------------------------------
    def reviewer_approve(self, task: Task, actor_id: str, strategy: Optional[AssignmentStrategy] = None) -> Task:
        self._transition(task, "reviewer_approve", Role.REVIEWER, actor_id)
        self.assign_qa(task, strategy)
        self.db.commit()
        return task

    def reviewer_reject(self, task: Task, actor_id: str, reason: str) -> Task:
        """
        4. Rejection / rework loop.
        Reviewer rejects -> logged as REJECTED_BY_REVIEWER (visible in audit
        history) -> immediately routed back to ASSIGNED_ANNOTATOR so the
        same annotator (or a re-assigned one) can rework it. rework_count
        increments so it's easy to spot tasks bouncing repeatedly.
        """
        self._transition(task, "reviewer_reject", Role.REVIEWER, actor_id, metadata={"reason": reason})
        task.rework_count += 1
        self._transition(task, "route_for_rework", actor_role=None, actor_id=None,
                          metadata={"reason": reason, "rework_count": task.rework_count})
        self.add_comment(task, actor_id, TaskStatus.REJECTED_BY_REVIEWER, reason)
        self.db.commit()
        return task

    # ------------------------------------------------------------------
    # QA actions
    # ------------------------------------------------------------------
    def qa_approve(self, task: Task, actor_id: str) -> Task:
        self._transition(task, "qa_approve", Role.QA, actor_id)
        self._transition(task, "complete", actor_role=None, actor_id=None)
        self.db.commit()
        return task

    def qa_reject(self, task: Task, actor_id: str, reason: str) -> Task:
        """Same rework-loop pattern as reviewer_reject(), triggered from QA."""
        self._transition(task, "qa_reject", Role.QA, actor_id, metadata={"reason": reason})
        task.rework_count += 1
        self._transition(task, "route_for_rework", actor_role=None, actor_id=None,
                          metadata={"reason": reason, "rework_count": task.rework_count})
        self.add_comment(task, actor_id, TaskStatus.REJECTED_BY_QA, reason)
        self.db.commit()
        return task

    # ------------------------------------------------------------------
    # 5. Comments / reviewer feedback
    # ------------------------------------------------------------------
    def add_comment(self, task: Task, author_id: str, stage: TaskStatus, body: str) -> TaskComment:
        comment = TaskComment(task_id=task.id, author_id=author_id, stage=stage, body=body)
        self.db.add(comment)
        audit.log_event(
            self.db, task.id, action="comment_added",
            from_status=task.status, to_status=task.status,
            actor_id=author_id, metadata={"stage": stage.value, "preview": body[:120]},
        )
        self.db.flush()
        return comment
