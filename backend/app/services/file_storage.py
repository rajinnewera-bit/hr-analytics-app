import json
import hashlib
from pathlib import Path
from shutil import copyfileobj
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.config import UPLOADS_DIR


def save_uploaded_file(file: UploadFile, analysis_type: str) -> dict[str, str]:
    upload_id = uuid4().hex
    safe_name = Path(file.filename or "uploaded_file").name.replace(" ", "_")
    saved_file_name = f"{upload_id}_{safe_name}"
    saved_file_path = UPLOADS_DIR / saved_file_name
    metadata_path = _build_metadata_path(upload_id)
    extension = Path(safe_name).suffix.lower()

    try:
        with saved_file_path.open("wb") as buffer:
            copyfileobj(file.file, buffer)

        file_hash = _hash_file(saved_file_path)

        metadata = {
            "upload_id": upload_id,
            "analysis_type": analysis_type,
            "file_path": str(saved_file_path),
            "original_file_name": file.filename or safe_name,
            "extension": extension,
            "file_hash": file_hash,
        }
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        return metadata
    except Exception as exc:
        saved_file_path.unlink(missing_ok=True)
        metadata_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save the uploaded file.",
        ) from exc


def load_uploaded_file(upload_id: str) -> dict[str, str]:
    metadata_path = _build_metadata_path(upload_id)

    if not metadata_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested upload ID was not found.",
        )

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The saved upload metadata is invalid.",
        ) from exc

    saved_file_path = Path(metadata["file_path"])
    if not saved_file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The uploaded file is no longer available.",
        )

    if not metadata.get("file_hash"):
        metadata["file_hash"] = _hash_file(saved_file_path)
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")

    return metadata


def delete_uploaded_file(upload_id: str) -> None:
    metadata_path = _build_metadata_path(upload_id)
    if not metadata_path.exists():
        return

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        metadata = {}

    file_path = Path(metadata.get("file_path", ""))
    file_path.unlink(missing_ok=True)
    metadata_path.unlink(missing_ok=True)


def _build_metadata_path(upload_id: str) -> Path:
    return UPLOADS_DIR / f"{upload_id}.json"


def _hash_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()
