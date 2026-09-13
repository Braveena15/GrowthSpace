from collections.abc import Generator
from dataclasses import dataclass
from datetime import date
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, inspect, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import DailyNoteAnalysis, User
from app.schemas.note_analysis import NoteAnalysisContent
from app.security import create_access_token
from app.services.note_analysis import (
    NoteAnalysisMalformedResponseError,
    NoteAnalysisSchemaError,
    NoteAnalysisTimeoutError,
    NoteAnalysisUnavailableError,
    NoteSource,
    OllamaNoteAnalysisProvider,
    get_note_analysis_provider,
)


JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"
DAY = date(2026, 9, 14)


def analysis_content(summary: str = "You made progress on a planned task.") -> NoteAnalysisContent:
    return NoteAnalysisContent(
        summary=summary,
        positive_actions=["You completed a planned task."],
        challenges=["The note mentions limited time."],
        possible_improvements=["You could choose one smaller next step."],
        themes=["Planning"],
        reflection_question="What helped you complete the task?",
    )


class FakeProvider:
    model_name = "mock-local-model"

    def __init__(self, result: object | Exception | None = None) -> None:
        self.result = analysis_content() if result is None else result
        self.calls: list[list[NoteSource]] = []

    def analyse(self, sources: list[NoteSource]) -> NoteAnalysisContent:
        self.calls.append(sources)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result  # type: ignore[return-value]


@dataclass
class AnalysisTestContext:
    client: TestClient
    engine: Engine
    headers: dict[str, str]
    other_headers: dict[str, str]
    provider: FakeProvider
    settings: Settings


@pytest.fixture
def analysis_context() -> Generator[AnalysisTestContext, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    DailyNoteAnalysis.metadata.create_all(engine)
    with Session(engine) as session:
        owner = User(username="analysis_owner", password_hash="unused")
        other = User(username="analysis_other", password_hash="unused")
        session.add_all([owner, other])
        session.commit()
        session.refresh(owner)
        session.refresh(other)
        owner_token = create_access_token(owner.id, JWT_SECRET, 30)
        other_token = create_access_token(other.id, JWT_SECRET, 30)

    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        ai_note_analysis_enabled=True,
        _env_file=None,
    )
    provider = FakeProvider()

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_note_analysis_provider] = lambda: provider
    with TestClient(app) as client:
        yield AnalysisTestContext(
            client=client,
            engine=engine,
            headers={"Authorization": f"Bearer {owner_token}"},
            other_headers={"Authorization": f"Bearer {other_token}"},
            provider=provider,
            settings=settings,
        )
    app.dependency_overrides.clear()
    engine.dispose()


def open_checkin(context: AnalysisTestContext) -> None:
    response = context.client.put(f"/api/check-ins/{DAY}", headers=context.headers)
    assert response.status_code == 200


def save_note(context: AnalysisTestContext, category: str, note: str) -> None:
    response = context.client.put(
        f"/api/check-ins/{DAY}/notes",
        headers=context.headers,
        json={"category": category, "note": note},
    )
    assert response.status_code == 200


def generate(context: AnalysisTestContext, confirm: bool = False):
    return context.client.post(
        f"/api/check-ins/{DAY}/note-analysis",
        headers=context.headers,
        json={"confirm_overwrite_accepted": confirm},
    )


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", f"/api/check-ins/{DAY}/note-analysis", None),
        ("POST", f"/api/check-ins/{DAY}/note-analysis", {}),
        ("PUT", f"/api/check-ins/{DAY}/note-analysis", analysis_content().model_dump()),
        ("POST", f"/api/check-ins/{DAY}/note-analysis/accept", None),
        ("POST", f"/api/check-ins/{DAY}/note-analysis/reject", None),
    ],
)
def test_analysis_endpoints_require_authentication(
    analysis_context: AnalysisTestContext,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    response = analysis_context.client.request(method, path, json=body)
    assert response.status_code == 401


def test_successful_combined_analysis_uses_only_nonblank_category_notes(
    analysis_context: AnalysisTestContext,
) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "  Finished   the planned task. ")
    save_note(analysis_context, "Communication", "   ")

    response = generate(analysis_context)

    assert response.status_code == 200
    body = response.json()
    assert body["analysis"]["summary"] == "You made progress on a planned task."
    assert body["analysis"]["status"] == "draft"
    assert body["is_outdated"] is False
    assert analysis_context.provider.calls == [
        [NoteSource(category="Career", note="Finished the planned task.")]
    ]


def test_blank_notes_do_not_generate(analysis_context: AnalysisTestContext) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", " \n  ")
    response = generate(analysis_context)
    assert response.status_code == 422
    assert response.json() == {"detail": "Add at least one note before requesting an analysis."}
    assert analysis_context.provider.calls == []


def test_analysis_ownership_is_isolated(analysis_context: AnalysisTestContext) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Finished one task.")
    assert generate(analysis_context).status_code == 200

    other = analysis_context.client.get(
        f"/api/check-ins/{DAY}/note-analysis",
        headers=analysis_context.other_headers,
    )
    assert other.status_code == 404


@pytest.mark.parametrize(
    ("failure", "status_code", "detail"),
    [
        (NoteAnalysisTimeoutError(), 504, "AI note analysis timed out. Please try again."),
        (NoteAnalysisUnavailableError("private raw error"), 503, "AI note analysis is temporarily unavailable."),
        (NoteAnalysisMalformedResponseError(), 502, "AI note analysis returned an invalid response. Please try again."),
        (NoteAnalysisSchemaError(), 502, "AI note analysis returned an invalid response. Please try again."),
    ],
)
def test_provider_failures_return_safe_errors(
    analysis_context: AnalysisTestContext,
    failure: Exception,
    status_code: int,
    detail: str,
) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "A private note that must not be echoed.")
    analysis_context.provider.result = failure
    response = generate(analysis_context)
    assert response.status_code == status_code
    assert response.json() == {"detail": detail}
    assert "private" not in response.text.lower()


