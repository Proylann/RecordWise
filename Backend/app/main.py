from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from random import choice, randint
from uuid import uuid4

import jwt
from eth_account import Account
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from web3 import Web3

from app.assistant import ensure_assistant_model, generate_assistant_reply, get_assistant_status, train_assistant_model
from app.config import get_settings
from app.database import get_database, ping_database
from app.mailer import send_email
from app.schemas import (
    ActivitySummaryResponse,
    ActivityLogResponse,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantStatusResponse,
    AssistantTrainResponse,
    AdminUserCreateRequest,
    AdminUserResponse,
    AdminUserUpdateRequest,
    ArchiveVerificationResponse,
    AuditEntryResponse,
    AuthResponse,
    CaptchaResponse,
    CommunityReportResponse,
    LoginVerifyRequest,
    LoginRequest,
    MessageResponse,
    MfaCodeRequest,
    MfaSetupResponse,
    NotificationResponse,
    PendingAuthResponse,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetVerifyRequest,
    ProfileUpdateRequest,
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
    create_access_token,
    decode_access_token,
    generate_email_code,
    generate_session_id,
    hash_password,
    verify_password,
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


@app.on_event("startup")
def startup_tasks() -> None:
    ensure_default_admin_account()
    ensure_assistant_model()


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


def ensure_default_admin_account() -> None:
    users = get_users_collection()
    admin_email = "admin@recordwise.com"
    admin_password = "@Password12345"
    existing = users.find_one({"email": admin_email})
    now = datetime.now(UTC)

    if existing:
        updates: dict = {"updated_at": now}
        if get_user_role(existing) != "admin":
            updates["role"] = "admin"
        if existing.get("archived"):
            updates["archived"] = False
            updates["archived_at"] = None
        users.update_one({"_id": existing["_id"]}, {"$set": updates})
        return

    users.insert_one(
        {
            "first_name": "System",
            "middle_name": "Admin",
            "last_name": "RecordWise",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "purok": None,
            "role": "admin",
            "mfa_enabled": False,
            "archived": False,
            "archived_at": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    log_activity(
        actor_email=admin_email,
        actor_role="admin",
        action="Seeded Admin Account",
        target_collection="users",
        target_id=admin_email,
        details="Default admin account prepared for administrative access.",
    )


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


def get_mfa_codes_collection():
    collection = get_database()["mfa_codes"]
    collection.create_index("expires_at", expireAfterSeconds=0)
    collection.create_index([("email", 1), ("purpose", 1), ("created_at", -1)])
    return collection


def get_pending_login_collection():
    collection = get_database()["pending_logins"]
    collection.create_index("login_ticket", unique=True)
    collection.create_index("expires_at", expireAfterSeconds=0)
    collection.create_index([("email", 1), ("created_at", -1)])
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


def is_mfa_required_for_user(document: dict) -> bool:
    return get_user_role(document) == "secretary" or bool(document.get("mfa_enabled"))


def serialize_user(document: dict) -> UserResponse:
    return UserResponse(
        email=document["email"],
        first_name=document.get("first_name"),
        middle_name=document.get("middle_name"),
        last_name=document.get("last_name"),
        purok=document.get("purok"),
        mfa_enabled=is_mfa_required_for_user(document),
        role=get_user_role(document),
    )


def serialize_admin_user(document: dict) -> AdminUserResponse:
    return AdminUserResponse(
        email=document["email"],
        first_name=document.get("first_name"),
        middle_name=document.get("middle_name"),
        last_name=document.get("last_name"),
        purok=document.get("purok"),
        mfa_enabled=is_mfa_required_for_user(document),
        role=get_user_role(document),
        archived=bool(document.get("archived", False)),
        created_at=isoformat(as_utc(document["created_at"])) if document.get("created_at") else None,
        updated_at=isoformat(as_utc(document["updated_at"])) if document.get("updated_at") else None,
        archived_at=isoformat(as_utc(document["archived_at"])) if document.get("archived_at") else None,
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
        blockchain_tx_hash=document.get("blockchain_tx_hash"),
        blockchain_contract_address=document.get("blockchain_contract_address"),
        blockchain_network_id=document.get("blockchain_network_id"),
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
SPECIAL_WEEKLY_REQUEST_LIMITS = {
    "Business Clearance": 1,
}
DEFAULT_WEEKLY_REQUEST_LIMIT = 2
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


def get_blockchain_contract_details() -> tuple[list[dict], str]:
    artifact_path = Path(__file__).resolve().parent.parent.parent / "blockchain" / "build" / "contracts" / "BarangayRecords.json"
    if not artifact_path.exists():
        raise RuntimeError("BarangayRecords artifact not found. Compile and migrate the Truffle contract first.")

    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    contract_address = settings.blockchain_contract_address
    if not contract_address:
        network_config = artifact.get("networks", {}).get(str(settings.ganache_network_id))
        if not network_config or not network_config.get("address"):
            raise RuntimeError(
                f"BarangayRecords is not deployed for network {settings.ganache_network_id}. Run Truffle migrate first."
            )
        contract_address = str(network_config["address"])

    abi = artifact.get("abi")
    if not abi:
        raise RuntimeError("BarangayRecords ABI is missing from the compiled artifact.")

    return abi, contract_address


def register_record_on_chain(
    *,
    record_id: str,
    resident_name: str,
    document_type: str,
    document_hash: str,
    ipfs_cid: str | None,
) -> tuple[str, str]:
    if not settings.ganache_private_key:
        raise RuntimeError("GANACHE_PRIVATE_KEY is not configured in Backend/.env.")

    abi, contract_address = get_blockchain_contract_details()
    web3 = Web3(Web3.HTTPProvider(settings.ganache_rpc_url))
    if not web3.is_connected():
        raise RuntimeError(f"Unable to connect to Ganache at {settings.ganache_rpc_url}.")

    account = Account.from_key(settings.ganache_private_key)
    contract = web3.eth.contract(address=Web3.to_checksum_address(contract_address), abi=abi)
    nonce = web3.eth.get_transaction_count(account.address)
    chain_id = web3.eth.chain_id

    transaction = contract.functions.addRecord(
        record_id,
        resident_name,
        document_type,
        document_hash,
        ipfs_cid or "",
    ).build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "gas": settings.ganache_gas,
            "gasPrice": settings.ganache_gas_price,
            "chainId": chain_id,
        }
    )

    signed_transaction = web3.eth.account.sign_transaction(transaction, private_key=settings.ganache_private_key)
    raw_transaction = getattr(signed_transaction, "raw_transaction", None)
    if raw_transaction is None:
        raw_transaction = getattr(signed_transaction, "rawTransaction", None)
    if raw_transaction is None:
        raise RuntimeError("Unable to extract the signed blockchain transaction payload.")
    tx_hash = web3.eth.send_raw_transaction(raw_transaction)
    receipt = web3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt.status != 1:
        raise RuntimeError("Blockchain transaction failed while storing the uploaded record.")

    return web3.to_hex(tx_hash), contract_address


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


def get_weekly_request_limit(request_type: str) -> int:
    return SPECIAL_WEEKLY_REQUEST_LIMITS.get(request_type.strip(), DEFAULT_WEEKLY_REQUEST_LIMIT)


def enforce_weekly_request_limit(*, collection, submitted_by: str, request_type: str, now: datetime) -> None:
    request_window_start = now - timedelta(days=7)
    normalized_request_type = request_type.strip()
    weekly_limit = get_weekly_request_limit(normalized_request_type)
    request_count = collection.count_documents(
        {
            "submitted_by": submitted_by,
            "request_type": normalized_request_type,
            "created_at": {"$gte": request_window_start},
        }
    )
    if request_count >= weekly_limit:
        if weekly_limit == 1:
            detail = f"You can only submit 1 {normalized_request_type} request every 7 days."
        else:
            detail = f"You can only submit {weekly_limit} {normalized_request_type} requests every 7 days."
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)


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
        detail="MFA code required. A verification code was sent to your email.",
    )


