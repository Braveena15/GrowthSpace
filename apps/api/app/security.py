from datetime import datetime, timedelta, timezone
from functools import lru_cache

import jwt
from pwdlib import PasswordHash


JWT_ALGORITHM = "HS256"
password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except Exception:
        return False


@lru_cache
def get_dummy_password_hash() -> str:
    """Provide work-equivalent verification when a username does not exist."""
    return hash_password("Dummy-password-which-is-never-used!1")


def create_access_token(user_id: int, secret: str, expires_minutes: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str, secret: str) -> int:
    payload = jwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject.isdigit():
        raise jwt.InvalidTokenError("Token subject is invalid.")
    return int(subject)
