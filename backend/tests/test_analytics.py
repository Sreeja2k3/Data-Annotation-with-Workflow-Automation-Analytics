import pytest
import datetime
from backend.analytics import calculate_cohens_kappa, get_project_dashboard_stats
from backend.models import Task, TaskVersion, Review

def test_cohens_kappa_mathematical_cases():
    # 1. Perfect Agreement (kappa = 1.0)
    pairs_perfect = [("cat", "cat"), ("dog", "dog"), ("bird", "bird"), ("cat", "cat")]
    assert calculate_cohens_kappa(pairs_perfect) == 1.0

    # 2. Complete Disagreement (kappa <= 0.0)
    pairs_disagree = [("cat", "dog"), ("dog", "cat"), ("cat", "dog"), ("dog", "cat")]
    assert calculate_cohens_kappa(pairs_disagree) <= 0.0

    # 3. Partial Mixed Agreement (0.0 < kappa < 1.0)
    pairs_mixed = [
        ("car", "car"), ("car", "car"), ("pedestrian", "car"),
        ("cyclist", "cyclist"), ("pedestrian", "pedestrian")
    ]
    kappa = calculate_cohens_kappa(pairs_mixed)
    assert 0.0 < kappa < 1.0

    # 4. Empty List Edge Case
    assert calculate_cohens_kappa([]) == 0.0

def test_dashboard_kpis_calculation(db_session, seeded_env):
    proj = seeded_env["project"]
    ann1 = seeded_env["users"]["ann1"]

    # Add 2 completed tasks, 1 in review, 1 unassigned
    t1 = Task(project_id=proj.id, data_ref='{"text": "1"}', status="Locked", assigned_to=ann1.id, created_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=10))
    t2 = Task(project_id=proj.id, data_ref='{"text": "2"}', status="Approved", assigned_to=ann1.id, created_at=datetime.datetime.utcnow() - datetime.timedelta(minutes=5))
    t3 = Task(project_id=proj.id, data_ref='{"text": "3"}', status="In Review", assigned_to=ann1.id)
    t4 = Task(project_id=proj.id, data_ref='{"text": "4"}', status="Unassigned", priority="Urgent")
    db_session.add_all([t1, t2, t3, t4])
    db_session.commit()

    # Add TaskVersions for completed tasks
    v1 = TaskVersion(task_id=t1.id, submitted_by=ann1.id, payload_json='{"label": "Car"}', created_at=datetime.datetime.utcnow())
    v2 = TaskVersion(task_id=t2.id, submitted_by=ann1.id, payload_json='{"label": "Bicycle"}', created_at=datetime.datetime.utcnow())
    db_session.add_all([v1, v2])
    db_session.commit()

    stats = get_project_dashboard_stats(db_session, proj.id)
    assert stats["total_tasks"] == 4
    assert stats["completion_percentage"] == 50.0 # 2 out of 4
    assert stats["status_counts"]["Locked"] == 1
    assert stats["status_counts"]["Approved"] == 1
    assert stats["urgent_tasks"] == 1
    assert stats["average_time_to_completion"] > 0
