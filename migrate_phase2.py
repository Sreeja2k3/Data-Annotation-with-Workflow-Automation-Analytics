"""Small compatibility migration for an already-created Phase 3 database.

Fresh databases do not need this script because `Base.metadata.create_all()`
creates the complete schema. If you already ran the teammate's Phase 3 code
against a PostgreSQL database, run this once after pulling the Phase 2 update:

    python migrate_phase2.py

It adds the Project Manager enum value and the optional dataset_id column
without changing any Phase 3 workflow tables or transition behavior.
"""
from sqlalchemy import text

from app.database import engine


def main():
    with engine.connect() as conn:
        # PostgreSQL enum values cannot be added inside a transaction block.
        conn.execution_options(isolation_level="AUTOCOMMIT").execute(
            text("ALTER TYPE role ADD VALUE IF NOT EXISTS 'PROJECT_MANAGER'")
        )

        conn.execute(
            text(
                "ALTER TABLE imported_items "
                "ADD COLUMN IF NOT EXISTS dataset_id UUID"
            )
        )

        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_imported_items_dataset_id "
                "ON imported_items (dataset_id)"
            )
        )

        # Add the FK only if it is not already present.
        conn.execute(
            text(
                "DO $$ BEGIN "
                "IF NOT EXISTS ("
                "SELECT 1 FROM pg_constraint WHERE conname = 'fk_imported_items_dataset_id'"
                ") THEN "
                "ALTER TABLE imported_items "
                "ADD CONSTRAINT fk_imported_items_dataset_id "
                "FOREIGN KEY (dataset_id) REFERENCES datasets(id); "
                "END IF; END $$;"
            )
        )
        conn.commit()

    print("Phase 2 compatibility migration completed.")


if __name__ == "__main__":
    main()
