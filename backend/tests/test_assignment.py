import pytest
import json
from backend.models import Task, AssignmentHistory, Notification

def test_auto_assignment_balances_workload_evenly(client, seeded_env, db_session):
    proj = seeded_env["project"]
    pm_token = seeded_env["tokens"]["pm"]
    ann1 = seeded_env["users"]["ann1"]
    ann2 = seeded_env["users"]["ann2"]

    # Give ann1 two existing in-flight tasks
    t_busy1 = Task(project_id=proj.id, data_ref='{"text": "Busy 1"}', status="In Progress", assigned_to=ann1.id)
    t_busy2 = Task(project_id=proj.id, data_ref='{"text": "Busy 2"}', status="Assigned", assigned_to=ann1.id)
    db_session.add(t_busy1)
    db_session.add(t_busy2)

    # Create 3 unassigned tasks
    u1 = Task(project_id=proj.id, data_ref='{"text": "Item 1"}', status="Unassigned", priority="Normal")
    u2 = Task(project_id=proj.id, data_ref='{"text": "Item 2"}', status="Unassigned", priority="High")
    u3 = Task(project_id=proj.id, data_ref='{"text": "Item 3"}', status="Unassigned", priority="Urgent")
    db_session.add(u1)
    db_session.add(u2)
    db_session.add(u3)
    db_session.commit()

    # Run auto-assignment
    res = client.post(f"/api/projects/{proj.id}/assignments/auto", headers={"Authorization": f"Bearer {pm_token}"})
    assert res.status_code == 200
    assert res.json()["assigned_count"] == 3

    # Refresh tasks from database
    db_session.refresh(u1)
    db_session.refresh(u2)
    db_session.refresh(u3)

    # Ann2 had 0 tasks, so initial tasks should have been assigned to Ann2 first
    assert u3.assigned_to == ann2.id # Urgent task assigned first to least loaded (ann2)
    assert u2.assigned_to == ann2.id # High task assigned to ann2 (now ann2 has 2, ann1 has 2)
    # The 3rd task can go to either with tie-breaking
    assert u1.assigned_to in [ann1.id, ann2.id]

def test_manual_reassignment_requires_reason(client, seeded_env, db_session):
    proj = seeded_env["project"]
    pm_token = seeded_env["tokens"]["pm"]
    ann1 = seeded_env["users"]["ann1"]
    ann2 = seeded_env["users"]["ann2"]

    task = Task(project_id=proj.id, data_ref='{"text": "Reassign me"}', status="Assigned", assigned_to=ann1.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # Attempt manual reassignment without reason -> should fail (FR-2.3)
    res_fail = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/reassign", json={
        "new_assignee_id": ann2.id,
        "reason": ""
    }, headers={"Authorization": f"Bearer {pm_token}"})
    assert res_fail.status_code == 400

    # Reassign with valid reason
    res_ok = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/reassign", json={
        "new_assignee_id": ann2.id,
        "reason": "Annotator 1 assigned to another urgent batch"
    }, headers={"Authorization": f"Bearer {pm_token}"})
    assert res_ok.status_code == 200
    assert res_ok.json()["assigned_to"] == ann2.id

    # Verify history recorded
    hist = db_session.query(AssignmentHistory).filter(AssignmentHistory.task_id == task.id).first()
    assert hist is not None
    assert hist.previous_assignee_id == ann1.id
    assert hist.new_assignee_id == ann2.id
    assert "urgent batch" in hist.reason
