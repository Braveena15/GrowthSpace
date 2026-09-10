from collections.abc import Generator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    return create_engine(str(settings.database_url), pool_pre_ping=True)


def get_session(
    engine: Annotated[Engine, Depends(get_engine)],
) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
