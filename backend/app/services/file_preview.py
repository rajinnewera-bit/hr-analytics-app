from datetime import date, datetime
import logging
from pathlib import Path
from time import perf_counter
from typing import Optional

import pandas as pd
from fastapi import HTTPException, status

from app.config import ALLOWED_FILE_TYPES
from app.schemas.upload import (
    AttendanceAdministrativeException,
    AttendanceHolidayMarker,
    AttendancePolicyRule,
    AttendanceReviewDecision,
    UploadResponse,
)
from app.services.analysis_router import (
    ATTENDANCE_ANALYSIS_TYPE,
    AUTO_DETECT_ANALYSIS_TYPE,
    build_analysis_fallback_result,
    route_analysis_engine,
)
from app.services.attendance_ingestion import looks_like_matrix_attendance_dataframe
from app.services.attendance_structure import (
    AttendanceSheetPreparation,
    build_raw_like_dataframe,
    prepare_attendance_sheet,
)
from app.services.workbook_intelligence import build_workbook_intelligence_summary

logger = logging.getLogger(__name__)


def _serialize_cell_value(value: object) -> str:
    if pd.isna(value):
        return ""

    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()

    return str(value)


def _build_preview_rows(dataframe: pd.DataFrame) -> list[list[str]]:
    preview_frame = dataframe.head(5)
    preview_rows: list[list[str]] = []

    for _, row in preview_frame.iterrows():
        preview_rows.append([_serialize_cell_value(value) for value in row.tolist()])

    return preview_rows


def _build_response(
    *,
    upload_id: str,
    analysis_type: str,
    original_file_name: str,
    file_type: str,
    message: str,
    sheet_names: list[str],
    selected_sheet: str,
    dataframe: pd.DataFrame,
    workbook_intelligence_summary: list,
    attendance_structure_preparation: Optional[AttendanceSheetPreparation] = None,
    attendance_review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    attendance_policy_rules: Optional[list[AttendancePolicyRule]] = None,
    attendance_holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    attendance_administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> UploadResponse:
    try:
        analysis_result = route_analysis_engine(
            analysis_type=analysis_type,
            dataframe=dataframe,
            selected_sheet=selected_sheet,
            workbook_intelligence_summary=workbook_intelligence_summary,
            attendance_structure_preparation=attendance_structure_preparation,
            attendance_review_decisions=attendance_review_decisions,
            attendance_policy_rules=attendance_policy_rules,
            attendance_holiday_markers=attendance_holiday_markers,
            attendance_administrative_exceptions=attendance_administrative_exceptions,
        )
    except Exception:
        logger.exception(
            "Analysis routing failed for file=%s selected_sheet=%s analysis_type=%s",
            original_file_name,
            selected_sheet,
            analysis_type,
        )
        analysis_result = build_analysis_fallback_result(analysis_type, selected_sheet)

    return UploadResponse(
        upload_id=upload_id,
        analysis_type=analysis_type,
        analysis_overview=analysis_result["analysis_overview"],
        file_name=original_file_name,
        file_type=file_type,
        upload_status="success",
        message=message,
        sheet_names=sheet_names,
        selected_sheet=selected_sheet,
        total_rows=int(dataframe.shape[0]),
        total_columns=int(dataframe.shape[1]),
        column_headers=[str(column) for column in dataframe.columns.tolist()],
        preview_rows=_build_preview_rows(dataframe),
        payroll_validation_summary=analysis_result["payroll_validation_summary"],
        attendance_validation_summary=analysis_result["attendance_validation_summary"],
        workbook_intelligence_summary=workbook_intelligence_summary,
    )


def _read_csv_dataframe(file_path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(file_path, skip_blank_lines=False)
    except pd.errors.EmptyDataError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded CSV file is empty.",
        ) from exc
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded CSV file is invalid or could not be read.",
        ) from exc


def _read_excel_workbook(file_path: Path) -> pd.ExcelFile:
    try:
        workbook = pd.ExcelFile(file_path, engine="openpyxl")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded Excel file is empty or has an invalid structure.",
        ) from exc
    except Exception as exc:
        logger.exception("Excel workbook open failed for file_path=%s", file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded Excel file is invalid or could not be read.",
        ) from exc

    if not workbook.sheet_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded Excel file does not contain any sheets.",
        )

    return workbook


def _parse_excel_sheet(workbook: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
    try:
        return workbook.parse(sheet_name=sheet_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected Excel sheet could not be read.",
        ) from exc
    except Exception as exc:
        logger.exception("Excel sheet parse failed for sheet=%s", sheet_name)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected Excel sheet is invalid or could not be read.",
        ) from exc


