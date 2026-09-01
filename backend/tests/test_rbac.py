import pytest

def test_admin_can_create_project_and_manage_members(client, seeded_env):
    admin_token = seeded_env["tokens"]["admin"]
    po_user = seeded_env["users"]["po"]
    pm_user = seeded_env["users"]["pm"]

    # Admin creates project
    res = client.post("/api/projects", json={
        "name": "New Admin Created Project",
        "description": "Perception testing",
        "schema_json": '{"categories": ["Tree", "Sign"]}',
        "po_id": po_user.id,
        "pm_id": pm_user.id
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 201
    proj_id = res.json()["id"]

    # Admin assigns member
    ann1 = seeded_env["users"]["ann1"]
    res_mem = client.post(f"/api/projects/{proj_id}/members", json={
        "user_id": ann1.id,
        "project_role": "Annotator"
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert res_mem.status_code == 200

def test_non_admin_cannot_create_project(client, seeded_env):
    ann_token = seeded_env["tokens"]["ann1"]
    res = client.post("/api/projects", json={
        "name": "Unauthorized Project"
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res.status_code == 403

def test_product_owner_can_create_schema_version_but_annotator_cannot(client, seeded_env):
    proj_id = seeded_env["project"].id
    po_token = seeded_env["tokens"]["po"]
    ann_token = seeded_env["tokens"]["ann1"]

    # PO creates schema
    res_po = client.post(f"/api/projects/{proj_id}/schemas", json={
        "taxonomy_json": '{"categories": ["Car", "Pedestrian", "Bicycle", "Motorcycle"]}',
        "guidelines_text": "Added Motorcycle class."
    }, headers={"Authorization": f"Bearer {po_token}"})
    assert res_po.status_code == 201
    assert res_po.json()["version_number"] == 2

    # Annotator attempts schema edit
    res_ann = client.post(f"/api/projects/{proj_id}/schemas", json={
        "taxonomy_json": '{"categories": ["Car"]}',
        "guidelines_text": "Annotator hack."
    }, headers={"Authorization": f"Bearer {ann_token}"})
    assert res_ann.status_code == 403

def test_outsider_cannot_access_project_data(client, seeded_env):
    proj_id = seeded_env["project"].id
    outsider_token = seeded_env["tokens"]["outsider"]

    res = client.get(f"/api/projects/{proj_id}", headers={"Authorization": f"Bearer {outsider_token}"})
    assert res.status_code == 403

def test_annotator_cannot_view_all_tasks_unrestricted(client, seeded_env):
    proj_id = seeded_env["project"].id
    ann_token = seeded_env["tokens"]["ann1"]

    # /api/projects/{id}/tasks is restricted to Admin, PO, PM
    res = client.get(f"/api/projects/{proj_id}/tasks", headers={"Authorization": f"Bearer {ann_token}"})
    assert res.status_code == 403

def test_soft_delete_and_recovery_by_admin(client, seeded_env):
    proj_id = seeded_env["project"].id
    admin_token = seeded_env["tokens"]["admin"]
    pm_token = seeded_env["tokens"]["pm"]

    # PM cannot soft-delete
    res_pm_del = client.post(f"/api/projects/{proj_id}/delete", headers={"Authorization": f"Bearer {pm_token}"})
    assert res_pm_del.status_code == 403

    # Admin soft-deletes
    res_del = client.post(f"/api/projects/{proj_id}/delete", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_del.status_code == 200

    # Admin recovers
    res_rec = client.post(f"/api/projects/{proj_id}/recover", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_rec.status_code == 200
