import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.dialects.postgresql import insert

from app.models.ai_insight import AIFeedback, AIInsight
from app.models.enums import InsightScope, InsightSource, InsightTrigger, UILanguage
from app.repositories.base import BaseRepository


def _target(scope: InsightScope, ref_id: uuid.UUID | None) -> list[ColumnElement[bool]]:
    reference = AIInsight.ref_id.is_(None) if ref_id is None else AIInsight.ref_id == ref_id
    return [AIInsight.scope == scope, reference]


class AIInsightRepository(BaseRepository[AIInsight]):
    model = AIInsight

    async def cached(
        self, input_hash: str, language: UILanguage, since: datetime
    ) -> AIInsight | None:
        return await self._session.scalar(
            select(AIInsight)
            .where(
                AIInsight.input_hash == input_hash,
                AIInsight.language == language,
                AIInsight.source == InsightSource.AI,
                AIInsight.created_at >= since,
            )
            .order_by(AIInsight.created_at.desc(), AIInsight.id.desc())
            .limit(1)
        )

    async def latest(
        self,
        scope: InsightScope,
        ref_id: uuid.UUID | None,
        *,
        language: UILanguage | None = None,
        trigger: InsightTrigger | None = None,
    ) -> AIInsight | None:
        statement = select(AIInsight).where(*_target(scope, ref_id))
        if language is not None:
            statement = statement.where(AIInsight.language == language)
        if trigger is not None:
            statement = statement.where(AIInsight.trigger == trigger)
        return await self._session.scalar(
            statement.order_by(AIInsight.created_at.desc(), AIInsight.id.desc()).limit(1)
        )

    async def tokens_since(self, since: datetime) -> int:
        total = await self._session.scalar(
            select(func.coalesce(func.sum(AIInsight.tokens_used), 0)).where(
                AIInsight.created_at >= since
            )
        )
        return int(total or 0)

    async def manual_count(self, user_id: uuid.UUID, since: datetime) -> int:
        total = await self._session.scalar(
            select(func.count()).where(
                AIInsight.requested_by == user_id,
                AIInsight.trigger == InsightTrigger.MANUAL,
                AIInsight.created_at >= since,
            )
        )
        return total or 0

    async def oldest_manual(self, user_id: uuid.UUID, since: datetime) -> datetime | None:
        return await self._session.scalar(
            select(func.min(AIInsight.created_at)).where(
                AIInsight.requested_by == user_id,
                AIInsight.trigger == InsightTrigger.MANUAL,
                AIInsight.created_at >= since,
            )
        )

    async def analyzed_requests(
        self, request_ids: Sequence[uuid.UUID], since: datetime
    ) -> set[uuid.UUID]:
        if not request_ids:
            return set()
        rows = await self._session.scalars(
            select(AIInsight.ref_id)
            .where(
                AIInsight.scope == InsightScope.REQUEST,
                AIInsight.ref_id.in_(request_ids),
                AIInsight.created_at >= since,
            )
            .distinct()
        )
        return {ref_id for ref_id in rows if ref_id is not None}

    async def save_feedback(
        self,
        insight_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        item: int,
        useful: bool,
        now: datetime,
    ) -> None:
        statement = insert(AIFeedback).values(
            insight_id=insight_id,
            user_id=user_id,
            item=item,
            useful=useful,
            created_at=now,
            updated_at=now,
        )
        await self._session.execute(
            statement.on_conflict_do_update(
                constraint="uq_ai_feedback_insight_user_item",
                set_={"useful": statement.excluded.useful, "updated_at": now},
            )
        )

    async def feedback_for(self, insight_id: uuid.UUID, user_id: uuid.UUID) -> dict[int, bool]:
        rows = await self._session.execute(
            select(AIFeedback.item, AIFeedback.useful).where(
                AIFeedback.insight_id == insight_id, AIFeedback.user_id == user_id
            )
        )
        return dict(rows.all())
