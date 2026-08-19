"""Create deterministic demo users/project/dataset for local testing.

Run after PostgreSQL is available:
    python seed.py

Passwords can be overridden with environment variables. The defaults are
intended only for local development and must not be used in production.
"""
import os

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import Dataset, Project, Role, User

Base.metadata.create_all(bind=engine)

def get_or_create_user(db, name, email, password, role):
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        user.name = name
        user.role = role
        user.is_active = True
        if not user.password_hash:
            user.password_hash = hash_password(password)
    return user


def main():
    db = SessionLocal()
    try:
        users = [
            ("Admin", os.getenv("SEED_ADMIN_EMAIL", "admin@example.com"), os.getenv("SEED_ADMIN_PASSWORD", "Admin@123"), Role.ADMIN),
            ("Project Manager", os.getenv("SEED_PM_EMAIL", "pm@example.com"), os.getenv("SEED_PM_PASSWORD", "PM@123"), Role.PROJECT_MANAGER),
            ("Annotator 1", "annotator1@example.com", "Annotator@123", Role.ANNOTATOR),
            ("Reviewer 1", "reviewer1@example.com", "Reviewer@123", Role.REVIEWER),
            ("QA 1", "qa1@example.com", "QA@123", Role.QA),
        ]
        for row in users:
            get_or_create_user(db, *row)

        project = db.query(Project).filter(Project.name == "Demo Annotation Project").first()
        if project is None:
            project = Project(
                name="Demo Annotation Project",
                description="Seed project for Phase 2 and Phase 3 API testing.",
            )
            db.add(project)
            db.flush()

        dataset = db.query(Dataset).filter(
            Dataset.project_id == project.id,
            Dataset.name == "Demo Dataset",
        ).first()
        if dataset is None:
            dataset = Dataset(
                project_id=project.id,
                name="Demo Dataset",
                description="Small dataset for CSV/JSON import testing.",
            )
            db.add(dataset)

        db.commit()
        print("Seed complete.")
        print("Admin: admin@example.com / Admin@123")
        print("PM:    pm@example.com / PM@123")
        print(f"Project ID: {project.id}")
        print(f"Dataset ID: {dataset.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