def smtp_not_configured_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="SMTP is not configured for MFA delivery.",
    )


def captcha_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Captcha.",
    )


def register_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Please review the registration details and try again.",
    )


def account_exists_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="An account with that email already exists.",
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


def send_mfa_code(email: str, purpose: str) -> None:
    collection = get_mfa_codes_collection()
    collection.delete_many({"email": email, "purpose": purpose})
    now = datetime.now(UTC)
    code = generate_email_code()
    expires_at = now + timedelta(minutes=settings.mfa_code_ttl_minutes)
    collection.insert_one(
        {
            "email": email,
            "purpose": purpose,
            "code": code,
            "created_at": now,
            "expires_at": expires_at,
        }
    )
    purpose_labels = {
        "login": "sign in",
        "enable_mfa": "enable multi-factor authentication",
        "disable_mfa": "disable multi-factor authentication",
        "password_reset": "reset your password",
    }
    try:
        send_email(
            to_email=email,
            subject="RecordWise verification code",
            body=(
                f"Your RecordWise verification code is {code}.\n\n"
                f"Use this code to {purpose_labels.get(purpose, 'complete verification')}.\n"
                f"This code expires in {settings.mfa_code_ttl_minutes} minutes."
            ),
        )
    except RuntimeError as exc:
        collection.delete_many({"email": email, "purpose": purpose})
        raise smtp_not_configured_error() from exc
    except Exception as exc:  # pragma: no cover
        collection.delete_many({"email": email, "purpose": purpose})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to deliver MFA code email.",
        ) from exc


