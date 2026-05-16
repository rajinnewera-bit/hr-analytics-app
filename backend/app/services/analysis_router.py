from typing import Any, Optional

import pandas as pd

from app.schemas.upload import (
    AttendanceAdministrativeException,
    AnalysisOverview,
    AttendanceHolidayMarker,
    AttendancePolicyRule,
    AttendanceReviewDecision,
    WorkbookSheetSummary,
)
from app.services.attendance_structure import AttendanceSheetPreparation
from app.services.attendance_validation import (
    build_attendance_validation_summary,
    build_empty_attendance_validation_summary,
)
from app.services.file_validation import build_empty_validation_summary, build_validation_summary

PAYROLL_ANALYSIS_TYPE = "Payroll & HR Analytics"
ATTENDANCE_ANALYSIS_TYPE = "Attendance / Timesheet Analysis"
AUTO_DETECT_ANALYSIS_TYPE = "Auto Detect"


def route_analysis_engine(
    *,
    analysis_type: str,
    dataframe: pd.DataFrame,
    selected_sheet: str,
    workbook_intelligence_summary: list[WorkbookSheetSummary],
    attendance_structure_preparation: Optional[AttendanceSheetPreparation] = None,
    attendance_review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    attendance_policy_rules: Optional[list[AttendancePolicyRule]] = None,
    attendance_holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    attendance_administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> dict[str, Any]:
    engine = _resolve_engine(
        analysis_type,
        dataframe,
        selected_sheet,
        workbook_intelligence_summary,
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
        attendance_summary = build_attendance_validation_summary(
            dataframe,
            structure_preparation=attendance_structure_preparation,
            review_decisions=attendance_review_decisions,
            policy_rules=attendance_policy_rules,
            holiday_markers=attendance_holiday_markers,
            administrative_exceptions=attendance_administrative_exceptions,
        )
        return {
            "analysis_overview": AnalysisOverview(
                engine="attendance",
                title="Attendance / Timesheet Analysis",
                status=attendance_summary.status,
                message="Attendance-specific checks are active for the selected sheet.",
            ),
            "payroll_validation_summary": None,
            "attendance_validation_summary": attendance_summary,
        }

    return build_generic_analysis_result(analysis_type, selected_sheet)


def build_generic_analysis_result(
    analysis_type: str,
    selected_sheet: str,
) -> dict[str, Any]:
    label = analysis_type or AUTO_DETECT_ANALYSIS_TYPE

    return {
        "analysis_overview": AnalysisOverview(
            engine="generic",
            title=label,
            status="info",
            message=(
                f"No specialized validation engine is active for {label}. "
                f"The app is showing preview and workbook intelligence for {selected_sheet}."
            ),
        ),
        "payroll_validation_summary": None,
        "attendance_validation_summary": None,
    }


def build_analysis_fallback_result(
    analysis_type: str,
    selected_sheet: str,
) -> dict[str, Any]:
    return {
        "analysis_overview": AnalysisOverview(
            engine="generic",
            title=analysis_type or AUTO_DETECT_ANALYSIS_TYPE,
            status="warning",
            message=(
                "The specialized analysis engine could not complete. "
                "The file preview is still available."
            ),
        ),
        "payroll_validation_summary": build_empty_validation_summary(),
        "attendance_validation_summary": build_empty_attendance_validation_summary(),
    }


def _resolve_engine(
    analysis_type: str,
    dataframe: pd.DataFrame,
    selected_sheet: str,
    workbook_intelligence_summary: list[WorkbookSheetSummary],
) -> str:
    normalized = (analysis_type or "").strip().lower()

    if normalized == PAYROLL_ANALYSIS_TYPE.lower():
        return "payroll"

    if normalized == ATTENDANCE_ANALYSIS_TYPE.lower():
        return "attendance"

    if normalized != AUTO_DETECT_ANALYSIS_TYPE.lower():
        return "generic"

    inferred_engine = _infer_engine_from_columns(dataframe)
    if inferred_engine != "generic":
        return inferred_engine

    selected_sheet_type = _selected_sheet_type(selected_sheet, workbook_intelligence_summary)
    if selected_sheet_type == "salary/payroll sheet":
        return "payroll"
    if selected_sheet_type == "attendance sheet":
        return "attendance"

    return "generic"


def _selected_sheet_type(
    selected_sheet: str,
    workbook_intelligence_summary: list[WorkbookSheetSummary],
) -> str:
    for sheet_summary in workbook_intelligence_summary:
        if sheet_summary.sheet_name == selected_sheet:
            return sheet_summary.likely_sheet_type
    return "unknown"


def _infer_engine_from_columns(dataframe: pd.DataFrame) -> str:
    columns = [" ".join(str(column).strip().lower().replace("_", " ").split()) for column in dataframe.columns]

    if any(
        keyword in column
        for column in columns
        for keyword in ["salary", "payroll", "gross pay", "net pay", "basic pay"]
    ):
        return "payroll"

    attendance_indicators = 0
    if any("date" in column or "day" in column for column in columns):
        attendance_indicators += 1
    if any(
        keyword in column
        for column in columns
        for keyword in ["work description", "activity", "task", "work done", "details"]
    ):
        attendance_indicators += 1
    if any("location" in column or "site" in column for column in columns):
        attendance_indicators += 1
    if any("remark" in column or "note" in column or "comment" in column for column in columns):
        attendance_indicators += 1
    if any("working day" in column or "attendance" in column or "timesheet" in column for column in columns):
        attendance_indicators += 1

    payroll_indicators = 0
    if any("department" in column for column in columns):
        payroll_indicators += 1
    if any("in time" in column or "out time" in column for column in columns):
        payroll_indicators += 1
    if any("working hours" in column for column in columns):
        payroll_indicators += 1

    if attendance_indicators >= 3 and attendance_indicators >= payroll_indicators:
        return "attendance"

    if payroll_indicators >= 2:
        return "payroll"

    return "generic"
