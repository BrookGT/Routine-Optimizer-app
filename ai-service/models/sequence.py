"""
models/sequence.py — GRU-based next-place-type sequence model.

Architecture:
  Embedding(vocab_size, emb_dim)
  → GRU(emb_dim, hidden_dim, batch_first=True)
  → Linear(hidden_dim, vocab_size)
  → Softmax

Input:  integer-encoded sequence of place-type indices (padded to MAX_SEQ_LEN)
Output: probability distribution over place types  [vocab_size]

sequenceScore for a candidate = P(candidate_type | recent_history)

Cold-start (no recent interactions or model not trained):
  Returns uniform score 1/vocab_size ≈ 0.125 for all types.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

import config

logger = logging.getLogger(__name__)

VOCAB_SIZE   = len(config.PLACE_TYPES)   # 8
MAX_SEQ_LEN  = 10
EMB_DIM      = 16
HIDDEN_DIM   = 32
NUM_EPOCHS   = 30
LEARNING_RATE = 0.01

# ─── Optional PyTorch import (gracefully degrade when not installed) ──────────

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    logger.warning(
        "[sequence] PyTorch not available — sequence model disabled; "
        "sequenceScore will be uniform (0.5)."
    )


# ─── GRU Model ───────────────────────────────────────────────────────────────

class _GRUModel(nn.Module if _TORCH_AVAILABLE else object):
    def __init__(self) -> None:
        if not _TORCH_AVAILABLE:
            return
        super().__init__()
        self.embedding = nn.Embedding(VOCAB_SIZE, EMB_DIM, padding_idx=0)
        self.gru        = nn.GRU(EMB_DIM, HIDDEN_DIM, batch_first=True)
        self.fc         = nn.Linear(HIDDEN_DIM, VOCAB_SIZE)

    def forward(self, x):  # x: (B, seq_len) int tensor
        emb    = self.embedding(x)             # (B, seq_len, EMB_DIM)
        _, h_n = self.gru(emb)                 # h_n: (1, B, HIDDEN_DIM)
        out    = self.fc(h_n.squeeze(0))       # (B, VOCAB_SIZE)
        return out                             # logits


# ─── Encoding helpers ─────────────────────────────────────────────────────────

def encode_type(place_type: str) -> int:
    return config.PLACE_TYPE_INDEX.get(place_type, 0)


def sequence_from_types(types: list[str], max_len: int = MAX_SEQ_LEN) -> list[int]:
    """Converts a list of place-type strings to padded integer indices."""
    encoded = [encode_type(t) for t in types[-max_len:]]
    # Left-pad with 0 (padding_idx)
    padded = [0] * (max_len - len(encoded)) + encoded
    return padded


# ─── SequenceModel wrapper ────────────────────────────────────────────────────

class SequenceModel:
    """
    Wraps the PyTorch GRU with train / predict methods.

    When PyTorch is unavailable, all predictions return the uniform score.
    """

    def __init__(self) -> None:
        self._model: Optional[_GRUModel] = None
        self._trained: bool = False

    def is_trained(self) -> bool:
        return self._trained and _TORCH_AVAILABLE

    def train_on_dataset(self, dataset: list[dict]) -> dict:
        """
        Trains the GRU from a list of training rows.

        Each row must contain: user_id, place_type (the observed action),
        and a pre-computed sequence of prior place types in place_type_sequence.

        We build sequences by grouping rows per user, ordered by recency.
        """
        if not _TORCH_AVAILABLE:
            return {"trained": False, "reason": "torch_unavailable"}

        # Group rows per user, sorted chronologically (oldest first for sequences)
        from collections import defaultdict

        by_user: dict[str, list[dict]] = defaultdict(list)
        for row in dataset:
            by_user[row["user_id"]].append(row)

        seqs: list[list[int]] = []
        targets: list[int]    = []

        for uid, rows in by_user.items():
            # Sort ascending by creation order (we only have recency as proxy here)
            # We reverse because dataset rows are newest-first (matches Firestore ordering)
            rows_asc = list(reversed(rows))
            for i in range(1, len(rows_asc)):
                prior_types = [r["place_type"] for r in rows_asc[:i]]
                target_type  = rows_asc[i]["place_type"]
                seqs.append(sequence_from_types(prior_types))
                targets.append(encode_type(target_type))

        if len(seqs) < 5:
            logger.warning("[sequence] not enough sequences to train (%d); skipping", len(seqs))
            return {"trained": False, "reason": "insufficient_data", "sequences": len(seqs)}

        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        X = torch.tensor(seqs,   dtype=torch.long)
        y = torch.tensor(targets, dtype=torch.long)

        dataset_t = TensorDataset(X, y)
        loader    = DataLoader(dataset_t, batch_size=32, shuffle=True)

        model = _GRUModel()
        optim = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
        loss_fn = nn.CrossEntropyLoss()

        model.train()
        final_loss = 0.0
        for epoch in range(NUM_EPOCHS):
            epoch_loss = 0.0
            for bx, by in loader:
                optim.zero_grad()
                logits = model(bx)
                loss   = loss_fn(logits, by)
                loss.backward()
                optim.step()
                epoch_loss += loss.item()
            final_loss = epoch_loss / max(len(loader), 1)

        self._model   = model
        self._trained = True

        logger.info(
            "[sequence] trained on %d sequences, final_loss=%.4f", len(seqs), final_loss
        )
        return {
            "trained":    True,
            "sequences":  len(seqs),
            "epochs":     NUM_EPOCHS,
            "final_loss": round(final_loss, 4),
        }

    def predict_distribution(self, recent_types: list[str]) -> dict[str, float]:
        """
        Returns P(next_type | recent_types) as a dict {place_type: probability}.
        Falls back to uniform if model is untrained or torch unavailable.
        """
        uniform = {t: 1.0 / VOCAB_SIZE for t in config.PLACE_TYPES}

        if not self.is_trained() or self._model is None:
            return uniform

        import torch

        seq_tensor = torch.tensor(
            [sequence_from_types(recent_types)], dtype=torch.long
        )
        self._model.eval()
        with torch.no_grad():
            logits = self._model(seq_tensor)[0]          # (VOCAB_SIZE,)
            probs  = torch.softmax(logits, dim=0).numpy()

        return {t: float(probs[i]) for i, t in enumerate(config.PLACE_TYPES)}

    def state_dict(self) -> Optional[dict]:
        if not _TORCH_AVAILABLE or self._model is None:
            return None
        import torch
        return self._model.state_dict()

    def load_state_dict(self, sd: dict) -> None:
        if not _TORCH_AVAILABLE:
            return
        import torch
        model = _GRUModel()
        model.load_state_dict({k: torch.tensor(v) for k, v in sd.items()})
        self._model   = model
        self._trained = True


# ─── Module-level singleton ───────────────────────────────────────────────────

_sequence_model: Optional[SequenceModel] = None


def get_sequence_model() -> SequenceModel:
    global _sequence_model
    if _sequence_model is None:
        _sequence_model = SequenceModel()
    return _sequence_model


def set_sequence_model(model: SequenceModel) -> None:
    global _sequence_model
    _sequence_model = model
