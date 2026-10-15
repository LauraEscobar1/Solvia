import hashlib
import secrets
import uuid
from datetime import datetime
from functools import lru_cache
from typing import Literal

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.core.errors import UnauthorizedError
from app.models.enums import UserRole

_password_hasher = PasswordHash((Argon2Hasher(),))


class AccessTokenClaims(BaseModel):
    sub: uuid.UUID
    role: UserRole
    area_id: uuid.UUID | None = None
    type: Literal["access"]
    iat: int
    exp: int


def jwt_signing_key(settings: Settings) -> str:
    return settings.jwt_secret.get_secret_value()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    return _password_hasher.verify_and_update(password, password_hash)


@lru_cache(maxsize=1)
def _timing_equalizer_hash() -> str:
    return _password_hasher.hash(secrets.token_urlsafe(16))


def burn_password_check(password: str) -> None:
    _password_hasher.verify(password, _timing_equalizer_hash())


def create_access_token(
    settings: Settings,
    *,
    user_id: uuid.UUID,
    role: UserRole,
    area_id: uuid.UUID | None,
    now: datetime,
) -> tuple[str, int]:
    expires_in = settings.jwt_access_token_minutes * 60
    issued_at = int(now.timestamp())
    payload = {
        "sub": str(user_id),
        "role": role.value,
        "area_id": str(area_id) if area_id else None,
        "type": "access",
        "iat": issued_at,
        "exp": issued_at + expires_in,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, jwt_signing_key(settings), algorithm=settings.jwt_algorithm)
    return token, expires_in


def decode_access_token(settings: Settings, token: str) -> AccessTokenClaims:
    try:
        payload = jwt.decode(
            token,
            jwt_signing_key(settings),
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
        return AccessTokenClaims.model_validate(payload)
    except (jwt.PyJWTError, ValidationError) as exc:
        raise UnauthorizedError from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
