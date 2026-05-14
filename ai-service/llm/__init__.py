"""
llm/ — OpenAI-backed text generation helpers.

Currently exposes two functions:
  - generate_recommendation_reason(profile, place)
  - summarize_reviews(reviews, max_chars=240)

Both fall back to deterministic, template-based output when
OPENAI_API_KEY is not configured or the API call fails — so the rest
of the pipeline never breaks.
"""

from .openai_client import (
    generate_recommendation_reason,
    summarize_reviews,
    is_llm_enabled,
)

__all__ = [
    "generate_recommendation_reason",
    "summarize_reviews",
    "is_llm_enabled",
]
