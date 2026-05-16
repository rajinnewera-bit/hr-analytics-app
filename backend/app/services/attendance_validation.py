from collections import Counter, defaultdict
from dataclasses import replace
from datetime import date, datetime
from typing import Optional

import pandas as pd

from app.schemas.upload import (
    AttendanceAdministrativeException,
    AttendanceDetectedColumns,
    AttendanceDuplicateDateIssue,
    AttendanceEmployeeActivityItem,
    AttendanceHolidayMarker,
    AttendanceEmployeeMonthlySummaryItem,
    AttendanceFieldMapping,
    AttendanceLocationCoverageItem,
    AttendanceMonthlyConsistencyIssue,
    AttendanceMonthlyEntryItem,
    AttendancePolicyRule,
    AttendanceProcessingSummary,
    AttendanceStatusSummary,
    AttendanceUnitSummaryItem,
    AttendanceReviewDecision,
    AttendanceRowIssue,
    AttendanceStructureSummary,
    AttendanceValidationSummary,
)
from app.services.attendance_anomaly import detect_attendance_anomalies
from app.services.attendance_classification import classify_attendance_records
from app.services.attendance_ingestion import (
    AttendanceIngestionResult,
    AttendanceNormalizedRecord,
    ingest_attendance_dataframe,
)
from app.services.attendance_payroll import (
    apply_monthly_payroll_reconciliation,
    build_employee_monthly_summary,
    build_status_summary,
    build_unit_summary,
)
from app.services.attendance_review_workflow import apply_attendance_review_workflow
from app.services.attendance_rule_engine import (
    build_default_attendance_policy_rules,
    merge_attendance_policy_rules,
)
from app.services.attendance_structure import AttendanceSheetPreparation


def build_empty_attendance_validation_summary() -> AttendanceValidationSummary:
    default_rules = build_default_attendance_policy_rules()
    return AttendanceValidationSummary(
        status="valid",
        total_valid_rows=0,
        total_invalid_rows=0,
        warnings_count=0,
        errors_count=0,
        processing_mode="timesheet",
        missing_required_columns=[],
        structure_summary=AttendanceStructureSummary(
            detected_header_row_number=0,
            mapped_fields=[],
            warnings=[],
        ),
        policy_rules=default_rules,
        processing_summary=AttendanceProcessingSummary(
            processing_mode="timesheet",
            unique_employees=0,
            total_records=0,
            total_exception_groups=0,
            pending_review_groups=0,
            future_date_count=0,
            overnight_punch_count=0,
            missing_punch_count=0,
            suspicious_entry_count=0,
            date_range_start="",
            date_range_end="",
            unit_options=[],
            employee_options=[],
            status_summary=AttendanceStatusSummary(
                present_count=0,
                absent_count=0,
                half_day_count=0,
                paid_week_off_count=0,
                unpaid_week_off_count=0,
                paid_holiday_count=0,
                unpaid_holiday_count=0,
                irregular_punch_count=0,
                pending_review_count=0,
                comp_off_earned_count=0,
                comp_off_adjusted_days=0.0,
                late_entry_count=0,
                early_logout_count=0,
                overnight_exit_count=0,
                missing_punch_count=0,
            ),
        ),
        exception_groups=[],
        detected_columns=AttendanceDetectedColumns(
            employee_code_columns=[],
            employee_name_columns=[],
            employee_id_columns=[],
            gender_columns=[],
            date_columns=[],
            day_columns=[],
            in_time_columns=[],
            out_time_columns=[],
            work_duration_columns=[],
            attendance_status_columns=[],
            working_day_columns=[],
            activity_columns=[],
            work_description_columns=[],
            unit_columns=[],
            location_columns=[],
            remarks_columns=[],
        ),
        working_days_count=0,
        working_day_labels=[],
        date_range_start="",
        date_range_end="",
        missing_dates=[],
        duplicate_dates=[],
        blank_work_descriptions=[],
        missing_remarks=[],
        daily_activity_gaps=[],
        location_coverage=[],
        total_entries_per_month=[],
        monthly_consistency=[],
        employee_activity_message="Employee column not detected. Employee activity summary is unavailable for this sheet.",
        employee_activity_summary=[],
        marked_holidays=[],
        administrative_exceptions=[],
        employee_monthly_summary=[],
        unit_summary=[],
        processed_attendance_rows=[],
    )


