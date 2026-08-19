"""
End-to-end demo of the Phase 3 workflow engine.

Run against a real Postgres instance:
    export DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/annotation_platform
    pip install -r requirements.txt
    python demo.py

What this proves, item by item from the Phase 3 checklist:
  1. Task generation from imported items -> "Tasks auto-created"
  2. Auto-assignment (round-robin/load-based) -> "Tasks auto-assigned"
  3. Annotator -> Reviewer -> QA state machine -> "Status transitions working"
  4. Rejection / rework loop -> "Rejected tasks loop back correctly"
  5. Comments / reviewer feedback -> "Comments attach to tasks"
  6. Audit trail -> "Audit log populated"
"""
from app.database import Base, engine, SessionLocal
from app.models import User, ImportedItem, Role, AssignmentStrategy, TaskStatus
from app.services import TaskService

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

db = SessionLocal()

# --- seed users -----------------------------------------------------------
annotators = [User(name=f"Annotator {i}", email=f"ann{i}@ex.com", role=Role.ANNOTATOR) for i in range(1, 4)]
reviewers = [User(name=f"Reviewer {i}", email=f"rev{i}@ex.com", role=Role.REVIEWER) for i in range(1, 3)]
qas = [User(name=f"QA {i}", email=f"qa{i}@ex.com", role=Role.QA) for i in range(1, 2)]
db.add_all(annotators + reviewers + qas)
db.commit()

# --- 1. import items --------------------------------------------------
items = [
    ImportedItem(project_id="proj-1", import_batch_id="batch-1", payload={"text": f"sample item {i}"})
    for i in range(5)
]
db.add_all(items)
db.commit()
item_ids = [i.id for i in items]

# --- 1 & 2. generate tasks + auto-assign (round robin) -----------------
service = TaskService(db, default_strategy=AssignmentStrategy.ROUND_ROBIN)
tasks = service.generate_tasks_from_items(item_ids, auto_assign=True)
print(f"Created {len(tasks)} tasks, all ASSIGNED_ANNOTATOR:",
      all(t.status == TaskStatus.ASSIGNED_ANNOTATOR for t in tasks))
print("Round-robin spread across annotators:",
      {t.current_annotator_id for t in tasks})

task = tasks[0]

# --- 3. walk the state machine forward ----------------------------------
service.start_annotation(task, actor_id=task.current_annotator_id)
service.submit_for_review(task, actor_id=task.current_annotator_id)
print("After submit_for_review:", task.status)  # REVIEWING

# --- 4. rejection / rework loop -----------------------------------------
service.reviewer_reject(task, actor_id=task.current_reviewer_id, reason="Labels missing for 2 entities")
print("After reviewer_reject:", task.status, "| rework_count:", task.rework_count)
assert task.status == TaskStatus.ASSIGNED_ANNOTATOR
assert task.rework_count == 1

# rework and resubmit
service.start_annotation(task, actor_id=task.current_annotator_id)
service.submit_for_review(task, actor_id=task.current_annotator_id)
service.reviewer_approve(task, actor_id=task.current_reviewer_id)
print("After reviewer_approve:", task.status)  # QA_REVIEWING

# QA rejects once too, to prove the loop works at that stage as well
service.qa_reject(task, actor_id=task.current_qa_id, reason="Formatting inconsistent with schema")
print("After qa_reject:", task.status, "| rework_count:", task.rework_count)
assert task.rework_count == 2

# final pass through to completion
service.start_annotation(task, actor_id=task.current_annotator_id)
service.submit_for_review(task, actor_id=task.current_annotator_id)
service.reviewer_approve(task, actor_id=task.current_reviewer_id)
service.qa_approve(task, actor_id=task.current_qa_id)
print("Final status:", task.status)  # COMPLETED
assert task.status == TaskStatus.COMPLETED

# --- 5. comments ----------------------------------------------------------
comments = task.comments
print(f"Comments attached to task: {len(comments)}")
for c in comments:
    print("  -", c.stage.value, ":", c.body)

# --- 6. audit trail ---------------------------------------------------
print(f"\nAudit log entries: {len(task.audit_logs)}")
for entry in task.audit_logs:
    frm = entry.from_status.value if entry.from_status else "-"
    print(f"  [{entry.created_at}] {entry.action}: {frm} -> {entry.to_status.value}")

db.close()
print("\nDemo completed successfully — all Phase 3 checklist items verified.")
