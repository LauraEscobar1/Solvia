import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Area, RequestEvent, ServiceRequest, User
from app.models.enums import (
    SLA_STAGES,
    RequestEventType,
    RequestPriority,
    RequestStatus,
    UserRole,
)
from app.repositories.sla_policy import SlaPolicyRepository
from app.repositories.user import UserRepository
from app.services.sla import SlaCatalog

RANDOM_SEED = 20261015
SUPPORT, HR, FINANCE = "Soporte TI", "Recursos Humanos", "Finanzas"


@dataclass(frozen=True, slots=True)
class DemoPerson:
    full_name: str
    email: str
    role: UserRole
    area_name: str | None


EXTRA_DEMO_PEOPLE = (
    DemoPerson("Diego Responsable", "responsable3@example.com", UserRole.ASSIGNEE, FINANCE),
    DemoPerson("Carlos Solicitante", "solicitante1@example.com", UserRole.REQUESTER, None),
    DemoPerson("Marta Solicitante", "solicitante2@example.com", UserRole.REQUESTER, None),
)

AREA_ASSIGNEES = {
    SUPPORT: ("responsable1@example.com", "supervisor@example.com"),
    HR: ("responsable2@example.com",),
    FINANCE: ("responsable3@example.com",),
}
AREA_SUPERVISORS = {SUPPORT: "supervisor@example.com"}
REQUESTERS = ("solicitante1@example.com", "solicitante2@example.com")

TITLES = {
    SUPPORT: (
        "No funciona la impresora del segundo piso",
        "Acceso a la VPN desde casa",
        "El portátil arranca muy lento",
        "Restablecer la contraseña del correo",
        "Instalar software de diseño",
        "La pantalla parpadea",
        "Error al abrir el ERP",
        "Configurar teléfono IP",
        "Sin conexión wifi en la sala de juntas",
        "Solicitud de un segundo monitor",
    ),
    HR: (
        "Certificado laboral para el banco",
        "Solicitud de vacaciones de diciembre",
        "Actualizar datos bancarios",
        "Duda sobre la nómina de septiembre",
        "Alta de una nueva persona en el equipo",
        "Constancia de ingresos",
        "Cambio de horario por estudios",
        "Inscripción a la formación de liderazgo",
    ),
    FINANCE: (
        "Reembolso de gastos de viaje",
        "Factura duplicada de un proveedor",
        "Aprobación de una orden de compra",
        "Pago pendiente a un proveedor",
        "Anticipo para viaje a Bogotá",
        "Error en la conciliación bancaria",
        "Alta de un nuevo proveedor",
        "Cambio de centro de costos",
    ),
}
REQUESTER_COMMENTS = (
    "¿Hay alguna novedad?",
    "Envié más detalles por correo.",
    "Lo necesito para el cierre de mes.",
    "Gracias por la ayuda.",
)
ASSIGNEE_COMMENTS = (
    "Revisando el caso.",
    "Necesito más información del solicitante.",
    "Esperando respuesta del proveedor.",
    "Apliqué una solución temporal.",
)
RETURN_REASONS = ("No corresponde a mi área.", "Falta información para empezar.")
STEP_BACK_REASONS = ("Bloqueada a la espera de un repuesto.", "Pendiente de una aprobación.")
CANCEL_REASONS = (
    "Solicitud duplicada.",
    "El solicitante ya no la necesita.",
    "Se resolvió por otro canal.",
)
STATUS_PLAN = (
    [RequestStatus.RECEIVED] * 10
    + [RequestStatus.ASSIGNED] * 10
    + [RequestStatus.IN_PROGRESS] * 16
    + [RequestStatus.COMPLETED] * 19
    + [RequestStatus.CANCELLED] * 5
)
PRIORITY_WEIGHTS = {
    RequestPriority.CRITICAL: 1.0,
    RequestPriority.HIGH: 2.5,
    RequestPriority.MEDIUM: 4.0,
    RequestPriority.LOW: 2.5,
}
AREA_WEIGHTS = {SUPPORT: 5.0, HR: 3.0, FINANCE: 3.0}
STAGE_FACTORS = (0.2, 0.4, 0.6, 0.8, 1.1, 1.6, 2.4)
MIN_AGE_HOURS = 2
MAX_AGE_HOURS = 30 * 24
AGE_SKEW = 2.2
RETURN_PROBABILITY = 0.25
STEP_BACK_PROBABILITY = 0.15
COMMENT_PROBABILITY = 0.35


@dataclass(slots=True)
class DemoReport:
    users_created: int = 0
    requests_created: int = 0
    events_created: int = 0
    skipped: bool = False


@dataclass(slots=True)
class _Timeline:
    request: ServiceRequest
    cursor: datetime
    events: list[RequestEvent] = field(default_factory=list)