def build_attendance_validation_summary(
    dataframe: pd.DataFrame,
    structure_preparation: Optional[AttendanceSheetPreparation] = None,
    review_decisions: Optional[list[AttendanceReviewDecision]] = None,
    policy_rules: Optional[list[AttendancePolicyRule]] = None,
    holiday_markers: Optional[list[AttendanceHolidayMarker]] = None,
    administrative_exceptions: Optional[list[AttendanceAdministrativeException]] = None,
) -> AttendanceValidationSummary:
    ingestion_result = ingest_attendance_dataframe(
        dataframe,
        structure_preparation=structure_preparation,
    )
    merged_policy_rules = merge_attendance_policy_rules(policy_rules)
    marked_holidays = _normalize_holiday_markers(holiday_markers)
    normalized_administrative_exceptions = _normalize_administrative_exceptions(
        administrative_exceptions
    )
    records_with_holidays = _apply_marked_holidays(ingestion_result.records, marked_holidays)
    records_with_exceptions = _apply_administrative_exceptions(
        records_with_holidays,
        normalized_administrative_exceptions,
    )
    anomaly_result = detect_attendance_anomalies(records_with_exceptions)
    review_result = apply_attendance_review_workflow(
        records_with_exceptions,
        anomaly_result.exception_groups,
        decisions=review_decisions,
    )
    classification_result = classify_attendance_records(
        review_result.resolved_records,
        merged_policy_rules,
    )
    apply_monthly_payroll_reconciliation(classification_result.processed_rows)

    structure_summary = _build_structure_summary(ingestion_result.structure_preparation)
    detected_columns = _build_detected_columns(ingestion_result.mapped_columns)
    missing_dates = _missing_date_issues(ingestion_result.records)
    duplicate_dates = _duplicate_date_issues(review_result.exception_groups)
    blank_work_descriptions = (
        _blank_work_description_issues(review_result.resolved_records)
        if ingestion_result.processing_mode == "timesheet"
        else []
    )
    missing_remarks = (
        _missing_remark_issues(review_result.resolved_records)
        if ingestion_result.processing_mode == "timesheet"
        else []
    )
    daily_activity_gaps = (
        _daily_activity_gap_issues(review_result.resolved_records)
        if ingestion_result.processing_mode == "timesheet"
        else []
    )
    location_coverage = _location_coverage(review_result.resolved_records)
    total_entries_per_month = _monthly_entries(review_result.resolved_records)
    monthly_consistency = _monthly_consistency(review_result.resolved_records)
    employee_activity_summary, employee_activity_message = _employee_activity(review_result.resolved_records)
    employee_monthly_summary = build_employee_monthly_summary(classification_result.processed_rows)
    unit_summary = build_unit_summary(classification_result.processed_rows)
    processing_summary = _processing_summary(
        ingestion_result=ingestion_result,
        resolved_records=review_result.resolved_records,
        exception_groups=review_result.exception_groups,
        processed_rows=classification_result.processed_rows,
    )

    error_group_count = len([group for group in review_result.exception_groups if group.severity == "error"])
    warning_group_count = len([group for group in review_result.exception_groups if group.severity == "warning"])
    invalid_source_rows = {
        candidate.source_row_number
        for group in review_result.exception_groups
        for candidate in group.candidate_rows
    }
    invalid_source_rows.update(issue.row_number for issue in missing_dates)
    total_rows = len(ingestion_result.records)
    total_invalid_rows = min(len(invalid_source_rows), total_rows)
    total_valid_rows = max(total_rows - total_invalid_rows, 0)

    warnings_count = (
        len(structure_summary.warnings)
        + warning_group_count
        + len(blank_work_descriptions)
        + len(missing_remarks)
        + len(daily_activity_gaps)
        + len(monthly_consistency)
    )
    errors_count = len(ingestion_result.missing_required_columns) + error_group_count + len(missing_dates)

    if errors_count > 0:
        status = "error"
    elif warnings_count > 0:
        status = "warning"
    else:
        status = "valid"

    sorted_dates = sorted(
        {
            record.date_value.strftime("%Y-%m-%d")
            for record in review_result.resolved_records
            if record.date_value is not None
        }
    )
    working_day_labels = [
        label
        for label, _ in Counter(
            record.day_label
            for record in review_result.resolved_records
            if record.day_label
        ).most_common()
    ]

    return AttendanceValidationSummary(
        status=status,
        total_valid_rows=total_valid_rows,
        total_invalid_rows=total_invalid_rows,
        warnings_count=warnings_count,
        errors_count=errors_count,
        processing_mode=ingestion_result.processing_mode,
        missing_required_columns=ingestion_result.missing_required_columns,
        structure_summary=structure_summary,
        policy_rules=merged_policy_rules,
        processing_summary=processing_summary,
        exception_groups=review_result.exception_groups,
        detected_columns=detected_columns,
        working_days_count=len(sorted_dates),
        working_day_labels=working_day_labels,
        date_range_start=sorted_dates[0] if sorted_dates else "",
        date_range_end=sorted_dates[-1] if sorted_dates else "",
        missing_dates=missing_dates,
        duplicate_dates=duplicate_dates,
        blank_work_descriptions=blank_work_descriptions,
        missing_remarks=missing_remarks,
        daily_activity_gaps=daily_activity_gaps,
        location_coverage=location_coverage,
        total_entries_per_month=total_entries_per_month,
        monthly_consistency=monthly_consistency,
        employee_activity_message=employee_activity_message,
        employee_activity_summary=employee_activity_summary,
        marked_holidays=marked_holidays,
        administrative_exceptions=normalized_administrative_exceptions,
        employee_monthly_summary=employee_monthly_summary,
        unit_summary=unit_summary,
        processed_attendance_rows=classification_result.processed_rows,
    )


