import os
import datetime
from typing import Optional
from sqlalchemy.orm import Session
from backend.models import Notification

EMAIL_ENABLED = os.environ.get("EMAIL_ENABLED", "false").lower() == "true"
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "resend")
EMAIL_API_KEY = os.environ.get("EMAIL_API_KEY", "")

def dispatch_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notif_type: str # "assignment", "rejection", "reassignment", "sla_warning", "qa_pending", "approved"
) -> Notification:
    """
    Creates an in-app notification and optionally dispatches an external email if enabled.
    """
    notif = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type,
        read=False,
        created_at=datetime.datetime.utcnow()
    )
    db.add(notif)
    db.flush()

    if EMAIL_ENABLED and EMAIL_API_KEY:
        try:
            send_email_notification(user_id, title, message)
        except Exception as e:
            # Gracefully log without breaking the transaction
            print(f"[Notification Service] Failed to send external email: {e}")

    return notif

def send_email_notification(user_id: int, subject: str, body: str):
    """Abstraction for external email provider integration (Resend / SendGrid)."""
    # In production with EMAIL_ENABLED=true, integrate with Resend SDK or standard HTTP API
    print(f"[Email Dispatch] Provider: {EMAIL_PROVIDER} -> Recipient user ID: {user_id} | Subject: {subject}")
