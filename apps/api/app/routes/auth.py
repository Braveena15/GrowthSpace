from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.models import User
from app.schemas.auth import LoginRequest, SetupRequest, TokenResponse, UserResponse
from app.security import (
    create_access_token,
    decode_access_token,
    get_dummy_password_hash,
    hash_password,
    verify_password,
)


router = APIRouter(prefix="/api/auth", tags=["authentication"])
bearer_scheme = HTTPBearer(auto_error=False)

INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid username or password.",
    headers={"WWW-Authenticate": "Bearer"},
)
INVALID_TOKEN = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or missing authentication token.",
    headers={"WWW-Authenticate": "Bearer"},
)


def lock_users_table_for_setup(session: Session) -> None:
    """Serialize first-account creation on PostgreSQL."""
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))


@router.post("/setup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def setup(credentials: SetupRequest, session: Annotated[Session, Depends(get_session)]) -> User:
    lock_users_table_for_setup(session)
    if session.scalar(select(User.id).limit(1)) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists.",
        )

    user = User(
        username=credentials.username,
        password_hash=hash_password(credentials.password.get_secret_value()),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists.",
        ) from None
    session.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(
    credentials: LoginRequest,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    user = session.scalar(select(User).where(User.username == credentials.username))
    password = credentials.password.get_secret_value()
    password_hash = user.password_hash if user is not None else get_dummy_password_hash()

    if not verify_password(password, password_hash) or user is None or not user.is_active:
        raise INVALID_CREDENTIALS

    token = create_access_token(
        user.id,
        settings.jwt_secret.get_secret_value(),
        settings.access_token_expire_minutes,
    )
    return TokenResponse(access_token=token)


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise INVALID_TOKEN

    try:
        user_id = decode_access_token(
            credentials.credentials,
            settings.jwt_secret.get_secret_value(),
        )
    except jwt.InvalidTokenError:
        raise INVALID_TOKEN from None

    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise INVALID_TOKEN
    return user


@router.get("/me", response_model=UserResponse)
def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
