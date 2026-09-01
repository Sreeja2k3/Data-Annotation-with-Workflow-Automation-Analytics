import json
import datetime
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models import Task, TaskVersion, Review, User, ProjectMembership, Project, SchemaVersion

def calculate_cohens_kappa(pairs: List[Tuple[Any, Any]]) -> float:
    """
    Computes Cohen's Kappa for categorical label pairs: [("cat", "cat"), ("dog", "cat"), ...].
    Formula: kappa = (Po - Pe) / (1 - Pe)
    """
    if not pairs:
        return 0.0

    n = len(pairs)
    categories = set()
    for a, b in pairs:
        categories.add(str(a))
        categories.add(str(b))

    if len(categories) <= 1:
        return 1.0 # Perfect agreement if all ratings are the same single category

    # Observed agreement (Po)
    agreements = sum(1 for a, b in pairs if a == b)
    po = agreements / n

    # Expected agreement (Pe)
    rater_a_counts = defaultdict(int)
    rater_b_counts = defaultdict(int)

    for a, b in pairs:
        rater_a_counts[str(a)] += 1
        rater_b_counts[str(b)] += 1

    pe = 0.0
    for c in categories:
        p_a = rater_a_counts[c] / n
        p_b = rater_b_counts[c] / n
        pe += (p_a * p_b)

    if pe >= 1.0:
        return 1.0

    kappa = (po - pe) / (1 - pe)
    return round(kappa, 4)

def get_project_dashboard_stats(db: Session, project_id: int) -> Dict[str, Any]:
    """Calculates comprehensive KPIs for a specific project dashboard (FR-6.1)."""
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    total_tasks = len(tasks)

    if total_tasks == 0:
        return {
            "total_tasks": 0,
            "completion_percentage": 0.0,
            "status_counts": {},
            "average_time_to_completion": 0.0,
            "cohens_kappa": 0.0,
            "active_workload": 0,
            "reviewer_backlog": 0,
            "pending_qa": 0,
            "urgent_tasks": 0,
            "rejection_rate": 0.0
        }

    status_counts = defaultdict(int)
    completed_count = 0
    in_review_count = 0
    pending_qa_count = 0
    active_workload_count = 0
    urgent_count = 0

    for t in tasks:
        status_counts[t.status] += 1
        if t.status in ["Approved", "Locked"]:
            completed_count += 1
        if t.status in ["Submitted", "In Review", "Resubmitted"]:
            in_review_count += 1
        if t.status == "QA Pending":
            pending_qa_count += 1
        if t.status in ["Assigned", "In Progress", "Rejected", "Resubmitted"]:
            active_workload_count += 1
        if t.priority == "Urgent" and t.status not in ["Approved", "Locked"]:
            urgent_count += 1

    completion_percentage = round((completed_count / total_tasks) * 100, 2)

    # Rejection rate calculation across reviews for this project
    task_ids = [t.id for t in tasks]
    total_reviews = db.query(Review).filter(Review.task_id.in_(task_ids)).count() if task_ids else 0
    rejected_reviews = db.query(Review).filter(Review.task_id.in_(task_ids), Review.decision == "Reject").count() if task_ids else 0
    rejection_rate = round((rejected_reviews / total_reviews * 100), 2) if total_reviews > 0 else 0.0

    # Average time to completion in seconds
    completed_task_ids = [t.id for t in tasks if t.status in ["Approved", "Locked"]]
    avg_seconds = 0.0
    if completed_task_ids:
        durations = []
        for task_id in completed_task_ids:
            task = next(t for t in tasks if t.id == task_id)
            first_v = db.query(TaskVersion).filter(TaskVersion.task_id == task_id).order_by(TaskVersion.created_at.asc()).first()
            if first_v and task.created_at:
                diff = (first_v.created_at - task.created_at).total_seconds()
                durations.append(max(0.0, diff))
        if durations:
            avg_seconds = round(sum(durations) / len(durations), 1)

    # Inter-annotator agreement (Cohen's Kappa)
    kappa_score = get_project_cohens_kappa(db, project_id)

    return {
        "total_tasks": total_tasks,
        "completion_percentage": completion_percentage,
        "status_counts": dict(status_counts),
        "average_time_to_completion": avg_seconds,
        "cohens_kappa": kappa_score,
        "active_workload": active_workload_count,
        "reviewer_backlog": in_review_count,
        "pending_qa": pending_qa_count,
        "urgent_tasks": urgent_count,
        "rejection_rate": rejection_rate
    }

def get_project_cohens_kappa(db: Session, project_id: int) -> float:
    """Finds dual-annotated tasks with same data_ref and calculates Cohen's Kappa."""
    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    grouped = defaultdict(list)
    for t in tasks:
        grouped[t.data_ref].append(t)

    pairs = []
    for data_ref, t_list in grouped.items():
        if len(t_list) >= 2:
            # Check if at least 2 have versions
            v1 = db.query(TaskVersion).filter(TaskVersion.task_id == t_list[0].id).order_by(TaskVersion.version_number.desc()).first()
            v2 = db.query(TaskVersion).filter(TaskVersion.task_id == t_list[1].id).order_by(TaskVersion.version_number.desc()).first()
            if v1 and v2:
                try:
                    p1 = json.loads(v1.payload_json).get("label") or json.loads(v1.payload_json).get("category")
                    p2 = json.loads(v2.payload_json).get("label") or json.loads(v2.payload_json).get("category")
                    if p1 and p2:
                        pairs.append((p1, p2))
                except Exception:
                    pass

    return calculate_cohens_kappa(pairs)

