"""
rag/ — Retrieval-Augmented Generation helpers.

Currently a lightweight, deterministic extractor that pulls structured
signals from free-text place descriptions and reviews:
    - price hints (cheap / luxury / etc.)
    - category hints (gym, cafe, lounge, …)
    - quality markers (popular, recommended, hidden gem, …)

These signals augment both the price classifier and the LLM explanation
prompt without requiring a vector store.  We can plug in a real vector
DB later by replacing extract_signals with a retriever.
"""

from .extractor import extract_signals, score_keywords

__all__ = ["extract_signals", "score_keywords"]
