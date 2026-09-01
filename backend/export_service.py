import io
import json
import zipfile
import datetime
from sqlalchemy.orm import Session
from backend.models import Project, Task, TaskVersion, DatasetSnapshot, SchemaVersion

def generate_manifest(project: Project, format_type: str, count: int, snapshot_name: str = None) -> dict:
    """Generate a standard export manifest containing tracking metadata (FR-8.3)."""
    return {
        "project_id": project.id,
        "project_name": project.name,
        "export_format": format_type,
        "export_timestamp": datetime.datetime.utcnow().isoformat(),
        "total_records": count,
        "snapshot_name": snapshot_name,
        "schema_version": project.schema_json,
        "generator": "Annotation Ops v1.1"
    }

def export_project_data(db: Session, project_id: int, format_type: str, snapshot_id: int = None) -> io.BytesIO:
    """
    Exports approved/locked labels into standard formats (COCO, YOLO, Pascal VOC, CoNLL, JSONL)
    and packages them into a ZIP file in memory (FR-8.1, FR-8.2).
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError("Project not found")

    tasks_data = []
    snapshot_name = None

    if snapshot_id:
        snapshot = db.query(DatasetSnapshot).filter(DatasetSnapshot.id == snapshot_id).first()
        if not snapshot:
            raise ValueError("Snapshot not found")
        snapshot_name = snapshot.name
        tasks_data = json.loads(snapshot.version_manifest_json)
    else:
        # Load all tasks that are approved or locked
        tasks = db.query(Task).filter(
            Task.project_id == project_id,
            Task.status.in_(["Approved", "Locked"])
        ).all()
        for t in tasks:
            version = db.query(TaskVersion).filter(TaskVersion.task_id == t.id).order_by(TaskVersion.version_number.desc()).first()
            payload = json.loads(version.payload_json) if version else {}
            tasks_data.append({
                "task_id": t.id,
                "data_ref": t.data_ref,
                "priority": t.priority,
                "status": t.status,
                "payload": payload,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None
            })

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        manifest = generate_manifest(project, format_type, len(tasks_data), snapshot_name)
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

        # 1. JSONL Export
        if format_type.upper() == "JSONL":
            jsonl_content = ""
            for item in tasks_data:
                jsonl_content += json.dumps(item) + "\n"
            zip_file.writestr("annotations.jsonl", jsonl_content)

        # 2. COCO Export (Object detection / Categorization)
        elif format_type.upper() == "COCO":
            coco_data = {
                "info": {
                    "description": project.description or project.name,
                    "url": "",
                    "version": "1.0",
                    "year": datetime.datetime.utcnow().year,
                    "contributor": "Annotation Ops",
                    "date_created": datetime.datetime.utcnow().isoformat()
                },
                "images": [],
                "annotations": [],
                "categories": []
            }

            category_mapping = {}
            try:
                schema = json.loads(project.schema_json or "{}")
                classes = schema.get("categories", []) or schema.get("classes", [])
                for idx, cat_name in enumerate(classes):
                    cat_id = idx + 1
                    category_mapping[cat_name] = cat_id
                    coco_data["categories"].append({
                        "id": cat_id,
                        "name": cat_name,
                        "supercategory": "none"
                    })
            except Exception:
                pass

            ann_id_counter = 1
            for idx, item in enumerate(tasks_data):
                img_id = idx + 1
                data_ref = item["data_ref"]

                try:
                    ref_obj = json.loads(data_ref)
                    filename = ref_obj.get("image_url") or ref_obj.get("filename") or ref_obj.get("text") or str(ref_obj)
                except Exception:
                    filename = data_ref

                coco_data["images"].append({
                    "id": img_id,
                    "file_name": filename,
                    "width": 800,
                    "height": 600
                })

                payload = item.get("payload", {})
                label = payload.get("label") or payload.get("category")
                if label:
                    if label not in category_mapping:
                        cat_id = len(category_mapping) + 1
                        category_mapping[label] = cat_id
                        coco_data["categories"].append({"id": cat_id, "name": label, "supercategory": "none"})

                    coco_data["annotations"].append({
                        "id": ann_id_counter,
                        "image_id": img_id,
                        "category_id": category_mapping[label],
                        "segmentation": [],
                        "area": 0.0,
                        "bbox": [],
                        "iscrowd": 0
                    })
                    ann_id_counter += 1

                # Bounding boxes
                bboxes = payload.get("bboxes") or payload.get("annotations") or []
                if isinstance(bboxes, list):
                    for box in bboxes:
                        if not isinstance(box, dict):
                            continue
                        bbox_coords = box.get("bbox")
                        box_label = box.get("label") or box.get("category")
                        if bbox_coords and box_label:
                            if box_label not in category_mapping:
                                cat_id = len(category_mapping) + 1
                                category_mapping[box_label] = cat_id
                                coco_data["categories"].append({"id": cat_id, "name": box_label, "supercategory": "none"})

                            coco_data["annotations"].append({
                                "id": ann_id_counter,
                                "image_id": img_id,
                                "category_id": category_mapping[box_label],
                                "segmentation": [],
                                "area": float(bbox_coords[2] * bbox_coords[3]) if len(bbox_coords) >= 4 else 0.0,
                                "bbox": bbox_coords,
                                "iscrowd": 0
                            })
                            ann_id_counter += 1

            zip_file.writestr("coco_annotations.json", json.dumps(coco_data, indent=2))

        # 3. YOLO Export (Darknet format)
        elif format_type.upper() == "YOLO":
            classes_list = []
            category_mapping = {}

            try:
                schema = json.loads(project.schema_json or "{}")
                classes_list = schema.get("categories", []) or schema.get("classes", [])
                for idx, cat_name in enumerate(classes_list):
                    category_mapping[cat_name] = idx
            except Exception:
                pass

            for item in tasks_data:
                yolo_lines = []
                payload = item.get("payload", {})

                label = payload.get("label") or payload.get("category")
                if label:
                    if label not in category_mapping:
                        category_mapping[label] = len(classes_list)
                        classes_list.append(label)
                    yolo_lines.append(f"{category_mapping[label]} 0.5 0.5 1.0 1.0")

                bboxes = payload.get("bboxes") or payload.get("annotations") or []
                if isinstance(bboxes, list):
                    for box in bboxes:
                        if not isinstance(box, dict):
                            continue
                        bbox_coords = box.get("bbox")
                        box_label = box.get("label") or box.get("category")
                        if bbox_coords and box_label and len(bbox_coords) >= 4:
                            if box_label not in category_mapping:
                                category_mapping[box_label] = len(classes_list)
                                classes_list.append(box_label)
                            x_center = bbox_coords[0] + (bbox_coords[2] / 2)
                            y_center = bbox_coords[1] + (bbox_coords[3] / 2)
                            yolo_lines.append(f"{category_mapping[box_label]} {x_center} {y_center} {bbox_coords[2]} {bbox_coords[3]}")

                zip_file.writestr(f"labels/task_{item['task_id']}.txt", "\n".join(yolo_lines))

            zip_file.writestr("classes.txt", "\n".join(classes_list))

        # 4. Pascal VOC (XML format)
        elif format_type.upper() in ["VOC", "PASCAL_VOC", "PASCAL"]:
            for item in tasks_data:
                task_id = item["task_id"]
                data_ref = item["data_ref"]
                try:
                    ref_obj = json.loads(data_ref)
                    filename = ref_obj.get("image_url") or ref_obj.get("filename") or ref_obj.get("text") or str(ref_obj)
                except Exception:
                    filename = data_ref

                payload = item.get("payload", {})

                xml_content = f"<annotation>\n"
                xml_content += f"  <folder>exports</folder>\n"
                xml_content += f"  <filename>{filename}</filename>\n"
                xml_content += f"  <size>\n"
                xml_content += f"    <width>800</width>\n"
                xml_content += f"    <height>600</height>\n"
                xml_content += f"    <depth>3</depth>\n"
                xml_content += f"  </size>\n"

                label = payload.get("label") or payload.get("category")
                if label:
                    xml_content += f"  <object>\n"
                    xml_content += f"    <name>{label}</name>\n"
                    xml_content += f"    <bndbox>\n"
                    xml_content += f"      <xmin>0</xmin>\n"
                    xml_content += f"      <ymin>0</ymin>\n"
                    xml_content += f"      <xmax>800</xmax>\n"
                    xml_content += f"      <ymax>600</ymax>\n"
                    xml_content += f"    </bndbox>\n"
                    xml_content += f"  </object>\n"

                bboxes = payload.get("bboxes") or payload.get("annotations") or []
                if isinstance(bboxes, list):
                    for box in bboxes:
                        if not isinstance(box, dict):
                            continue
                        bbox_coords = box.get("bbox")
                        box_label = box.get("label") or box.get("category")
                        if bbox_coords and box_label and len(bbox_coords) >= 4:
                            xmin = int(bbox_coords[0])
                            ymin = int(bbox_coords[1])
                            xmax = int(bbox_coords[0] + bbox_coords[2])
                            ymax = int(bbox_coords[1] + bbox_coords[3])
                            xml_content += f"  <object>\n"
                            xml_content += f"    <name>{box_label}</name>\n"
                            xml_content += f"    <bndbox>\n"
                            xml_content += f"      <xmin>{xmin}</xmin>\n"
                            xml_content += f"      <ymin>{ymin}</ymin>\n"
                            xml_content += f"      <xmax>{xmax}</xmax>\n"
                            xml_content += f"      <ymax>{ymax}</ymax>\n"
                            xml_content += f"    </bndbox>\n"
                            xml_content += f"  </object>\n"

                xml_content += f"</annotation>"
                zip_file.writestr(f"voc/task_{task_id}.xml", xml_content)

        # 5. CoNLL (NLP format)
        elif format_type.upper() == "CONLL":
            conll_lines = []
            for item in tasks_data:
                data_ref = item["data_ref"]
                payload = item.get("payload", {})
                text_content = ""
                try:
                    ref_obj = json.loads(data_ref)
                    text_content = ref_obj.get("text") or ref_obj.get("content") or str(ref_obj)
                except Exception:
                    text_content = str(data_ref)

                label = payload.get("label") or payload.get("category") or "O"
                tokens = text_content.split()
                if not tokens:
                    tokens = [text_content]

                conll_lines.append(f"# -DOCSTART- task_{item['task_id']}")
                for idx, tok in enumerate(tokens):
                    # For sequence tagging or classification
                    tag = f"B-{label}" if idx == 0 and label != "O" else (f"I-{label}" if label != "O" else "O")
                    conll_lines.append(f"{tok} _ _ {tag}")
                conll_lines.append("") # Blank line between sentences

            zip_file.writestr("dataset.conll", "\n".join(conll_lines))

        else:
            # Fallback JSON dump
            zip_file.writestr("annotations.json", json.dumps(tasks_data, indent=2))

    zip_buffer.seek(0)
    return zip_buffer
