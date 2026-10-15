import math
import time
from collections import deque
from collections.abc import Callable


class LoginRateLimiter:
    def __init__(
        self,
        max_attempts: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds
        self._clock = clock
        self._failures: dict[str, deque[float]] = {}

    def retry_after(self, key: str) -> int | None:
        failures = self._prune(key)
        if failures is None or len(failures) < self._max_attempts:
            return None
        remaining = failures[0] + self._window_seconds - self._clock()
        return max(1, math.ceil(remaining))

    def record_failure(self, key: str) -> None:
        self._prune(key)
        self._failures.setdefault(key, deque()).append(self._clock())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)

    def _prune(self, key: str) -> deque[float] | None:
        failures = self._failures.get(key)
        if failures is None:
            return None
        threshold = self._clock() - self._window_seconds
        while failures and failures[0] <= threshold:
            failures.popleft()
        if not failures:
            del self._failures[key]
            return None
        return failures
