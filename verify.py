import sys
import os

# Adjust path to import backend modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.auth import hash_password, verify_password
from backend.analytics import calculate_cohens_kappa
from backend.database import SessionLocal, engine, Base
from backend.models import User, Project, Task
from backend.main import seed_database


def test_password_hashing():
    print("Testing password hashing algorithms...")
    pwd = "secure_password_123"
    hashed = hash_password(pwd)
    
    assert verify_password(pwd, hashed) == True, "Password verification failed!"
    assert verify_password("wrong_password", hashed) == False, "Password verification allowed incorrect credentials!"
    print("[OK] Password hashing verify successfully.")

def test_cohens_kappa_math():
    print("Testing Cohen's Kappa calculations...")
    
    # 100% agreement
    agree_pairs = [("cat", "cat"), ("dog", "dog"), ("cat", "cat")]
    kappa_agree = calculate_cohens_kappa(agree_pairs)
    assert kappa_agree == 1.0, f"Expected 1.0, got {kappa_agree}"
    
    # Disagreement math test
    disagree_pairs = [("cat", "cat"), ("dog", "cat"), ("cat", "dog"), ("dog", "dog")]
    # po = 2/4 = 0.5
    # Rater A: 2 cats, 2 dogs (0.5, 0.5)
    # Rater B: 3 cats, 1 dog (0.75, 0.25)
    # pe = (0.5 * 0.75) + (0.5 * 0.25) = 0.375 + 0.125 = 0.5
    # kappa = (0.5 - 0.5) / (1 - 0.5) = 0.0
    kappa_disagree = calculate_cohens_kappa(disagree_pairs)
    assert kappa_disagree == 0.0, f"Expected 0.0, got {kappa_disagree}"
    
    # Standard mixed agreement
    mixed_pairs = [
        ("car", "car"), ("car", "car"), ("pedestrian", "car"), 
        ("cyclist", "cyclist"), ("pedestrian", "pedestrian")
    ]
    kappa_mixed = calculate_cohens_kappa(mixed_pairs)
    assert 0.0 < kappa_mixed < 1.0, f"Expected between 0.0 and 1.0, got {kappa_mixed}"
    
    # Empty edge case
    assert calculate_cohens_kappa([]) == 0.0, "Expected 0.0 for empty pairs list"
    print("[OK] Cohen's Kappa agreement coefficients calculated correctly.")

def test_database_connection():
    print("Testing relational database connection...")
    db = SessionLocal()
    try:
        seed_database()
        user_count = db.query(User).count()
        project_count = db.query(Project).count()
        task_count = db.query(Task).count()
        
        print(f"[OK] Connected to database. Found {user_count} users, {project_count} projects, and {task_count} tasks.")
        
        # Verify pre-seeded demo user
        admin = db.query(User).filter(User.email == "admin@annotationops.com").first()
        assert admin is not None, "Admin user seeding missing!"
        assert admin.global_role == "admin", "Admin role not initialized correctly!"
        print("[OK] Pre-seeded admin user verified.")
        
    except Exception as e:
        print(f"Database verification failed: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    print("=== RUNNING SYSTEM VERIFICATION ===")
    test_password_hashing()
    test_cohens_kappa_math()
    test_database_connection()
    print("=== ALL TESTS PASSED SUCCESSFULLY ===")
