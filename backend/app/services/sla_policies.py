from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, UnprocessableError
from app.models.enums import SLA_STAGES, RequestPriority, RequestStatus
from app.models.sla_policy import SlaPolicy
from app.repositories.sla_policy import SlaPolicyRepository
from app.schemas.sla import SlaPolicyItem, SlaPolicyRead

SLA_MATRIX_KEYS: frozenset[tuple[RequestPriority, RequestStatus]] = frozenset(
    (priority, stage) for priority in RequestPriority for stage in SLA_STAGES
)


class SlaPolicyService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._policies = SlaPolicyRepository(session)

    async def get_matrix(self) -> list[SlaPolicyRead]:
        return [SlaPolicyRead.model_validate(p) for p in await self._policies.list_ordered()]

    async def replace_matrix(self, items: list[SlaPolicyItem]) -> list[SlaPolicyRead]:
        keys = [(item.priority, item.status) for item in items]
        if len(keys) != len(set(keys)) or set(keys) != SLA_MATRIX_KEYS:
            raise UnprocessableError(ErrorCode.SLA_INCOMPLETE_MATRIX)

        existing = {(p.priority, p.status): p for p in await self._policies.list_ordered()}
        for item in items:
            policy = existing.get((item.priority, item.status))
            if policy is None:
                self._session.add(
                    SlaPolicy(
                        priority=item.priority,
                        status=item.status,
                        max_hours=item.max_hours,
                        inactivity_hours=item.inactivity_hours,
                    )
                )
            else:
                policy.max_hours = item.max_hours
                policy.inactivity_hours = item.inactivity_hours
        await self._session.flush()
        await self._session.commit()
        return await self.get_matrix()
