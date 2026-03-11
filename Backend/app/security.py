from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
import secrets

import bcrypt
import jwt
import pyotp

from app.config import get_settings


PASSWORD_POLICY_MESSAGE = (
    "Password must be at least 12 characters and include uppercase, lowercase, number, and special character."
)


def validate_password_policy(password: str) -> None:
    if len(password) < 12:
        raise ValueError(PASSWORD_POLICY_MESSAGE)

    checks = (
        any(character.islower() for character in password),
        any(character.isupper() for character in password),
        any(character.isdigit() for character in password),
        any(not character.isalnum() for character in password),
    )

    if not all(checks):
        raise ValueError(PASSWORD_POLICY_MESSAGE)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False

    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except ValueError:
        return False


def generate_session_id() -> str:
    return secrets.token_urlsafe(24)


def create_access_token(*, subject: str, session_id: str) -> tuple[str, datetime]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.jwt_access_token_minutes)
    payload = {
        "sub": subject,
        "sid": session_id,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "iss": settings.jwt_issuer,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        issuer=settings.jwt_issuer,
    )


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_totp_uri(*, secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="RecordWise")


def verify_totp_code(secret: str, code: str) -> bool:
    if not secret or not code:
        return False

    totp = pyotp.TOTP(secret)
    return bool(totp.verify(code.strip(), valid_window=1))