def verify_mfa_code(*, email: str, purpose: str, code: str) -> bool:
    collection = get_mfa_codes_collection()
    document = collection.find_one({"email": email, "purpose": purpose, "code": code.strip()})
    if not document:
        return False
    if as_utc(document["expires_at"]) <= datetime.now(UTC):
        collection.delete_one({"_id": document["_id"]})
        return False
    collection.delete_one({"_id": document["_id"]})
    return True


def request_password_reset_code(email: str) -> None:
    users = get_users_collection()
    user_document = users.find_one({"email": email, "archived": {"$ne": True}})
    if not user_document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    send_mfa_code(email, "password_reset")


def login_error_with_attempts(attempts_used: int, message_prefix: str = "Invalid login credentials.") -> HTTPException:
    attempts_left = max(settings.login_rate_limit_attempts - attempts_used, 0)
    if attempts_left == 0:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked for {settings.login_rate_limit_window_minutes} minutes due to too many failed login attempts.",
        )

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"{message_prefix} {attempts_left} trial(s) left.",
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
    if user_document.get("archived"):
        sessions.update_one({"_id": session_document["_id"]}, {"$set": {"revoked_at": now, "expires_at": now}})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This account is archived")

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
        first_error = exc.errors()[0].get("msg") if exc.errors() else None
        if first_error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(first_error))
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


@app.post("/auth/login", response_model=AuthResponse | PendingAuthResponse)
def login(payload: LoginRequest, request: Request) -> AuthResponse | PendingAuthResponse:
    users = get_users_collection()
    pending_logins = get_pending_login_collection()
    email = normalize_email(payload.email)
    ip_address = get_client_ip(request)

    enforce_login_rate_limit(email, ip_address)
    captcha_challenge = validate_captcha(payload.captcha_id, payload.captcha_answer)

    user_document = users.find_one({"email": email})
    if not user_document or not verify_password(payload.password, user_document.get("password_hash", "")):
        invalidate_captcha(captcha_challenge)
        attempts_used = record_failed_login(email, ip_address)
        raise login_error_with_attempts(attempts_used)
    if user_document.get("archived"):
        invalidate_captcha(captcha_challenge)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is archived")

    mfa_required = is_mfa_required_for_user(user_document)
    if mfa_required:
        if not payload.mfa_code:
            pending_logins.delete_many({"email": email})
            expires_at = datetime.now(UTC) + timedelta(minutes=settings.mfa_code_ttl_minutes)
            login_ticket = uuid4().hex
            pending_logins.insert_one(
                {
                    "login_ticket": login_ticket,
                    "email": email,
                    "ip_address": ip_address,
                    "created_at": datetime.now(UTC),
                    "expires_at": expires_at,
                }
            )
            send_mfa_code(email, "login")
            mark_captcha_used(captcha_challenge)
            return PendingAuthResponse(
                login_ticket=login_ticket,
                email=email,
                expires_at=isoformat(expires_at),
                message="Verification code required. A code was sent to your email.",
            )
        if not verify_mfa_code(email=email, purpose="login", code=payload.mfa_code):
            invalidate_captcha(captcha_challenge)
            attempts_used = record_failed_login(email, ip_address)
            raise login_error_with_attempts(attempts_used)

    mark_captcha_used(captcha_challenge)
    clear_failed_logins(email, ip_address)
    return create_session(user_document)