def _normalize_holiday_markers(
    holiday_markers: Optional[list[AttendanceHolidayMarker]],
) -> list[AttendanceHolidayMarker]:
    normalized_by_date: dict[str, AttendanceHolidayMarker] = {}

    for marker in holiday_markers or []:
        raw_date = (marker.date or "").strip()
        raw_type = (marker.holiday_type or "").strip()
        raw_reason = (marker.reason or "").strip()
        raw_remarks = (marker.remarks or "").strip()
        if not raw_date or not raw_type or not (raw_reason or raw_remarks):
            continue

        parsed = pd.to_datetime(raw_date, errors="coerce")
        if pd.isna(parsed):
            continue

        normalized_date = pd.Timestamp(parsed).strftime("%Y-%m-%d")
        normalized_by_date[normalized_date] = AttendanceHolidayMarker(
            date=normalized_date,
            holiday_type=raw_type,
            reason=raw_reason,
            remarks=raw_remarks,
            action_by=(marker.action_by or "").strip() or "HR",
            action_at=(marker.action_at or "").strip()
            or datetime.utcnow().replace(microsecond=0).isoformat(),
            source=(marker.source or "").strip() or "Holiday Marker",
        )

    return list(sorted(normalized_by_date.values(), key=lambda item: item.date))


def _apply_marked_holidays(
    records: list[AttendanceNormalizedRecord],
    holiday_markers: list[AttendanceHolidayMarker],
) -> list[AttendanceNormalizedRecord]:
    if not holiday_markers:
        return records

    holiday_by_date = {marker.date: marker for marker in holiday_markers}
    updated_records: list[AttendanceNormalizedRecord] = []

    for record in records:
        if record.date_value is None:
            updated_records.append(record)
            continue

        normalized_date = record.date_value.strftime("%Y-%m-%d")
        holiday_marker = holiday_by_date.get(normalized_date)
        if not holiday_marker:
            updated_records.append(record)
            continue

        next_record = replace(record)
        next_record.attendance_status = holiday_marker.holiday_type
        next_record.action_source = holiday_marker.source
        next_record.action_reason = holiday_marker.reason
        next_record.action_remarks = holiday_marker.remarks
        next_record.hr_reviewed_by = holiday_marker.action_by
        next_record.hr_reviewed_at = holiday_marker.action_at
        if "hr_marked_holiday" not in next_record.anomaly_flags:
            next_record.anomaly_flags.append("hr_marked_holiday")
        holiday_note = " | ".join(
            item
            for item in [
                f"HR marked {normalized_date} as {holiday_marker.holiday_type}.",
                holiday_marker.reason,
                holiday_marker.remarks,
            ]
            if item
        )
        if holiday_note and holiday_note not in next_record.remarks:
            next_record.remarks = (
                f"{next_record.remarks} | {holiday_note}"
                if next_record.remarks
                else holiday_note
            )
        updated_records.append(next_record)

    return updated_records


