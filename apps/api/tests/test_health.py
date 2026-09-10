from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import OperationalError

from app.database import get_engine
from app.main import app


@pytest.fixture
def sqlite_engine() -> Generator[Engine, None, None]:
    engine = create_engine("sqlite://")
    yield engine
    engine.dispose()


def test_health_returns_connected_status(sqlite_engine: Engine) -> None:
    app.dependency_overrides[get_engine] = lambda: sqlite_engine

    with TestClient(app) as client:
        response = client.get("/api/health")

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"api": "connected", "database": "connected"}


def test_health_returns_safe_error_when_database_is_unavailable() -> None:
    class UnavailableEngine:
        def connect(self) -> None:
            raise OperationalError("SELECT 1", {}, Exception("offline"))

    app.dependency_overrides[get_engine] = lambda: UnavailableEngine()

    with TestClient(app) as client:
        response = client.get("/api/health")

    app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {
        "api": "connected",
        "database": "unavailable",
        "message": "Database connection unavailable.",
    }
    assert "offline" not in response.text

