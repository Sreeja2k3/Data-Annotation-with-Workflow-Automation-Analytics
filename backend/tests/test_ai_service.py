import pytest
import json
from unittest.mock import patch
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

    result = LocalAIService.auto_annotate_task(db_session, task, provider="local-heuristic")
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

    result = LocalAIService.auto_annotate_task(db_session, task, provider="local-heuristic")
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
        headers={"Authorization": f"Bearer {ann1_token}"},
        json={"provider": "auto"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "suggested_label" in data
    assert "objects" in data
    assert data["confidence"] > 0.8

def test_ai_status_endpoint(client, seeded_env):
    """Test /api/ai/status endpoint returns Ollama connection status."""
    ann1_token = seeded_env["tokens"]["ann1"]
    res = client.get("/api/ai/status", headers={"Authorization": f"Bearer {ann1_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "ollama_available" in data
    assert "ollama_host" in data
    assert "active_engine" in data
    assert isinstance(data["models"], list)

def test_auto_annotate_with_mocked_ollama(client, db_session, seeded_env):
    """Test auto-annotate when Ollama is running and responds with JSON."""
    project = seeded_env["project"]
    ann1_token = seeded_env["tokens"]["ann1"]
    ann1 = seeded_env["users"]["ann1"]
    po = seeded_env["users"]["po"]

    schema = SchemaVersion(
        project_id=project.id,
        version_number=1,
        taxonomy_json=json.dumps({"categories": ["Urgent Bug", "Account Security", "General Feedback"]}),
        guidelines_text="Security issues go to Account Security.",
        defined_by=po.id
    )
    db_session.add(schema)
    db_session.commit()

    task = Task(
        project_id=project.id,
        data_ref=json.dumps({"text": "Someone tried to reset my two-factor password from an unknown device!"}),
        status="Assigned",
        priority="Urgent",
        assigned_to=ann1.id,
        schema_version_id=schema.id
    )
    db_session.add(task)
    db_session.commit()

    fake_status = {
        "ollama_available": True,
        "ollama_host": "http://localhost:11434",
        "models": ["llama3.2:latest"],
        "default_model": "llama3.2:latest",
        "active_engine": "Ollama",
        "message": "Connected to Ollama."
    }
    fake_llm_response = {
        "category": "Account Security",
        "confidence": 0.97,
        "reasoning": "Mentions unauthorized password reset and two-factor device compromise."
    }

    with patch.object(LocalAIService, "get_ollama_status", return_value=fake_status):
        with patch.object(LocalAIService, "_call_ollama", return_value=fake_llm_response):
            res = client.post(
                f"/api/projects/{project.id}/tasks/{task.id}/auto-annotate",
                headers={"Authorization": f"Bearer {ann1_token}"},
                json={"provider": "ollama", "model_name": "llama3.2:latest"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["provider"] == "ollama"
            assert data["suggested_label"] == "Account Security"
            assert data["confidence"] == 0.97
            assert "llama3.2:latest" in data["model_name"]
            assert "unauthorized password reset" in data["reasoning"]

def test_auto_annotate_fallback_when_ollama_offline(client, db_session, seeded_env):
    """Test auto-annotate gracefully falls back to local heuristic when Ollama is offline."""
    project = seeded_env["project"]
    ann1_token = seeded_env["tokens"]["ann1"]
    ann1 = seeded_env["users"]["ann1"]

    task = Task(
        project_id=project.id,
        data_ref=json.dumps({"text": "I need a full refund for invoice #98234"}),
        status="Assigned",
        priority="Normal",
        assigned_to=ann1.id
    )
    db_session.add(task)
    db_session.commit()

    offline_status = {
        "ollama_available": False,
        "ollama_host": "http://localhost:11434",
        "models": [],
        "default_model": None,
        "active_engine": "Local-Heuristic",
        "message": "Ollama not reachable."
    }

    with patch.object(LocalAIService, "get_ollama_status", return_value=offline_status):
        res = client.post(
            f"/api/projects/{project.id}/tasks/{task.id}/auto-annotate",
            headers={"Authorization": f"Bearer {ann1_token}"},
            json={"provider": "ollama"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["provider"] == "local-heuristic"
        assert "Refund Request" in data["suggested_label"] or "Billing Inquiry" in data["suggested_label"]
        assert "Ollama was unavailable" in data["notes"]
