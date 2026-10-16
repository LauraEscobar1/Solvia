from collections.abc import Mapping
from enum import StrEnum

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import JsonValue
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.errors import ErrorBody, ErrorResponse

logger = structlog.get_logger(__name__)


class ErrorCode(StrEnum):
    INTERNAL_ERROR = "common.internal_error"
    VALIDATION_ERROR = "common.validation_error"
    NOT_FOUND = "common.not_found"
    METHOD_NOT_ALLOWED = "common.method_not_allowed"
    HTTP_ERROR = "common.http_error"
    UNAUTHORIZED = "auth.unauthorized"
    FORBIDDEN = "auth.forbidden"
    AUTH_INVALID_CREDENTIALS = "auth.invalid_credentials"
    AUTH_TOO_MANY_ATTEMPTS = "auth.too_many_attempts"
    AUTH_INVALID_REFRESH_TOKEN = "auth.invalid_refresh_token"
    AUTH_REFRESH_TOKEN_REUSED = "auth.refresh_token_reused"
    AUTH_INVALID_CURRENT_PASSWORD = "auth.invalid_current_password"
    AREA_NOT_FOUND = "area.not_found"
    AREA_NAME_TAKEN = "area.name_taken"
    AREA_INVALID_MANAGER = "area.invalid_manager"
    USER_NOT_FOUND = "user.not_found"
    USER_EMAIL_TAKEN = "user.email_taken"
    USER_INVALID_AREA = "user.invalid_area"
    USER_LAST_ADMIN = "user.last_admin"
    USER_CANNOT_DEACTIVATE_SELF = "user.cannot_deactivate_self"
    SLA_INCOMPLETE_MATRIX = "sla.incomplete_matrix"
    DATABASE_UNAVAILABLE = "database.unavailable"
    AI_PROVIDER_UNAVAILABLE = "ai.provider_unavailable"
    AI_INVALID_RESPONSE = "ai.invalid_response"
    REQUEST_NOT_FOUND = "request.not_found"
    REQUEST_INVALID_TRANSITION = "request.invalid_transition"
    REQUEST_VERSION_CONFLICT = "request.version_conflict"
    REQUEST_CLOSED = "request.closed"
    REQUEST_COMMENT_REQUIRED = "request.comment_required"
    REQUEST_ASSIGNEE_REQUIRED = "request.assignee_required"
    REQUEST_INVALID_ASSIGNEE = "request.invalid_assignee"
    REQUEST_INVALID_AREA = "request.invalid_area"
    ALERT_NOT_FOUND = "alert.not_found"


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        params: Mapping[str, JsonValue] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(code.value)
        self.code = code
        self.status_code = status_code
        self.params: dict[str, JsonValue] = dict(params or {})
        self.headers: dict[str, str] = dict(headers or {})


class NotFoundError(AppError):
    def __init__(
        self,
        code: ErrorCode = ErrorCode.NOT_FOUND,
        *,
        params: Mapping[str, JsonValue] | None = None,
    ) -> None:
        super().__init__(code, status_code=status.HTTP_404_NOT_FOUND, params=params)


class UnauthorizedError(AppError):
    def __init__(self, code: ErrorCode = ErrorCode.UNAUTHORIZED) -> None:
        super().__init__(
            code,
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppError):
    def __init__(self, code: ErrorCode = ErrorCode.FORBIDDEN) -> None:
        super().__init__(code, status_code=status.HTTP_403_FORBIDDEN)


class ConflictError(AppError):
    def __init__(self, code: ErrorCode, *, params: Mapping[str, JsonValue] | None = None) -> None:
        super().__init__(code, status_code=status.HTTP_409_CONFLICT, params=params)


class UnprocessableError(AppError):
    def __init__(self, code: ErrorCode, *, params: Mapping[str, JsonValue] | None = None) -> None:
        super().__init__(code, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, params=params)


class TooManyRequestsError(AppError):
    def __init__(self, code: ErrorCode, *, retry_after: int) -> None:
        super().__init__(
            code,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            params={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


_HTTP_STATUS_CODES: dict[int, ErrorCode] = {
    status.HTTP_401_UNAUTHORIZED: ErrorCode.UNAUTHORIZED,
    status.HTTP_403_FORBIDDEN: ErrorCode.FORBIDDEN,
    status.HTTP_404_NOT_FOUND: ErrorCode.NOT_FOUND,
    status.HTTP_405_METHOD_NOT_ALLOWED: ErrorCode.METHOD_NOT_ALLOWED,
}


def error_response(
    code: ErrorCode,
    status_code: int,
    params: Mapping[str, JsonValue] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, params=dict(params or {})))
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(mode="json"),
        headers=dict(headers) if headers else None,
    )


async def _handle_app_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AppError):
        raise exc
    return error_response(exc.code, exc.status_code, exc.params, exc.headers)


async def _handle_http_exception(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    code = _HTTP_STATUS_CODES.get(exc.status_code, ErrorCode.HTTP_ERROR)
    params: dict[str, JsonValue] = (
        {"status": exc.status_code} if code is ErrorCode.HTTP_ERROR else {}
    )
    return error_response(code, exc.status_code, params, headers=exc.headers)


async def _handle_validation_error(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise exc
    fields: list[JsonValue] = [
        {"loc": ".".join(str(part) for part in error["loc"]), "type": error["type"]}
        for error in exc.errors()
    ]
    return error_response(
        ErrorCode.VALIDATION_ERROR,
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        {"fields": fields},
    )


async def _handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled_error", error_type=type(exc).__name__)
    return error_response(ErrorCode.INTERNAL_ERROR, status.HTTP_500_INTERNAL_SERVER_ERROR)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected_error)
