from pathlib import Path
import logging
from time import perf_counter

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.config import ALLOWED_FILE_TYPES
from app.schemas.upload import (
    AttendanceMergeRequest,
    AttendanceReviewRequest,
    AttendanceSaveRequest,
    AttendanceWorkingRuleState,
    UploadResponse,
)
from app.services.attendance_rule_store_service import save_rule_state
from app.services.file_storage import delete_uploaded_file, load_uploaded_file, save_uploaded_file
from app.services.file_preview import build_file_preview, build_file_preview_with_merges

router = APIRouter()
logger = logging.getLogger(__name__)


def validate_file_extension(filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_FILE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV and XLSX files are allowed.",
        )
    return extension


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    analysis_type: str = Form("Auto Detect"),
) -> UploadResponse:
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A file name is required.",
        )

    extension = validate_file_extension(file.filename)
    selected_analysis_type = (analysis_type or "Auto Detect").strip() or "Auto Detect"
    logger.info(
        "Upload started for file=%s extension=%s analysis_type=%s",
        file.filename,
        extension,
        selected_analysis_type,
    )

    save_started_at = perf_counter()
    try:
        upload_metadata = save_uploaded_file(file, selected_analysis_type)
    finally:
        await file.close()
    logger.info(
        "Upload saved in %.2fs upload_id=%s file=%s",
        perf_counter() - save_started_at,
        upload_metadata["upload_id"],
        file.filename,
    )

    preview_started_at = perf_counter()
    try:
        response = build_file_preview(
            file_path=Path(upload_metadata["file_path"]),
            original_file_name=upload_metadata["original_file_name"],
            extension=extension,
            upload_id=upload_metadata["upload_id"],
            analysis_type=upload_metadata["analysis_type"],
            dataset_key=upload_metadata.get("file_hash", ""),
        )
        logger.info(
            "Upload processed successfully in %.2fs upload_id=%s file=%s selected_sheet=%s analysis_type=%s",
            perf_counter() - preview_started_at,
            response.upload_id,
            response.file_name,
            response.selected_sheet,
            response.analysis_type,
        )
        return response
    except HTTPException as exc:
        logger.warning(
            "Upload failed with HTTP error upload_id=%s file=%s detail=%s",
            upload_metadata["upload_id"],
            file.filename,
            exc.detail,
        )
        delete_uploaded_file(upload_metadata["upload_id"])
        raise
    except Exception as exc:
        logger.exception(
            "Upload crashed unexpectedly upload_id=%s file=%s",
            upload_metadata["upload_id"],
            file.filename,
        )
        delete_uploaded_file(upload_metadata["upload_id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected server error while processing the uploaded file.",
        ) from exc


@router.get("/upload/{upload_id}/sheet/{sheet_name:path}", response_model=UploadResponse)
async def analyze_selected_sheet(upload_id: str, sheet_name: str) -> UploadResponse:
    logger.info("Sheet analysis requested upload_id=%s sheet=%s", upload_id, sheet_name)
    upload_metadata = load_uploaded_file(upload_id)
    started_at = perf_counter()
    try:
        response = build_file_preview(
            file_path=Path(upload_metadata["file_path"]),
            original_file_name=upload_metadata["original_file_name"],
            extension=upload_metadata["extension"],
            upload_id=upload_metadata["upload_id"],
            analysis_type=upload_metadata.get("analysis_type", "Auto Detect"),
            selected_sheet=sheet_name,
            dataset_key=upload_metadata.get("file_hash", ""),
            message="Sheet analyzed successfully.",
        )
        logger.info(
            "Sheet analysis completed in %.2fs upload_id=%s selected_sheet=%s analysis_type=%s",
            perf_counter() - started_at,
            upload_id,
            response.selected_sheet,
            response.analysis_type,
        )
        return response
    except HTTPException as exc:
        logger.warning(
            "Sheet analysis failed upload_id=%s sheet=%s detail=%s",
            upload_id,
            sheet_name,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception(
            "Sheet analysis crashed unexpectedly upload_id=%s sheet=%s",
            upload_id,
            sheet_name,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected server error while analyzing the selected sheet.",
        ) from exc


@router.post("/upload/{upload_id}/attendance-review", response_model=UploadResponse)
async def review_attendance_exceptions(
    upload_id: str,
    review_request: AttendanceReviewRequest,
) -> UploadResponse:
    upload_metadata = load_uploaded_file(upload_id)
    selected_sheet = review_request.sheet_name or "CSV Data"
    logger.info(
        "Attendance review requested upload_id=%s sheet=%s decisions=%s",
        upload_id,
        selected_sheet,
        len(review_request.decisions),
    )
    started_at = perf_counter()
    try:
        response = build_file_preview(
            file_path=Path(upload_metadata["file_path"]),
            original_file_name=upload_metadata["original_file_name"],
            extension=upload_metadata["extension"],
            upload_id=upload_metadata["upload_id"],
            analysis_type=upload_metadata.get("analysis_type", "Auto Detect"),
            selected_sheet=selected_sheet,
            dataset_key=upload_metadata.get("file_hash", ""),
            message="Attendance review updated successfully.",
            attendance_review_decisions=review_request.decisions,
            attendance_policy_rules=review_request.policy_rules,
            attendance_holiday_markers=review_request.holiday_markers,
            attendance_administrative_exceptions=review_request.administrative_exceptions,
            attendance_merge_instructions=review_request.merge_instructions,
        )
        logger.info(
            "Attendance review completed in %.2fs upload_id=%s sheet=%s",
            perf_counter() - started_at,
            upload_id,
            selected_sheet,
        )
        return response
    except HTTPException as exc:
        logger.warning(
            "Attendance review failed upload_id=%s sheet=%s detail=%s",
            upload_id,
            selected_sheet,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception(
            "Attendance review crashed unexpectedly upload_id=%s sheet=%s",
            upload_id,
            selected_sheet,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected server error while applying attendance review decisions.",
        ) from exc


@router.post("/upload/{upload_id}/attendance-merge", response_model=UploadResponse)
async def apply_attendance_merge(
    upload_id: str,
    merge_request: AttendanceMergeRequest,
) -> UploadResponse:
    upload_metadata = load_uploaded_file(upload_id)
    selected_sheet = merge_request.sheet_name or "CSV Data"
    logger.info(
        "Attendance merge requested upload_id=%s sheet=%s merge_instructions=%s",
        upload_id,
        selected_sheet,
        len(merge_request.merge_instructions),
    )
    started_at = perf_counter()
    try:
        response = build_file_preview_with_merges(
            file_path=Path(upload_metadata["file_path"]),
            original_file_name=upload_metadata["original_file_name"],
            extension=upload_metadata["extension"],
            upload_id=upload_metadata["upload_id"],
            analysis_type=upload_metadata.get("analysis_type", "Auto Detect"),
            selected_sheet=selected_sheet,
            dataset_key=upload_metadata.get("file_hash", ""),
            merge_instructions=merge_request.merge_instructions,
            attendance_review_decisions=merge_request.decisions,
            attendance_policy_rules=merge_request.policy_rules,
            attendance_holiday_markers=merge_request.holiday_markers,
            attendance_administrative_exceptions=merge_request.administrative_exceptions,
            dry_run=merge_request.dry_run,
            message="Attendance merge preview generated successfully." if merge_request.dry_run else "Attendance merge applied successfully.",
        )
        logger.info(
            "Attendance merge completed in %.2fs upload_id=%s sheet=%s merge_count=%s",
            perf_counter() - started_at,
            upload_id,
            selected_sheet,
            len(merge_request.merge_instructions),
        )
        return response
    except HTTPException as exc:
        logger.warning(
            "Attendance merge failed upload_id=%s sheet=%s detail=%s",
            upload_id,
            selected_sheet,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception(
            "Attendance merge crashed unexpectedly upload_id=%s sheet=%s",
            upload_id,
            selected_sheet,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected server error while applying attendance merge.",
        ) from exc


@router.post("/upload/{upload_id}/attendance-save", response_model=UploadResponse)
async def save_attendance_working_state(
    upload_id: str,
    save_request: AttendanceSaveRequest,
) -> UploadResponse:
    upload_metadata = load_uploaded_file(upload_id)
    selected_sheet = save_request.sheet_name or "CSV Data"
    logger.info(
        "Attendance save requested upload_id=%s sheet=%s merge_instructions=%s decisions=%s",
        upload_id,
        selected_sheet,
        len(save_request.merge_instructions),
        len(save_request.decisions),
    )
    started_at = perf_counter()
    try:
        saved_state = save_rule_state(
            dataset_key=upload_metadata.get("file_hash", ""),
            sheet_name=selected_sheet,
            state=AttendanceWorkingRuleState(
                dataset_key=upload_metadata.get("file_hash", ""),
                sheet_name=selected_sheet,
                merge_instructions=save_request.merge_instructions,
                review_decisions=save_request.decisions,
                policy_rules=save_request.policy_rules,
                holiday_markers=save_request.holiday_markers,
                administrative_exceptions=save_request.administrative_exceptions,
            ),
            actor=save_request.actor,
        )
        response = build_file_preview(
            file_path=Path(upload_metadata["file_path"]),
            original_file_name=upload_metadata["original_file_name"],
            extension=upload_metadata["extension"],
            upload_id=upload_metadata["upload_id"],
            analysis_type=upload_metadata.get("analysis_type", "Auto Detect"),
            selected_sheet=selected_sheet,
            dataset_key=upload_metadata.get("file_hash", ""),
            message="Attendance changes saved successfully.",
            attendance_merge_instructions=saved_state.merge_instructions,
            attendance_review_decisions=saved_state.review_decisions,
            attendance_policy_rules=saved_state.policy_rules,
            attendance_holiday_markers=saved_state.holiday_markers,
            attendance_administrative_exceptions=saved_state.administrative_exceptions,
        )
        logger.info(
            "Attendance save completed in %.2fs upload_id=%s sheet=%s",
            perf_counter() - started_at,
            upload_id,
            selected_sheet,
        )
        return response
    except HTTPException as exc:
        logger.warning(
            "Attendance save failed upload_id=%s sheet=%s detail=%s",
            upload_id,
            selected_sheet,
            exc.detail,
        )
        raise
    except Exception as exc:
        logger.exception(
            "Attendance save crashed unexpectedly upload_id=%s sheet=%s",
            upload_id,
            selected_sheet,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected server error while saving attendance changes.",
        ) from exc
