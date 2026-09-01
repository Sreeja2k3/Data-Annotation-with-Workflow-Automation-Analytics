import pytest
import os
import tempfile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app, seed_database
from backend.models import User, Project, ProjectMembership, SchemaVersion, Task, TaskVersion, Review, DatasetSnapshot, ProjectSetting
from backend.auth import hash_password, create_access_token

# Use in-memory SQLite database for isolated test execution
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def seeded_env(db_session):
    """Sets up a complete set of users with different roles for RBAC and workflow tests."""
    admin = User(name="Admin User", email="admin@test.com", hashed_password=hash_password("password123"), global_role="admin")
    po = User(name="Product Owner", email="po@test.com", hashed_password=hash_password("password123"), global_role="user")
    pm = User(name="Project Manager", email="pm@test.com", hashed_password=hash_password("password123"), global_role="user")
    ann1 = User(name="Annotator One", email="ann1@test.com", hashed_password=hash_password("password123"), global_role="user")
    ann2 = User(name="Annotator Two", email="ann2@test.com", hashed_password=hash_password("password123"), global_role="user")
    rev = User(name="Reviewer User", email="rev@test.com", hashed_password=hash_password("password123"), global_role="user")
    outsider = User(name="Outsider User", email="outsider@test.com", hashed_password=hash_password("password123"), global_role="user")

    users = [admin, po, pm, ann1, ann2, rev, outsider]
    for u in users:
        db_session.add(u)
    db_session.commit()
    for u in users:
        db_session.refresh(u)

    # Create project 1
    proj1 = Project(
        name="Vision Detection Project",
        description="Bounding and classification",
        schema_json='{"categories": ["Car", "Pedestrian", "Bicycle"]}',
        created_by=admin.id
    )
    db_session.add(proj1)
    db_session.commit()
    db_session.refresh(proj1)

    # Settings
    setting1 = ProjectSetting(project_id=proj1.id, review_mode="single", auto_assignment_enabled=True, batch_size=10, default_priority="Normal", sla_hours=48)
    db_session.add(setting1)

    # Memberships
    m_admin = ProjectMembership(user_id=admin.id, project_id=proj1.id, project_role="Admin")
    m_po = ProjectMembership(user_id=po.id, project_id=proj1.id, project_role="Product Owner")
    m_pm = ProjectMembership(user_id=pm.id, project_id=proj1.id, project_role="Project Manager")
    m_ann1 = ProjectMembership(user_id=ann1.id, project_id=proj1.id, project_role="Annotator")
    m_ann2 = ProjectMembership(user_id=ann2.id, project_id=proj1.id, project_role="Annotator")
    m_rev = ProjectMembership(user_id=rev.id, project_id=proj1.id, project_role="Reviewer")

    for m in [m_admin, m_po, m_pm, m_ann1, m_ann2, m_rev]:
        db_session.add(m)
    db_session.commit()

    # Schema version
    schema_v1 = SchemaVersion(
        project_id=proj1.id,
        version_number=1,
        taxonomy_json=proj1.schema_json,
        guidelines_text="Label all moving objects on street.",
        defined_by=po.id
    )
    db_session.add(schema_v1)
    db_session.commit()
    db_session.refresh(schema_v1)

    # Tokens dictionary
    tokens = {
        "admin": create_access_token({"sub": admin.email, "id": admin.id, "global_role": "admin"}),
        "po": create_access_token({"sub": po.email, "id": po.id, "global_role": "user"}),
        "pm": create_access_token({"sub": pm.email, "id": pm.id, "global_role": "user"}),
        "ann1": create_access_token({"sub": ann1.email, "id": ann1.id, "global_role": "user"}),
        "ann2": create_access_token({"sub": ann2.email, "id": ann2.id, "global_role": "user"}),
        "rev": create_access_token({"sub": rev.email, "id": rev.id, "global_role": "user"}),
        "outsider": create_access_token({"sub": outsider.email, "id": outsider.id, "global_role": "user"}),
    }

    return {
        "users": {"admin": admin, "po": po, "pm": pm, "ann1": ann1, "ann2": ann2, "rev": rev, "outsider": outsider},
        "project": proj1,
        "schema": schema_v1,
        "tokens": tokens
    }
