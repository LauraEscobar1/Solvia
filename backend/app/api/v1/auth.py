from fastapi import APIRouter, status

from app.api.deps import AuthServiceDep, ClientIPDep, CurrentUserDep
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    ProfileUpdate,
    RefreshRequest,
    TokenResponse,
)
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", summary="Inicia sesión con email y contraseña")
async def login(
    body: LoginRequest, service: AuthServiceDep, client_ip: ClientIPDep
) -> TokenResponse:
    return await service.login(body.email, body.password, client_ip)


@router.post("/refresh", summary="Rota el refresh token y emite un nuevo access token")
async def refresh(body: RefreshRequest, service: AuthServiceDep) -> TokenResponse:
    return await service.refresh(body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoca el refresh token")
async def logout(body: LogoutRequest, service: AuthServiceDep) -> None:
    await service.logout(body.refresh_token)


@router.get("/me", summary="Perfil del usuario autenticado")
async def read_me(user: CurrentUserDep) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", summary="Actualiza idioma, tema o contraseña del usuario autenticado")
async def update_me(body: ProfileUpdate, user: CurrentUserDep, service: AuthServiceDep) -> UserRead:
    return await service.update_profile(user, body)