def _normalize_administrative_exceptions(
    administrative_exceptions: Optional[list[AttendanceAdministrativeException]],
) -> list[AttendanceAdministrativeException]:
    normalized: list[AttendanceAdministrativeException] = []

    for item in administrative_exceptions or []:
        raw_date = (item.date or "").strip()
        raw_scope = (item.scope or "").strip() or "all_employees"
        raw_treatment = (item.treatment_type or "").strip() or "Paid Present"
        raw_reason = (item.reason or "").strip()
        raw_remarks = (item.remarks or "").strip()
        if not raw_date or not (raw_reason or raw_remarks):
            continue

        parsed = pd.to_datetime(raw_date, errors="coerce")
        if pd.isna(parsed):
            continue

        normalized.append(
            AttendanceAdministrativeException(
                date=pd.Timestamp(parsed).strftime("%Y-%m-%d"),
                scope=raw_scope,
                treatment_type=raw_treatment,
                unit_name=(item.unit_name or "").strip(),
                employee_ids=sorted(
                    {
                        employee_id.strip()
                        for employee_id in (item.employee_ids or [])
                        if employee_id and employee_id.strip()
                    }
                ),
                custom_status_label=(item.custom_status_label or "").strip(),
                custom_payable_value=item.custom_payable_value,
                reason=raw_reason,
                remarks=raw_remarks,
                action_by=(item.action_by or "").strip() or "HR",
                action_at=(item.action_at or "").strip()
                or datetime.utcnow().replace(microsecond=0).isoformat(),
                source=(item.source or "").strip() or "Administrative Attendance Exception",
            )
        )

    normalized.sort(key=lambda item: (item.date, item.scope, item.unit_name, ",".join(item.employee_ids)))
    return normalized


def _apply_administrative_exceptions(
    records: list[AttendanceNormalizedRecord],
    administrative_exceptions: list[AttendanceAdministrativeException],
) -> list[AttendanceNormalizedRecord]:
    if not administrative_exceptions:
        return records

    updated_records: list[AttendanceNormalizedRecord] = []

    for record in records:
        next_record = record
        for admin_exception in administrative_exceptions:
            if not _administrative_exception_matches(record, admin_exception):
                continue
            next_record = _apply_administrative_exception_to_record(
                next_record,
                admin_exception,
            )
        updated_records.append(next_record)

    return updated_records


def _administrative_exception_matches(
    record: AttendanceNormalizedRecord,
    admin_exception: AttendanceAdministrativeException,
) -> bool:
    if record.date_value is None or record.date_value.strftime("%Y-%m-%d") != admin_exception.date:
        return False

    scope = (admin_exception.scope or "").strip().lower()
    if scope == "all_employees":
        return True
    if scope == "specific_unit":
        return bool(admin_exception.unit_name) and (record.unit or "").strip() == admin_exception.unit_name
    if scope == "selected_employees":
        selected = {item.strip().lower() for item in admin_exception.employee_ids if item.strip()}
        if not selected:
            return False
        return (
            (record.employee_code or "").strip().lower() in selected
            or (record.employee_name or "").strip().lower() in selected
        )
    return False


