import pytest
import zipfile
import json
from backend.models import Task, TaskVersion
from backend.export_service import export_project_data

def test_export_formats_and_manifest(db_session, seeded_env):
    proj = seeded_env["project"]
    ann1 = seeded_env["users"]["ann1"]

    # Create approved task with annotation
    t = Task(
        project_id=proj.id,
        data_ref=json.dumps({"image_url": "https://img.com/car.jpg", "filename": "car.jpg"}),
        status="Locked",
        assigned_to=ann1.id
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)

    v = TaskVersion(
        task_id=t.id,
        submitted_by=ann1.id,
        payload_json=json.dumps({"label": "Car", "confidence": 1.0}),
        version_number=1
    )
    db_session.add(v)
    db_session.commit()

    # 1. Test COCO Export
    coco_buf = export_project_data(db_session, proj.id, "COCO")
    with zipfile.ZipFile(coco_buf, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert "coco_annotations.json" in namelist
        manifest = json.loads(z.read("manifest.json").decode())
        assert manifest["export_format"] == "COCO"
        assert manifest["total_records"] == 1

        coco_json = json.loads(z.read("coco_annotations.json").decode())
        assert len(coco_json["images"]) == 1
        assert len(coco_json["annotations"]) == 1

    # 2. Test YOLO Export
    yolo_buf = export_project_data(db_session, proj.id, "YOLO")
    with zipfile.ZipFile(yolo_buf, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert "classes.txt" in namelist
        assert f"labels/task_{t.id}.txt" in namelist

    # 3. Test Pascal VOC Export
    voc_buf = export_project_data(db_session, proj.id, "VOC")
    with zipfile.ZipFile(voc_buf, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert f"voc/task_{t.id}.xml" in namelist
        xml_text = z.read(f"voc/task_{t.id}.xml").decode()
        assert "<annotation>" in xml_text
        assert "<name>Car</name>" in xml_text

    # 4. Test CoNLL Export
    conll_buf = export_project_data(db_session, proj.id, "CONLL")
    with zipfile.ZipFile(conll_buf, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert "dataset.conll" in namelist

    # 5. Test JSONL Export
    jsonl_buf = export_project_data(db_session, proj.id, "JSONL")
    with zipfile.ZipFile(jsonl_buf, "r") as z:
        namelist = z.namelist()
        assert "manifest.json" in namelist
        assert "annotations.jsonl" in namelist
        lines = z.read("annotations.jsonl").decode().strip().split("\n")
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec["task_id"] == t.id