def _parse_excel_sheet_raw(workbook: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
    try:
        return workbook.parse(sheet_name=sheet_name, header=None)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected Excel sheet could not be read.",
        ) from exc
    except Exception as exc:
        logger.exception("Excel raw sheet parse failed for sheet=%s", sheet_name)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected Excel sheet is invalid or could not be read.",
        ) from exc


def _build_workbook_intelligence_non_blocking(
    *,
    extension: str,
    file_path: Path,
    csv_dataframe: Optional[pd.DataFrame] = None,
    workbook: Optional[pd.ExcelFile] = None,
    parsed_sheets: Optional[dict[str, pd.DataFrame]] = None,
) -> list:
    started_at = perf_counter()
    try:
        summary = build_workbook_intelligence_summary(
            extension=extension,
            file_path=file_path,
            csv_dataframe=csv_dataframe,
            workbook=workbook,
            parsed_sheets=parsed_sheets,
        )
        logger.info(
            "Workbook intelligence completed in %.2fs for file_path=%s",
            perf_counter() - started_at,
            file_path,
        )
        return summary
    except Exception:
        logger.exception(
            "Workbook intelligence failed but upload will continue for file_path=%s",
            file_path,
        )
        return []


def _build_csv_preview(
    file_path: Path,
    original_file_name: str,
    upload_id: str,
    analysis_type: str,
    message: str,
    attendance_review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    attendance_policy_rules: Optional[list[AttendancePolicyRule]] = None,
    attendance_holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    attendance_administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> UploadResponse:
    dataframe = _read_csv_dataframe(file_path)
    attendance_structure_preparation = prepare_attendance_sheet(build_raw_like_dataframe(dataframe))
    preview_dataframe = _select_excel_dataframe(
        analysis_type=analysis_type,
        default_dataframe=dataframe,
        attendance_structure_preparation=attendance_structure_preparation,
    )

    workbook_intelligence_summary = _build_workbook_intelligence_non_blocking(
        extension=".csv",
        file_path=file_path,
        csv_dataframe=preview_dataframe,
    )

    return _build_response(
        upload_id=upload_id,
        analysis_type=analysis_type,
        original_file_name=original_file_name,
        file_type=ALLOWED_FILE_TYPES[".csv"],
        message=message,
        sheet_names=["CSV Data"],
        selected_sheet="CSV Data",
        dataframe=preview_dataframe,
        workbook_intelligence_summary=workbook_intelligence_summary,
        attendance_structure_preparation=attendance_structure_preparation,
        attendance_review_decisions=attendance_review_decisions,
        attendance_policy_rules=attendance_policy_rules,
        attendance_holiday_markers=attendance_holiday_markers,
        attendance_administrative_exceptions=attendance_administrative_exceptions,
    )


def _build_excel_preview(
    file_path: Path,
    original_file_name: str,
    upload_id: str,
    analysis_type: str,
    message: str,
    selected_sheet: Optional[str] = None,
    attendance_review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    attendance_policy_rules: Optional[list[AttendancePolicyRule]] = None,
    attendance_holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    attendance_administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> UploadResponse:
    workbook_started_at = perf_counter()
    workbook = _read_excel_workbook(file_path)
    logger.info(
        "Excel workbook opened in %.2fs for file_path=%s",
        perf_counter() - workbook_started_at,
        file_path,
    )
    sheet_names = [str(sheet_name) for sheet_name in workbook.sheet_names]
    target_sheet_name = selected_sheet or sheet_names[0]

    if target_sheet_name not in sheet_names:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested sheet name was not found in this workbook.",
        )

    sheet_parse_started_at = perf_counter()
    raw_dataframe = _parse_excel_sheet_raw(workbook, target_sheet_name)
    default_dataframe = _parse_excel_sheet(workbook, target_sheet_name)
    attendance_structure_preparation = prepare_attendance_sheet(raw_dataframe)
    dataframe = _select_excel_dataframe(
        analysis_type=analysis_type,
        default_dataframe=default_dataframe,
        attendance_structure_preparation=attendance_structure_preparation,
    )
    logger.info(
        "Selected sheet parsed in %.2fs for file_path=%s sheet=%s",
        perf_counter() - sheet_parse_started_at,
        file_path,
        target_sheet_name,
    )
    workbook_intelligence_summary = _build_workbook_intelligence_non_blocking(
        extension=".xlsx",
        file_path=file_path,
        workbook=workbook,
        parsed_sheets={target_sheet_name: dataframe},
    )

    return _build_response(
        upload_id=upload_id,
        analysis_type=analysis_type,
        original_file_name=original_file_name,
        file_type=ALLOWED_FILE_TYPES[".xlsx"],
        message=message,
        sheet_names=sheet_names,
        selected_sheet=target_sheet_name,
        dataframe=dataframe,
        workbook_intelligence_summary=workbook_intelligence_summary,
        attendance_structure_preparation=attendance_structure_preparation,
        attendance_review_decisions=attendance_review_decisions,
        attendance_policy_rules=attendance_policy_rules,
        attendance_holiday_markers=attendance_holiday_markers,
        attendance_administrative_exceptions=attendance_administrative_exceptions,
    )


def build_file_preview(
    *,
    file_path: Path,
    original_file_name: str,
    extension: str,
    upload_id: str,
    analysis_type: str,
    selected_sheet=None,
    message: str = "File uploaded and preview generated successfully.",
    attendance_review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    attendance_policy_rules: Optional[list[AttendancePolicyRule]] = None,
    attendance_holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    attendance_administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> UploadResponse:
    if extension == ".csv":
        if selected_sheet and selected_sheet != "CSV Data":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The requested sheet name was not found in this file.",
            )

        return _build_csv_preview(
            file_path,
            original_file_name,
            upload_id,
            analysis_type,
            message,
            attendance_review_decisions,
            attendance_policy_rules,
            attendance_holiday_markers,
            attendance_administrative_exceptions,
        )

    if extension == ".xlsx":
        return _build_excel_preview(
            file_path=file_path,
            original_file_name=original_file_name,
            upload_id=upload_id,
            analysis_type=analysis_type,
            selected_sheet=selected_sheet,
            message=message,
            attendance_review_decisions=attendance_review_decisions,
            attendance_policy_rules=attendance_policy_rules,
            attendance_holiday_markers=attendance_holiday_markers,
            attendance_administrative_exceptions=attendance_administrative_exceptions,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only CSV and XLSX files are allowed.",
    )


def _select_excel_dataframe(
    *,
    analysis_type: str,
    default_dataframe: pd.DataFrame,
    attendance_structure_preparation: AttendanceSheetPreparation,
) -> pd.DataFrame:
    if not attendance_structure_preparation.should_use_structured_dataframe:
        logger.info("Using default dataframe because structured dataframe is unavailable.")
        return default_dataframe

    if analysis_type == ATTENDANCE_ANALYSIS_TYPE:
        if looks_like_matrix_attendance_dataframe(default_dataframe):
            logger.info("Using default dataframe for attendance analysis because a matrix attendance layout was detected.")
            return default_dataframe
        logger.info("Using structured dataframe for attendance analysis.")
        return attendance_structure_preparation.dataframe

    if analysis_type != AUTO_DETECT_ANALYSIS_TYPE:
        return default_dataframe

    default_columns = [str(column).strip().lower() for column in default_dataframe.columns.tolist()]
    unnamed_count = sum("unnamed" in column for column in default_columns)
    mapped_field_count = sum(
        1 for item in attendance_structure_preparation.mapped_fields if item["status"] == "mapped"
    )

    if unnamed_count >= max(1, len(default_columns) // 2) and mapped_field_count >= 4:
        logger.info("Using structured dataframe for auto-detect because unnamed columns dominate and mappings are strong.")
        return attendance_structure_preparation.dataframe

    logger.info("Using default dataframe after preview selection heuristics.")
    return default_dataframe


def build_file_preview_with_merges(
    *,
    file_path: Path,
    original_file_name: str,
    extension: str,
    upload_id: str,
    analysis_type: str,
    selected_sheet: Optional[str] = None,
    merge_instructions: Optional[list] = None,
    dry_run: bool = False,
    message: str = "Attendance merge preview generated successfully.",
) -> UploadResponse:
    """
    Build file preview with employee merge workflow applied.

    This function processes the attendance file with optional employee merges,
    where multiple source employee names/codes are consolidated into final identities.

    Args:
        file_path: Path to the uploaded file.
        original_file_name: Original file name.
        extension: File extension (.csv or .xlsx).
        upload_id: Upload ID for metadata.
        analysis_type: Analysis type (Auto Detect, Attendance Analysis, etc.).
        selected_sheet: Sheet name for Excel files.
        merge_instructions: List of AttendanceMergeInstruction objects.
        dry_run: If True, preview only; if False, apply merge.
        message: Custom message for the response.

    Returns:
        UploadResponse with merged data and updated summaries.
    """
    from app.schemas.upload import AttendanceMergeInstruction
    from app.services.attendance_validation import build_attendance_validation_summary_with_merges

    # Normalize merge instructions to ensure they're properly typed.
    normalized_merge_instructions: Optional[list[AttendanceMergeInstruction]] = None
    if merge_instructions:
        try:
            normalized_merge_instructions = [
                (
                    AttendanceMergeInstruction(**instr)
                    if isinstance(instr, dict)
                    else instr
                )
                for instr in merge_instructions
            ]
        except Exception as exc:
            logger.exception("Failed to normalize merge instructions")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid merge instructions format.",
            ) from exc

    if extension == ".csv":
        return _build_csv_preview_with_merges(
            file_path,
            original_file_name,
            upload_id,
            analysis_type,
            message,
            merge_instructions=normalized_merge_instructions,
            dry_run=dry_run,
        )

    if extension == ".xlsx":
        return _build_excel_preview_with_merges(
            file_path=file_path,
            original_file_name=original_file_name,
            upload_id=upload_id,
            analysis_type=analysis_type,
            selected_sheet=selected_sheet,
            message=message,
            merge_instructions=normalized_merge_instructions,
            dry_run=dry_run,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only CSV and XLSX files are allowed.",
    )


def _build_csv_preview_with_merges(
    file_path: Path,
    original_file_name: str,
    upload_id: str,
    analysis_type: str,
    message: str,
    merge_instructions: Optional[list] = None,
    dry_run: bool = False,
) -> UploadResponse:
    """Build CSV preview with merges applied."""
    from app.services.attendance_validation import build_attendance_validation_summary_with_merges

    dataframe = _read_csv_dataframe(file_path)
    attendance_structure_preparation = prepare_attendance_sheet(build_raw_like_dataframe(dataframe))
    preview_dataframe = _select_excel_dataframe(
        analysis_type=analysis_type,
        default_dataframe=dataframe,
        attendance_structure_preparation=attendance_structure_preparation,
    )

    workbook_intelligence_summary = _build_workbook_intelligence_non_blocking(
        extension=".csv",
        file_path=file_path,
        csv_dataframe=preview_dataframe,
    )

    # Use the merge-aware validation summary builder.
    try:
        analysis_result_dict = _build_attendance_analysis_with_merges(
            dataframe=preview_dataframe,
            structure_preparation=attendance_structure_preparation,
            analysis_type=analysis_type,
            merge_instructions=merge_instructions,
        )
    except Exception:
        logger.exception(
            "Analysis routing failed for file=%s analysis_type=%s",
            original_file_name,
            analysis_type,
        )
        from app.services.analysis_router import build_analysis_fallback_result
        analysis_result_dict = build_analysis_fallback_result(analysis_type, "CSV Data")

    return UploadResponse(
        upload_id=upload_id,
        analysis_type=analysis_type,
        analysis_overview=analysis_result_dict["analysis_overview"],
        file_name=original_file_name,
        file_type=ALLOWED_FILE_TYPES[".csv"],
        upload_status="success",
        message=message,
        sheet_names=["CSV Data"],
        selected_sheet="CSV Data",
        total_rows=int(preview_dataframe.shape[0]),
        total_columns=int(preview_dataframe.shape[1]),
        column_headers=[str(column) for column in preview_dataframe.columns.tolist()],
        preview_rows=_build_preview_rows(preview_dataframe),
        payroll_validation_summary=analysis_result_dict["payroll_validation_summary"],
        attendance_validation_summary=analysis_result_dict["attendance_validation_summary"],
        workbook_intelligence_summary=workbook_intelligence_summary,
    )


def _build_excel_preview_with_merges(
    file_path: Path,
    original_file_name: str,
    upload_id: str,
    analysis_type: str,
    message: str,
    selected_sheet: Optional[str] = None,
    merge_instructions: Optional[list] = None,
    dry_run: bool = False,
) -> UploadResponse:
    """Build Excel preview with merges applied."""
    from app.services.attendance_validation import build_attendance_validation_summary_with_merges

    workbook_started_at = perf_counter()
    workbook = _read_excel_workbook(file_path)
    logger.info(
        "Excel workbook opened in %.2fs for file_path=%s",
        perf_counter() - workbook_started_at,
        file_path,
    )
    sheet_names = [str(sheet_name) for sheet_name in workbook.sheet_names]
    target_sheet_name = selected_sheet or sheet_names[0]

    if target_sheet_name not in sheet_names:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The requested sheet name was not found in this workbook.",
        )

    sheet_parse_started_at = perf_counter()
    raw_dataframe = _parse_excel_sheet_raw(workbook, target_sheet_name)
    default_dataframe = _parse_excel_sheet(workbook, target_sheet_name)
    attendance_structure_preparation = prepare_attendance_sheet(raw_dataframe)
    dataframe = _select_excel_dataframe(
        analysis_type=analysis_type,
        default_dataframe=default_dataframe,
        attendance_structure_preparation=attendance_structure_preparation,
    )
    logger.info(
        "Selected sheet parsed in %.2fs for file_path=%s sheet=%s",
        perf_counter() - sheet_parse_started_at,
        file_path,
        target_sheet_name,
    )
    workbook_intelligence_summary = _build_workbook_intelligence_non_blocking(
        extension=".xlsx",
        file_path=file_path,
        workbook=workbook,
        parsed_sheets={target_sheet_name: dataframe},
    )

    # Use the merge-aware validation summary builder.
    try:
        analysis_result_dict = _build_attendance_analysis_with_merges(
            dataframe=dataframe,
            structure_preparation=attendance_structure_preparation,
            analysis_type=analysis_type,
            merge_instructions=merge_instructions,
        )
    except Exception:
        logger.exception(
            "Analysis routing failed for file=%s selected_sheet=%s analysis_type=%s",
            original_file_name,
            target_sheet_name,
            analysis_type,
        )
        from app.services.analysis_router import build_analysis_fallback_result
        analysis_result_dict = build_analysis_fallback_result(analysis_type, target_sheet_name)

    return UploadResponse(
        upload_id=upload_id,
        analysis_type=analysis_type,
        analysis_overview=analysis_result_dict["analysis_overview"],
        file_name=original_file_name,
        file_type=ALLOWED_FILE_TYPES[".xlsx"],
        upload_status="success",
        message=message,
        sheet_names=sheet_names,
        selected_sheet=target_sheet_name,
        total_rows=int(dataframe.shape[0]),
        total_columns=int(dataframe.shape[1]),
        column_headers=[str(column) for column in dataframe.columns.tolist()],
        preview_rows=_build_preview_rows(dataframe),
        payroll_validation_summary=analysis_result_dict["payroll_validation_summary"],
        attendance_validation_summary=analysis_result_dict["attendance_validation_summary"],
        workbook_intelligence_summary=workbook_intelligence_summary,
    )


