from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import choice, randint
from uuid import uuid4

import jwt
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.config import get_settings
from app.database import get_database, ping_database
from app.schemas import (
    ActivityLogResponse,
    ArchiveVerificationResponse,
    AuditEntryResponse,
    AuthResponse,
    CaptchaResponse,
    CommunityReportResponse,
    LoginRequest,
    MessageResponse,
    MfaCodeRequest,
    MfaSetupResponse,
    NotificationResponse,
    RecordRequestResponse,
    RecordInsightResponse,
    RecordListResponse,
    RecordStatusUpdateRequest,
    RegisterRequest,
    SecurityRecordResponse,
    StatusTimelineEntryResponse,
    UserResponse,
    VALID_USER_ROLES,
)
from app.security import (
    PASSWORD_POLICY_MESSAGE,
    build_totp_uri,
    create_access_token,
    decode_access_token,
    generate_session_id,
    generate_totp_secret,
    hash_password,
    verify_password,
    verify_totp_code,
)


settings = get_settings()
app = FastAPI(title="RecordWise Backend", version="1.0.0")
MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Expires-At"],
)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    if request.url.path == "/auth/register":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Unable to register with the provided information."},
        )
    if request.url.path == "/auth/login":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": "Unable to sign in with the provided information."},
        )
    raise exc


def get_users_collection():
    collection = get_database()["users"]
    collection.create_index("email", unique=True)
    return collection


def get_security_records_collection():
    collection = get_database()["security_records"]
    collection.create_index("record_id", unique=True)
    collection.create_index("submitted_by")
    collection.create_index("created_at")
    collection.create_index("status")
    collection.create_index("category")
    collection.create_index("resident_name")
    return collection


def get_record_requests_collection():
    collection = get_database()["record_requests"]
    collection.create_index("request_id", unique=True)
    collection.create_index("submitted_by")
    collection.create_index("status")
    collection.create_index("created_at")
    collection.create_index("assigned_secretary_email")
    return collection


def get_community_reports_collection():
    collection = get_database()["community_reports"]
    collection.create_index("report_id", unique=True)
    collection.create_index("submitted_by")
    collection.create_index("status")
    collection.create_index("created_at")
    return collection


def get_activity_logs_collection():
    collection = get_database()["activity_logs"]
    collection.create_index("log_id", unique=True)
    collection.create_index("actor_email")
    collection.create_index("timestamp")
    return collection


def get_sessions_collection():
    collection = get_database()["auth_sessions"]
    collection.create_index("session_id", unique=True)
    collection.create_index("expires_at", expireAfterSeconds=0)
    collection.create_index("user_email")
    return collection


def get_login_attempts_collection():
    collection = get_database()["login_attempts"]
    collection.create_index(
        "created_at",
        expireAfterSeconds=settings.login_rate_limit_window_minutes * 60,
    )
    collection.create_index([("email", 1), ("ip_address", 1), ("created_at", -1)])
    return collection


