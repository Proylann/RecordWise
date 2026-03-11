from __future__ import annotations

from functools import lru_cache

from pymongo import MongoClient
from pymongo.database import Database

from app.config import get_settings


@lru_cache(maxsize=1)
def get_client() -> MongoClient:
    settings = get_settings()
    if not settings.mongodb_uri:
        raise RuntimeError("MONGODB_URI is not set in Backend/.env")

    return MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000)


def get_database() -> Database:
    settings = get_settings()
    return get_client()[settings.mongodb_db_name]


def ping_database() -> dict:
    return get_database().command("ping")

