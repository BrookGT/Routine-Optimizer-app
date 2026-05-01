"""
store/firebase_client.py — Shared Firestore client helper for the AI service.

Re-uses the already-initialized Firebase Admin app (initialized by
data_pipeline or on first call here). This avoids duplicate app errors.
"""

from __future__ import annotations

import logging
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

import config

logger = logging.getLogger(__name__)

_firebase_app: Optional[firebase_admin.App] = None


def get_firestore():
    """Return a Firestore client, initialising Firebase Admin if needed."""
    global _firebase_app

    try:
        _firebase_app = firebase_admin.get_app()
    except ValueError:
        if not config.FIREBASE_PROJECT_ID:
            raise RuntimeError(
                "FIREBASE_PROJECT_ID is not set — configure Firebase credentials in .env"
            )
        cred = credentials.Certificate({
            "type":                 "service_account",
            "project_id":           config.FIREBASE_PROJECT_ID,
            "client_email":         config.FIREBASE_CLIENT_EMAIL,
            "private_key":          config.FIREBASE_PRIVATE_KEY,
            "token_uri":            "https://oauth2.googleapis.com/token",
            "auth_uri":             "https://accounts.google.com/o/oauth2/auth",
            "client_x509_cert_url": "",
        })
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("[firebase_client] Firebase Admin initialized")

    return firestore.client()
