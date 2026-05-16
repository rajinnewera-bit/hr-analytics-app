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
