import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import BigInteger, Uuid, any_, bindparam, exists, func, literal, or_, select
from sqlalchemy.dialects.postgresql import ARRAY, insert

from app.models.alert import Alert
from app.models.enums import CLOSED_STATUSES, AlertType
from app.models.request import ServiceRequest
from app.repositories.base import BaseRepository

EVALUATION_LOCK_KEY = 5_100_216_301


class AlertRepository(BaseRepository[Alert]):
    model = Alert

    async def try_evaluation_lock(self) -> bool:
        locked = await self._session.scalar(
            select(func.pg_try_advisory_xact_lock(literal(EVALUATION_LOCK_KEY, BigInteger)))
        )
        return bool(locked)

    async def open_for_requests(self, request_ids: Sequence[uuid.UUID]) -> list[Alert]:
        evaluated = bindparam("evaluated", list(request_ids), type_=ARRAY(Uuid()))
        closed_request = exists().where(
            ServiceRequest.id == Alert.request_id,
            ServiceRequest.status.in_(CLOSED_STATUSES),
        )
        rows = await self._session.scalars(
            select(Alert)
            .where(
                Alert.resolved_at.is_(None),
                Alert.request_id.is_not(None),
                or_(Alert.request_id == any_(evaluated), closed_request),
            )
            .with_for_update(of=Alert)
        )
        return list(rows)

    async def open_for_request(self, request_id: uuid.UUID) -> list[Alert]:
        rows = await self._session.scalars(
            select(Alert)
            .where(Alert.resolved_at.is_(None), Alert.request_id == request_id)
            .with_for_update(of=Alert)
        )
        return list(rows)

    async def open_bottlenecks(self) -> list[Alert]:
        rows = await self._session.scalars(
            select(Alert)
            .where(Alert.resolved_at.is_(None), Alert.type == AlertType.BOTTLENECK)
            .with_for_update(of=Alert)
        )
        return list(rows)

    async def create_many(self, values: Sequence[dict[str, Any]]) -> int:
        if not values:
            return 0
        rows = await self._session.execute(
            insert(Alert).values(list(values)).on_conflict_do_nothing().returning(Alert.id)
        )
        return len(rows.all())