def get_captcha_collection():
    collection = get_database()["captcha_challenges"]
    collection.create_index("captcha_id", unique=True)
    collection.create_index("expires_at", expireAfterSeconds=0)
    return collection


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_client_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def isoformat(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_user_role(document: dict) -> str:
    role = str(document.get("role", "resident")).strip().lower()
    if role == "staff":
        return "secretary"
    if role not in VALID_USER_ROLES:
        return "resident"
    return role


def serialize_user(document: dict) -> UserResponse:
    return UserResponse(
        email=document["email"],
        first_name=document.get("first_name"),
        middle_name=document.get("middle_name"),
        last_name=document.get("last_name"),
        purok=document.get("purok"),
        mfa_enabled=bool(document.get("mfa_enabled")),
        role=get_user_role(document),
    )


def serialize_audit_entry(entry: dict) -> AuditEntryResponse:
    return AuditEntryResponse(
        action=entry["action"],
        actor_email=entry["actor_email"],
        timestamp=isoformat(as_utc(entry["timestamp"])),
        notes=entry.get("notes"),
        status=entry.get("status"),
    )


def serialize_record_insights(document: dict) -> RecordInsightResponse:
    insights = document.get("insights", {})
    return RecordInsightResponse(
        suggested_category=insights.get("suggested_category"),
        duplicate_warning=insights.get("duplicate_warning"),
        completeness_score=int(insights.get("completeness_score", 0)),
        anomaly_flags=list(insights.get("anomaly_flags", [])),
        recommended_action=insights.get("recommended_action", "Review"),
    )


def serialize_record_request(document: dict) -> RecordRequestResponse:
    return RecordRequestResponse(
        request_id=document["request_id"],
        request_type=document["request_type"],
        purpose=document["purpose"],
        status=normalize_request_status(document["status"]),
        resident_name=document["resident_name"],
        purok=document["purok"],
        submitted_by=document["submitted_by"],
        created_at=isoformat(as_utc(document["created_at"])),
        updated_at=isoformat(as_utc(document.get("updated_at", document["created_at"]))),
        assigned_secretary_email=document.get("assigned_secretary_email"),
        evidence_filename=document.get("evidence_filename"),
        evidence_url=get_public_file_url(document.get("evidence_path")),
        status_history=[serialize_status_timeline_entry(entry) for entry in document.get("status_history", [])],
    )


def serialize_community_report(document: dict) -> CommunityReportResponse:
    return CommunityReportResponse(
        report_id=document["report_id"],
        report_type=document["report_type"],
        custom_concern=document.get("custom_concern"),
        description=document["description"],
        urgency=document.get("urgency", "Medium"),
        status=document["status"],
        resident_name=document["resident_name"],
        purok=document["purok"],
        submitted_by=document["submitted_by"],
        created_at=isoformat(as_utc(document["created_at"])),
        evidence_filename=document.get("evidence_filename"),
        evidence_url=get_public_file_url(document.get("evidence_path")),
    )


def serialize_activity_log(document: dict) -> ActivityLogResponse:
    return ActivityLogResponse(
        log_id=document["log_id"],
        actor_email=document["actor_email"],
        actor_role=document["actor_role"],
        action=document["action"],
        target_collection=document["target_collection"],
        target_id=document["target_id"],
        details=document["details"],
        timestamp=isoformat(as_utc(document["timestamp"])),
    )


def serialize_status_timeline_entry(entry: dict) -> StatusTimelineEntryResponse:
    return StatusTimelineEntryResponse(
        status=normalize_request_status(entry["status"]),
        timestamp=isoformat(as_utc(entry["timestamp"])),
        actor_email=entry["actor_email"],
        notes=entry.get("notes"),
    )


def serialize_security_record(document: dict) -> SecurityRecordResponse:
    return SecurityRecordResponse(
        record_id=document["record_id"],
        title=document["title"],
        description=document["description"],
        category=document["category"],
        risk_level=document["risk_level"],
        resident_name=document.get("resident_name", "Unknown Resident"),
        status=document.get("status", "Pending"),
        created_at=isoformat(as_utc(document["created_at"])),
        updated_at=isoformat(as_utc(document.get("updated_at", document["created_at"]))),
        submitted_by=document.get("submitted_by"),
        evidence_filename=document.get("evidence_filename"),
        evidence_url=get_public_file_url(document.get("evidence_path")),
        source_type=document.get("source_type"),
        source_id=document.get("source_id"),
        previous_hash=document.get("previous_hash"),
        record_hash=document.get("record_hash", ""),
        insights=serialize_record_insights(document),
        audit_trail=[serialize_audit_entry(entry) for entry in document.get("audit_trail", [])],
    )


def generate_record_id() -> str:
    return f"RW-{uuid4().hex[:8].upper()}"


def generate_request_id() -> str:
    return f"RQ-{uuid4().hex[:8].upper()}"


def generate_report_id() -> str:
    return f"RP-{uuid4().hex[:8].upper()}"


def generate_log_id() -> str:
    return f"LG-{uuid4().hex[:8].upper()}"


VALID_RECORD_STATUSES = {"Pending", "Verified", "Released", "Archived"}
VALID_RISK_LEVELS = {"Low", "Medium", "High", "Critical"}
VALID_REQUEST_STATUSES = {"Pending", "In Progress", "Ready To Pickup", "Claimed", "Declined"}
VALID_REPORT_STATUSES = {"Open", "In Review", "Resolved", "Declined"}
VALID_REPORT_URGENCY = {"Low", "Medium", "High", "Urgent"}
CATEGORY_KEYWORDS = {
    "Barangay Clearance": ["clearance", "permit", "certificate"],
    "Certificate Request": ["certificate", "indigency", "residency", "request"],
    "Incident Report": ["incident", "blotter", "complaint", "report"],
    "Financial Assistance": ["assistance", "aid", "medical", "burial", "financial"],
    "Resident Record": ["resident", "profile", "household", "member"],
    "Resolution / Ordinance": ["resolution", "ordinance", "policy", "meeting"],
}


def normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def get_public_file_url(relative_path: str | None) -> str | None:
    if not relative_path:
        return None
    normalized_path = relative_path.replace("\\", "/")
    return f"/media/{normalized_path}"


async def save_upload_file(upload: UploadFile | None, folder_name: str) -> tuple[str | None, str | None]:
    if not upload or not upload.filename:
        return None, None

    file_bytes = await upload.read()
    if len(file_bytes) > settings.max_upload_size_bytes:
        max_size_mb = settings.max_upload_size_bytes / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds the {max_size_mb:.0f} MB limit.",
        )

    target_dir = MEDIA_DIR / folder_name
    target_dir.mkdir(parents=True, exist_ok=True)
    extension = Path(upload.filename).suffix.lower()
    stored_name = f"{uuid4().hex}{extension}"
    target_path = target_dir / stored_name
    with target_path.open("wb") as output:
        output.write(file_bytes)
    return upload.filename, f"{folder_name}/{stored_name}"


def build_record_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def suggest_category(title: str, description: str, fallback: str) -> str:
    text = normalize_text(f"{title} {description}")
    best_match = fallback
    best_score = 0
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in text)
        if score > best_score:
            best_match = category
            best_score = score
    return best_match


def build_record_insights(
    *,
    title: str,
    description: str,
    category: str,
    resident_name: str,
    risk_level: str,
    duplicate_record: dict | None,
) -> dict:
    completeness_checks = [
        bool(title.strip()),
        bool(description.strip()),
        bool(category.strip()),
        bool(resident_name.strip()),
        len(description.strip()) >= 30,
    ]
    completeness_score = int((sum(completeness_checks) / len(completeness_checks)) * 100)
    suggested = suggest_category(title, description, category)
    anomaly_flags: list[str] = []

    if risk_level in {"High", "Critical"}:
        anomaly_flags.append("High-priority archive entry")
    if duplicate_record:
        anomaly_flags.append("Possible duplicate submission")
    if len(description.strip()) < 40:
        anomaly_flags.append("Description may be too short")

    duplicate_warning = None
    if duplicate_record:
        duplicate_warning = (
            f"Similar to {duplicate_record['record_id']} filed for {duplicate_record.get('resident_name', 'another resident')}."
        )

    recommended_action = "Verify"
    if duplicate_record or risk_level in {"High", "Critical"}:
        recommended_action = "Manual review"
    elif completeness_score < 80:
        recommended_action = "Request correction"

    return {
        "suggested_category": suggested,
        "duplicate_warning": duplicate_warning,
        "completeness_score": completeness_score,
        "anomaly_flags": anomaly_flags,
        "recommended_action": recommended_action,
    }