def _build_attendance_analysis_with_merges(
    *,
    dataframe: pd.DataFrame,
    structure_preparation: Optional[AttendanceSheetPreparation],
    analysis_type: str,
    merge_instructions: Optional[list] = None,
) -> dict:
    """
    Build attendance analysis with merge instructions applied.

    This routes to the appropriate validation function, with merges if provided.
    """
    from app.services.analysis_router import (
        ATTENDANCE_ANALYSIS_TYPE,
        AUTO_DETECT_ANALYSIS_TYPE,
        PAYROLL_ANALYSIS_TYPE,
        _resolve_engine,
        build_generic_analysis_result,
    )
    from app.schemas.upload import AnalysisOverview
    from app.services.attendance_validation import (
        build_attendance_validation_summary,
        build_attendance_validation_summary_with_merges,
    )
    from app.services.file_validation import build_validation_summary

    engine = _resolve_engine(
        analysis_type,
        dataframe,
        "selected_sheet",
        [],  # workbook_intelligence_summary empty for now
    )

    if engine == "payroll":
        payroll_summary = build_validation_summary(dataframe)
        return {
            "analysis_overview": AnalysisOverview(
                engine="payroll",
                title="Payroll & HR Analytics",
                status=payroll_summary.status,
                message="Payroll validation checks are active for the selected sheet.",
            ),
            "payroll_validation_summary": payroll_summary,
            "attendance_validation_summary": None,
        }

    if engine == "attendance":
        # Use the merge-aware function if merges are provided.
        if merge_instructions:
            attendance_summary = build_attendance_validation_summary_with_merges(
                dataframe,
                structure_preparation=structure_preparation,
                merge_instructions=merge_instructions,
            )
        else:
            attendance_summary = build_attendance_validation_summary(
                dataframe,
                structure_preparation=structure_preparation,
            )
        return {
            "analysis_overview": AnalysisOverview(
                engine="attendance",
                title="Attendance / Timesheet Analysis",
                status=attendance_summary.status,
                message="Attendance-specific checks are active for the selected sheet." + (
                    " Employee merges have been applied." if merge_instructions else ""
                ),
            ),
            "payroll_validation_summary": None,
            "attendance_validation_summary": attendance_summary,
        }

    return build_generic_analysis_result(analysis_type, "selected_sheet")