def _apply_administrative_exception_to_record(
    record: AttendanceNormalizedRecord,
    admin_exception: AttendanceAdministrativeException,
) -> AttendanceNormalizedRecord:
    next_record = replace(record)
    treatment = (admin_exception.treatment_type or "").strip()
    override_status, display_status = _administrative_exception_status_mapping(
        admin_exception
    )

    next_record.attendance_status = display_status
    next_record.hr_override_status = override_status
    next_record.review_action = "administrative_exception"
    next_record.hr_reviewed_by = admin_exception.action_by
    next_record.hr_reviewed_at = admin_exception.action_at
    next_record.action_source = admin_exception.source
    next_record.action_reason = admin_exception.reason
    next_record.action_remarks = admin_exception.remarks
    next_record.remarks = " | ".join(
        item
        for item in [
            next_record.remarks,
            f"{admin_exception.source}: {treatment}",
            admin_exception.reason,
            admin_exception.remarks,
        ]
        if item
    )

    for flag in ["pending_review", "missing_in_time", "missing_out_time", "future_date"]:
        if flag in next_record.anomaly_flags:
            next_record.anomaly_flags.remove(flag)
    if "administrative_exception_override" not in next_record.anomaly_flags:
        next_record.anomaly_flags.append("administrative_exception_override")

    return next_record


def _administrative_exception_status_mapping(
    admin_exception: AttendanceAdministrativeException,
) -> tuple[str, str]:
    treatment = (admin_exception.treatment_type or "").strip().lower()
    if treatment == "paid present":
        return "Present", "Administrative Attendance Exception - Paid Present"
    if treatment == "paid holiday":
        return "Paid Holiday", "Administrative Attendance Exception - Paid Holiday"
    if treatment == "special paid off":
        return "Special Paid Off", "Administrative Attendance Exception - Special Paid Off"
    if treatment == "unpaid off":
        return "Unpaid Off", "Administrative Attendance Exception - Unpaid Off"
    custom_label = admin_exception.custom_status_label or "Custom HR Approved Status"
    return "Custom HR Approved Status", f"Administrative Attendance Exception - {custom_label}"


def _build_structure_summary(preparation: AttendanceSheetPreparation) -> AttendanceStructureSummary:
    return AttendanceStructureSummary(
        detected_header_row_number=preparation.detected_header_row_number,
        mapped_fields=[
            AttendanceFieldMapping(
                field_name=str(item["field_name"]),
                detected_column_name=str(item["detected_column_name"]),
                confidence_score=float(item["confidence_score"]),
                reason=str(item["reason"]),
                status=str(item["status"]),
            )
            for item in preparation.mapped_fields
        ],
        warnings=list(preparation.warnings),
    )


def _build_detected_columns(mapped_columns: dict[str, str]) -> AttendanceDetectedColumns:
    employee_code = mapped_columns.get("Employee Code", "")
    location = mapped_columns.get("Location / District", "")

    return AttendanceDetectedColumns(
        employee_code_columns=[employee_code] if employee_code else [],
        employee_name_columns=_value_to_list(mapped_columns.get("Employee Name", "")),
        employee_id_columns=[employee_code] if employee_code else [],
        gender_columns=_value_to_list(mapped_columns.get("Gender", "")),
        date_columns=_value_to_list(mapped_columns.get("Date", "")),
        day_columns=_value_to_list(mapped_columns.get("Day", "")),
        in_time_columns=_value_to_list(mapped_columns.get("In Time", "")),
        out_time_columns=_value_to_list(mapped_columns.get("Out Time", "")),
        work_duration_columns=_value_to_list(mapped_columns.get("Work Duration", "")),
        attendance_status_columns=_value_to_list(mapped_columns.get("Attendance Status", "")),
        working_day_columns=_value_to_list(mapped_columns.get("Day", "")),
        activity_columns=_value_to_list(mapped_columns.get("Work / Activity", "")),
        work_description_columns=_value_to_list(mapped_columns.get("Description of Work", "")),
        unit_columns=[location] if location else [],
        location_columns=[location] if location else [],
        remarks_columns=_value_to_list(mapped_columns.get("Remarks", "")),
    )


def _value_to_list(value: str) -> list[str]:
    return [value] if value else []


def _missing_date_issues(records: list[AttendanceNormalizedRecord]) -> list[AttendanceRowIssue]:
    issues: list[AttendanceRowIssue] = []
    for record in records:
        if record.date_value is not None:
            continue
        issues.append(
            AttendanceRowIssue(
                row_number=record.source_row_number,
                employee_name=record.employee_name,
                employee_id=record.employee_code,
                date_value="",
                details="Date is missing or could not be read.",
            )
        )
    return issues