def find_duplicate_record(title: str, resident_name: str) -> dict | None:
    records = get_security_records_collection()
    return records.find_one(
        {
            "title_normalized": normalize_text(title),
            "resident_name_normalized": normalize_text(resident_name),
        },
        sort=[("created_at", -1)],
    )


def build_audit_entry(*, action: str, actor_email: str, status_value: str | None = None, notes: str | None = None) -> dict:
    return {
        "action": action,
        "actor_email": actor_email,
        "status": status_value,
        "notes": notes,
        "timestamp": datetime.now(UTC),
    }


def build_status_timeline_entry(*, status_value: str, actor_email: str, notes: str | None = None) -> dict:
    return {
        "status": status_value,
        "actor_email": actor_email,
        "notes": notes,
        "timestamp": datetime.now(UTC),
    }


def parse_optional_datetime(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None

    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    else:
        parsed = parsed.astimezone(UTC)

    if end_of_day and "T" not in value:
        parsed = parsed + timedelta(days=1) - timedelta(microseconds=1)
    return parsed


def build_date_range_query(date_from: str | None, date_to: str | None) -> dict | None:
    start = parse_optional_datetime(date_from)
    end = parse_optional_datetime(date_to, end_of_day=True)
    if not start and not end:
        return None

    query: dict = {}
    if start:
        query["$gte"] = start
    if end:
        query["$lte"] = end
    return query


def normalize_request_status(value: str) -> str:
    normalized = value.strip()
    legacy_map = {
        "On Process": "In Progress",
        "Ready to Pickup": "Ready To Pickup",
    }
    return legacy_map.get(normalized, normalized)


def normalize_request_id(value: str) -> str:
    cleaned = value.strip().upper()
    if cleaned.startswith("RO-"):
        return "RQ-" + cleaned[3:]
    return cleaned


def require_roles(current_user: dict, *allowed_roles: str) -> None:
    if current_user.get("role") not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this resource")


def log_activity(*, actor_email: str, actor_role: str, action: str, target_collection: str, target_id: str, details: str) -> None:
    get_activity_logs_collection().insert_one(
        {
            "log_id": generate_log_id(),
            "actor_email": actor_email,
            "actor_role": actor_role,
            "action": action,
            "target_collection": target_collection,
            "target_id": target_id,
            "details": details,
            "timestamp": datetime.now(UTC),
        }
    )


def archive_workflow_record(
    *,
    source_type: str,
    source_id: str,
    title: str,
    description: str,
    category: str,
    resident_name: str,
    submitted_by: str,
    evidence_filename: str | None,
    evidence_path: str | None,
    actor_email: str,
    actor_role: str,
) -> None:
    records = get_security_records_collection()
    existing = records.find_one({"source_type": source_type, "source_id": source_id})
    previous_record = records.find_one(sort=[("created_at", -1)])
    now = datetime.now(UTC)
    insights = build_record_insights(
        title=title,
        description=description,
        category=category,
        resident_name=resident_name,
        risk_level="Low",
        duplicate_record=None,
    )
    audit_entry = build_audit_entry(
        action="Archived from Workflow",
        actor_email=actor_email,
        status_value="Archived",
        notes=f"Archived from {source_type} workflow.",
    )

    if existing:
        records.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "title": title,
                    "description": description,
                    "category": category,
                    "resident_name": resident_name,
                    "status": "Archived",
                    "updated_at": now,
                    "submitted_by": submitted_by,
                    "evidence_filename": evidence_filename,
                    "evidence_path": evidence_path,
                    "insights": insights,
                },
                "$push": {"audit_trail": audit_entry},
            },
        )
        return

    record_id = generate_record_id()
    record_hash = build_record_hash(
        {
            "record_id": record_id,
            "title": title,
            "description": description,
            "category": category,
            "resident_name": resident_name,
            "submitted_by": submitted_by,
            "previous_hash": previous_record.get("record_hash") if previous_record else None,
            "created_at": isoformat(now),
        }
    )
    record_document = {
        "record_id": record_id,
        "title": title,
        "title_normalized": normalize_text(title),
        "description": description,
        "category": category,
        "resident_name": resident_name,
        "resident_name_normalized": normalize_text(resident_name),
        "risk_level": "Low",
        "status": "Archived",
        "submitted_by": submitted_by,
        "evidence_filename": evidence_filename,
        "evidence_path": evidence_path,
        "created_at": now,
        "updated_at": now,
        "previous_hash": previous_record.get("record_hash") if previous_record else None,
        "record_hash": record_hash,
        "insights": insights,
        "audit_trail": [audit_entry],
        "source_type": source_type,
        "source_id": source_id,
    }
    records.insert_one(record_document)


def login_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid login credentials.",
    )


def mfa_required_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="MFA code required",
    )


def captcha_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Captcha.",
    )


def register_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unable to register with the provided information.",
    )


