from datetime import timedelta

import httpx2
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token
from app.core.time import utcnow
from app.models import RefreshToken, User
from app.models.enums import UserRole
from tests.db.conftest import PASSWORD, Factory, bearer, login

LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/auth/me"


async def test_login_returns_tokens_and_profile(
    db_client: httpx2.AsyncClient, factory: Factory, session: AsyncSession
) -> None:
    area = await factory.area("Soporte")
    user = await factory.user(UserRole.SUPERVISOR, area=area)

    response = await db_client.post(LOGIN_URL, json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 30 * 60
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == user.email
    assert body["user"]["area"] == {"id": str(area.id), "name": "Soporte"}
    await session.refresh(user)
    assert user.last_login_at is not None


async def test_login_normalizes_email(db_client: httpx2.AsyncClient, factory: Factory) -> None:
    user = await factory.user(email="ana@example.com")

    response = await db_client.post(
        LOGIN_URL, json={"email": "  ANA@Example.com ", "password": PASSWORD}
    )

    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(user.id)


async def test_login_failures_do_not_reveal_whether_email_exists(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    active = await factory.user(email="activa@example.com")
    inactive = await factory.user(email="inactiva@example.com", is_active=False)

    responses = [
        await db_client.post(LOGIN_URL, json={"email": active.email, "password": "incorrecta"}),
        await db_client.post(LOGIN_URL, json={"email": "nadie@example.com", "password": "x"}),
        await db_client.post(LOGIN_URL, json={"email": inactive.email, "password": PASSWORD}),
    ]

    for response in responses:
        assert response.status_code == 401
        assert response.json() == {"error": {"code": "auth.invalid_credentials", "params": {}}}


async def test_login_is_rate_limited_per_email_and_ip(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    user = await factory.user()
    other = await factory.user()

    for _ in range(5):
        failed = await db_client.post(LOGIN_URL, json={"email": user.email, "password": "mala"})
        assert failed.status_code == 401
    blocked = await db_client.post(LOGIN_URL, json={"email": user.email, "password": PASSWORD})
    other_email = await db_client.post(LOGIN_URL, json={"email": other.email, "password": PASSWORD})

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "auth.too_many_attempts"
    assert blocked.json()["error"]["params"]["retry_after"] > 0
    assert int(blocked.headers["retry-after"]) > 0
    assert other_email.status_code == 200


async def test_successful_login_resets_failed_attempts(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    user = await factory.user()
    for _ in range(4):
        await db_client.post(LOGIN_URL, json={"email": user.email, "password": "mala"})
    await login(db_client, user.email)

    for _ in range(4):
        await db_client.post(LOGIN_URL, json={"email": user.email, "password": "mala"})
    response = await db_client.post(LOGIN_URL, json={"email": user.email, "password": PASSWORD})

    assert response.status_code == 200


async def test_refresh_rotates_the_token(db_client: httpx2.AsyncClient, factory: Factory) -> None:
    user = await factory.user()
    tokens = await login(db_client, user.email)

    rotated = await db_client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})

    assert rotated.status_code == 200
    new_tokens = rotated.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]
    me = await db_client.get(ME_URL, headers=bearer(new_tokens))
    assert me.status_code == 200


async def test_reusing_a_rotated_token_revokes_every_session(
    db_client: httpx2.AsyncClient, factory: Factory, session: AsyncSession
) -> None:
    user = await factory.user()
    first = await login(db_client, user.email)
    second = await login(db_client, user.email)
    rotated = (
        await db_client.post(REFRESH_URL, json={"refresh_token": first["refresh_token"]})
    ).json()

    reuse = await db_client.post(REFRESH_URL, json={"refresh_token": first["refresh_token"]})

    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "auth.refresh_token_reused"
    for token in (rotated["refresh_token"], second["refresh_token"]):
        response = await db_client.post(REFRESH_URL, json={"refresh_token": token})
        assert response.status_code == 401
    active_tokens = await session.scalar(
        select(func.count())
        .select_from(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    )
    assert active_tokens == 0


async def test_unknown_or_expired_refresh_token_is_rejected(
    db_client: httpx2.AsyncClient, factory: Factory, session: AsyncSession
) -> None:
    user = await factory.user()
    tokens = await login(db_client, user.email)
    await session.execute(update(RefreshToken).values(expires_at=utcnow() - timedelta(minutes=1)))
    await session.commit()

    expired = await db_client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    unknown = await db_client.post(REFRESH_URL, json={"refresh_token": "x" * 40})

    for response in (expired, unknown):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "auth.invalid_refresh_token"


async def test_logout_revokes_the_refresh_token(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    user = await factory.user()
    tokens = await login(db_client, user.email)

    logout = await db_client.post(LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]})
    refresh = await db_client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})

    assert logout.status_code == 204
    assert logout.content == b""
    assert refresh.status_code == 401


async def test_me_requires_a_valid_access_token(
    db_client: httpx2.AsyncClient, factory: Factory, db_settings: Settings
) -> None:
    user = await factory.user()
    expired_token, _ = create_access_token(
        db_settings,
        user_id=user.id,
        role=user.role,
        area_id=None,
        now=utcnow() - timedelta(hours=1),
    )

    missing = await db_client.get(ME_URL)
    garbage = await db_client.get(ME_URL, headers={"Authorization": "Bearer no-es-un-jwt"})
    expired = await db_client.get(ME_URL, headers={"Authorization": f"Bearer {expired_token}"})
    valid = await db_client.get(ME_URL, headers=factory.auth_headers(user))

    for response in (missing, garbage, expired):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "auth.unauthorized"
        assert response.headers["www-authenticate"] == "Bearer"
    assert valid.status_code == 200
    assert valid.json()["id"] == str(user.id)


async def test_deactivated_user_is_rejected_immediately(
    db_client: httpx2.AsyncClient, factory: Factory, session: AsyncSession
) -> None:
    user = await factory.user()
    headers = factory.auth_headers(user)
    await session.execute(update(User).where(User.id == user.id).values(is_active=False))
    await session.commit()

    response = await db_client.get(ME_URL, headers=headers)

    assert response.status_code == 401


async def test_update_profile_preferences(db_client: httpx2.AsyncClient, factory: Factory) -> None:
    user = await factory.user()

    response = await db_client.patch(
        ME_URL, headers=factory.auth_headers(user), json={"language": "en", "theme": "dark"}
    )

    assert response.status_code == 200
    assert response.json()["language"] == "en"
    assert response.json()["theme"] == "dark"


async def test_change_password_requires_current_and_revokes_sessions(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    user = await factory.user(must_change_password=True)
    tokens = await login(db_client, user.email)
    new_password = "otra-contrasena-segura"

    missing = await db_client.patch(
        ME_URL, headers=bearer(tokens), json={"new_password": new_password}
    )
    wrong = await db_client.patch(
        ME_URL,
        headers=bearer(tokens),
        json={"current_password": "incorrecta", "new_password": new_password},
    )
    too_short = await db_client.patch(
        ME_URL,
        headers=bearer(tokens),
        json={"current_password": PASSWORD, "new_password": "corta"},
    )
    changed = await db_client.patch(
        ME_URL,
        headers=bearer(tokens),
        json={"current_password": PASSWORD, "new_password": new_password},
    )

    assert missing.status_code == 422
    assert missing.json()["error"]["params"]["fields"][0]["type"] == "current_password_required"
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "auth.invalid_current_password"
    assert too_short.status_code == 422
    assert changed.status_code == 200
    assert changed.json()["must_change_password"] is False
    refresh = await db_client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    assert refresh.status_code == 401
    await login(db_client, user.email, new_password)
