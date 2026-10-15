from datetime import datetime, timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode, TooManyRequestsError, UnauthorizedError
from app.core.rate_limit import LoginRateLimiter
from app.core.security import (
    burn_password_check,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.core.time import Clock, utcnow
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository
from app.schemas.auth import ProfileUpdate, TokenResponse
from app.schemas.user import UserRead

logger = structlog.get_logger(__name__)


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        rate_limiter: LoginRateLimiter,
        clock: Clock = utcnow,
    ) -> None:
        self._session = session
        self._settings = settings
        self._rate_limiter = rate_limiter
        self._clock = clock
        self._users = UserRepository(session)
        self._tokens = RefreshTokenRepository(session)

    async def login(self, email: str, password: str, client_ip: str) -> TokenResponse:
        normalized_email = email.strip().lower()
        limiter_key = f"{normalized_email}|{client_ip}"
        retry_after = self._rate_limiter.retry_after(limiter_key)
        if retry_after is not None:
            raise TooManyRequestsError(ErrorCode.AUTH_TOO_MANY_ATTEMPTS, retry_after=retry_after)

        user = await self._users.get_by_email(normalized_email)
        if user is None:
            burn_password_check(password)
            valid, updated_hash = False, None
        else:
            valid, updated_hash = verify_password(password, user.password_hash)

        if user is None or not valid or not user.is_active:
            self._rate_limiter.record_failure(limiter_key)
            logger.info("login_failed")
            raise UnauthorizedError(ErrorCode.AUTH_INVALID_CREDENTIALS)

        self._rate_limiter.reset(limiter_key)
        if updated_hash is not None:
            user.password_hash = updated_hash
        now = self._clock()
        user.last_login_at = now
        response = await self._issue_tokens(user, now)
        await self._session.commit()
        logger.info("login_succeeded", user_id=str(user.id))
        return response

    async def refresh(self, raw_token: str) -> TokenResponse:
        now = self._clock()
        record = await self._tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if record is None:
            raise UnauthorizedError(ErrorCode.AUTH_INVALID_REFRESH_TOKEN)

        if record.revoked_at is not None:
            await self._tokens.revoke_all_for_user(record.user_id, now)
            await self._session.commit()
            logger.warning("refresh_token_reuse_detected", user_id=str(record.user_id))
            raise UnauthorizedError(ErrorCode.AUTH_REFRESH_TOKEN_REUSED)

        if record.expires_at <= now:
            raise UnauthorizedError(ErrorCode.AUTH_INVALID_REFRESH_TOKEN)

        record.revoked_at = now
        user = await self._users.get(record.user_id)
        if user is None or not user.is_active:
            await self._session.commit()
            raise UnauthorizedError(ErrorCode.AUTH_INVALID_REFRESH_TOKEN)

        response = await self._issue_tokens(user, now)
        await self._session.commit()
        return response

    async def logout(self, raw_token: str) -> None:
        record = await self._tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if record is not None and record.revoked_at is None:
            record.revoked_at = self._clock()
            await self._session.commit()

    async def update_profile(self, user: User, data: ProfileUpdate) -> UserRead:
        if data.language is not None:
            user.language = data.language
        if data.theme is not None:
            user.theme = data.theme
        if data.new_password is not None:
            valid, _ = verify_password(data.current_password or "", user.password_hash)
            if not valid:
                raise AppError(ErrorCode.AUTH_INVALID_CURRENT_PASSWORD)
            user.password_hash = hash_password(data.new_password)
            user.must_change_password = False
            await self._tokens.revoke_all_for_user(user.id, self._clock())
        await self._session.flush()
        await self._session.commit()
        return UserRead.model_validate(user)

    async def _issue_tokens(self, user: User, now: datetime) -> TokenResponse:
        access_token, expires_in = create_access_token(
            self._settings, user_id=user.id, role=user.role, area_id=user.area_id, now=now
        )
        raw_refresh_token = generate_refresh_token()
        refresh_expires_at = now + timedelta(days=self._settings.refresh_token_days)
        await self._tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(raw_refresh_token),
                expires_at=refresh_expires_at,
            )
        )
        return TokenResponse(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=raw_refresh_token,
            refresh_expires_at=refresh_expires_at,
            user=UserRead.model_validate(user),
        )
