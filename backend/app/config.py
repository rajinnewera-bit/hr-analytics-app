import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = Path(os.getenv("UPLOADS_DIR", BACKEND_DIR / "uploads")).resolve()

ALLOWED_FILE_TYPES = {
    ".csv": "csv",
    ".xlsx": "xlsx",
}

DEFAULT_LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

DEFAULT_LAN_FRONTEND_ORIGIN_REGEX = (
    r"^http://(?:localhost|127\.0\.0\.1|"
    r"192\.168(?:\.\d{1,3}){2}|"
    r"10(?:\.\d{1,3}){3}|"
    r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
    r"):3001$"
)

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()


def _parse_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


CONFIGURED_FRONTEND_ORIGINS = _parse_csv_env("CORS_ALLOW_ORIGINS")
CONFIGURED_FRONTEND_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX")

if APP_ENV == "production":
    LOCAL_FRONTEND_ORIGINS = CONFIGURED_FRONTEND_ORIGINS
    LAN_FRONTEND_ORIGIN_REGEX = CONFIGURED_FRONTEND_ORIGIN_REGEX
else:
    LOCAL_FRONTEND_ORIGINS = (
        CONFIGURED_FRONTEND_ORIGINS or DEFAULT_LOCAL_FRONTEND_ORIGINS
    )
    LAN_FRONTEND_ORIGIN_REGEX = (
        CONFIGURED_FRONTEND_ORIGIN_REGEX or DEFAULT_LAN_FRONTEND_ORIGIN_REGEX
    )