@app.post("/auth/login/verify", response_model=AuthResponse)
def verify_login(payload: LoginVerifyRequest) -> AuthResponse:
    pending_logins = get_pending_login_collection()
    pending_login = pending_logins.find_one({"login_ticket": payload.login_ticket})
    if not pending_login:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Login verification has expired. Please sign in again.")

    if as_utc(pending_login["expires_at"]) <= datetime.now(UTC):
        pending_logins.delete_one({"_id": pending_login["_id"]})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Login verification has expired. Please sign in again.")

    email = pending_login["email"]
    ip_address = pending_login.get("ip_address", "unknown")
    user_document = get_users_collection().find_one({"email": email})
    if not user_document or user_document.get("archived"):
        pending_logins.delete_one({"_id": pending_login["_id"]})
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Login verification is no longer valid. Please sign in again.")

    if not verify_mfa_code(email=email, purpose="login", code=payload.code):
        attempts_used = record_failed_login(email, ip_address)
        raise login_error_with_attempts(attempts_used, "Invalid or expired OTP.")

    pending_logins.delete_one({"_id": pending_login["_id"]})
    clear_failed_logins(email, ip_address)
    return create_session(user_document)


@app.post("/auth/logout", response_model=MessageResponse)
def logout(current_user: dict = Depends(get_current_user)) -> MessageResponse:
    get_sessions_collection().update_one(
        {"session_id": current_user["session_id"]},
        {"$set": {"revoked_at": datetime.now(UTC), "expires_at": datetime.now(UTC)}},
    )
    return MessageResponse(message="Logged out successfully")


@app.post("/auth/password-reset/request", response_model=MessageResponse)
def password_reset_request(payload: PasswordResetRequest) -> MessageResponse:
    email = normalize_email(payload.email)
    request_password_reset_code(email)
    return MessageResponse(message="Password reset code was sent to the email address.")


