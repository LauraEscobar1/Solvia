from pydantic import BaseModel, Field, JsonValue


class ErrorBody(BaseModel):
    code: str = Field(examples=["request.not_found"])
    params: dict[str, JsonValue] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorBody
