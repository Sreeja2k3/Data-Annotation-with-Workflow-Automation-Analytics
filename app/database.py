"""
Database setup for the annotation workflow engine.
Uses SQLAlchemy 2.0 style with PostgreSQL.
"""
import os

from dotenv import load_dotenv

load_dotenv()
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@127.0.0.1:5432/annotation_platform",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a DB session and guarantees it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
