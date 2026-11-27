import uuid
from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.models.user import User


@contextmanager
def temp_authenticated_user(client: TestClient, name: str = "Test User"):
    email = f"pytest-{uuid.uuid4().hex[:10]}@example.com"
    password = "test-password-123"
    resp = client.post(
        "/api/auth/register",
        json={"email": email, "name": name, "password": password},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    user_id = data["user"]["id"]
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    try:
        yield {"user": data["user"], "headers": headers, "email": email, "password": password}
    finally:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            if user:
                db.delete(user)
                db.commit()
