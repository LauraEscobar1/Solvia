import uuid
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, NotFoundError
from app.core.time import Clock, utcnow
from app.models.enums import CLOSED_STATUSES, RequestPriority, RequestStatus
from app.models.request import ServiceRequest
from app.models.user import User
from app.repositories.request import RequestRepository, RequestWithSla
from app.repositories.request_event import RequestEventRepository
from app.repositories.sla_policy import SlaPolicyRepository
from app.repositories.sla_rules import SlaRules
from app.schemas.area import UserRef
from app.schemas.common import Page
from app.schemas.request import (
    AllowedTransitionRead,
    AssignInput,
    BoardCard,
    BoardColumn,
    CommentInput,
    DueEstimate,
    EventListQuery,
    RequestBoard,
    RequestCreate,
    RequestDetail,
    RequestEventRead,
    RequestFilters,
    RequestListQuery,
    RequestPermissions,
    RequestSummary,
    RequestUpdate,
    TransitionInput,
)
from app.schemas.user import AreaRef
from app.services.request_policy import Capability, RequestPolicy
from app.services.request_workflow import RequestWorkflow, allowed_transitions
from app.services.sla import SlaCatalog

BOARD_COLUMN_LIMIT = 50
DEFAULT_BOARD_STATUSES = (
    RequestStatus.RECEIVED,
    RequestStatus.ASSIGNED,
    RequestStatus.IN_PROGRESS,
    RequestStatus.COMPLETED,
)


def _summary_fields(row: RequestWithSla) -> dict[str, object]:
    request = row.request
    return {
        "id": request.id,
        "code": request.code,
        "title": request.title,
        "area": AreaRef.model_validate(request.area),
        "requester": UserRef.model_validate(request.requester),
        "assignee": UserRef.model_validate(request.assignee) if request.assignee else None,
        "priority": request.priority,
        "status": request.status,
        "received_at": request.received_at,
        "due_at": request.due_at,
        "last_activity_at": request.last_activity_at,
        "completed_at": request.completed_at,
        "version": request.version,
        "sla_status": row.sla_status,
        "is_stalled": row.is_stalled,
    }


