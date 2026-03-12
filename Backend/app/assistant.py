from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any


TOKEN_PATTERN = re.compile(r"[a-z0-9']+")
DATA_DIR = Path(__file__).resolve().parent / "data"
DATASET_PATH = DATA_DIR / "chatbot_dataset.json"
MODEL_PATH = DATA_DIR / "chatbot_model.json"


ROUTE_LIBRARY: dict[str, dict[str, str]] = {
    "resident": {
        "dashboard": "/dashboard",
        "request_record": "/request-record",
        "records_queue": "/records-queue",
        "report_problem": "/report-problem",
        "profile": "/profile",
        "assistant": "/assistant",
    },
    "secretary": {
        "dashboard": "/dashboard",
        "requests": "/secretary-requests",
        "reports": "/secretary-reports",
        "archives": "/archive-records",
        "archive_views": "/certificate-incident-archives",
        "activity_logs": "/activity-logs",
        "profile": "/profile",
        "assistant": "/assistant",
    },
    "admin": {
        "dashboard": "/dashboard",
        "residents": "/admin/residents",
        "staff": "/admin/staff",
        "requests": "/admin/requests",
        "incidents": "/admin/incidents",
        "logs": "/admin/logs",
        "activities": "/admin/activities",
        "archives": "/admin/archives",
        "profile": "/profile",
        "assistant": "/assistant",
    },
}


@dataclass
class AssistantInference:
    reply: str
    matched_intent: str
    confidence: float
    route: str | None
    route_label: str | None
    suggestions: list[str]