def get_annotator_stats(
    db: Session,
    project_id: int,
    start_date: Optional[datetime.datetime] = None,
    end_date: Optional[datetime.datetime] = None
) -> List[Dict[str, Any]]:
    """Calculates per-annotator productivity, average completion time, and rejection rate (FR-6.2)."""
    memberships = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == project_id,
        ProjectMembership.project_role == "Annotator"
    ).all()

    stats = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if not user:
            continue

        query = db.query(TaskVersion).join(Task).filter(
            Task.project_id == project_id,
            TaskVersion.submitted_by == user.id
        )
        if start_date:
            query = query.filter(TaskVersion.created_at >= start_date)
        if end_date:
            query = query.filter(TaskVersion.created_at <= end_date)

        submissions = query.all()
        submitted_task_ids = list(set(s.task_id for s in submissions))

        completed_tasks = db.query(Task).filter(
            Task.id.in_(submitted_task_ids),
            Task.status.in_(["Approved", "Locked"])
        ).count() if submitted_task_ids else 0

        # Rejection count on this user's tasks
        rejections = db.query(Review).filter(
            Review.task_id.in_(submitted_task_ids),
            Review.decision == "Reject"
        ).count() if submitted_task_ids else 0

        total_reviews = db.query(Review).filter(
            Review.task_id.in_(submitted_task_ids)
        ).count() if submitted_task_ids else 0

        rejection_rate = round((rejections / total_reviews * 100), 2) if total_reviews > 0 else 0.0

        # Avg time per item
        durations = []
        for s in submissions:
            task = db.query(Task).filter(Task.id == s.task_id).first()
            if task and task.created_at:
                durations.append(max(0.0, (s.created_at - task.created_at).total_seconds()))
        avg_time = round(sum(durations) / len(durations), 1) if durations else 0.0

        stats.append({
            "user_id": user.id,
            "name": user.name,
            "email": user.email,
            "tasks_completed": completed_tasks,
            "total_submissions": len(submissions),
            "average_time_seconds": avg_time,
            "rejection_rate": rejection_rate
        })

    return stats

def get_reviewer_stats(db: Session, project_id: int) -> List[Dict[str, Any]]:
    """Calculates reviewer statistics: tasks reviewed, acceptance/rejection ratio, avg review time (FR-6.3)."""
    memberships = db.query(ProjectMembership).filter(
        ProjectMembership.project_id == project_id,
        ProjectMembership.project_role == "Reviewer"
    ).all()

    stats = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        if not user:
            continue

        reviews = db.query(Review).join(Task).filter(
            Task.project_id == project_id,
            Review.reviewer_id == user.id
        ).all()

        total = len(reviews)
        accepted = sum(1 for r in reviews if r.decision == "Accept")
        rejected = sum(1 for r in reviews if r.decision == "Reject")
        accept_ratio = round((accepted / total * 100), 2) if total > 0 else 0.0

        # Turnaround time from task submission to review
        durations = []
        for r in reviews:
            task = db.query(Task).filter(Task.id == r.task_id).first()
            if task and task.submitted_at:
                durations.append(max(0.0, (r.created_at - task.submitted_at).total_seconds()))
        avg_review_time = round(sum(durations) / len(durations), 1) if durations else 0.0

        stats.append({
            "reviewer_id": user.id,
            "name": user.name,
            "email": user.email,
            "tasks_reviewed": total,
            "accepted_count": accepted,
            "rejected_count": rejected,
            "acceptance_ratio": accept_ratio,
            "average_review_time_seconds": avg_review_time
        })

    return stats

def get_portfolio_stats(db: Session, user: User) -> List[Dict[str, Any]]:
    """Product Owner portfolio-level dashboard rolling up metrics across owned projects (FR-6.6)."""
    if user.global_role == "admin":
        projects = db.query(Project).filter(Project.is_deleted == False).all()
    else:
        # Projects where user is Product Owner or Project Manager
        memberships = db.query(ProjectMembership).filter(
            ProjectMembership.user_id == user.id,
            ProjectMembership.project_role.in_(["Product Owner", "Project Manager"])
        ).all()
        project_ids = [m.project_id for m in memberships]
        projects = db.query(Project).filter(Project.id.in_(project_ids), Project.is_deleted == False).all()

    portfolio = []
    for proj in projects:
        kpis = get_project_dashboard_stats(db, proj.id)
        portfolio.append({
            "project_id": proj.id,
            "project_name": proj.name,
            "description": proj.description,
            "is_archived": proj.is_archived,
            "completion_percentage": kpis["completion_percentage"],
            "rejection_rate": kpis["rejection_rate"],
            "cohens_kappa": kpis["cohens_kappa"],
            "total_tasks": kpis["total_tasks"],
            "active_workload": kpis["active_workload"],
            "created_at": proj.created_at.isoformat()
        })

    return portfolio