class RequestService:
    def __init__(self, session: AsyncSession, timezone: ZoneInfo, clock: Clock = utcnow) -> None:
        self._clock = clock
        self._timezone = timezone
        self._requests = RequestRepository(session)
        self._events = RequestEventRepository(session)
        self._sla = SlaPolicyRepository(session)
        self._workflow = RequestWorkflow(session, clock)

    async def search(self, actor: User, query: RequestListQuery) -> Page[RequestSummary]:
        rows, total = await self._requests.search(
            RequestPolicy(actor).scope(),
            query,
            sort=query.sort,
            page=query.page,
            size=query.size,
            rules=SlaRules(self._clock()),
            timezone=self._timezone,
        )
        return Page[RequestSummary](
            items=[RequestSummary.model_validate(_summary_fields(row)) for row in rows],
            total=total,
            page=query.page,
            size=query.size,
        )

    async def board(self, actor: User, filters: RequestFilters) -> RequestBoard:
        policy = RequestPolicy(actor)
        scope = policy.scope()
        rules = SlaRules(self._clock())
        statuses = filters.status or list(DEFAULT_BOARD_STATUSES)
        column_filters = filters.model_copy(update={"status": []})
        totals = await self._requests.count_by_status(scope, column_filters, rules, self._timezone)
        columns = []
        for status in statuses:
            rows = await self._requests.board_column(
                scope,
                column_filters,
                status,
                limit=BOARD_COLUMN_LIMIT,
                rules=rules,
                timezone=self._timezone,
            )
            columns.append(
                BoardColumn(
                    status=status,
                    total=totals.get(status, 0),
                    items=[self._card(policy, row) for row in rows],
                )
            )
        return RequestBoard(columns=columns)

    async def get(self, actor: User, request_id: uuid.UUID) -> RequestDetail:
        row = await self._requests.get_with_relations(request_id, SlaRules(self._clock()))
        policy = RequestPolicy(actor)
        if row is None or not policy.can(Capability.VIEW, row.request):
            raise NotFoundError(ErrorCode.REQUEST_NOT_FOUND)
        request = row.request
        transitions = self._transitions(policy, request)
        permissions = RequestPermissions(
            editable_fields=sorted(policy.editable_fields(request)),
            can_assign=request.status not in CLOSED_STATUSES
            and policy.can(Capability.ASSIGN, request),
            can_comment=policy.can(Capability.COMMENT, request),
        )
        return RequestDetail.model_validate(
            {
                **_summary_fields(row),
                "description": request.description,
                "created_at": request.created_at,
                "updated_at": request.updated_at,
                "allowed_transitions": transitions,
                "permissions": permissions,
            }
        )

    async def create(self, actor: User, data: RequestCreate) -> RequestDetail:
        request = await self._workflow.create(actor, data)
        return await self.get(actor, request.id)

    async def update(
        self, actor: User, request_id: uuid.UUID, data: RequestUpdate
    ) -> RequestDetail:
        await self._workflow.update(actor, request_id, data)
        return await self.get(actor, request_id)

    async def transition(
        self, actor: User, request_id: uuid.UUID, data: TransitionInput
    ) -> RequestDetail:
        await self._workflow.transition(
            actor,
            request_id,
            to=data.to,
            version=data.version,
            comment=data.comment,
            assignee_id=data.assignee_id,
        )
        return await self.get(actor, request_id)

    async def assign(self, actor: User, request_id: uuid.UUID, data: AssignInput) -> RequestDetail:
        await self._workflow.assign(
            actor,
            request_id,
            assignee_id=data.assignee_id,
            version=data.version,
            comment=data.comment,
        )
        return await self.get(actor, request_id)

    async def comment(
        self, actor: User, request_id: uuid.UUID, data: CommentInput
    ) -> RequestEventRead:
        event = await self._workflow.comment(actor, request_id, data.comment)
        return RequestEventRead(
            id=event.id,
            type=event.type,
            from_status=None,
            to_status=None,
            actor=UserRef.model_validate(actor),
            comment=event.comment,
            details=event.details,
            created_at=event.created_at,
        )

    async def events(
        self, actor: User, request_id: uuid.UUID, query: EventListQuery
    ) -> Page[RequestEventRead]:
        request = await self._requests.get(request_id)
        if request is None or not RequestPolicy(actor).can(Capability.VIEW, request):
            raise NotFoundError(ErrorCode.REQUEST_NOT_FOUND)
        events, total = await self._events.list_for_request(
            request_id, page=query.page, size=query.size
        )
        return Page[RequestEventRead](
            items=[RequestEventRead.model_validate(event) for event in events],
            total=total,
            page=query.page,
            size=query.size,
        )

    async def due_estimates(self) -> list[DueEstimate]:
        catalog = await self._catalog()
        return [
            DueEstimate(priority=priority, hours=catalog.total_hours(priority))
            for priority in reversed(RequestPriority)
        ]

    async def _catalog(self) -> SlaCatalog:
        return SlaCatalog(await self._sla.list_ordered())

    def _card(self, policy: RequestPolicy, row: RequestWithSla) -> BoardCard:
        return BoardCard.model_validate(
            {
                **_summary_fields(row),
                "allowed_transitions": self._transitions(policy, row.request),
            }
        )

    @staticmethod
    def _transitions(policy: RequestPolicy, request: ServiceRequest) -> list[AllowedTransitionRead]:
        return [
            AllowedTransitionRead(
                to=transition.to,
                requires_comment=transition.requires_comment,
                requires_assignee=transition.requires_assignee,
            )
            for transition in allowed_transitions(policy, request)
        ]
