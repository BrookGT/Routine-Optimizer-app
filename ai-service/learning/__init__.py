"""
learning/ — Real-time online learning helpers.

Bridges incoming user-interaction events to the in-memory bandit and
sequence model, so the AI service learns continuously between full
training runs.
"""

from .realtime import apply_feedback, apply_feedback_batch

__all__ = ["apply_feedback", "apply_feedback_batch"]