def account_exists_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Account already Exist",
    )


def register_password_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=PASSWORD_POLICY_MESSAGE,
    )


def create_session(user_document: dict) -> AuthResponse:
    sessions = get_sessions_collection()
    now = datetime.now(UTC)
    session_id = generate_session_id()
    token, token_expires_at = create_access_token(subject=user_document["email"], session_id=session_id)
    session_expires_at = now + timedelta(minutes=settings.session_idle_timeout_minutes)

    sessions.insert_one(
        {
            "session_id": session_id,
            "user_email": user_document["email"],
            "created_at": now,
            "last_activity_at": now,
            "expires_at": session_expires_at,
            "revoked_at": None,
        }
    )

    return AuthResponse(
        token=token,
        expires_at=isoformat(token_expires_at),
        user=serialize_user(user_document),
    )


def create_captcha_challenge() -> CaptchaResponse:
    collection = get_captcha_collection()
    left = randint(1, 20)
    operation = choice(["+", "-"])
    right = randint(1, 20)
    if operation == "-" and right > left:
        left, right = right, left

    answer = left + right if operation == "+" else left - right
    captcha_id = uuid4().hex
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.captcha_ttl_minutes)
    collection.insert_one(
        {
            "captcha_id": captcha_id,
            "answer": str(answer),
            "question": f"{left} {operation} {right} = ?",
            "used": False,
            "expires_at": expires_at,
            "created_at": datetime.now(UTC),
        }
    )
    return CaptchaResponse(captcha_id=captcha_id, question=f"{left} {operation} {right} = ?", expires_at=isoformat(expires_at))


def validate_captcha(captcha_id: str, captcha_answer: str) -> dict:
    collection = get_captcha_collection()
    challenge = collection.find_one({"captcha_id": captcha_id, "used": False})
    if not challenge:
        raise captcha_error()

    challenge_expires_at = as_utc(challenge["expires_at"])
    if challenge_expires_at <= datetime.now(UTC) or challenge["answer"] != captcha_answer.strip():
        collection.delete_one({"_id": challenge["_id"]})
        raise captcha_error()

    return challenge


def mark_captcha_used(challenge: dict) -> None:
    get_captcha_collection().update_one({"_id": challenge["_id"]}, {"$set": {"used": True}})


def invalidate_captcha(challenge: dict) -> None:
    get_captcha_collection().delete_one({"_id": challenge["_id"]})


def enforce_login_rate_limit(email: str, ip_address: str) -> None:
    collection = get_login_attempts_collection()
    attempts = collection.count_documents({"email": email})
    if attempts >= settings.login_rate_limit_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked for {settings.login_rate_limit_window_minutes} minutes due to too many failed login attempts.",
        )


def record_failed_login(email: str, ip_address: str) -> int:
    collection = get_login_attempts_collection()
    collection.insert_one(
        {
            "email": email,
            "ip_address": ip_address,
            "created_at": datetime.now(UTC),
        }
    )
    return collection.count_documents({"email": email})


def clear_failed_logins(email: str, ip_address: str) -> None:
    get_login_attempts_collection().delete_many({"email": email})


def login_error_with_attempts(attempts_used: int) -> HTTPException:
    attempts_left = max(settings.login_rate_limit_attempts - attempts_used, 0)
    if attempts_left == 0:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked for {settings.login_rate_limit_window_minutes} minutes due to too many failed login attempts.",
        )

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Invalid login credentials. {attempts_left} trial(s) left.",
    )


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        payload = decode_access_token(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    session_id = payload.get("sid")
    email = payload.get("sub")
    if not session_id or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    sessions = get_sessions_collection()
    users = get_users_collection()
    session_document = sessions.find_one({"session_id": session_id, "user_email": email})
    if not session_document or session_document.get("revoked_at") is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is no longer active")

    now = datetime.now(UTC)
    session_expires_at = as_utc(session_document["expires_at"])
    if session_expires_at <= now:
        sessions.update_one({"_id": session_document["_id"]}, {"$set": {"revoked_at": now}})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has expired")

    new_expiry = now + timedelta(minutes=settings.session_idle_timeout_minutes)
    sessions.update_one(
        {"_id": session_document["_id"]},
        {"$set": {"last_activity_at": now, "expires_at": new_expiry}},
    )

    user_document = users.find_one({"email": email})
    if not user_document:
        sessions.update_one({"_id": session_document["_id"]}, {"$set": {"revoked_at": now}})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is no longer active")

    user_document["session_expires_at"] = new_expiry
    user_document["session_id"] = session_id
    return user_document


@app.get("/health")
def healthcheck() -> dict:
    ping_result = ping_database()
    return {"status": "ok", "database": ping_result}


@app.get("/auth/captcha", response_model=CaptchaResponse)
def get_captcha() -> CaptchaResponse:
    return create_captcha_challenge()


@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: dict = Depends(get_current_user)) -> UserResponse:
    return serialize_user(current_user)


