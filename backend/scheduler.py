import datetime
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import Task, ProjectSetting, Notification, Project
from backend.assignment import auto_assign_tasks

def check_sla_deadlines():
    """
    Periodic job that checks in-flight tasks against project SLA limits.
    Issues sla_warning notifications for tasks approaching or exceeding deadline.
    """
    db = SessionLocal()
    try:
        now = datetime.datetime.utcnow()
        # Find active projects with settings
        settings = db.query(ProjectSetting).all()
        for setting in settings:
            sla_hours = setting.sla_hours or 48
            warning_threshold = datetime.timedelta(hours=max(1, sla_hours - 6))

            # Query active assigned tasks
            active_tasks = db.query(Task).filter(
                Task.project_id == setting.project_id,
                Task.status.in_(["Assigned", "In Progress", "Rejected"]),
                Task.assigned_to.isnot(None),
                Task.assigned_at.isnot(None)
            ).all()

            for task in active_tasks:
                elapsed = now - task.assigned_at
                if elapsed >= warning_threshold:
                    # Check if warning already sent in last 12 hours
                    recent_notif = db.query(Notification).filter(
                        Notification.user_id == task.assigned_to,
                        Notification.type == "sla_warning",
                        Notification.created_at >= now - datetime.timedelta(hours=12)
                    ).first()
                    if not recent_notif:
                        notif = Notification(
                            user_id=task.assigned_to,
                            title="SLA Deadline Approaching",
                            message=f"Task #{task.id} (Priority: {task.priority}) is approaching its {sla_hours}-hour SLA limit.",
                            type="sla_warning",
                            created_at=now
                        )
                        db.add(notif)
        db.commit()
    except Exception as e:
        print(f"[Scheduler] SLA check error: {e}")
    finally:
        db.close()

def run_auto_assignment_sweep():
    """
    Periodic job to auto-assign any unassigned tasks across active projects.
    """
    db = SessionLocal()
    try:
        active_projects = db.query(Project).filter(Project.is_archived == False, Project.is_deleted == False).all()
        for p in active_projects:
            setting = db.query(ProjectSetting).filter(ProjectSetting.project_id == p.id).first()
            if setting and setting.auto_assignment_enabled:
                auto_assign_tasks(db, p.id)
    except Exception as e:
        print(f"[Scheduler] Auto-assignment sweep error: {e}")
    finally:
        db.close()

def start_scheduler():
    """Initializes and starts the APScheduler background worker."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(check_sla_deadlines, 'interval', minutes=15, id='sla_check')
        scheduler.add_job(run_auto_assignment_sweep, 'interval', minutes=5, id='auto_assign')
        scheduler.start()
        print("[Scheduler] APScheduler background engine started.")
        return scheduler
    except Exception as e:
        print(f"[Scheduler] Could not start APScheduler: {e}")
        return None