def _duplicate_date_issues(exception_groups) -> list[AttendanceDuplicateDateIssue]:
    issues: list[AttendanceDuplicateDateIssue] = []
    for group in exception_groups:
        if group.category not in {"multiple_entries", "duplicate_punches"}:
            continue
        issues.append(
            AttendanceDuplicateDateIssue(
                employee_name=group.employee_name,
                employee_id=group.employee_code,
                date_value=group.date,
                row_numbers=[candidate.source_row_number for candidate in group.candidate_rows],
            )
        )
    return issues


def _blank_work_description_issues(records: list[AttendanceNormalizedRecord]) -> list[AttendanceRowIssue]:
    issues: list[AttendanceRowIssue] = []
    for record in records:
        if record.activity or record.work_description:
            continue
        issues.append(
            AttendanceRowIssue(
                row_number=record.source_row_number,
                employee_name=record.employee_name,
                employee_id=record.employee_code,
                date_value=_date_text(record.date_value),
                details="Work description is blank.",
            )
        )
    return issues


def _missing_remark_issues(records: list[AttendanceNormalizedRecord]) -> list[AttendanceRowIssue]:
    issues: list[AttendanceRowIssue] = []
    for record in records:
        if record.remarks:
            continue
        issues.append(
            AttendanceRowIssue(
                row_number=record.source_row_number,
                employee_name=record.employee_name,
                employee_id=record.employee_code,
                date_value=_date_text(record.date_value),
                details="Remarks are missing.",
            )
        )
    return issues


def _daily_activity_gap_issues(records: list[AttendanceNormalizedRecord]) -> list[AttendanceRowIssue]:
    issues: list[AttendanceRowIssue] = []
    for record in records:
        gap_fields = []
        if not record.activity and not record.work_description:
            gap_fields.append("Work / Activity")
        if not record.unit:
            gap_fields.append("Unit / Location")
        if not record.remarks:
            gap_fields.append("Remarks")
        if len(gap_fields) < 2:
            continue
        issues.append(
            AttendanceRowIssue(
                row_number=record.source_row_number,
                employee_name=record.employee_name,
                employee_id=record.employee_code,
                date_value=_date_text(record.date_value),
                details=f"Missing {' and '.join(gap_fields[:2])}{'' if len(gap_fields) == 2 else ' plus more context'}.",
            )
        )
    return issues


def _location_coverage(records: list[AttendanceNormalizedRecord]) -> list[AttendanceLocationCoverageItem]:
    coverage_counter: Counter[str] = Counter(
        record.unit or "Unknown / Unspecified"
        for record in records
        if record.date_value is not None
    )
    return [
        AttendanceLocationCoverageItem(location_name=location_name, total_entries=total_entries)
        for location_name, total_entries in coverage_counter.most_common()
    ]


def _monthly_entries(records: list[AttendanceNormalizedRecord]) -> list[AttendanceMonthlyEntryItem]:
    monthly_counter: Counter[str] = Counter()
    for record in records:
        if record.date_value is None:
            continue
        monthly_counter[record.date_value.strftime("%Y-%m")] += 1

    return [
        AttendanceMonthlyEntryItem(month=month, total_entries=total_entries)
        for month, total_entries in sorted(monthly_counter.items())
    ]


def _monthly_consistency(
    records: list[AttendanceNormalizedRecord],
) -> list[AttendanceMonthlyConsistencyIssue]:
    activity_by_employee: dict[str, dict[str, object]] = defaultdict(
        lambda: {
            "employee_name": "",
            "employee_code": "",
            "months": defaultdict(int),
        }
    )
    for record in records:
        if record.date_value is None:
            continue
        employee_key = record.employee_code or record.employee_name
        if not employee_key:
            continue
        item = activity_by_employee[employee_key]
        item["employee_name"] = record.employee_name
        item["employee_code"] = record.employee_code
        item["months"][record.date_value.strftime("%Y-%m")] += 1

    issues: list[AttendanceMonthlyConsistencyIssue] = []
    for item in activity_by_employee.values():
        month_items = sorted(item["months"].items())
        counts = [count for _, count in month_items]
        if len(counts) < 2 or (max(counts) - min(counts)) <= 3:
            continue
        issues.append(
            AttendanceMonthlyConsistencyIssue(
                employee_name=str(item["employee_name"]),
                employee_id=str(item["employee_code"]),
                months=[month for month, _ in month_items],
                entry_counts=counts,
                details="Monthly entry volume changes sharply across active months.",
            )
        )
    return issues