@app.post("/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: dict) -> AuthResponse:
    users = get_users_collection()
    raw_email = str(payload.get("email", ""))
    email = normalize_email(raw_email)

    if users.find_one({"email": email}):
        raise account_exists_error()

    try:
        register_payload = RegisterRequest.model_validate(payload)
    except ValidationError as exc:
        password_error = any(error.get("loc") == ("password",) for error in exc.errors())
        if password_error:
            raise register_password_error()
        raise register_error()

    user_document = {
        "first_name": register_payload.first_name.strip(),
        "middle_name": register_payload.middle_name.strip(),
        "last_name": register_payload.last_name.strip(),
        "email": email,
        "password_hash": hash_password(register_payload.password),
        "purok": register_payload.purok.strip(),
        "role": "resident",
        "mfa_enabled": False,
        "mfa_secret": None,
        "mfa_pending_secret": None,
        "created_at": datetime.now(UTC),
    }
    users.insert_one(user_document)
    log_activity(
        actor_email=user_document["email"],
        actor_role=get_user_role(user_document),
        action="Registered Account",
        target_collection="users",
        target_id=user_document["email"],
        details=f"Resident account created for {user_document['first_name']} {user_document['last_name']}.",
    )

    return create_session(user_document)


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request) -> AuthResponse:
    users = get_users_collection()
    email = normalize_email(payload.email)
    ip_address = get_client_ip(request)

    enforce_login_rate_limit(email, ip_address)
    captcha_challenge = validate_captcha(payload.captcha_id, payload.captcha_answer)

    user_document = users.find_one({"email": email})
    if not user_document or not verify_password(payload.password, user_document.get("password_hash", "")):
        invalidate_captcha(captcha_challenge)
        attempts_used = record_failed_login(email, ip_address)
        raise login_error_with_attempts(attempts_used)

    if user_document.get("mfa_enabled"):
        if not payload.mfa_code:
            raise mfa_required_error()
        if not verify_totp_code(user_document.get("mfa_secret", ""), payload.mfa_code):
            invalidate_captcha(captcha_challenge)
            attempts_used = record_failed_login(email, ip_address)
            raise login_error_with_attempts(attempts_used)

    mark_captcha_used(captcha_challenge)
    clear_failed_logins(email, ip_address)
    return create_session(user_document)


@app.post("/auth/logout", response_model=MessageResponse)
def logout(current_user: dict = Depends(get_current_user)) -> MessageResponse:
    get_sessions_collection().update_one(
        {"session_id": current_user["session_id"]},
        {"$set": {"revoked_at": datetime.now(UTC), "expires_at": datetime.now(UTC)}},
    )
    return MessageResponse(message="Logged out successfully")


@app.post("/auth/mfa/setup", response_model=MfaSetupResponse)
def setup_mfa(current_user: dict = Depends(get_current_user)) -> MfaSetupResponse:
    users = get_users_collection()
    secret = generate_totp_secret()
    users.update_one(
        {"email": current_user["email"]},
        {"$set": {"mfa_pending_secret": secret}},
    )
    return MfaSetupResponse(secret=secret, otpauth_url=build_totp_uri(secret=secret, email=current_user["email"]))


