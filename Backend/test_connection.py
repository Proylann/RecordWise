from __future__ import annotations

from app.config import get_settings
from app.database import ping_database


def main() -> None:
    settings = get_settings()
    ping_result = ping_database()
    print(f"Connected to MongoDB database '{settings.mongodb_db_name}'")
    print(f"Ping result: {ping_result}")


if __name__ == "__main__":
    main()
