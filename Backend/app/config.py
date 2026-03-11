from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from secrets import token_urlsafe

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.mongodb_uri = os.getenv("MONGODB_URI", "").strip()
        self.mongodb_db_name = os.getenv("MONGODB_DB_NAME", "recordwise").strip() or "recordwise"
        self.api_host = os.getenv("API_HOST", "127.0.0.1").strip() or "127.0.0.1"
        self.api_port = int(os.getenv("API_PORT", "8000"))
        self.jwt_secret = os.getenv("JWT_SECRET", token_urlsafe(48)).strip()
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256").strip() or "HS256"
        self.jwt_issuer = os.getenv("JWT_ISSUER", "recordwise-api").strip() or "recordwise-api"
        self.jwt_access_token_minutes = int(os.getenv("JWT_ACCESS_TOKEN_MINUTES", "480"))
        self.session_idle_timeout_minutes = int(os.getenv("SESSION_IDLE_TIMEOUT_MINUTES", "15"))
        self.login_rate_limit_attempts = int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5"))
        self.login_rate_limit_window_minutes = int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", "15"))
        self.captcha_ttl_minutes = int(os.getenv("CAPTCHA_TTL_MINUTES", "5"))
        self.max_upload_size_bytes = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if origin.strip()
        ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