@app.post("/auth/mfa/enable", response_model=MessageResponse)
def enable_mfa(payload: MfaCodeRequest, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    users = get_users_collection()
    latest_user = users.find_one({"email": current_user["email"]})
    pending_secret = latest_user.get("mfa_pending_secret") if latest_user else None
    if not pending_secret or not verify_totp_code(pending_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    users.update_one(
        {"email": current_user["email"]},
        {
            "$set": {"mfa_enabled": True, "mfa_secret": pending_secret},
            "$unset": {"mfa_pending_secret": ""},
        },
    )
    return MessageResponse(message="MFA has been enabled")


@app.post("/auth/mfa/disable", response_model=MessageResponse)
def disable_mfa(payload: MfaCodeRequest, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    users = get_users_collection()
    latest_user = users.find_one({"email": current_user["email"]})
    current_secret = latest_user.get("mfa_secret") if latest_user else None
    if not current_secret or not verify_totp_code(current_secret, payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    users.update_one(
        {"email": current_user["email"]},
        {
            "$set": {"mfa_enabled": False},
            "$unset": {"mfa_secret": "", "mfa_pending_secret": ""},
        },
    )
    return MessageResponse(message="MFA has been disabled")


@app.get("/security-records", response_model=RecordListResponse)
def list_security_records(
    search: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=80),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    submitted_by_me: bool = Query(default=False),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> RecordListResponse:
    require_roles(current_user, "secretary", "admin")
    records = get_security_records_collection()
    query: dict = {}

    if category:
        query["category"] = category.strip()
    if status_filter:
        query["status"] = status_filter.strip()
    if submitted_by_me:
        query["submitted_by"] = current_user["email"]
    date_query = build_date_range_query(date_from, date_to)
    if date_query:
        query["created_at"] = date_query
    if search and search.strip():
        expression = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"title": expression},
            {"description": expression},
            {"record_id": expression},
            {"resident_name": expression},
            {"category": expression},
            {"record_hash": expression},
        ]

    documents = list(records.find(query).sort("created_at", -1).limit(50))
    return RecordListResponse(records=[serialize_security_record(document) for document in documents], total=len(documents))


@app.get("/security-records/{record_id}", response_model=SecurityRecordResponse)
def get_security_record(record_id: str, current_user: dict = Depends(get_current_user)) -> SecurityRecordResponse:
    require_roles(current_user, "secretary", "admin")
    document = get_security_records_collection().find_one({"record_id": record_id})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return serialize_security_record(document)


@app.get("/security-records/{record_id}/history", response_model=list[AuditEntryResponse])
def get_security_record_history(record_id: str, current_user: dict = Depends(get_current_user)) -> list[AuditEntryResponse]:
    require_roles(current_user, "secretary", "admin")
    document = get_security_records_collection().find_one({"record_id": record_id})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return [serialize_audit_entry(entry) for entry in document.get("audit_trail", [])]


@app.post("/security-records", response_model=SecurityRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_security_record(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    resident_name: str = Form(...),
    risk_level: str = Form(...),
    evidence: UploadFile | None = File(default=None),
    current_user: dict = Depends(get_current_user),
) -> SecurityRecordResponse:
    require_roles(current_user, "secretary", "admin")
    records = get_security_records_collection()
    clean_title = title.strip()
    clean_description = description.strip()
    clean_category = category.strip()
    clean_resident_name = resident_name.strip()
    clean_risk_level = risk_level.strip().title()

    if not clean_title or not clean_description or not clean_category or not clean_risk_level or not clean_resident_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All required fields must be provided")
    if clean_risk_level not in VALID_RISK_LEVELS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid priority level")

    previous_record = records.find_one(sort=[("created_at", -1)])
    evidence_filename, evidence_path = await save_upload_file(evidence, "archive_records")
    duplicate_record = find_duplicate_record(clean_title, clean_resident_name)
    insights = build_record_insights(
        title=clean_title,
        description=clean_description,
        category=clean_category,
        resident_name=clean_resident_name,
        risk_level=clean_risk_level,
        duplicate_record=duplicate_record,
    )
    now = datetime.now(UTC)
    status_value = "Pending"
    record_id = generate_record_id()
    record_hash = build_record_hash(
        {
            "record_id": record_id,
            "title": clean_title,
            "description": clean_description,
            "category": clean_category,
            "resident_name": clean_resident_name,
            "risk_level": clean_risk_level,
            "submitted_by": current_user["email"],
            "previous_hash": previous_record.get("record_hash") if previous_record else None,
            "created_at": isoformat(now),
        }
    )
    audit_entry = build_audit_entry(
        action="Created",
        actor_email=current_user["email"],
        status_value=status_value,
        notes="Record archived in RecordWise",
    )

    record_document = {
        "record_id": record_id,
        "title": clean_title,
        "title_normalized": normalize_text(clean_title),
        "description": clean_description,
        "category": clean_category,
        "resident_name": clean_resident_name,
        "resident_name_normalized": normalize_text(clean_resident_name),
        "risk_level": clean_risk_level,
        "status": status_value,
        "submitted_by": current_user["email"],
        "evidence_filename": evidence_filename,
        "evidence_path": evidence_path,
        "created_at": now,
        "updated_at": now,
        "previous_hash": previous_record.get("record_hash") if previous_record else None,
        "record_hash": record_hash,
        "insights": insights,
        "audit_trail": [audit_entry],
    }
    records.insert_one(record_document)
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Archived Record",
        target_collection="security_records",
        target_id=record_id,
        details=f"Archived {clean_category} for {clean_resident_name}.",
    )

    return serialize_security_record(record_document)


@app.patch("/security-records/{record_id}/status", response_model=SecurityRecordResponse)
def update_security_record_status(
    record_id: str,
    payload: RecordStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> SecurityRecordResponse:
    require_roles(current_user, "secretary", "admin")
    records = get_security_records_collection()
    document = records.find_one({"record_id": record_id})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    next_status = payload.status.strip().title()
    if next_status not in VALID_RECORD_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid record status")

    audit_entry = build_audit_entry(
        action="Status Updated",
        actor_email=current_user["email"],
        status_value=next_status,
        notes=(payload.notes or "").strip() or None,
    )
    updated_at = datetime.now(UTC)
    records.update_one(
        {"_id": document["_id"]},
        {
            "$set": {"status": next_status, "updated_at": updated_at},
            "$push": {"audit_trail": audit_entry},
        },
    )

    updated = records.find_one({"_id": document["_id"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Updated Record Status",
        target_collection="security_records",
        target_id=record_id,
        details=f"Record moved to {next_status}.",
    )
    return serialize_security_record(updated)


@app.get("/security-records/verify/hash", response_model=ArchiveVerificationResponse)
def verify_security_record_hash(
    record_hash: str = Query(..., min_length=16, max_length=128),
    current_user: dict = Depends(get_current_user),
) -> ArchiveVerificationResponse:
    require_roles(current_user, "secretary", "admin")
    document = get_security_records_collection().find_one({"record_hash": record_hash.strip()})
    if not document:
        return ArchiveVerificationResponse(
            exists=False,
            verified=False,
            details="No archived record matches the supplied hash.",
        )

    payload = {
        "record_id": document["record_id"],
        "title": document["title"],
        "description": document["description"],
        "category": document["category"],
        "resident_name": document["resident_name"],
        "risk_level": document["risk_level"],
        "submitted_by": document["submitted_by"],
        "previous_hash": document.get("previous_hash"),
        "created_at": isoformat(as_utc(document["created_at"])),
    }
    rebuilt_hash = build_record_hash(payload)
    verified = rebuilt_hash == document.get("record_hash")
    details = "The record hash matches the stored archive payload." if verified else "The stored record no longer matches its hash."
    return ArchiveVerificationResponse(
        exists=True,
        verified=verified,
        record_id=document["record_id"],
        title=document["title"],
        category=document["category"],
        created_at=isoformat(as_utc(document["created_at"])),
        resident_name=document["resident_name"],
        details=details,
    )


@app.get("/record-requests", response_model=list[RecordRequestResponse])
def list_record_requests(
    search: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    assigned_to_me: bool = Query(default=False),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> list[RecordRequestResponse]:
    records = get_record_requests_collection()
    query = {}
    role = get_user_role(current_user)
    if role == "resident":
        query["submitted_by"] = current_user["email"]
    if role in {"secretary", "admin"} and assigned_to_me:
        query["assigned_secretary_email"] = current_user["email"]
    if status_filter:
        query["status"] = normalize_request_status(status_filter)
    date_query = build_date_range_query(date_from, date_to)
    if date_query:
        query["created_at"] = date_query
    if search and search.strip():
        expression = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"request_id": expression},
            {"request_type": expression},
            {"purpose": expression},
            {"resident_name": expression},
            {"submitted_by": expression},
            {"assigned_secretary_email": expression},
        ]
    documents = list(records.find(query).sort("created_at", -1).limit(50))
    return [serialize_record_request(document) for document in documents]


@app.get("/record-requests/{request_id}", response_model=RecordRequestResponse)
def get_record_request(request_id: str, current_user: dict = Depends(get_current_user)) -> RecordRequestResponse:
    collection = get_record_requests_collection()
    query = {"request_id": normalize_request_id(request_id)}
    if get_user_role(current_user) == "resident":
        query["submitted_by"] = current_user["email"]
    document = collection.find_one(query)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    return serialize_record_request(document)


@app.post("/record-requests", response_model=RecordRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_record_request(
    request_type: str = Form(...),
    purpose: str = Form(...),
    evidence: UploadFile | None = File(default=None),
    current_user: dict = Depends(get_current_user),
) -> RecordRequestResponse:
    require_roles(current_user, "resident")
    collection = get_record_requests_collection()
    now = datetime.now(UTC)
    evidence_filename, evidence_path = await save_upload_file(evidence, "record_requests")
    document = {
        "request_id": generate_request_id(),
        "request_type": request_type.strip(),
        "purpose": purpose.strip(),
        "status": "Pending",
        "resident_name": " ".join(
            part for part in [current_user.get("first_name"), current_user.get("middle_name"), current_user.get("last_name")] if part
        ),
        "purok": current_user.get("purok", ""),
        "submitted_by": current_user["email"],
        "assigned_secretary_email": None,
        "created_at": now,
        "updated_at": now,
        "evidence_filename": evidence_filename,
        "evidence_path": evidence_path,
        "status_history": [
            build_status_timeline_entry(
                status_value="Pending",
                actor_email=current_user["email"],
                notes="Request submitted by resident.",
            )
        ],
    }
    if not document["request_type"] or not document["purpose"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All required fields must be provided")
    collection.insert_one(document)
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Submitted Record Request",
        target_collection="record_requests",
        target_id=document["request_id"],
        details=f"Requested {document['request_type']}.",
    )
    return serialize_record_request(document)


@app.patch("/record-requests/{request_id}/status", response_model=RecordRequestResponse)
def update_record_request_status(
    request_id: str,
    payload: RecordStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> RecordRequestResponse:
    require_roles(current_user, "secretary", "admin")
    collection = get_record_requests_collection()
    document = collection.find_one({"request_id": request_id})
    if not document:
        document = collection.find_one({"request_id": normalize_request_id(request_id)})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    next_status = normalize_request_status(payload.status)
    if next_status not in VALID_REQUEST_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request status")
    assigned_secretary_email = document.get("assigned_secretary_email")
    requested_assignee = (payload.assigned_secretary_email or "").strip().lower() or None
    if requested_assignee:
        assigned_secretary_email = requested_assignee
    elif not assigned_secretary_email:
        assigned_secretary_email = current_user["email"]

    history_entry = build_status_timeline_entry(
        status_value=next_status,
        actor_email=current_user["email"],
        notes=(payload.notes or "").strip() or None,
    )
    collection.update_one(
        {"_id": document["_id"]},
        {
            "$set": {
                "status": next_status,
                "updated_at": datetime.now(UTC),
                "assigned_secretary_email": assigned_secretary_email,
            },
            "$push": {"status_history": history_entry},
        },
    )
    updated = collection.find_one({"_id": document["_id"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if next_status in {"Ready To Pickup", "Claimed"}:
        archive_workflow_record(
            source_type="record_request",
            source_id=updated["request_id"],
            title=f"{updated['request_type']} for {updated['resident_name']}",
            description=updated["purpose"],
            category="Certificate Archive",
            resident_name=updated["resident_name"],
            submitted_by=updated["submitted_by"],
            evidence_filename=updated.get("evidence_filename"),
            evidence_path=updated.get("evidence_path"),
            actor_email=current_user["email"],
            actor_role=get_user_role(current_user),
        )
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Updated Request Status",
        target_collection="record_requests",
        target_id=request_id,
        details=f"Request moved to {next_status} and handled by {assigned_secretary_email or current_user['email']}.",
    )
    return serialize_record_request(updated)


@app.get("/community-reports", response_model=list[CommunityReportResponse])
def list_community_reports(current_user: dict = Depends(get_current_user)) -> list[CommunityReportResponse]:
    collection = get_community_reports_collection()
    query = {}
    if get_user_role(current_user) == "resident":
        query["submitted_by"] = current_user["email"]
    documents = list(collection.find(query).sort("created_at", -1).limit(50))
    return [serialize_community_report(document) for document in documents]


@app.post("/community-reports", response_model=CommunityReportResponse, status_code=status.HTTP_201_CREATED)
async def create_community_report(
    report_type: str = Form(...),
    custom_concern: str | None = Form(default=None),
    description: str = Form(...),
    urgency: str = Form(...),
    evidence: UploadFile | None = File(default=None),
    current_user: dict = Depends(get_current_user),
) -> CommunityReportResponse:
    require_roles(current_user, "resident")
    collection = get_community_reports_collection()
    clean_report_type = report_type.strip()
    clean_custom_concern = (custom_concern or "").strip() or None
    clean_description = description.strip()
    clean_urgency = urgency.strip().title()
    if not clean_report_type or not clean_description or not clean_urgency:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All required fields must be provided")
    if clean_report_type == "Other" and not clean_custom_concern:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please specify the other concern")
    if clean_urgency not in VALID_REPORT_URGENCY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid urgency level")
    if not evidence or not evidence.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Photo evidence is required")
    if not evidence.content_type or not evidence.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incident reports require image evidence")
    evidence_filename, evidence_path = await save_upload_file(evidence, "community_reports")
    document = {
        "report_id": generate_report_id(),
        "report_type": clean_report_type,
        "custom_concern": clean_custom_concern,
        "description": clean_description,
        "urgency": clean_urgency,
        "status": "Open",
        "resident_name": " ".join(
            part for part in [current_user.get("first_name"), current_user.get("middle_name"), current_user.get("last_name")] if part
        ),
        "purok": current_user.get("purok", ""),
        "submitted_by": current_user["email"],
        "created_at": datetime.now(UTC),
        "evidence_filename": evidence_filename,
        "evidence_path": evidence_path,
    }
    collection.insert_one(document)
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Submitted Community Report",
        target_collection="community_reports",
        target_id=document["report_id"],
        details=f"Submitted {clean_report_type} report.",
    )
    return serialize_community_report(document)


@app.patch("/community-reports/{report_id}/status", response_model=CommunityReportResponse)
def update_community_report_status(
    report_id: str,
    payload: RecordStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> CommunityReportResponse:
    require_roles(current_user, "secretary", "admin")
    collection = get_community_reports_collection()
    document = collection.find_one({"report_id": report_id})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    next_status = payload.status.strip().title()
    if next_status not in VALID_REPORT_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid report status")
    collection.update_one(
        {"_id": document["_id"]},
        {"$set": {"status": next_status, "updated_at": datetime.now(UTC)}},
    )
    updated = collection.find_one({"_id": document["_id"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if next_status == "Resolved":
        archive_workflow_record(
            source_type="community_report",
            source_id=updated["report_id"],
            title=f"{updated['report_type']}: {updated.get('custom_concern') or updated['resident_name']}",
            description=updated["description"],
            category="Blotter / Incident Report",
            resident_name=updated["resident_name"],
            submitted_by=updated["submitted_by"],
            evidence_filename=updated.get("evidence_filename"),
            evidence_path=updated.get("evidence_path"),
            actor_email=current_user["email"],
            actor_role=get_user_role(current_user),
        )
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Updated Community Report",
        target_collection="community_reports",
        target_id=report_id,
        details=f"Report moved to {next_status}.",
    )
    return serialize_community_report(updated)


@app.get("/activity-logs", response_model=list[ActivityLogResponse])
def list_activity_logs(
    search: str | None = Query(default=None, max_length=120),
    actor_email: str | None = Query(default=None, max_length=254),
    target_collection: str | None = Query(default=None, max_length=80),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> list[ActivityLogResponse]:
    require_roles(current_user, "secretary", "admin")
    query: dict = {}
    if actor_email:
        query["actor_email"] = {"$regex": actor_email.strip(), "$options": "i"}
    if target_collection:
        query["target_collection"] = target_collection.strip()
    date_query = build_date_range_query(date_from, date_to)
    if date_query:
        query["timestamp"] = date_query
    if search and search.strip():
        expression = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"action": expression},
            {"details": expression},
            {"target_id": expression},
            {"target_collection": expression},
            {"actor_email": expression},
        ]

    documents = list(get_activity_logs_collection().find(query).sort("timestamp", -1).limit(200))
    return [serialize_activity_log(document) for document in documents]


@app.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(current_user: dict = Depends(get_current_user)) -> list[NotificationResponse]:
    role = get_user_role(current_user)
    notifications: list[NotificationResponse] = []

    if role == "resident":
        ready_requests = list(
            get_record_requests_collection()
            .find(
                {
                    "submitted_by": current_user["email"],
                    "status": {"$in": ["Ready To Pickup", "Claimed"]},
                }
            )
            .sort("updated_at", -1)
            .limit(10)
        )
        for request in ready_requests:
            status_value = normalize_request_status(request["status"])
            notifications.append(
                NotificationResponse(
                    notification_id=f"request-{request['request_id']}",
                    title="Document Request Update",
                    message=f"{request['request_type']} is now {status_value}.",
                    type="request-status",
                    created_at=isoformat(as_utc(request.get("updated_at", request["created_at"]))),
                    read=False,
                    related_route="/records-queue",
                )
            )
    else:
        unassigned_requests = list(
            get_record_requests_collection()
            .find({"status": {"$in": ["Pending", "In Progress"]}, "assigned_secretary_email": None})
            .sort("created_at", -1)
            .limit(10)
        )
        for request in unassigned_requests:
            notifications.append(
                NotificationResponse(
                    notification_id=f"assignment-{request['request_id']}",
                    title="Assignment Needed",
                    message=f"{request['request_type']} for {request['resident_name']} is waiting for secretary ownership.",
                    type="assignment",
                    created_at=isoformat(as_utc(request["created_at"])),
                    read=False,
                    related_route="/secretary-requests",
                )
            )

    notifications.sort(key=lambda item: item.created_at, reverse=True)
    return notifications[:10]
