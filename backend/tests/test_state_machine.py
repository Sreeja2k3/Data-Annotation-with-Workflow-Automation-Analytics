import pytest
import json
from backend.models import Task, TaskVersion, Review, TaskStatusHistory, AuditLog

def test_full_state_machine_happy_path(client, seeded_env, db_session):
    proj = seeded_env["project"]
    pm_token = seeded_env["tokens"]["pm"]
    ann_token = seeded_env["tokens"]["ann1"]
    rev_token = seeded_env["tokens"]["rev"]
    admin_token = seeded_env["tokens"]["admin"]
    ann1 = seeded_env["users"]["ann1"]

    # 1. Create a task (Unassigned)
    task = Task(
        project_id=proj.id,
        data_ref='{"text": "Pedestrian walking across crosswalk."}',
        status="Unassigned",
        priority="Normal"
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # 2. PM assigns to Annotator 1
    res_assign = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/reassign", json={
        "new_assignee_id": ann1.id,
        "reason": "Initial manual task assignment"
    }, headers={"Authorization": f"Bearer {pm_token}"})
    assert res_assign.status_code == 200
    assert res_assign.json()["status"] == "Assigned"
    assert res_assign.json()["assigned_to"] == ann1.id

    # 3. Annotator submits label
    res_sub = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/submit", json={
        "payload_json": json.dumps({"label": "Pedestrian", "confidence": 0.98})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_sub.status_code == 200
    assert res_sub.json()["status"] == "In Review"

    # Verify immutable version created
    versions = db_session.query(TaskVersion).filter(TaskVersion.task_id == task.id).all()
    assert len(versions) == 1
    assert versions[0].version_number == 1

    # 4. Reviewer accepts submission
    res_rev = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/review", json={
        "decision": "Accept",
        "comment": "Accurate label verified."
    }, headers={"Authorization": f"Bearer {rev_token}"})
    assert res_rev.status_code == 200
    assert res_rev.json()["status"] == "QA Pending"

    # 5. PM signs off QA -> Approved -> Locked
    res_qa = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/qa-signoff", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_qa.status_code == 200
    assert res_qa.json()["status"] == "Locked"

    # Verify task is read-only for annotator
    res_sub_locked = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/submit", json={
        "payload_json": json.dumps({"label": "Car"})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_sub_locked.status_code == 400

    # 6. Admin reopens locked task with mandatory reason
    res_reopen = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/reopen", json={
        "reason": "Auditor requested taxonomy re-evaluation"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_reopen.status_code == 200
    assert res_reopen.json()["status"] == "In Progress"

def test_rejection_loop_and_version_immutability(client, seeded_env, db_session):
    proj = seeded_env["project"]
    ann_token = seeded_env["tokens"]["ann1"]
    rev_token = seeded_env["tokens"]["rev"]
    ann1 = seeded_env["users"]["ann1"]

    # Create task assigned to ann1
    task = Task(
        project_id=proj.id,
        data_ref='{"text": "Bicycle rider with helmet."}',
        status="Assigned",
        priority="High",
        assigned_to=ann1.id
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # 1. Annotator submits initial version (Incorrect: Pedestrian)
    res_v1 = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/submit", json={
        "payload_json": json.dumps({"label": "Pedestrian"})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_v1.status_code == 200

    # 2. Reviewer rejects WITHOUT comment -> should fail (FR-3.3)
    res_rej_fail = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/review", json={
        "decision": "Reject",
        "comment": ""
    }, headers={"Authorization": f"Bearer {rev_token}"})
    assert res_rej_fail.status_code == 400

    # 3. Reviewer rejects WITH required comment
    res_rej_ok = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/review", json={
        "decision": "Reject",
        "comment": "Subject is riding a bicycle. Change label to Bicycle."
    }, headers={"Authorization": f"Bearer {rev_token}"})
    assert res_rej_ok.status_code == 200
    assert res_rej_ok.json()["status"] == "Rejected"

    # 4. Annotator corrects and resubmits (Correct: Bicycle)
    res_v2 = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/submit", json={
        "payload_json": json.dumps({"label": "Bicycle"})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_v2.status_code == 200

    # 5. Check both versions exist in database (FR-3.4, FR-7.1)
    versions = db_session.query(TaskVersion).filter(TaskVersion.task_id == task.id).order_by(TaskVersion.version_number.asc()).all()
    assert len(versions) == 2
    assert versions[0].version_number == 1
    assert json.loads(versions[0].payload_json)["label"] == "Pedestrian"
    assert versions[1].version_number == 2
    assert json.loads(versions[1].payload_json)["label"] == "Bicycle"

def test_self_review_prevention(client, seeded_env, db_session):
    proj = seeded_env["project"]
    admin_token = seeded_env["tokens"]["admin"]
    ann_token = seeded_env["tokens"]["ann1"]
    ann1 = seeded_env["users"]["ann1"]

    task = Task(
        project_id=proj.id,
        data_ref='{"text": "Self review test"}',
        status="Assigned",
        assigned_to=ann1.id
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    # 1. Annotator submits an annotation
    res_sub = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/submit", json={
        "payload_json": json.dumps({"label": "Car"})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_sub.status_code == 200

    # 2. Admin promotes/changes Ann1 to Reviewer role on project
    res_role = client.post(f"/api/projects/{proj.id}/members", json={
        "user_id": ann1.id,
        "project_role": "Reviewer"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_role.status_code == 200

    # 3. Now Ann1 has Reviewer role, but tries to review their own submission -> strictly prohibited (FR-3.2)
    res_self = client.post(f"/api/projects/{proj.id}/tasks/{task.id}/review", json={
        "decision": "Accept",
        "comment": "Looks good to me!"
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_self.status_code == 403
    assert "Self-review prohibited" in res_self.json()["detail"]
