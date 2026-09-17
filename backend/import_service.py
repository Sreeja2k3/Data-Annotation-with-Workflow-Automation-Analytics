import io
import csv
import json
import zipfile
import datetime
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, UploadFile

from backend.models import ImportJob, ImportError, Dataset, Task, SchemaVersion, Project
from backend.workflow import log_audit_event

def parse_and_validate_import_file(
    content: bytes,
    filename: str,
    project_id: int
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parses and validates file content (CSV, JSON, JSONL, or ZIP archive).
    Returns (valid_items, error_list) with row/item index and error description.
    """
    valid_items = []
    error_list = []

    ext = filename.lower().split(".")[-1] if "." in filename else ""

    # 1. CSV File
    if ext == "csv":
        try:
            text_stream = io.StringIO(content.decode("utf-8", errors="replace"))
            reader = csv.DictReader(text_stream)
            if not reader.fieldnames:
                error_list.append({"row_index": 0, "error": "Empty CSV or missing header row", "raw": ""})
                return valid_items, error_list

            for idx, row in enumerate(reader, start=1):
                # We expect at least one reference field like 'image_url', 'text', 'data', or 'content'
                data_val = row.get("image_url") or row.get("text") or row.get("data") or row.get("content") or row.get("url")
                if not data_val or not str(data_val).strip():
                    error_list.append({
                        "row_index": idx,
                        "error": "Missing required data reference column ('image_url', 'text', or 'data')",
                        "raw": json.dumps(row)
                    })
                else:
                    valid_items.append({
                        "data_ref": json.dumps(row),
                        "row_index": idx
                    })
        except Exception as e:
            error_list.append({"row_index": 0, "error": f"CSV parse error: {str(e)}", "raw": ""})

    # 2. JSON / JSONL File
    elif ext in ["json", "jsonl"]:
        try:
            raw_text = content.decode("utf-8", errors="replace").strip()
            # Check if JSON array
            if raw_text.startswith("["):
                items = json.loads(raw_text)
                for idx, item in enumerate(items, start=1):
                    if not isinstance(item, dict):
                        error_list.append({"row_index": idx, "error": "Item must be a JSON object", "raw": str(item)})
                    elif not any(k in item for k in ["image_url", "text", "data", "content", "url"]):
                        error_list.append({
                            "row_index": idx,
                            "error": "Missing required data field ('image_url', 'text', 'data', or 'url')",
                            "raw": json.dumps(item)
                        })
                    else:
                        valid_items.append({"data_ref": json.dumps(item), "row_index": idx})
            else:
                # JSONL
                for idx, line in enumerate(raw_text.splitlines(), start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        if not isinstance(item, dict):
                            error_list.append({"row_index": idx, "error": "Line is not a valid JSON object", "raw": line})
                        elif not any(k in item for k in ["image_url", "text", "data", "content", "url"]):
                            error_list.append({
                                "row_index": idx,
                                "error": "Missing required data field ('image_url', 'text', 'data', or 'url')",
                                "raw": line
                            })
                        else:
                            valid_items.append({"data_ref": json.dumps(item), "row_index": idx})
                    except Exception as je:
                        error_list.append({"row_index": idx, "error": f"Invalid JSON line: {str(je)}", "raw": line})
        except Exception as e:
            error_list.append({"row_index": 0, "error": f"JSON parse error: {str(e)}", "raw": ""})

    # 3. ZIP Archive (image or audio batch)
    # 3. ZIP Archive (image or audio batch)
    elif ext == "zip":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                idx = 0
                for file_info in z.infolist():
                    if file_info.is_dir() or file_info.filename.startswith("__MACOSX"):
                        continue
                    idx += 1
                    file_name = file_info.filename
                    file_ext = file_name.lower().split(".")[-1] if "." in file_name else ""
                    if file_ext not in ["jpg", "jpeg", "png", "webp", "gif", "mp3", "wav", "flac", "ogg", "txt"]:
                        error_list.append({
                            "row_index": idx,
                            "error": f"Unsupported media extension '.{file_ext}' in archive",
                            "raw": file_name
                        })
                    else:
                        valid_items.append({
                            "data_ref": json.dumps({"image_url": file_name, "filename": file_name}),
                            "row_index": idx
                        })
        except Exception as e:
            error_list.append({"row_index": 0, "error": f"ZIP archive error: {str(e)}", "raw": ""})

    # 4. Direct Single Image File (.jpg, .jpeg, .png, .webp, .gif)
    elif ext in ["jpg", "jpeg", "png", "webp", "gif"]:
        try:
            import base64
            mime_type = "image/jpeg" if ext in ["jpg", "jpeg"] else f"image/{ext}"
            b64_str = base64.b64encode(content).decode("utf-8")
            data_uri = f"data:{mime_type};base64,{b64_str}"

            valid_items.append({
                "data_ref": json.dumps({
                    "image_url": data_uri,
                    "filename": filename,
                    "description": f"Directly imported image asset: {filename}"
                }),
                "row_index": 1
            })
        except Exception as e:
            error_list.append({"row_index": 1, "error": f"Image processing error: {str(e)}", "raw": filename})

    else:
        error_list.append({"row_index": 0, "error": f"Unsupported file extension '.{ext}'. Supported: .csv, .json, .jsonl, .zip, .jpg, .png, .webp, .gif", "raw": ""})

    return valid_items, error_list

def create_import_job_and_validate(
    db: Session,
    project_id: int,
    file_bytes: bytes,
    filename: str,
    user_id: int
) -> ImportJob:
    """
    Creates an ImportJob, parses and validates the file, and persists any validation errors.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    valid_items, error_list = parse_and_validate_import_file(file_bytes, filename, project_id)

    job = ImportJob(
        project_id=project_id,
        status="Validated" if not error_list else ("Partial" if valid_items else "Failed"),
        total_rows=len(valid_items) + len(error_list),
        valid_rows=len(valid_items),
        invalid_rows=len(error_list),
        raw_valid_data_json=json.dumps(valid_items) if valid_items else None,
        created_by=user_id,
        created_at=datetime.datetime.utcnow()
    )
    db.add(job)
    db.flush()

    for err in error_list:
        db_err = ImportError(
            import_job_id=job.id,
            row_index=err["row_index"],
            error_message=err["error"],
            raw_data_json=err.get("raw"),
            created_at=datetime.datetime.utcnow()
        )
        db.add(db_err)

    log_audit_event(
        db,
        actor_id=user_id,
        action="validate_import",
        entity_type="import_job",
        entity_id=job.id,
        metadata={
            "filename": filename,
            "total_rows": job.total_rows,
            "valid_rows": job.valid_rows,
            "invalid_rows": job.invalid_rows
        }
    )

    db.commit()
    db.refresh(job)
    return job

def confirm_and_ingest_import(
    db: Session,
    project_id: int,
    job_id: int,
    user_id: int,
    dataset_name: str,
    raw_valid_items: List[Dict[str, Any]],
    priority: str = "Normal"
) -> Tuple[Dataset, int]:
    """
    Ingests validated items, creates a Dataset record, and generates Task entities.
    """
    job = db.query(ImportJob).filter(ImportJob.id == job_id, ImportJob.project_id == project_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job not found")

    # Get latest schema version
    latest_schema = db.query(SchemaVersion).filter(SchemaVersion.project_id == project_id).order_by(SchemaVersion.version_number.desc()).first()

    # Create dataset
    dataset = Dataset(
        project_id=project_id,
        name=dataset_name or f"Dataset {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        total_items=len(raw_valid_items),
        created_at=datetime.datetime.utcnow()
    )
    db.add(dataset)
    db.flush()

    job.dataset_id = dataset.id
    job.status = "Completed"

    # Generate tasks
    now = datetime.datetime.utcnow()
    tasks_created = 0
    for item in raw_valid_items:
        task = Task(
            project_id=project_id,
            dataset_id=dataset.id,
            data_ref=item["data_ref"],
            status="Unassigned",
            priority=priority,
            schema_version_id=latest_schema.id if latest_schema else None,
            created_at=now,
            updated_at=now
        )
        db.add(task)
        tasks_created += 1

    log_audit_event(
        db,
        actor_id=user_id,
        action="ingest_dataset",
        entity_type="dataset",
        entity_id=dataset.id,
        metadata={"tasks_created": tasks_created, "project_id": project_id}
    )

    db.commit()
    db.refresh(dataset)
    return dataset, tasks_created
