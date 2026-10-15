import uuid
from dataclasses import dataclass
from enum import StrEnum

from app.models.enums import CLOSED_STATUSES, RequestStatus, UserRole
from app.models.request import ServiceRequest
from app.models.user import User


class Capability(StrEnum):
    VIEW = "view"
    COMMENT = "comment"
    EDIT_CONTENT = "edit_content"
    EDIT_PRIORITY = "edit_priority"
    EDIT_DUE_AT = "edit_due_at"
    ASSIGN = "assign"
    WORK = "work"
    SUPERVISE = "supervise"


FIELD_CAPABILITIES: dict[str, Capability] = {
    "title": Capability.EDIT_CONTENT,
    "description": Capability.EDIT_CONTENT,
    "priority": Capability.EDIT_PRIORITY,
    "due_at": Capability.EDIT_DUE_AT,
}

ASSIGNABLE_ROLES = frozenset({UserRole.ASSIGNEE, UserRole.SUPERVISOR})

SUPERVISOR_CAPABILITIES = frozenset(Capability)


@dataclass(frozen=True, slots=True)
class RequestScope:
    everything: bool
    user_id: uuid.UUID
    area_id: uuid.UUID | None
    include_assigned: bool


class RequestPolicy:
    def __init__(self, actor: User) -> None:
        self.actor = actor

    @property
    def is_admin(self) -> bool:
        return self.actor.role is UserRole.ADMIN

    def scope(self) -> RequestScope:
        role = self.actor.role
        return RequestScope(
            everything=role is UserRole.ADMIN,
            user_id=self.actor.id,
            area_id=self.actor.area_id if role in ASSIGNABLE_ROLES else None,
            include_assigned=role in ASSIGNABLE_ROLES,
        )

    def can_create(self) -> bool:
        return self.actor.is_active

    def capabilities(self, request: ServiceRequest) -> frozenset[Capability]:
        actor = self.actor
        in_area = actor.area_id is not None and actor.area_id == request.area_id
        supervises = self.is_admin or (actor.role is UserRole.SUPERVISOR and in_area)
        responsible = request.assignee_id == actor.id
        requested = request.requester_id == actor.id
        area_assignee = actor.role is UserRole.ASSIGNEE and in_area

        if supervises:
            return SUPERVISOR_CAPABILITIES
        if not (responsible or requested or area_assignee):
            return frozenset()

        granted = {Capability.VIEW, Capability.COMMENT}
        if responsible:
            granted.add(Capability.WORK)
        if requested and request.status is RequestStatus.RECEIVED:
            granted.add(Capability.EDIT_CONTENT)
        return frozenset(granted)

    def can(self, capability: Capability, request: ServiceRequest) -> bool:
        return capability in self.capabilities(request)

    def editable_fields(self, request: ServiceRequest) -> frozenset[str]:
        if request.status in CLOSED_STATUSES:
            return frozenset()
        granted = self.capabilities(request)
        return frozenset(field for field, needed in FIELD_CAPABILITIES.items() if needed in granted)
