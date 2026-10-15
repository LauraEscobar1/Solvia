from app.models.request_event import RequestEvent
from app.repositories.base import BaseRepository


class RequestEventRepository(BaseRepository[RequestEvent]):
    model = RequestEvent
