import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    ColumnElement,
    Select,
    Uuid,
    and_,
    any_,
    bindparam,
    exists,
    func,
    literal,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import ARRAY, insert

from app.models.alert import Alert, AlertReceipt
from app.models.area import Area
from app.models.enums import CLOSED_STATUSES, AlertType, RequestStatus
from app.models.request import ServiceRequest
from app.repositories.base import BaseRepository, contains_text
from app.repositories.request import RequestScope, scope_condition
from app.schemas.alert import AlertFilters, AlertState

EVALUATION_LOCK_KEY = 5_100_216_301


@dataclass(frozen=True, slots=True)
class AlertView:
    alert: Alert
    area_name: str
    request_code: str | None
    request_title: str | None
    request_status: RequestStatus | None
    is_read: bool


@dataclass(frozen=True, slots=True)
class AlertAudience:
    scope: RequestScope
    user_id: uuid.UUID

    def visible(self) -> list[ColumnElement[bool]]:
        own_requests = scope_condition(self.scope)
        if own_requests is None:
            return []
        visible = [and_(Alert.request_id.is_not(None), own_requests)]
        if self.scope.area_id is not None:
            visible.append(and_(Alert.request_id.is_(None), Alert.area_id == self.scope.area_id))
        return [or_(*visible)]

    def has_read(self) -> ColumnElement[bool]:
        return exists().where(
            AlertReceipt.alert_id == Alert.id, AlertReceipt.user_id == self.user_id
        )


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

    async def search(
        self, audience: AlertAudience, filters: AlertFilters, *, page: int, size: int
    ) -> tuple[list[AlertView], int]:
        conditions = [*audience.visible(), *self._filters(audience, filters)]
        total = await self._session.scalar(self._joined(select(func.count())).where(*conditions))
        rows = await self._session.execute(
            self._view(audience)
            .where(*conditions)
            .order_by(Alert.created_at.desc(), Alert.id.desc())
            .limit(size)
            .offset((page - 1) * size)
        )
        return [AlertView(*row) for row in rows], total or 0

    async def get_view(self, audience: AlertAudience, alert_id: uuid.UUID) -> AlertView | None:
        row = (
            await self._session.execute(
                self._view(audience).where(*audience.visible(), Alert.id == alert_id)
            )
        ).first()
        return None if row is None else AlertView(*row)

    async def unread_count(self, audience: AlertAudience) -> int:
        total = await self._session.scalar(
            self._joined(select(func.count())).where(
                *audience.visible(), Alert.resolved_at.is_(None), ~audience.has_read()
            )
        )
        return total or 0

    async def mark_read(self, alert_id: uuid.UUID, user_id: uuid.UUID, now: datetime) -> None:
        await self._session.execute(
            insert(AlertReceipt)
            .values(alert_id=alert_id, user_id=user_id, read_at=now)
            .on_conflict_do_nothing()
        )

    async def mark_all_read(self, audience: AlertAudience, now: datetime) -> int:
        unread = self._joined(
            select(Alert.id, literal(audience.user_id, Uuid()), literal(now))
        ).where(*audience.visible(), ~audience.has_read())
        rows = await self._session.execute(
            insert(AlertReceipt)
            .from_select(["alert_id", "user_id", "read_at"], unread)
            .on_conflict_do_nothing()
            .returning(AlertReceipt.alert_id)
        )
        return len(rows.all())

    async def create_many(self, values: Sequence[dict[str, Any]]) -> int:
        if not values:
            return 0
        rows = await self._session.execute(
            insert(Alert).values(list(values)).on_conflict_do_nothing().returning(Alert.id)
        )
        return len(rows.all())

    @staticmethod
    def _joined[*Ts](statement: Select[*Ts]) -> Select[*Ts]:
        return statement.select_from(Alert).outerjoin(
            ServiceRequest, ServiceRequest.id == Alert.request_id
        )

    def _view(
        self, audience: AlertAudience
    ) -> Select[Alert, str, str | None, str | None, RequestStatus | None, bool]:
        return self._joined(
            select(
                Alert,
                Area.name,
                ServiceRequest.code,
                ServiceRequest.title,
                ServiceRequest.status,
                audience.has_read(),
            )
        ).join(Area, Area.id == Alert.area_id)

    @staticmethod
    def _filters(audience: AlertAudience, filters: AlertFilters) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if filters.type:
            conditions.append(Alert.type.in_(filters.type))
        if filters.severity:
            conditions.append(Alert.severity.in_(filters.severity))
        if filters.is_read is not None:
            read = audience.has_read()
            conditions.append(read if filters.is_read else ~read)
        if filters.state is AlertState.OPEN:
            conditions.append(Alert.resolved_at.is_(None))
        elif filters.state is AlertState.RESOLVED:
            conditions.append(Alert.resolved_at.is_not(None))
        if filters.area_id is not None:
            conditions.append(Alert.area_id == filters.area_id)
        if filters.q:
            conditions.append(contains_text([ServiceRequest.code, ServiceRequest.title], filters.q))
        return conditions