def test_route_revalidates_provider_output(analysis_context: AnalysisTestContext) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Completed a task.")
    analysis_context.provider.result = {"summary": "Incomplete output"}
    response = generate(analysis_context)
    assert response.status_code == 502
    assert response.json() == {
        "detail": "AI note analysis returned an invalid response. Please try again."
    }


def test_disabled_feature_returns_state_and_safe_generation_error(
    analysis_context: AnalysisTestContext,
) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Completed a task.")
    analysis_context.settings.ai_note_analysis_enabled = False
    state = analysis_context.client.get(
        f"/api/check-ins/{DAY}/note-analysis",
        headers=analysis_context.headers,
    )
    generated = generate(analysis_context)
    assert state.status_code == 200
    assert state.json()["enabled"] is False
    assert generated.status_code == 503
    assert generated.json() == {"detail": "AI note analysis is currently disabled."}


def test_fingerprint_detects_meaningful_note_changes_but_normalizes_whitespace(
    analysis_context: AnalysisTestContext,
) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Finished the task.")
    assert generate(analysis_context).status_code == 200

    save_note(analysis_context, "Career", "  Finished   the task. ")
    same = analysis_context.client.get(f"/api/check-ins/{DAY}/note-analysis", headers=analysis_context.headers)
    assert same.json()["is_outdated"] is False

    save_note(analysis_context, "Career", "Finished the task and reviewed it.")
    changed = analysis_context.client.get(f"/api/check-ins/{DAY}/note-analysis", headers=analysis_context.headers)
    assert changed.json()["is_outdated"] is True
    regenerated = generate(analysis_context)
    assert regenerated.status_code == 200
    assert regenerated.json()["is_outdated"] is False


def test_analysis_can_be_edited_accepted_and_rejected(analysis_context: AnalysisTestContext) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Completed a task.")
    assert generate(analysis_context).status_code == 200
    edited_content = analysis_content("Edited summary.").model_dump()
    edited = analysis_context.client.put(
        f"/api/check-ins/{DAY}/note-analysis",
        headers=analysis_context.headers,
        json=edited_content,
    )
    accepted = analysis_context.client.post(
        f"/api/check-ins/{DAY}/note-analysis/accept",
        headers=analysis_context.headers,
    )
    rejected = analysis_context.client.post(
        f"/api/check-ins/{DAY}/note-analysis/reject",
        headers=analysis_context.headers,
    )
    assert edited.json()["analysis"]["summary"] == "Edited summary."
    assert edited.json()["analysis"]["status"] == "draft"
    assert accepted.json()["analysis"]["status"] == "accepted"
    assert rejected.json()["analysis"]["status"] == "rejected"


def test_accepted_analysis_requires_confirmation_before_regeneration(
    analysis_context: AnalysisTestContext,
) -> None:
    open_checkin(analysis_context)
    save_note(analysis_context, "Career", "Completed a task.")
    assert generate(analysis_context).status_code == 200
    analysis_context.client.post(f"/api/check-ins/{DAY}/note-analysis/accept", headers=analysis_context.headers)
    blocked = generate(analysis_context)
    assert blocked.status_code == 409
    assert len(analysis_context.provider.calls) == 1
    confirmed = generate(analysis_context, confirm=True)
    assert confirmed.status_code == 200
    assert confirmed.json()["analysis"]["status"] == "draft"
    assert len(analysis_context.provider.calls) == 2


def test_analysis_table_never_duplicates_raw_notes(analysis_context: AnalysisTestContext) -> None:
    open_checkin(analysis_context)
    raw_note = "A uniquely private source note."
    save_note(analysis_context, "Career", raw_note)
    assert generate(analysis_context).status_code == 200

    columns = {column["name"] for column in inspect(analysis_context.engine).get_columns("daily_note_analyses")}
    assert "note" not in columns
    assert "notes" not in columns
    with Session(analysis_context.engine) as session:
        stored = session.scalar(select(DailyNoteAnalysis))
        assert stored is not None
        assert raw_note not in str(stored.__dict__)


def test_ollama_request_and_valid_response_use_the_structured_schema() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={"message": {"content": analysis_content().model_dump_json()}},
        )

    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        ollama_model="qwen3:8b",
        _env_file=None,
    )
    provider = OllamaNoteAnalysisProvider(settings, transport=httpx.MockTransport(handler))
    result = provider.analyse([NoteSource("Career", "Completed a task.")])
    assert result.summary == "You made progress on a planned task."
    assert captured["model"] == "qwen3:8b"
    assert captured["stream"] is False
    assert captured["think"] is False
    assert captured["options"] == {"temperature": 0}
    assert captured["format"] == NoteAnalysisContent.model_json_schema()


@pytest.mark.parametrize(
    ("content", "expected_error"),
    [
        ("not JSON", NoteAnalysisMalformedResponseError),
        (json.dumps({"summary": "Incomplete"}), NoteAnalysisSchemaError),
    ],
)
def test_ollama_response_is_parsed_and_schema_validated(
    content: str,
    expected_error: type[Exception],
) -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"message": {"content": content}})
    )
    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        _env_file=None,
    )
    provider = OllamaNoteAnalysisProvider(settings, transport=transport)
    with pytest.raises(expected_error):
        provider.analyse([NoteSource("Career", "Completed a task.")])
