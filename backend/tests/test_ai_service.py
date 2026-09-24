import pytest
import json
from backend.models import Project, Task, SchemaVersion, User
from backend.ai_service import LocalAIService

def test_local_ai_cv_object_detection(db_session, seeded_env):
    """Test local AI engine detects road scene objects with bounding boxes."""
    project = seeded_env["project"]
    ann1 = seeded_env["users"]["ann1"]
    po = seeded_env["users"]["po"]

    schema = SchemaVersion(
        project_id=project.id,
        version_number=1,
        taxonomy_json=json.dumps({"categories": ["Car", "Bus", "Pedestrian", "Cyclist", "Traffic Light"]}),
        guidelines_text="Label road objects.",
        defined_by=po.id
    )
    db_session.add(schema)
    db_session.commit()

    task = Task(
        project_id=project.id,
        data_ref=json.dumps({
            "image_url": "https://images.unsplash.com/photo-1503376780353-7e6692767b70",
            "description": "Black sports car and pedestrian on road with active green traffic light"
        }),
        status="Assigned",
        priority="Normal",
        assigned_to=ann1.id,
        schema_version_id=schema.id
    )
    db_session.add(task)
    db_session.commit()

    result = LocalAIService.auto_annotate_task(db_session, task)
    assert result["modality"] == "Computer Vision"
    assert result["model_name"] == "Local-YOLOv8-Perception"
    assert len(result["objects"]) >= 2
    
    classes_found = [o["class"] for o in result["objects"]]
    assert "Car" in classes_found
    assert "Pedestrian" in classes_found or "Traffic Light" in classes_found
    assert result["confidence"] >= 0.90

def test_local_ai_nlp_text_classification(db_session, seeded_env):
    """Test local AI engine categorizes NLP support queries."""
    project = seeded_env["project"]
    ann1 = seeded_env["users"]["ann1"]
    po = seeded_env["users"]["po"]

    schema = SchemaVersion(
        project_id=project.id,
        version_number=1,
        taxonomy_json=json.dumps({"categories": ["Refund Request", "Technical Support", "Billing Inquiry"]}),
        guidelines_text="Classify intent.",
        defined_by=po.id
    )
    db_session.add(schema)
    db_session.commit()

    task = Task(
        project_id=project.id,
        data_ref=json.dumps({
            "text": "I was charged twice on my credit card invoice, please give me a refund."
        }),
        status="Assigned",
        priority="Normal",
        assigned_to=ann1.id,
        schema_version_id=schema.id
    )
    db_session.add(task)
    db_session.commit()

    result = LocalAIService.auto_annotate_task(db_session, task)
    assert result["modality"] == "Natural Language Processing"
    assert result["suggested_label"] in ["Refund Request", "Billing Inquiry"]
    assert result["confidence"] >= 0.90

def test_auto_annotate_api_endpoint(client, db_session, seeded_env):
    """Test auto-annotate HTTP endpoint."""
    project = seeded_env["project"]
    ann1_token = seeded_env["tokens"]["ann1"]
    ann1 = seeded_env["users"]["ann1"]

    task = Task(
        project_id=project.id,
        data_ref=json.dumps({
            "image_url": "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957",
            "description": "City transit bus stopped at bus bay"
        }),
        status="Assigned",
        priority="Normal",
        assigned_to=ann1.id
    )
    db_session.add(task)
    db_session.commit()

    res = client.post(
        f"/api/projects/{project.id}/tasks/{task.id}/auto-annotate",
        headers={"Authorization": f"Bearer {ann1_token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "suggested_label" in data
    assert "objects" in data
    assert data["confidence"] > 0.8
