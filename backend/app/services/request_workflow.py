import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from types import MappingProxyType
from typing import Any, Final

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    UnprocessableError,
)
from app.core.time import Clock, utcnow
from app.models.enums import CLOSED_STATUSES, RequestEventType, RequestStatus
from app.models.request import ServiceRequest
from app.models.request_event import RequestEvent
from app.models.user import User
from app.repositories.area import AreaRepository
from app.repositories.request import RequestRepository
from app.repositories.request_event import RequestEventRepository
from app.repositories.sla_policy import SlaPolicyRepository
from app.repositories.user import UserRepository
from app.schemas.request import RequestCreate, RequestUpdate
from app.services.request_policy import ASSIGNABLE_ROLES, Capability, RequestPolicy
from app.services.sla import SlaCatalog


@dataclass(frozen=True, slots=True)
class TransitionRule:
    capability: Capability
    requires_comment: bool = False
    requires_assignee: bool = False
    clears_assignee: bool = False
    sets_completed_at: bool = False
    clears_completed_at: bool = False


RECEIVED = RequestStatus.RECEIVED
ASSIGNED = RequestStatus.ASSIGNED
IN_PROGRESS = RequestStatus.IN_PROGRESS
COMPLETED = RequestStatus.COMPLETED
CANCELLED = RequestStatus.CANCELLED

_CANCEL = TransitionRule(Capability.SUPERVISE, requires_comment=True)

TRANSITIONS: Final[Mapping[tuple[RequestStatus, RequestStatus], TransitionRule]] = MappingProxyType(
    {
        (RECEIVED, ASSIGNED): TransitionRule(Capability.ASSIGN, requires_assignee=True),
        (ASSIGNED, RECEIVED): TransitionRule(
            Capability.WORK, requires_comment=True, clears_assignee=True
        ),
        (ASSIGNED, IN_PROGRESS): TransitionRule(Capability.WORK),
        (IN_PROGRESS, COMPLETED): TransitionRule(Capability.WORK, sets_completed_at=True),
        (IN_PROGRESS, ASSIGNED): TransitionRule(Capability.WORK, requires_comment=True),
        (RECEIVED, CANCELLED): _CANCEL,
        (ASSIGNED, CANCELLED): _CANCEL,
        (IN_PROGRESS, CANCELLED): _CANCEL,
        (COMPLETED, IN_PROGRESS): TransitionRule(
            Capability.SUPERVISE, requires_comment=True, clears_completed_at=True
        ),
    }
)


@dataclass(frozen=True, slots=True)
class AllowedTransition:
    to: RequestStatus
    requires_comment: bool
    requires_assignee: bool


def allowed_transitions(policy: RequestPolicy, request: ServiceRequest) -> list[AllowedTransition]:
    granted = policy.capabilities(request)
    return [
        AllowedTransition(target, rule.requires_comment, rule.requires_assignee)
        for (source, target), rule in TRANSITIONS.items()
        if source is request.status and rule.capability in granted
    ]


def _json(value: object) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _change(previous: object, current: object) -> dict[str, Any]:
    return {"from": _json(previous), "to": _json(current)}


def _clean(comment: str | None) -> str | None:
    if comment is None:
        return None
    stripped = comment.strip()
    return stripped or None