def normalize_text(value: str) -> str:
    normalized = value.strip().lower()
    replacements = {
        "log in": "login",
        "sign in": "login",
        "sign up": "register",
        "record request": "request",
        "incident report": "report",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    return normalized


def tokenize(value: str) -> list[str]:
    return TOKEN_PATTERN.findall(normalize_text(value))


def load_dataset() -> dict[str, Any]:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Assistant dataset not found at {DATASET_PATH}")
    with DATASET_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_model() -> dict[str, Any] | None:
    if not MODEL_PATH.exists():
        return None
    with MODEL_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_model(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with MODEL_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def dot_product(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def magnitude(vector: list[float]) -> float:
    return math.sqrt(sum(value * value for value in vector))


def cosine_similarity(left: list[float], right: list[float]) -> float:
    left_size = magnitude(left)
    right_size = magnitude(right)
    if left_size == 0 or right_size == 0:
        return 0.0
    return dot_product(left, right) / (left_size * right_size)


def vectorize(tokens: list[str], vocabulary: list[str], idf_map: dict[str, float]) -> list[float]:
    counts = Counter(tokens)
    total = sum(counts.values())
    if total == 0:
        return [0.0 for _ in vocabulary]
    return [round((counts.get(token, 0) / total) * idf_map.get(token, 0.0), 8) for token in vocabulary]


def train_assistant_model() -> dict[str, Any]:
    dataset = load_dataset()
    intents = dataset.get("intents", [])
    documents: list[tuple[str, list[str]]] = []
    document_frequency: Counter[str] = Counter()

    for intent in intents:
        for example in intent.get("examples", []):
            tokens = tokenize(example)
            if not tokens:
                continue
            documents.append((intent["tag"], tokens))
            document_frequency.update(set(tokens))

    vocabulary = sorted(document_frequency.keys())
    total_documents = max(len(documents), 1)
    idf_map = {
        token: round(math.log((1 + total_documents) / (1 + document_frequency[token])) + 1, 8)
        for token in vocabulary
    }

    centroids: dict[str, list[float]] = {}
    intent_examples: dict[str, list[str]] = {}

    for intent in intents:
        tag = intent["tag"]
        example_vectors = [
            vectorize(tokenize(example), vocabulary, idf_map)
            for example in intent.get("examples", [])
            if tokenize(example)
        ]
        if example_vectors:
            centroid = [
                round(sum(vector[index] for vector in example_vectors) / len(example_vectors), 8)
                for index in range(len(vocabulary))
            ]
        else:
            centroid = [0.0 for _ in vocabulary]
        centroids[tag] = centroid
        intent_examples[tag] = intent.get("examples", [])

    trained_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    model_payload = {
        "dataset_name": dataset.get("name", "ChainWise Assistant Dataset"),
        "trained_at": trained_at,
        "vocabulary": vocabulary,
        "idf": idf_map,
        "total_intents": len(intents),
        "total_examples": sum(len(intent.get("examples", [])) for intent in intents),
        "intents": [
            {
                "tag": intent["tag"],
                "keywords": intent.get("keywords", []),
                "responses": intent.get("responses", []),
                "steps": intent.get("steps", []),
                "follow_up": intent.get("follow_up"),
                "route_key_by_role": intent.get("route_key_by_role", {}),
                "route_label_by_role": intent.get("route_label_by_role", {}),
                "allowed_roles": intent.get("allowed_roles", ["resident", "secretary", "admin"]),
                "suggestions": intent.get("suggestions", []),
                "examples": intent_examples.get(intent["tag"], []),
                "centroid": centroids[intent["tag"]],
            }
            for intent in intents
        ],
    }
    save_model(model_payload)
    return model_payload


def ensure_assistant_model() -> dict[str, Any]:
    model = load_model()
    if model is not None:
        return model
    return train_assistant_model()


def get_assistant_status() -> dict[str, Any]:
    model = ensure_assistant_model()
    return {
        "dataset_name": model["dataset_name"],
        "total_intents": int(model["total_intents"]),
        "total_examples": int(model["total_examples"]),
        "vocabulary_size": len(model.get("vocabulary", [])),
        "trained_at": model.get("trained_at"),
        "model_ready": True,
    }


def choose_response(intent: dict[str, Any], message: str) -> str:
    responses = intent.get("responses", [])
    if not responses:
        return "Please tell me what you need help with."
    index_seed = int(sha256(message.encode("utf-8")).hexdigest(), 16)
    return responses[index_seed % len(responses)]


def score_intent(message_tokens: list[str], message_vector: list[float], intent: dict[str, Any]) -> float:
    cosine = cosine_similarity(message_vector, intent.get("centroid", []))
    keywords = {token for keyword in intent.get("keywords", []) for token in tokenize(keyword)}
    keyword_hits = sum(1 for token in message_tokens if token in keywords)
    keyword_score = keyword_hits / max(len(message_tokens), 1)
    example_overlap = 0.0
    for example in intent.get("examples", []):
        example_tokens = set(tokenize(example))
        if not example_tokens:
            continue
        overlap = len(example_tokens.intersection(message_tokens)) / len(example_tokens.union(message_tokens))
        example_overlap = max(example_overlap, overlap)
    return round((cosine * 0.7) + (keyword_score * 0.15) + (example_overlap * 0.15), 6)


def resolve_route(intent: dict[str, Any], role: str) -> tuple[str | None, str | None]:
    route_key = intent.get("route_key_by_role", {}).get(role)
    route_label = intent.get("route_label_by_role", {}).get(role)
    if not route_key:
        return None, None
    route = ROUTE_LIBRARY.get(role, {}).get(route_key)
    if not route:
        return None, route_label
    return route, route_label


def build_reply(intent: dict[str, Any], role: str, message: str) -> tuple[str, str | None, str | None]:
    primary = choose_response(intent, message)
    route, route_label = resolve_route(intent, role)
    lines = [primary]

    steps = intent.get("steps", [])
    if steps:
        lines.append("Steps:")
        for index, step in enumerate(steps[:4], start=1):
            lines.append(f"{index}. {step}")

    if route and route_label:
        lines.append(f"Open {route_label} at {route}.")

    follow_up = intent.get("follow_up")
    if follow_up:
        lines.append(follow_up)

    return "\n".join(lines), route, route_label


def fallback_reply(role: str) -> AssistantInference:
    role_examples = {
        "resident": [
            "How do I request a barangay clearance?",
            "Where can I check my request status?",
            "How do I report a community problem?",
        ],
        "secretary": [
            "How do I process pending requests?",
            "Where do I upload archive records?",
            "How do I review incident reports?",
        ],
        "admin": [
            "How do I manage residents?",
            "Where can I review staff accounts?",
            "How do I open system archives?",
        ],
    }
    return AssistantInference(
        reply="I did not fully understand that yet. Ask about a task in ChainWise and I will guide you to the correct page.",
        matched_intent="fallback",
        confidence=0.0,
        route=ROUTE_LIBRARY.get(role, {}).get("assistant"),
        route_label="AI Assistant",
        suggestions=role_examples.get(role, role_examples["resident"]),
    )


def generate_assistant_reply(message: str, role: str) -> AssistantInference:
    model = ensure_assistant_model()
    vocabulary = model.get("vocabulary", [])
    idf_map = model.get("idf", {})
    normalized_role = role if role in ROUTE_LIBRARY else "resident"
    message_tokens = tokenize(message)

    if not message_tokens:
        return fallback_reply(normalized_role)

    message_vector = vectorize(message_tokens, vocabulary, idf_map)
    allowed_intents = [
        intent for intent in model.get("intents", []) if normalized_role in intent.get("allowed_roles", [])
    ]
    scored = sorted(
        ((score_intent(message_tokens, message_vector, intent), intent) for intent in allowed_intents),
        key=lambda item: item[0],
        reverse=True,
    )
    best_score, best_intent = scored[0] if scored else (0.0, None)

    if best_intent is None or best_score < 0.18:
        return fallback_reply(normalized_role)

    reply, route, route_label = build_reply(best_intent, normalized_role, message)
    suggestions = best_intent.get("suggestions", [])[:3]
    return AssistantInference(
        reply=reply,
        matched_intent=best_intent.get("tag", "fallback"),
        confidence=round(best_score, 3),
        route=route,
        route_label=route_label,
        suggestions=suggestions,
    )
