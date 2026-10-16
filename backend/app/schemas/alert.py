from pydantic import BaseModel


class AlertEvaluationRead(BaseModel):
    created: int
    updated: int
    resolved: int
    bottlenecks: int
    skipped: bool
    duration_ms: int