class _DemoBuilder:
    def __init__(
        self,
        *,
        session: AsyncSession,
        rng: random.Random,
        now: datetime,
        catalog: SlaCatalog,
        stage_hours: dict[RequestPriority, dict[RequestStatus, int]],
        people: dict[str, User],
        areas: dict[str, Area],
        admin: User,
    ) -> None:
        self._session = session
        self._rng = rng
        self._now = now
        self._catalog = catalog
        self._stage_hours = stage_hours
        self._people = people
        self._areas = areas
        self._admin = admin

    async def build(self, target: RequestStatus, received_at: datetime) -> list[RequestEvent]:
        rng = self._rng
        area_name = rng.choices(list(AREA_WEIGHTS), weights=list(AREA_WEIGHTS.values()))[0]
        priority = rng.choices(list(PRIORITY_WEIGHTS), weights=list(PRIORITY_WEIGHTS.values()))[0]
        requester = self._people[rng.choice(REQUESTERS)]
        title = rng.choice(TITLES[area_name])
        request = ServiceRequest(
            title=title,
            description=f"{title}. Detalles adicionales en el historial de la solicitud.",
            area_id=self._areas[area_name].id,
            requester_id=requester.id,
            priority=priority,
            status=RequestStatus.RECEIVED,
            received_at=received_at,
            last_activity_at=received_at,
            due_at=self._catalog.due_at(priority, received_at),
            created_at=received_at,
            version=1,
        )
        self._session.add(request)
        await self._session.flush()

        timeline = _Timeline(request=request, cursor=received_at)
        self._event(
            timeline,
            requester,
            RequestEventType.CREATED,
            to_status=RequestStatus.RECEIVED,
            details={"priority": priority.value},
            bump=False,
        )
        assignee = self._people[rng.choice(AREA_ASSIGNEES[area_name])]
        supervisor = self._people.get(AREA_SUPERVISORS.get(area_name, ""), self._admin)

        if target is RequestStatus.CANCELLED:
            cutoff = rng.choice(SLA_STAGES)
            self._walk(timeline, cutoff, assignee, supervisor, requester)
            self._advance(timeline, request.status)
            self._event(
                timeline,
                supervisor,
                RequestEventType.STATUS_CHANGED,
                from_status=request.status,
                to_status=RequestStatus.CANCELLED,
                comment=rng.choice(CANCEL_REASONS),
            )
            request.status = RequestStatus.CANCELLED
        else:
            self._walk(timeline, target, assignee, supervisor, requester)

        request.last_activity_at = timeline.cursor
        request.updated_at = timeline.cursor
        return timeline.events

    def _walk(
        self,
        timeline: _Timeline,
        target: RequestStatus,
        assignee: User,
        supervisor: User,
        requester: User,
    ) -> None:
        rng = self._rng
        request = timeline.request
        if target is RequestStatus.RECEIVED:
            if rng.random() < RETURN_PROBABILITY:
                self._assign(timeline, supervisor, assignee)
                self._return(timeline, assignee)
            self._maybe_comment(timeline, requester, REQUESTER_COMMENTS)
            return

        self._assign(timeline, supervisor, assignee)
        self._maybe_comment(timeline, requester, REQUESTER_COMMENTS)
        if target is RequestStatus.ASSIGNED:
            return

        self._change(timeline, assignee, RequestStatus.IN_PROGRESS)
        self._maybe_comment(timeline, assignee, ASSIGNEE_COMMENTS)
        if rng.random() < STEP_BACK_PROBABILITY:
            self._change(
                timeline, assignee, RequestStatus.ASSIGNED, comment=rng.choice(STEP_BACK_REASONS)
            )
            self._change(timeline, assignee, RequestStatus.IN_PROGRESS)
        if target is RequestStatus.IN_PROGRESS:
            return

        self._change(timeline, assignee, RequestStatus.COMPLETED)
        request.completed_at = timeline.cursor

    def _assign(self, timeline: _Timeline, supervisor: User, assignee: User) -> None:
        request = timeline.request
        self._advance(timeline, RequestStatus.RECEIVED)
        self._event(
            timeline,
            supervisor,
            RequestEventType.ASSIGNED,
            from_status=RequestStatus.RECEIVED,
            to_status=RequestStatus.ASSIGNED,
            details={
                "assignee_id": str(assignee.id),
                "assignee_name": assignee.full_name,
                "previous_assignee_id": None,
                "previous_assignee_name": None,
                "area_override": assignee.area_id != request.area_id,
            },
        )
        request.status = RequestStatus.ASSIGNED
        request.assignee_id = assignee.id

    def _return(self, timeline: _Timeline, assignee: User) -> None:
        request = timeline.request
        reason = self._rng.choice(RETURN_REASONS)
        self._advance(timeline, RequestStatus.ASSIGNED)
        self._event(
            timeline,
            assignee,
            RequestEventType.STATUS_CHANGED,
            from_status=RequestStatus.ASSIGNED,
            to_status=RequestStatus.RECEIVED,
            comment=reason,
            details={
                "returned_by": str(assignee.id),
                "returned_by_name": assignee.full_name,
                "reason": reason,
                "previous_assignee_id": str(assignee.id),
                "previous_assignee_name": assignee.full_name,
            },
        )
        request.status = RequestStatus.RECEIVED
        request.assignee_id = None

    def _change(
        self,
        timeline: _Timeline,
        actor: User,
        target: RequestStatus,
        comment: str | None = None,
    ) -> None:
        request = timeline.request
        self._advance(timeline, request.status)
        self._event(
            timeline,
            actor,
            RequestEventType.STATUS_CHANGED,
            from_status=request.status,
            to_status=target,
            comment=comment,
        )
        request.status = target

    def _maybe_comment(self, timeline: _Timeline, actor: User, texts: tuple[str, ...]) -> None:
        if self._rng.random() < COMMENT_PROBABILITY:
            self._advance(timeline, timeline.request.status, fraction=0.3)
            self._event(
                timeline,
                actor,
                RequestEventType.COMMENT,
                comment=self._rng.choice(texts),
                bump=False,
            )

    def _advance(self, timeline: _Timeline, stage: RequestStatus, fraction: float = 1.0) -> None:
        hours = self._stage_hours[timeline.request.priority].get(stage, 24)
        step = timedelta(hours=hours * self._rng.choice(STAGE_FACTORS) * fraction)
        latest = self._now - timedelta(minutes=self._rng.randint(5, 120))
        timeline.cursor = max(timeline.cursor, min(timeline.cursor + step, latest))

    def _event(
        self,
        timeline: _Timeline,
        actor: User,
        event_type: RequestEventType,
        *,
        from_status: RequestStatus | None = None,
        to_status: RequestStatus | None = None,
        comment: str | None = None,
        details: dict[str, Any] | None = None,
        bump: bool = True,
    ) -> None:
        if bump:
            timeline.request.version += 1
        event = RequestEvent(
            request_id=timeline.request.id,
            type=event_type,
            from_status=from_status,
            to_status=to_status,
            actor_id=actor.id,
            comment=comment,
            details=details or {},
            created_at=timeline.cursor,
        )
        timeline.events.append(event)
        self._session.add(event)


