import pytest
import json
import zipfile

def test_complete_27_step_e2e_lifecycle(client):
    """
    Executes the comprehensive 27-step end-to-end scenario testing the entire system lifecycle against real database and APIs.
    """
    # -------------------------------------------------------------------------
    # STEP 1: Admin logs in (or registers & logs in)
    # -------------------------------------------------------------------------
    res_reg_admin = client.post("/api/auth/register", json={
        "name": "Super Admin",
        "email": "e2e_admin@annotationops.com",
        "password": "AdminPassword123!",
        "global_role": "admin"
    })
    assert res_reg_admin.status_code == 201

    res_login_admin = client.post("/api/auth/login", json={
        "email": "e2e_admin@annotationops.com",
        "password": "AdminPassword123!"
    })
    assert res_login_admin.status_code == 200
    admin_token = res_login_admin.json()["access_token"]
    admin_id = res_login_admin.json()["user"]["id"]

    # Register PO, PM, Annotator, Reviewer
    res_po = client.post("/api/auth/register", json={"name": "Alice PO", "email": "e2e_po@annotationops.com", "password": "Password123"})
    po_id = res_po.json()["id"]
    res_pm = client.post("/api/auth/register", json={"name": "Bob PM", "email": "e2e_pm@annotationops.com", "password": "Password123"})
    pm_id = res_pm.json()["id"]
    res_ann = client.post("/api/auth/register", json={"name": "Charlie Annotator", "email": "e2e_ann@annotationops.com", "password": "Password123"})
    ann_id = res_ann.json()["id"]
    res_rev = client.post("/api/auth/register", json={"name": "Diana Reviewer", "email": "e2e_rev@annotationops.com", "password": "Password123"})
    rev_id = res_rev.json()["id"]

    po_token = client.post("/api/auth/login", json={"email": "e2e_po@annotationops.com", "password": "Password123"}).json()["access_token"]
    pm_token = client.post("/api/auth/login", json={"email": "e2e_pm@annotationops.com", "password": "Password123"}).json()["access_token"]
    ann_token = client.post("/api/auth/login", json={"email": "e2e_ann@annotationops.com", "password": "Password123"}).json()["access_token"]
    rev_token = client.post("/api/auth/login", json={"email": "e2e_rev@annotationops.com", "password": "Password123"}).json()["access_token"]

    # -------------------------------------------------------------------------
    # STEP 2 & 3: Admin creates project and assigns Product Owner and PM
    # -------------------------------------------------------------------------
    res_proj = client.post("/api/projects", json={
        "name": "E2E Highway Vision Perception",
        "description": "End-to-end verification project",
        "schema_json": json.dumps({"categories": ["Car", "Truck", "Pedestrian"]}),
        "po_id": po_id,
        "pm_id": pm_id
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_proj.status_code == 201
    proj_id = res_proj.json()["id"]

    # Assign Annotator and Reviewer to project
    client.post(f"/api/projects/{proj_id}/members", json={"user_id": ann_id, "project_role": "Annotator"}, headers={"Authorization": f"Bearer {admin_token}"})
    client.post(f"/api/projects/{proj_id}/members", json={"user_id": rev_id, "project_role": "Reviewer"}, headers={"Authorization": f"Bearer {admin_token}"})

    # -------------------------------------------------------------------------
    # STEP 4: Product Owner creates schema revision 2 & guidelines
    # -------------------------------------------------------------------------
    res_schema = client.post(f"/api/projects/{proj_id}/schemas", json={
        "taxonomy_json": json.dumps({"categories": ["Car", "Truck", "Pedestrian", "Emergency Vehicle"]}),
        "guidelines_text": "1. Label all moving items.\n2. Distinguish emergency vehicles clearly."
    }, headers={"Authorization": f"Bearer {po_token}"})
    assert res_schema.status_code == 201
    assert res_schema.json()["version_number"] == 2

    # -------------------------------------------------------------------------
    # STEP 5 & 6: PM imports dataset & system validates dataset
    # -------------------------------------------------------------------------
    csv_data = b"image_url,description\nhttps://img.com/highway1.jpg,Fast ambulance\nhttps://img.com/highway2.jpg,Sedan car\n"
    res_upload = client.post(
        f"/api/projects/{proj_id}/imports/upload",
        files={"file": ("highway_batch.csv", csv_data, "text/csv")},
        headers={"Authorization": f"Bearer {pm_token}"}
    )
    assert res_upload.status_code == 200
    job_id = res_upload.json()["id"]
    assert res_upload.json()["valid_rows"] == 2
    assert res_upload.json()["invalid_rows"] == 0

    # -------------------------------------------------------------------------
    # STEP 7: Tasks are generated upon confirmation
    # -------------------------------------------------------------------------
    res_confirm = client.post(
        f"/api/projects/{proj_id}/imports/{job_id}/confirm",
        json={"dataset_name": "Highway Samples Batch 01", "priority": "High", "auto_assign": False},
        headers={"Authorization": f"Bearer {pm_token}"}
    )
    assert res_confirm.status_code == 200
    assert res_confirm.json()["tasks_created"] == 2

    # -------------------------------------------------------------------------
    # STEP 8: Tasks auto-assign using load-balancing algorithm
    # -------------------------------------------------------------------------
    res_auto = client.post(f"/api/projects/{proj_id}/assignments/auto", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_auto.status_code == 200
    assert res_auto.json()["assigned_count"] == 2

    # -------------------------------------------------------------------------
    # STEP 9: Annotator logs in & queries assigned queue
    # -------------------------------------------------------------------------
    res_my_tasks = client.get(f"/api/projects/{proj_id}/tasks/my", headers={"Authorization": f"Bearer {ann_token}"})
    assert res_my_tasks.status_code == 200
    my_tasks = res_my_tasks.json()
    assert len(my_tasks) == 2
    task_id = my_tasks[0]["id"]

    # -------------------------------------------------------------------------
    # STEP 10: Annotator opens task workspace
    # -------------------------------------------------------------------------
    res_task = client.get(f"/api/projects/{proj_id}/tasks/{task_id}", headers={"Authorization": f"Bearer {ann_token}"})
    assert res_task.status_code == 200
    assert res_task.json()["status"] == "Assigned"

    # -------------------------------------------------------------------------
    # STEP 11 & 12: Annotator labels it and submits (Version 1)
    # -------------------------------------------------------------------------
    res_sub_v1 = client.post(f"/api/projects/{proj_id}/tasks/{task_id}/submit", json={
        "payload_json": json.dumps({"label": "Car", "confidence": 0.85}) # Initial label (incorrect for ambulance)
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_sub_v1.status_code == 200
    assert res_sub_v1.json()["status"] == "In Review"

    # -------------------------------------------------------------------------
    # STEP 13 & 14: Reviewer inspects review queue and opens task
    # -------------------------------------------------------------------------
    res_rev_queue = client.get(f"/api/projects/{proj_id}/tasks/review-queue", headers={"Authorization": f"Bearer {rev_token}"})
    assert res_rev_queue.status_code == 200
    assert any(t["id"] == task_id for t in res_rev_queue.json())

    # -------------------------------------------------------------------------
    # STEP 15: Reviewer rejects with comment
    # -------------------------------------------------------------------------
    res_reject = client.post(f"/api/projects/{proj_id}/tasks/{task_id}/review", json={
        "decision": "Reject",
        "comment": "Flashing siren lights visible. Please change label to Emergency Vehicle."
    }, headers={"Authorization": f"Bearer {rev_token}"})
    assert res_reject.status_code == 200
    assert res_reject.json()["status"] == "Rejected"

    # -------------------------------------------------------------------------
    # STEP 16: Annotator receives in-app rejection notification
    # -------------------------------------------------------------------------
    res_notifs = client.get("/api/notifications", headers={"Authorization": f"Bearer {ann_token}"})
    assert res_notifs.status_code == 200
    rejection_notifs = [n for n in res_notifs.json() if n["type"] == "rejection"]
    assert len(rejection_notifs) > 0
    assert "rejected" in rejection_notifs[0]["title"].lower()

    # -------------------------------------------------------------------------
    # STEP 17 & 18: Annotator corrects task and resubmits (Version 2)
    # -------------------------------------------------------------------------
    res_sub_v2 = client.post(f"/api/projects/{proj_id}/tasks/{task_id}/submit", json={
        "payload_json": json.dumps({"label": "Emergency Vehicle", "confidence": 0.99})
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_sub_v2.status_code == 200
    assert res_sub_v2.json()["status"] == "In Review"

    # Check that Version 1 and Version 2 are both preserved
    res_v_check = client.get(f"/api/projects/{proj_id}/tasks/{task_id}", headers={"Authorization": f"Bearer {rev_token}"})
    assert len(res_v_check.json()["versions"]) == 2

    # -------------------------------------------------------------------------
    # STEP 19: Reviewer accepts corrected submission
    # -------------------------------------------------------------------------
    res_accept = client.post(f"/api/projects/{proj_id}/tasks/{task_id}/review", json={
        "decision": "Accept",
        "comment": "Verified Emergency Vehicle classification."
    }, headers={"Authorization": f"Bearer {rev_token}"})
    assert res_accept.status_code == 200
    assert res_accept.json()["status"] == "QA Pending"

    # -------------------------------------------------------------------------
    # STEP 20, 21, 22: PM performs QA sign-off -> Approved -> Locked
    # -------------------------------------------------------------------------
    res_qa_queue = client.get(f"/api/projects/{proj_id}/tasks/qa-queue", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_qa_queue.status_code == 200

    res_qa_signoff = client.post(f"/api/projects/{proj_id}/tasks/{task_id}/qa-signoff", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_qa_signoff.status_code == 200
    assert res_qa_signoff.json()["status"] == "Locked"

    # -------------------------------------------------------------------------
    # STEP 23: Audit history is visible
    # -------------------------------------------------------------------------
    res_audit = client.get(f"/api/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_audit.status_code == 200
    actions = [a["action"] for a in res_audit.json()]
    assert "create_project" in actions
    assert "submit_annotation" in actions
    assert "review_task" in actions
    assert "qa_signoff" in actions

    # -------------------------------------------------------------------------
    # STEP 24: Analytics update
    # -------------------------------------------------------------------------
    res_analytics = client.get(f"/api/projects/{proj_id}/analytics/dashboard", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_analytics.status_code == 200
    kpis = res_analytics.json()
    assert kpis["total_tasks"] == 2
    assert kpis["status_counts"]["Locked"] == 1
    assert kpis["completion_percentage"] == 50.0

    # -------------------------------------------------------------------------
    # STEP 25: Product Owner creates dataset snapshot
    # -------------------------------------------------------------------------
    res_snap = client.post(f"/api/projects/{proj_id}/snapshots", json={
        "name": "e2e-highway-v1.0-approved"
    }, headers={"Authorization": f"Bearer {po_token}"})
    assert res_snap.status_code == 201
    snap_id = res_snap.json()["id"]

    # -------------------------------------------------------------------------
    # STEP 26 & 27: Export approved labels and verify manifest
    # -------------------------------------------------------------------------
    res_export = client.get(f"/api/projects/{proj_id}/export?format=COCO&snapshot_id={snap_id}", headers={"Authorization": f"Bearer {po_token}"})
    assert res_export.status_code == 200
    assert res_export.headers["content-type"] == "application/zip"

    # Verify contents of zip
    import io
    zip_bytes = io.BytesIO(res_export.content)
    with zipfile.ZipFile(zip_bytes, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert "coco_annotations.json" in namelist
        manifest = json.loads(z.read("manifest.json").decode())
        assert manifest["snapshot_name"] == "e2e-highway-v1.0-approved"
        assert manifest["total_records"] == 1
        assert manifest["export_format"] == "COCO"

    print("\n[E2E] All 27 steps of the complete system lifecycle passed with 100% verification!")
