from collections.abc import Generator
from datetime import datetime, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import Base, User


USERNAME = "growth_owner"
PASSWORD = "Strong-personal-password1!"


@pytest.fixture
def auth_client() -> Generator[tuple[TestClient, Engine], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret="test-secret-that-is-long-enough-for-hs256-signing",
        access_token_expire_minutes=30,
        _env_file=None,
    )

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings

    with TestClient(app) as client:
        yield client, engine

    app.dependency_overrides.clear()
    engine.dispose()


def create_account(client: TestClient) -> dict[str, object]:
    response = client.post(
        "/api/auth/setup",
        json={"username": USERNAME, "password": PASSWORD},
    )
    assert response.status_code == 201
    return response.json()


def login(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_successful_initial_setup(auth_client: tuple[TestClient, Engine]) -> None:
    client, _ = auth_client

    body = create_account(client)

    assert body["username"] == USERNAME
    assert body["is_active"] is True
    assert isinstance(body["id"], int)
    assert datetime.fromisoformat(str(body["created_at"]))
    assert "password" not in body
    assert "password_hash" not in body


def test_password_is_stored_as_argon2_hash(
    auth_client: tuple[TestClient, Engine],
) -> None:
    client, engine = auth_client
    create_account(client)

    with Session(engine) as session:
        user = session.scalar(select(User))

    assert user is not None
    assert user.password_hash.startswith("$argon2")
    assert user.password_hash != PASSWORD
    assert PASSWORD not in user.password_hash


def test_second_setup_is_rejected(auth_client: tuple[TestClient, Engine]) -> None:
    client, _ = auth_client
    create_account(client)

    response = client.post(
        "/api/auth/setup",
        json={"username": "another_owner", "password": "Another-strong-pass2!"},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "An account already exists."}


def test_successful_login_returns_expiring_token(
    auth_client: tuple[TestClient, Engine],
) -> None:
    client, _ = auth_client
    account = create_account(client)

    response = client.post(
        "/api/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    token = response.json()["access_token"]
    payload = jwt.decode(
        token,
        "test-secret-that-is-long-enough-for-hs256-signing",
        algorithms=["HS256"],
    )
    assert payload["sub"] == str(account["id"])
    assert payload["exp"] > datetime.now(timezone.utc).timestamp()


@pytest.mark.parametrize(
    ("username", "password"),
    [
        (USERNAME, "Incorrect-password1!"),
        ("unknown_owner", PASSWORD),
    ],
)
def test_invalid_login_uses_generic_response(
    auth_client: tuple[TestClient, Engine],
    username: str,
    password: str,
) -> None:
    client, _ = auth_client
    create_account(client)

    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password."}


def test_inactive_account_is_rejected(auth_client: tuple[TestClient, Engine]) -> None:
    client, engine = auth_client
    create_account(client)
    with Session(engine) as session:
        user = session.scalar(select(User))
        assert user is not None
        user.is_active = False
        session.commit()

    response = client.post(
        "/api/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid username or password."}


def test_authenticated_me_returns_only_safe_fields(
    auth_client: tuple[TestClient, Engine],
) -> None:
    client, _ = auth_client
    create_account(client)
    token = login(client)

    response = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert set(response.json()) == {"id", "username", "is_active", "created_at"}
    assert response.json()["username"] == USERNAME


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer not-a-valid-token"},
    ],
)
def test_me_rejects_missing_and_invalid_token(
    auth_client: tuple[TestClient, Engine],
    headers: dict[str, str],
) -> None:
    client, _ = auth_client

    response = client.get("/api/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Invalid or missing authentication token."
    }


def test_invalid_setup_does_not_echo_password(
    auth_client: tuple[TestClient, Engine],
) -> None:
    client, _ = auth_client
    weak_password = "weak-password"

    response = client.post(
        "/api/auth/setup",
        json={"username": USERNAME, "password": weak_password},
    )

    assert response.status_code == 422
    assert weak_password not in response.text


def test_cors_allows_frontend_authentication_requests(
    auth_client: tuple[TestClient, Engine],
) -> None:
    client, _ = auth_client

    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "POST" in response.headers["access-control-allow-methods"]
