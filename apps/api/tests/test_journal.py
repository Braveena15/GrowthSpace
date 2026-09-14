from collections.abc import Generator
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import Base, JournalEntry, User
from app.security import create_access_token

SECRET = "journal-test-secret-that-is-long-enough"

@pytest.fixture
def context() -> Generator[tuple[TestClient, object, dict[str, str], int], None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="journal-owner", password_hash="unused"); session.add(user); session.commit(); session.refresh(user); user_id = user.id
    settings = Settings(database_url="postgresql+psycopg://test:test@localhost/test", jwt_secret=SECRET, _env_file=None)
    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session: yield session
    app.dependency_overrides[get_session] = session_override; app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client: yield client, engine, {"Authorization": f"Bearer {create_access_token(user_id, SECRET, 30)}"}, user_id
    app.dependency_overrides.clear(); engine.dispose()

def payload(**overrides: object) -> dict[str, object]:
    return {"title": "A title", "content": "A private paragraph.\n\nAnother paragraph.", "entry_date": "2026-09-14", "entry_time": "09:30:00", **overrides}

def create(client: TestClient, headers: dict[str, str], **overrides: object) -> dict[str, object]:
    response = client.post("/api/journal/entries", json=payload(**overrides), headers=headers); assert response.status_code == 201; return response.json()

def test_journal_auth_validation_and_multiple_same_day(context: tuple[TestClient, object, dict[str, str], int]) -> None:
    client, _, headers, _ = context
    assert client.post("/api/journal/entries", json=payload()).status_code == 401
    first, second = create(client, headers), create(client, headers, title=None, entry_time="10:00:00")
    assert first["title"] == "A title" and second["title"] is None and first["entry_date"] == second["entry_date"]
    for invalid in (payload(content=" \n "), payload(content="x" * 20001), payload(user_id=999)):
        assert client.post("/api/journal/entries", json=invalid, headers=headers).status_code == 422

def test_list_search_filters_pagination_and_order(context: tuple[TestClient, object, dict[str, str], int]) -> None:
    client, _, headers, _ = context
    create(client, headers, title="Older", entry_date="2026-09-13", entry_time="09:00:00")
    create(client, headers, title="Match title", entry_date="2026-09-14", entry_time="08:00:00")
    latest = create(client, headers, content="Contains Match text", entry_date="2026-09-14", entry_time="12:00:00")
    listed = client.get("/api/journal/entries", params={"limit": 2}, headers=headers).json()
    assert listed["total"] == 3 and [item["id"] for item in listed["entries"]] == [latest["id"], listed["entries"][1]["id"]]
    assert client.get("/api/journal/entries", params={"query": "match"}, headers=headers).json()["total"] == 2
    assert client.get("/api/journal/entries", params={"start_date": "2026-09-14", "end_date": "2026-09-14"}, headers=headers).json()["total"] == 2
    assert client.get("/api/journal/entries", params={"start_date": "2026-09-15", "end_date": "2026-09-14"}, headers=headers).status_code == 422

def test_edit_delete_and_ownership_404(context: tuple[TestClient, object, dict[str, str], int]) -> None:
    client, engine, headers, user_id = context
    entry = create(client, headers)
    assert client.patch(f"/api/journal/entries/{entry['id']}", json={"title": "Updated", "content": "Updated content"}, headers=headers).json()["title"] == "Updated"
    with Session(engine) as session:
        other = User(username="journal-other", password_hash="unused"); session.add(other); session.flush(); foreign = JournalEntry(user_id=other.id, title="Private", content="Private", entry_date=date(2026, 9, 14), entry_time=time(9)); session.add(foreign); session.commit(); foreign_id = foreign.id
    missing = client.get("/api/journal/entries/999", headers=headers); foreign = client.get(f"/api/journal/entries/{foreign_id}", headers=headers)
    assert missing.status_code == foreign.status_code == 404 and missing.json() == foreign.json() == {"detail": "Journal entry not found."}
    assert client.delete(f"/api/journal/entries/{entry['id']}", headers=headers).status_code == 204
    assert client.get("/api/journal/entries", headers=headers).json()["total"] == 0
    assert user_id > 0

def test_journal_model_metadata(context: tuple[TestClient, object, dict[str, str], int]) -> None:
    _, engine, _, _ = context
    indexes = {item["name"]: item["column_names"] for item in inspect(engine).get_indexes("journal_entries")}
    assert indexes["ix_journal_entries_user_date_time"] == ["user_id", "entry_date", "entry_time"]