def _employee_activity(
    records: list[AttendanceNormalizedRecord],
) -> tuple[list[AttendanceEmployeeActivityItem], str]:
    employee_activity: dict[str, dict[str, object]] = defaultdict(
        lambda: {
            "employee_name": "",
            "employee_code": "",
            "entries": 0,
            "active_days": set(),
            "months": set(),
            "locations": set(),
        }
    )
    for record in records:
        employee_key = record.employee_code or record.employee_name
        if not employee_key or record.date_value is None:
            continue
        item = employee_activity[employee_key]
        item["employee_name"] = record.employee_name
        item["employee_code"] = record.employee_code
        item["entries"] += 1
        item["active_days"].add(record.date_value.strftime("%Y-%m-%d"))
        item["months"].add(record.date_value.strftime("%Y-%m"))
        if record.unit:
            item["locations"].add(record.unit)

    if not employee_activity:
        return (
            [],
            "Employee column not detected. Employee activity summary is unavailable for this sheet.",
        )

    summary = [
        AttendanceEmployeeActivityItem(
            employee_name=str(item["employee_name"]),
            employee_id=str(item["employee_code"]),
            total_entries=int(item["entries"]),
            active_days=len(item["active_days"]),
            months_active=len(item["months"]),
            locations_covered=len(item["locations"]),
        )
        for item in employee_activity.values()
    ]
    summary.sort(key=lambda item: (-item.total_entries, item.employee_name or item.employee_id))
    return summary, ""


def _processing_summary(
    *,
    ingestion_result: AttendanceIngestionResult,
    resolved_records: list[AttendanceNormalizedRecord],
    exception_groups,
    processed_rows,
) -> AttendanceProcessingSummary:
    dated_records = [record for record in resolved_records if record.date_value is not None]
    sorted_dates = sorted(record.date_value for record in dated_records if record.date_value is not None)
    employee_options = sorted(
        {
            record.employee_name or record.employee_code
            for record in resolved_records
            if record.employee_name or record.employee_code
        }
    )
    unit_options = sorted({record.unit for record in resolved_records if record.unit})
    status_summary = build_status_summary(processed_rows)

    return AttendanceProcessingSummary(
        processing_mode=ingestion_result.processing_mode,
        unique_employees=len(
            {
                record.employee_code or record.employee_name
                for record in resolved_records
                if record.employee_code or record.employee_name
            }
        ),
        total_records=len(processed_rows),
        total_exception_groups=len(exception_groups),
        pending_review_groups=len([group for group in exception_groups if group.requires_review]),
        future_date_count=len([record for record in resolved_records if "future_date" in record.anomaly_flags]),
        overnight_punch_count=len([record for record in resolved_records if "overnight_punch" in record.anomaly_flags]),
        missing_punch_count=len(
            [
                record
                for record in resolved_records
                if "missing_in_time" in record.anomaly_flags or "missing_out_time" in record.anomaly_flags
            ]
        ),
        suspicious_entry_count=len(
            [
                record
                for record in resolved_records
                if "suspicious_entry" in record.anomaly_flags
                or "invalid_duration" in record.anomaly_flags
                or "negative_duration" in record.anomaly_flags
            ]
        ),
        date_range_start=sorted_dates[0].strftime("%Y-%m-%d") if sorted_dates else "",
        date_range_end=sorted_dates[-1].strftime("%Y-%m-%d") if sorted_dates else "",
        unit_options=unit_options,
        employee_options=employee_options,
        status_summary=status_summary,
    )


def _date_text(value: Optional[pd.Timestamp]) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%d")
