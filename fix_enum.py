from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(
        text("ALTER TYPE role ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER'")
    )
    conn.commit()

print("PROJECT_MANAGER added successfully")