class RequestWorkflow:
    def __init__(self, session: AsyncSession, clock: Clock = utcnow) -> None:
        self._session = session
        self._clock = clock
        self._requests = RequestRepository(session)
        self._events = RequestEventRepository(session)
        self._users = UserRepository(session)
        self._areas = AreaRepository(session)
        self._sla = SlaPolicyRepository(session)

    async def create(self, actor: User, data: RequestCreate) -> ServiceRequest:
        area = await self._areas.get(data.area_id)
        if area is None or not area.is_active:
            raise UnprocessableError(ErrorCode.REQUEST_INVALID_AREA)
        now = self._clock()
        catalog = SlaCatalog(await self._sla.list_ordered())
        request = await self._requests.add(
            ServiceRequest(
                title=data.title,
                description=data.description,
                area_id=area.id,
                requester_id=actor.id,
                priority=data.priority,
                status=RECEIVED,
                received_at=now,
                last_activity_at=now,
                due_at=catalog.due_at(data.priority, now),
            )
        )
        await self._record(
            request,
            actor,
            RequestEventType.CREATED,
            to_status=RECEIVED,
            details={"priority": data.priority.value, "due_at": _json(request.due_at)},
            bump_version=False,
            now=now,
        )
        await self._session.commit()
        return request

    async def update(
        self, actor: User, request_id: uuid.UUID, data: RequestUpdate
    ) -> ServiceRequest:
        request, policy = await self._load(actor, request_id, data.version)
        self._ensure_open(request)
        requested = self._requested_fields(data)
        if not requested:
            return request
        if requested - policy.editable_fields(request):
            raise ForbiddenError

        changes: dict[str, Any] = {}
        if data.title is not None and data.title != request.title:
            changes["title"] = _change(request.title, data.title)
            request.title = data.title
        if data.description is not None and data.description != request.description:
            changes["description"] = _change(request.description, data.description)
            request.description = data.description
        if data.priority is not None and data.priority is not request.priority:
            changes["priority"] = _change(request.priority, data.priority)
            request.priority = data.priority
            if "due_at" not in requested:
                catalog = SlaCatalog(await self._sla.list_ordered())
                self._set_due_at(
                    request, catalog.due_at(data.priority, request.received_at), changes
                )
        if "due_at" in requested:
            self._set_due_at(request, data.due_at, changes)

        if changes:
            await self._record(
                request, actor, RequestEventType.UPDATED, details={"changes": changes}
            )
            await self._session.commit()
        return request

    async def transition(
        self,
        actor: User,
        request_id: uuid.UUID,
        *,
        to: RequestStatus,
        version: int,
        comment: str | None = None,
        assignee_id: uuid.UUID | None = None,
    ) -> ServiceRequest:
        request, policy = await self._load(actor, request_id, version)
        await self._apply_transition(policy, request, to, _clean(comment), assignee_id)
        await self._session.commit()
        return request

    async def assign(
        self,
        actor: User,
        request_id: uuid.UUID,
        *,
        assignee_id: uuid.UUID,
        version: int,
        comment: str | None = None,
    ) -> ServiceRequest:
        request, policy = await self._load(actor, request_id, version)
        if request.status is RECEIVED:
            await self._apply_transition(policy, request, ASSIGNED, _clean(comment), assignee_id)
            await self._session.commit()
            return request

        self._ensure_open(request)
        if not policy.can(Capability.ASSIGN, request):
            raise ForbiddenError
        assignee, area_override = await self._validate_assignee(policy, request, assignee_id)
        if assignee.id == request.assignee_id:
            return request
        details = {
            "assignee_id": _json(assignee.id),
            "previous_assignee_id": _json(request.assignee_id),
            "area_override": area_override,
        }
        request.assignee_id = assignee.id
        await self._record(
            request,
            actor,
            RequestEventType.ASSIGNED,
            from_status=request.status,
            to_status=request.status,
            comment=_clean(comment),
            details=details,
        )
        await self._session.commit()
        return request

    async def comment(self, actor: User, request_id: uuid.UUID, text: str) -> RequestEvent:
        request, policy = await self._load(actor, request_id, None)
        if not policy.can(Capability.COMMENT, request):
            raise ForbiddenError
        event = await self._record(
            request, actor, RequestEventType.COMMENT, comment=text, bump_version=False
        )
        await self._session.commit()
        return event

    async def _apply_transition(
        self,
        policy: RequestPolicy,
        request: ServiceRequest,
        target: RequestStatus,
        comment: str | None,
        assignee_id: uuid.UUID | None,
    ) -> None:
        source = request.status
        rule = TRANSITIONS.get((source, target))
        if rule is None:
            raise ConflictError(
                ErrorCode.REQUEST_INVALID_TRANSITION,
                params={"from": source.value, "to": target.value},
            )
        if not policy.can(rule.capability, request):
            raise ForbiddenError
        if rule.requires_comment and comment is None:
            raise UnprocessableError(ErrorCode.REQUEST_COMMENT_REQUIRED)

        now = self._clock()
        details: dict[str, Any] = {}
        event_type = RequestEventType.STATUS_CHANGED
        if rule.requires_assignee:
            if assignee_id is None:
                raise UnprocessableError(ErrorCode.REQUEST_ASSIGNEE_REQUIRED)
            assignee, area_override = await self._validate_assignee(policy, request, assignee_id)
            details |= {
                "assignee_id": _json(assignee.id),
                "previous_assignee_id": _json(request.assignee_id),
                "area_override": area_override,
            }
            request.assignee_id = assignee.id
            event_type = RequestEventType.ASSIGNED
        if rule.clears_assignee:
            details |= {
                "returned_by": _json(policy.actor.id),
                "reason": comment,
                "previous_assignee_id": _json(request.assignee_id),
            }
            request.assignee_id = None
        if rule.sets_completed_at:
            request.completed_at = now
        if rule.clears_completed_at:
            details["previous_completed_at"] = _json(request.completed_at)
            request.completed_at = None
        request.status = target
        await self._record(
            request,
            policy.actor,
            event_type,
            from_status=source,
            to_status=target,
            comment=comment,
            details=details,
            now=now,
        )

    async def _load(
        self, actor: User, request_id: uuid.UUID, version: int | None
    ) -> tuple[ServiceRequest, RequestPolicy]:
        request = await self._requests.get_for_update(request_id)
        policy = RequestPolicy(actor)
        if request is None or not policy.can(Capability.VIEW, request):
            raise NotFoundError(ErrorCode.REQUEST_NOT_FOUND)
        if version is not None and version != request.version:
            raise ConflictError(
                ErrorCode.REQUEST_VERSION_CONFLICT, params={"current_version": request.version}
            )
        return request, policy

    async def _validate_assignee(
        self, policy: RequestPolicy, request: ServiceRequest, assignee_id: uuid.UUID
    ) -> tuple[User, bool]:
        assignee = await self._users.get(assignee_id)
        if assignee is None or not assignee.is_active or assignee.role not in ASSIGNABLE_ROLES:
            raise UnprocessableError(ErrorCode.REQUEST_INVALID_ASSIGNEE)
        area_override = assignee.area_id != request.area_id
        if area_override and not policy.is_admin:
            raise UnprocessableError(ErrorCode.REQUEST_INVALID_ASSIGNEE)
        return assignee, area_override

    async def _record(
        self,
        request: ServiceRequest,
        actor: User,
        event_type: RequestEventType,
        *,
        from_status: RequestStatus | None = None,
        to_status: RequestStatus | None = None,
        comment: str | None = None,
        details: dict[str, Any] | None = None,
        bump_version: bool = True,
        now: datetime | None = None,
    ) -> RequestEvent:
        moment = now or self._clock()
        request.last_activity_at = moment
        if bump_version:
            request.version += 1
        return await self._events.add(
            RequestEvent(
                request_id=request.id,
                type=event_type,
                from_status=from_status,
                to_status=to_status,
                actor_id=actor.id,
                comment=comment,
                details=details or {},
                created_at=moment,
            )
        )

    @staticmethod
    def _ensure_open(request: ServiceRequest) -> None:
        if request.status in CLOSED_STATUSES:
            raise ConflictError(ErrorCode.REQUEST_CLOSED)

    @staticmethod
    def _requested_fields(data: RequestUpdate) -> set[str]:
        fields = {
            name for name in ("title", "description", "priority") if getattr(data, name) is not None
        }
        if "due_at" in data.model_fields_set:
            fields.add("due_at")
        return fields

    @staticmethod
    def _set_due_at(
        request: ServiceRequest, due_at: datetime | None, changes: dict[str, Any]
    ) -> None:
        if due_at != request.due_at:
            changes["due_at"] = _change(request.due_at, due_at)
            request.due_at = due_at