@app.post("/auth/password-reset/verify", response_model=MessageResponse)
def password_reset_verify(payload: PasswordResetVerifyRequest) -> MessageResponse:
    email = normalize_email(payload.email)
    users = get_users_collection()
    latest_user = users.find_one({"email": email, "archived": {"$ne": True}})
    if not latest_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if not verify_mfa_code(email=email, purpose="password_reset", code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code")
    get_mfa_codes_collection().delete_many({"email": email, "purpose": "password_reset_verified"})
    get_mfa_codes_collection().insert_one(
        {
            "email": email,
            "purpose": "password_reset_verified",
            "code": payload.code.strip(),
            "created_at": datetime.now(UTC),
            "expires_at": datetime.now(UTC) + timedelta(minutes=settings.mfa_code_ttl_minutes),
        }
    )
    return MessageResponse(message="OTP verified. You can now change your password.")


@app.post("/auth/password-reset/confirm", response_model=MessageResponse)
def password_reset_confirm(payload: PasswordResetConfirmRequest) -> MessageResponse:
    users = get_users_collection()
    email = normalize_email(payload.email)
    latest_user = users.find_one({"email": email, "archived": {"$ne": True}})
    if not latest_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if not verify_mfa_code(email=email, purpose="password_reset_verified", code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset code")

    users.update_one(
        {"_id": latest_user["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(UTC)}},
    )
    get_sessions_collection().update_many(
        {"user_email": email, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(UTC), "expires_at": datetime.now(UTC)}},
    )
    log_activity(
        actor_email=email,
        actor_role=get_user_role(latest_user),
        action="Reset Password",
        target_collection="users",
        target_id=email,
        details="Password reset completed using emailed OTP.",
    )
    return MessageResponse(message="Password reset successful. You may now sign in.")


@app.post("/auth/mfa/setup", response_model=MfaSetupResponse)
def setup_mfa(current_user: dict = Depends(get_current_user)) -> MfaSetupResponse:
    send_mfa_code(current_user["email"], "enable_mfa")
    return MfaSetupResponse(
        message="A verification code was sent to your email address.",
        expires_in_minutes=settings.mfa_code_ttl_minutes,
    )


@app.post("/auth/mfa/enable", response_model=MessageResponse)
def enable_mfa(payload: MfaCodeRequest, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    users = get_users_collection()
    if not verify_mfa_code(email=current_user["email"], purpose="enable_mfa", code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    users.update_one(
        {"email": current_user["email"]},
        {
            "$set": {"mfa_enabled": True, "updated_at": datetime.now(UTC)},
        },
    )
    return MessageResponse(message="MFA has been enabled")


@app.post("/auth/mfa/disable", response_model=MessageResponse)
def disable_mfa(payload: MfaCodeRequest, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    if get_user_role(current_user) == "secretary":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Secretary accounts must keep MFA enabled")

    users = get_users_collection()
    if not verify_mfa_code(email=current_user["email"], purpose="disable_mfa", code=payload.code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid MFA code")

    users.update_one(
        {"email": current_user["email"]},
        {
            "$set": {"mfa_enabled": False, "updated_at": datetime.now(UTC)},
        },
    )
    return MessageResponse(message="MFA has been disabled")


@app.post("/auth/mfa/disable/request", response_model=MessageResponse)
def request_disable_mfa(current_user: dict = Depends(get_current_user)) -> MessageResponse:
    if get_user_role(current_user) == "secretary":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Secretary accounts must keep MFA enabled")

    send_mfa_code(current_user["email"], "disable_mfa")
    return MessageResponse(message="A verification code was sent to your email address.")


@app.patch("/auth/profile", response_model=UserResponse)
def update_profile(payload: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)) -> UserResponse:
    users = get_users_collection()
    users.update_one(
        {"email": current_user["email"]},
        {
            "$set": {
                "first_name": payload.first_name,
                "middle_name": payload.middle_name,
                "last_name": payload.last_name,
                "updated_at": datetime.now(UTC),
            }
        },
    )
    updated = users.find_one({"email": current_user["email"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(updated),
        action="Updated Profile",
        target_collection="users",
        target_id=current_user["email"],
        details="Account name details updated from profile settings.",
    )
    return serialize_user(updated)


@app.post("/auth/change-password", response_model=MessageResponse)
def change_password(payload: PasswordChangeRequest, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    users = get_users_collection()
    latest_user = users.find_one({"email": current_user["email"]})
    if not latest_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(payload.current_password, latest_user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different from the current password")

    users.update_one(
        {"_id": latest_user["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(UTC)}},
    )
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(latest_user),
        action="Changed Password",
        target_collection="users",
        target_id=current_user["email"],
        details="Password updated from profile settings.",
    )
    return MessageResponse(message="Password updated successfully")


@app.get("/admin/summary", response_model=ActivitySummaryResponse)
def get_admin_summary(current_user: dict = Depends(get_current_user)) -> ActivitySummaryResponse:
    require_roles(current_user, "admin")
    users = get_users_collection()
    return ActivitySummaryResponse(
        residents=users.count_documents({"role": "resident", "archived": {"$ne": True}}),
        staff=users.count_documents({"role": {"$in": ["secretary", "admin"]}, "archived": {"$ne": True}}),
        requests=get_record_requests_collection().count_documents({}),
        incidents=get_community_reports_collection().count_documents({}),
        logs=get_activity_logs_collection().count_documents({}),
        archives=get_security_records_collection().count_documents({}),
        archived_users=users.count_documents({"archived": True}),
    )


@app.get("/admin/users", response_model=list[AdminUserResponse])
def list_admin_users(
    role: str | None = Query(default=None, max_length=20),
    search: str | None = Query(default=None, max_length=120),
    archived: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
) -> list[AdminUserResponse]:
    require_roles(current_user, "admin")
    query: dict = {"archived": True} if archived else {"archived": {"$ne": True}}
    if role and role.strip().lower() in VALID_USER_ROLES:
        query["role"] = role.strip().lower()
    if search and search.strip():
        expression = {"$regex": search.strip(), "$options": "i"}
        query["$or"] = [
            {"email": expression},
            {"first_name": expression},
            {"middle_name": expression},
            {"last_name": expression},
            {"purok": expression},
            {"role": expression},
        ]
    documents = list(get_users_collection().find(query).sort("created_at", -1).limit(200))
    return [serialize_admin_user(document) for document in documents]


@app.post("/admin/users", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_admin_user(payload: AdminUserCreateRequest, current_user: dict = Depends(get_current_user)) -> AdminUserResponse:
    require_roles(current_user, "admin")
    users = get_users_collection()
    email = normalize_email(payload.email)
    if users.find_one({"email": email}):
        raise account_exists_error()
    now = datetime.now(UTC)
    document = {
        "first_name": payload.first_name,
        "middle_name": payload.middle_name,
        "last_name": payload.last_name,
        "email": email,
        "password_hash": hash_password(payload.password),
        "purok": payload.purok,
        "role": payload.role,
        "mfa_enabled": payload.role == "secretary",
        "archived": False,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }
    users.insert_one(document)
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Created User Account",
        target_collection="users",
        target_id=email,
        details=f"Created {payload.role} account for {payload.first_name} {payload.last_name}.",
    )
    return serialize_admin_user(document)


@app.patch("/admin/users/{email:path}", response_model=AdminUserResponse)
def update_admin_user(
    email: str,
    payload: AdminUserUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> AdminUserResponse:
    require_roles(current_user, "admin")
    users = get_users_collection()
    normalized_email = normalize_email(email)
    document = users.find_one({"email": normalized_email})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if normalized_email == "admin@recordwise.com" and payload.archived:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default admin account cannot be archived")
    now = datetime.now(UTC)
    updates: dict = {
        "first_name": payload.first_name,
        "middle_name": payload.middle_name,
        "last_name": payload.last_name,
        "purok": payload.purok,
        "role": payload.role,
        "archived": payload.archived,
        "mfa_enabled": payload.role == "secretary" or bool(document.get("mfa_enabled", False)),
        "updated_at": now,
        "archived_at": now if payload.archived else None,
    }
    if payload.password:
        updates["password_hash"] = hash_password(payload.password)
    users.update_one({"_id": document["_id"]}, {"$set": updates})
    updated = users.find_one({"_id": document["_id"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Updated User Account",
        target_collection="users",
        target_id=normalized_email,
        details=f"Updated {payload.role} account details. Archived={payload.archived}.",
    )
    return serialize_admin_user(updated)


@app.delete("/admin/users/{email:path}/permanent", response_model=MessageResponse)
def delete_admin_user(email: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    normalized_email = normalize_email(email)
    if normalized_email == "admin@recordwise.com":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default admin account cannot be deleted")
    if normalized_email == normalize_email(current_user["email"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your current account")
    result = get_users_collection().delete_one({"email": normalized_email})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Deleted User Account",
        target_collection="users",
        target_id=normalized_email,
        details="User account permanently deleted from the admin workspace.",
    )
    return MessageResponse(message="User deleted successfully")


@app.delete("/admin/users/{email:path}", response_model=MessageResponse)
def archive_admin_user(email: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    normalized_email = normalize_email(email)
    if normalized_email == "admin@recordwise.com":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Default admin account cannot be archived")
    result = get_users_collection().update_one(
        {"email": normalized_email},
        {"$set": {"archived": True, "archived_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Archived User Account",
        target_collection="users",
        target_id=normalized_email,
        details="User account moved to archives.",
    )
    return MessageResponse(message="User archived successfully")


@app.post("/admin/users/{email:path}/restore", response_model=AdminUserResponse)
def restore_admin_user(email: str, current_user: dict = Depends(get_current_user)) -> AdminUserResponse:
    require_roles(current_user, "admin")
    normalized_email = normalize_email(email)
    users = get_users_collection()
    document = users.find_one({"email": normalized_email})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    users.update_one(
        {"_id": document["_id"]},
        {"$set": {"archived": False, "archived_at": None, "updated_at": datetime.now(UTC)}},
    )
    updated = users.find_one({"_id": document["_id"]})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Restored User Account",
        target_collection="users",
        target_id=normalized_email,
        details="User account restored from archives.",
    )
    return serialize_admin_user(updated)


@app.delete("/admin/record-requests/{request_id}", response_model=MessageResponse)
def delete_record_request(request_id: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    result = get_record_requests_collection().delete_one({"request_id": normalize_request_id(request_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Deleted Record Request",
        target_collection="record_requests",
        target_id=normalize_request_id(request_id),
        details="Request deleted from admin workspace.",
    )
    return MessageResponse(message="Request deleted successfully")


@app.delete("/admin/community-reports/{report_id}", response_model=MessageResponse)
def delete_community_report(report_id: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    result = get_community_reports_collection().delete_one({"report_id": report_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Deleted Community Report",
        target_collection="community_reports",
        target_id=report_id,
        details="Incident report deleted from admin workspace.",
    )
    return MessageResponse(message="Incident deleted successfully")


@app.delete("/admin/security-records/{record_id}", response_model=MessageResponse)
def delete_security_record(record_id: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    result = get_security_records_collection().delete_one({"record_id": record_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archive record not found")
    log_activity(
        actor_email=current_user["email"],
        actor_role="admin",
        action="Deleted Archive Record",
        target_collection="security_records",
        target_id=record_id,
        details="Archive record removed from the system.",
    )
    return MessageResponse(message="Archive deleted successfully")


@app.delete("/admin/activity-logs/{log_id}", response_model=MessageResponse)
def delete_activity_log(log_id: str, current_user: dict = Depends(get_current_user)) -> MessageResponse:
    require_roles(current_user, "admin")
    result = get_activity_logs_collection().delete_one({"log_id": log_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    return MessageResponse(message="Log deleted successfully")


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
        "blockchain_tx_hash": None,
        "blockchain_contract_address": None,
        "blockchain_network_id": None,
        "insights": insights,
        "audit_trail": [audit_entry],
    }
    try:
        blockchain_tx_hash, contract_address = register_record_on_chain(
            record_id=record_id,
            resident_name=clean_resident_name,
            document_type=clean_category,
            document_hash=record_hash,
            ipfs_cid=evidence_path,
        )
    except RuntimeError as error:
        if evidence_path:
            stored_file = MEDIA_DIR / evidence_path
            if stored_file.exists():
                stored_file.unlink()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error

    record_document["blockchain_tx_hash"] = blockchain_tx_hash
    record_document["blockchain_contract_address"] = contract_address
    record_document["blockchain_network_id"] = settings.ganache_network_id
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
    clean_request_type = request_type.strip()
    clean_purpose = purpose.strip()

    if not clean_request_type or not clean_purpose:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All required fields must be provided")

    enforce_weekly_request_limit(
        collection=collection,
        submitted_by=current_user["email"],
        request_type=clean_request_type,
        now=now,
    )

    evidence_filename, evidence_path = await save_upload_file(evidence, "record_requests")
    document = {
        "request_id": generate_request_id(),
        "request_type": clean_request_type,
        "purpose": clean_purpose,
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
    role = get_user_role(current_user)
    query: dict = {"actor_email": current_user["email"]} if role == "secretary" else {}
    if actor_email:
        if role == "secretary":
            requested_actor_email = normalize_email(actor_email)
            if requested_actor_email != current_user["email"]:
                return []
            query["actor_email"] = current_user["email"]
        else:
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


@app.get("/assistant/status", response_model=AssistantStatusResponse)
def get_assistant_model_status(current_user: dict = Depends(get_current_user)) -> AssistantStatusResponse:
    return AssistantStatusResponse(**get_assistant_status())


@app.post("/assistant/train", response_model=AssistantTrainResponse)
def retrain_assistant_model(current_user: dict = Depends(get_current_user)) -> AssistantTrainResponse:
    require_roles(current_user, "admin")
    train_assistant_model()
    status_payload = get_assistant_status()
    log_activity(
        actor_email=current_user["email"],
        actor_role=get_user_role(current_user),
        action="Retrained AI Assistant",
        target_collection="assistant_model",
        target_id="chainwise-local-assistant",
        details="Rebuilt the local assistant model from the custom dataset.",
    )
    return AssistantTrainResponse(
        message="Assistant model retrained successfully.",
        status=AssistantStatusResponse(**status_payload),
    )


@app.post("/assistant/chat", response_model=AssistantChatResponse)
def chat_with_assistant(
    payload: AssistantChatRequest,
    current_user: dict = Depends(get_current_user),
) -> AssistantChatResponse:
    inference = generate_assistant_reply(payload.message, get_user_role(current_user))
    return AssistantChatResponse(
        reply=inference.reply,
        matched_intent=inference.matched_intent,
        confidence=inference.confidence,
        route=inference.route,
        route_label=inference.route_label,
        suggestions=inference.suggestions,
    )
