from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.security import validate_password_policy

VALID_PUROKS = {f"Purok {number}" for number in range(1, 8)}
VALID_USER_ROLES = {"admin", "secretary", "resident"}
NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z\s'.-]*$")


def validate_person_name(value: str, field_label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_label} is required")
    if not NAME_PATTERN.fullmatch(cleaned):
        raise ValueError(f"{field_label} may only contain letters, spaces, apostrophes, periods, and hyphens")
    return cleaned


class RegisterRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    purok: str = Field(min_length=7, max_length=20)
    password: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def validate_password_strength(self) -> "RegisterRequest":
        validate_password_policy(self.password)
        return self

    @model_validator(mode="after")
    def validate_purok(self) -> "RegisterRequest":
        if self.purok.strip() not in VALID_PUROKS:
            raise ValueError("Invalid purok selection")
        self.first_name = validate_person_name(self.first_name, "First name")
        self.middle_name = validate_person_name(self.middle_name, "Middle name")
        self.last_name = validate_person_name(self.last_name, "Last name")
        return self


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    captcha_id: str = Field(min_length=1, max_length=128)
    captcha_answer: str = Field(min_length=1, max_length=16)
    mfa_code: str | None = Field(default=None, min_length=6, max_length=12)


class UserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    purok: str | None = None
    mfa_enabled: bool = False
    role: str = "resident"


class AuthResponse(BaseModel):
    token: str
    expires_at: str
    user: UserResponse


class CaptchaResponse(BaseModel):
    captcha_id: str
    question: str
    expires_at: str


class MessageResponse(BaseModel):
    message: str


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class MfaCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=12)


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    action: str
    actor_email: str
    timestamp: str
    notes: str | None = None
    status: str | None = None


class StatusTimelineEntryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: str
    timestamp: str
    actor_email: str
    notes: str | None = None


class RecordInsightResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    suggested_category: str | None = None
    duplicate_warning: str | None = None
    completeness_score: int
    anomaly_flags: list[str] = Field(default_factory=list)
    recommended_action: str


class SecurityRecordResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    record_id: str
    title: str
    description: str
    category: str
    risk_level: str
    resident_name: str
    status: str
    created_at: str
    updated_at: str
    submitted_by: str | None = None
    evidence_filename: str | None = None
    evidence_url: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    previous_hash: str | None = None
    record_hash: str
    blockchain_tx_hash: str | None = None
    blockchain_contract_address: str | None = None
    blockchain_network_id: int | None = None
    insights: RecordInsightResponse
    audit_trail: list[AuditEntryResponse] = Field(default_factory=list)


class RecordListResponse(BaseModel):
    records: list[SecurityRecordResponse]
    total: int


class RecordStatusUpdateRequest(BaseModel):
    status: str = Field(min_length=3, max_length=32)
    notes: str | None = Field(default=None, max_length=250)
    assigned_secretary_email: str | None = Field(default=None, max_length=254)


class RecordRequestResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    request_id: str
    request_type: str
    purpose: str
    status: str
    resident_name: str
    purok: str
    submitted_by: str
    created_at: str
    updated_at: str
    assigned_secretary_email: str | None = None
    evidence_filename: str | None = None
    evidence_url: str | None = None
    status_history: list[StatusTimelineEntryResponse] = Field(default_factory=list)


class CommunityReportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    report_id: str
    report_type: str
    custom_concern: str | None = None
    description: str
    urgency: str
    status: str
    resident_name: str
    purok: str
    submitted_by: str
    created_at: str
    evidence_filename: str | None = None
    evidence_url: str | None = None


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    log_id: str
    actor_email: str
    actor_role: str
    action: str
    target_collection: str
    target_id: str
    details: str
    timestamp: str


class NotificationResponse(BaseModel):
    notification_id: str
    title: str
    message: str
    type: str
    created_at: str
    read: bool = False
    related_route: str | None = None


class ArchiveVerificationResponse(BaseModel):
    exists: bool
    verified: bool
    record_id: str | None = None
    title: str | None = None
    category: str | None = None
    created_at: str | None = None
    resident_name: str | None = None
    details: str


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    email: str
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    purok: str | None = None
    mfa_enabled: bool = False
    role: str = "resident"
    archived: bool = False
    created_at: str | None = None
    updated_at: str | None = None
    archived_at: str | None = None


class AdminUserCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    purok: str | None = Field(default=None, max_length=20)
    password: str = Field(min_length=12, max_length=128)
    role: str = Field(default="resident", min_length=5, max_length=20)

    @model_validator(mode="after")
    def validate_values(self) -> "AdminUserCreateRequest":
        validate_password_policy(self.password)
        self.first_name = validate_person_name(self.first_name, "First name")
        self.middle_name = validate_person_name(self.middle_name, "Middle name")
        self.last_name = validate_person_name(self.last_name, "Last name")
        self.role = self.role.strip().lower()
        if self.role not in VALID_USER_ROLES:
            raise ValueError("Invalid role selection")
        if self.role == "resident":
            if not self.purok or self.purok.strip() not in VALID_PUROKS:
                raise ValueError("Resident accounts require a valid purok")
            self.purok = self.purok.strip()
        else:
            self.purok = self.purok.strip() if self.purok and self.purok.strip() in VALID_PUROKS else None
        return self


class AdminUserUpdateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    purok: str | None = Field(default=None, max_length=20)
    password: str | None = Field(default=None, min_length=12, max_length=128)
    role: str = Field(default="resident", min_length=5, max_length=20)
    archived: bool = False

    @model_validator(mode="after")
    def validate_values(self) -> "AdminUserUpdateRequest":
        if self.password:
            validate_password_policy(self.password)
        self.first_name = validate_person_name(self.first_name, "First name")
        self.middle_name = validate_person_name(self.middle_name, "Middle name")
        self.last_name = validate_person_name(self.last_name, "Last name")
        self.role = self.role.strip().lower()
        if self.role not in VALID_USER_ROLES:
            raise ValueError("Invalid role selection")
        if self.role == "resident":
            if not self.purok or self.purok.strip() not in VALID_PUROKS:
                raise ValueError("Resident accounts require a valid purok")
            self.purok = self.purok.strip()
        else:
            self.purok = self.purok.strip() if self.purok and self.purok.strip() in VALID_PUROKS else None
        return self


class ActivitySummaryResponse(BaseModel):
    residents: int
    staff: int
    requests: int
    incidents: int
    logs: int
    archives: int
    archived_users: int


class AssistantStatusResponse(BaseModel):
    dataset_name: str
    total_intents: int
    total_examples: int
    vocabulary_size: int
    trained_at: str | None = None
    model_ready: bool


class AssistantTrainResponse(BaseModel):
    message: str
    status: AssistantStatusResponse


class AssistantChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AssistantChatResponse(BaseModel):
    reply: str
    matched_intent: str
    confidence: float
    route: str | None = None
    route_label: str | None = None
    suggestions: list[str] = Field(default_factory=list)