def _age_hours(rng: random.Random) -> float:
    return MIN_AGE_HOURS + (MAX_AGE_HOURS - MIN_AGE_HOURS) * math.pow(rng.random(), AGE_SKEW)


async def _ensure_people(
    session: AsyncSession, areas: dict[str, Area], password: str
) -> tuple[dict[str, User], int]:
    users = UserRepository(session)
    created = 0
    for person in EXTRA_DEMO_PEOPLE:
        if await users.get_by_email(person.email) is None:
            area = areas[person.area_name] if person.area_name else None
            await users.add(
                User(
                    full_name=person.full_name,
                    email=person.email,
                    password_hash=hash_password(password),
                    role=person.role,
                    area_id=area.id if area else None,
                )
            )
            created += 1
    emails = {email for group in AREA_ASSIGNEES.values() for email in group} | set(REQUESTERS)
    people = {}
    for email in emails:
        user = await users.get_by_email(email)
        if user is not None:
            people[email] = user
    return people, created


async def create_demo_requests(
    session: AsyncSession,
    *,
    areas: dict[str, Area],
    admin: User,
    password: str,
    now: datetime,
) -> DemoReport:
    people, users_created = await _ensure_people(session, areas, password)
    report = DemoReport(users_created=users_created)
    requester_ids = [people[email].id for email in REQUESTERS]
    already_seeded = await session.scalar(
        select(exists().where(ServiceRequest.requester_id.in_(requester_ids)))
    )
    if already_seeded:
        report.skipped = True
        return report

    policies = await SlaPolicyRepository(session).list_ordered()
    stage_hours: dict[RequestPriority, dict[RequestStatus, int]] = {}
    for policy in policies:
        stage_hours.setdefault(policy.priority, {})[policy.status] = policy.max_hours

    rng = random.Random(RANDOM_SEED)  # noqa: S311
    plan = list(STATUS_PLAN)
    rng.shuffle(plan)
    builder = _DemoBuilder(
        session=session,
        rng=rng,
        now=now,
        catalog=SlaCatalog(policies),
        stage_hours=stage_hours,
        people=people,
        areas=areas,
        admin=admin,
    )
    drafts = [(now - timedelta(hours=_age_hours(rng)), target) for target in plan]
    for received_at, target in sorted(drafts, key=lambda draft: draft[0]):
        events = await builder.build(target, received_at)
        report.requests_created += 1
        report.events_created += len(events)
    return report
