import pytest
import io
from backend.import_service import parse_and_validate_import_file

def test_parse_and_validate_csv():
    # Valid CSV
    valid_csv = b"image_url,description\nhttps://img.com/1.jpg,Car on road\nhttps://img.com/2.jpg,Pedestrian\n"
    valid_items, errors = parse_and_validate_import_file(valid_csv, "dataset.csv", 1)
    assert len(valid_items) == 2
    assert len(errors) == 0

    # CSV with row errors
    invalid_csv = b"image_url,description\nhttps://img.com/1.jpg,Car\n,Missing image\nhttps://img.com/3.jpg,Bicycle\n"
    valid_items, errors = parse_and_validate_import_file(invalid_csv, "invalid.csv", 1)
    assert len(valid_items) == 2
    assert len(errors) == 1
    assert errors[0]["row_index"] == 2
    assert "Missing required data reference" in errors[0]["error"]

def test_parse_and_validate_json():
    # Valid JSON array
    valid_json = b'[{"text": "Sentence one"}, {"text": "Sentence two"}]'
    valid_items, errors = parse_and_validate_import_file(valid_json, "data.json", 1)
    assert len(valid_items) == 2
    assert len(errors) == 0

    # Invalid JSON array with missing data field
    invalid_json = b'[{"text": "Valid"}, {"unknown_field": "Missing"}]'
    valid_items, errors = parse_and_validate_import_file(invalid_json, "invalid.json", 1)
    assert len(valid_items) == 1
    assert len(errors) == 1
    assert errors[0]["row_index"] == 2

def test_unsupported_file_extension_error():
    content = b"random executable content"
    valid_items, errors = parse_and_validate_import_file(content, "malicious.exe", 1)
    assert len(valid_items) == 0
    assert len(errors) == 1
    assert "Unsupported file extension" in errors[0]["error"]
