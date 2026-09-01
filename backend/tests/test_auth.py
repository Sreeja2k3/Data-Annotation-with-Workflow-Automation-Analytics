import pytest
from backend.auth import hash_password, verify_password

def test_password_hashing_and_verification():
    raw_pwd = "SuperSecretPassword2026!"
    hashed = hash_password(raw_pwd)

    assert hashed != raw_pwd
    assert ":" in hashed
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

def test_user_registration(client):
    res = client.post("/api/auth/register", json={
        "name": "New User",
        "email": "newuser@test.com",
        "password": "ValidPassword123"
    })
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "newuser@test.com"
    assert "hashed_password" not in data

def test_duplicate_registration_fails(client):
    client.post("/api/auth/register", json={
        "name": "User One",
        "email": "dup@test.com",
        "password": "ValidPassword123"
    })
    res = client.post("/api/auth/register", json={
        "name": "User Two",
        "email": "dup@test.com",
        "password": "ValidPassword123"
    })
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"]

def test_user_login_success_and_failure(client):
    client.post("/api/auth/register", json={
        "name": "Login User",
        "email": "loginuser@test.com",
        "password": "Password123"
    })

    # Success
    res_ok = client.post("/api/auth/login", json={
        "email": "loginuser@test.com",
        "password": "Password123"
    })
    assert res_ok.status_code == 200
    token_data = res_ok.json()
    assert "access_token" in token_data
    assert token_data["user"]["email"] == "loginuser@test.com"

    # Bad password
    res_bad = client.post("/api/auth/login", json={
        "email": "loginuser@test.com",
        "password": "WrongPassword"
    })
    assert res_bad.status_code == 401

def test_protected_route_requires_token(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401

def test_protected_route_with_valid_token(client, seeded_env):
    token = seeded_env["tokens"]["admin"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "admin@test.com"
