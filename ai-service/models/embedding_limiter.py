"""
embedding_limiter.py — Thread-safe RPM + spacing + soft TPM for OpenAI Embeddings.

* Sliding 60s window for max concurrent “embedding API invocations” per minute.
* Optional minimum seconds between calls (anti-burst).
* Optional soft TPM budget (rough: sum of estimated input tokens / minute).
* try_consume — non-blocking for /predict (optionally count_denial=False when polling).
* wait_and_consume — blocks until a slot is free (/train).
"""

from __future__ import annotations

import threading
import time
from collections import deque

WINDOW_SEC = 60.0


class OpenAIEmbeddingLimiter:
    __slots__ = (
        "_lock",
        "_window",
        "max_rpm",
        "min_interval",
        "_last_emit",
        "total_calls",
        "denied_calls",
        "_tpm_soft",
        "_token_events",
        "_tokens_denied_est",
    )

    def __init__(
        self,
        max_rpm: int,
        min_interval_sec: float,
        tpm_soft_limit: int = 0,
    ) -> None:
        self._lock = threading.Lock()
        self._window: deque[float] = deque()
        self.max_rpm = max(1, max_rpm)
        self.min_interval = max(0.0, min_interval_sec)
        self._last_emit = 0.0
        self.total_calls = 0
        self.denied_calls = 0
        self._tpm_soft = max(0, tpm_soft_limit)
        self._token_events: deque[tuple[float, int]] = deque()
        self._tokens_denied_est = 0

    def _prune(self, now: float) -> None:
        while self._window and now - self._window[0] >= WINDOW_SEC:
            self._window.popleft()
        while self._token_events and now - self._token_events[0][0] >= WINDOW_SEC:
            self._token_events.popleft()

    def _token_sum(self) -> int:
        return sum(t for _, t in self._token_events)

    def snapshot(self) -> dict:
        with self._lock:
            now = time.monotonic()
            self._prune(now)
            return {
                "rpm_limit":                 self.max_rpm,
                "requests_last_60s":         len(self._window),
                "min_interval_seconds":      self.min_interval,
                "total_embedding_calls":     self.total_calls,
                "denied_due_to_limit":       self.denied_calls,
                "tpm_soft_limit":            self._tpm_soft or None,
                "estimated_input_tokens_60s": self._token_sum(),
                "tokens_blocked_est":        self._tokens_denied_est,
            }

    def try_consume(
        self,
        estimated_input_tokens: int = 0,
        *,
        count_denial: bool = True,
    ) -> bool:
        """One embedding HTTP request. Returns False if rate / TPM / spacing blocks."""
        tok = max(0, estimated_input_tokens)
        with self._lock:
            now = time.monotonic()
            self._prune(now)

            if self._tpm_soft and self._token_sum() + tok > self._tpm_soft:
                if count_denial:
                    self.denied_calls += 1
                    self._tokens_denied_est += tok
                return False

            if len(self._window) >= self.max_rpm:
                if count_denial:
                    self.denied_calls += 1
                return False

            if (
                self.min_interval > 0
                and self._last_emit > 0
                and (now - self._last_emit) < self.min_interval
            ):
                if count_denial:
                    self.denied_calls += 1
                return False

            t = time.monotonic()
            self._window.append(t)
            self._last_emit = t
            if tok:
                self._token_events.append((t, tok))
            self.total_calls += 1
            return True

    def wait_and_consume(self, estimated_input_tokens: int = 0) -> None:
        """Block until try_consume succeeds (does not increment denied on spin)."""
        while not self.try_consume(estimated_input_tokens, count_denial=False):
            time.sleep(0.08)
