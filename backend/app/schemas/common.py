from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

SearchText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class PageQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)
    q: SearchText | None = None


class Page[ItemT](BaseModel):
    items: list[ItemT]
    total: int
    page: int
    size: int
