from dataclasses import dataclass
from datetime import date
import logging
import re
from datetime import time
from typing import Optional

import pandas as pd

from app.schemas.upload import (
    AttendanceExceptionActionOption,
    AttendanceExceptionCandidate,
    AttendanceExceptionGroup,
)
from app.services.attendance_ingestion import AttendanceNormalizedRecord

logger = logging.getLogger(__name__)

NON_WORKING_EXACT_STATUSES = {
    "a",
    "absent",
    "wo",
    "week off",
    "weekly off",
}
HOLIDAY_STATUS_TOKENS = {
    "holiday",
    "public holiday",
    "national holiday",
    "declared holiday",
    "paid holiday",
}
LATE_REVIEW_CUTOFF = time(hour=10, minute=11)


@dataclass
class AttendanceAnomalyResult:
    exception_groups: list[AttendanceExceptionGroup]


def detect_attendance_anomalies(
    records: list[AttendanceNormalizedRecord],
) -> AttendanceAnomalyResult:
    today = pd.Timestamp(date.today()).normalize()
    exception_groups: list[AttendanceExceptionGroup] = []
    grouped_records: dict[tuple[str, str], list[AttendanceNormalizedRecord]] = {}

    for record in records:
        _annotate_row_level_flags(record, today)

        if record.date_value is None:
            continue

        employee_key = _employee_key(record)
        grouped_records.setdefault((employee_key, record.date_value.strftime("%Y-%m-%d")), []).append(record)

    duplicate_keys: set[str] = set()
    for (_, date_key), candidate_records in grouped_records.items():
        if any("administrative_exception_override" in record.anomaly_flags for record in candidate_records):
            continue
        if len(candidate_records) <= 1:
            continue

        category = "multiple_entries"
        anomaly_flags = ["multiple_entries_same_employee_date"]
        if _has_duplicate_punch_signature(candidate_records):
            category = "duplicate_punches"
            anomaly_flags.append("duplicate_punches")

        for record in candidate_records:
            record.anomaly_flags.extend(flag for flag in anomaly_flags if flag not in record.anomaly_flags)

        exception_id = _build_exception_id(category, candidate_records[0], date_key)
        duplicate_keys.add(exception_id)
        exception_groups.append(
            AttendanceExceptionGroup(
                exception_id=exception_id,
                category=category,
                severity="warning",
                employee_code=candidate_records[0].employee_code,
                employee_name=candidate_records[0].employee_name,
                date=date_key,
                unit=candidate_records[0].unit,
                summary="Multiple attendance rows found for the same employee and date.",
                details="Review duplicate punch candidates before final attendance is generated.",
                suggested_action="merge_punches",
                selected_action="",
                requires_review=True,
                anomaly_flags=anomaly_flags,
                action_options=_action_options_for_category(category),
                candidate_rows=[_candidate_from_record(record) for record in candidate_records],
            )
        )
        logger.warning(
            "Duplicate attendance punches detected employee_code=%s employee_name=%s date=%s rows=%s",
            candidate_records[0].employee_code,
            candidate_records[0].employee_name,
            date_key,
            [record.source_row_number for record in candidate_records],
        )

    for record in records:
        if record.date_value is None:
            continue

        employee_key = _employee_key(record)
        date_key = record.date_value.strftime("%Y-%m-%d")
        duplicate_exception_id = _build_exception_id("multiple_entries", record, date_key)
        duplicate_punch_exception_id = _build_exception_id("duplicate_punches", record, date_key)
        if duplicate_exception_id in duplicate_keys or duplicate_punch_exception_id in duplicate_keys:
            continue

        if "administrative_exception_override" in record.anomaly_flags:
            continue

        if "missing_in_time" in record.anomaly_flags or "missing_out_time" in record.anomaly_flags:
            auto_payable_missing_out = _is_auto_payable_missing_out_time(record)
            exception_groups.append(
                _single_record_group(
                    record,
                    category="missing_punch",
                    severity="warning",
                    summary="Missing punch detected.",
                    details="This row is missing an in-time or out-time.",
                    suggested_action="keep_as_is" if auto_payable_missing_out else "manual_override",
                    anomaly_flags=[
                        flag
                        for flag in record.anomaly_flags
                        if flag in {"missing_in_time", "missing_out_time"}
                    ],
                    requires_review=not auto_payable_missing_out,
                )
            )

        if "future_date" in record.anomaly_flags:
            exception_groups.append(
                _single_record_group(
                    record,
                    category="future_date",
                    severity="error",
                    summary="Future attendance date detected.",
                    details="This row uses a future date and should be reviewed before payroll processing.",
                    suggested_action="ignore_anomaly",
                    anomaly_flags=["future_date"],
                )
            )

        if "invalid_duration" in record.anomaly_flags or "negative_duration" in record.anomaly_flags:
            exception_groups.append(
                _single_record_group(
                    record,
                    category="invalid_duration",
                    severity="error",
                    summary="Invalid work duration detected.",
                    details="Working hours are negative, zero, or beyond an expected range.",
                    suggested_action="manual_override",
                    anomaly_flags=[
                        flag
                        for flag in record.anomaly_flags
                        if flag in {"invalid_duration", "negative_duration"}
                    ],
                )
            )

        if "suspicious_entry" in record.anomaly_flags:
            exception_groups.append(
                _single_record_group(
                    record,
                    category="suspicious_entry",
                    severity="warning",
                    summary="Suspicious attendance entry detected.",
                    details="The row contains unusual punch values that should be confirmed by HR.",
                    suggested_action="manual_override",
                    anomaly_flags=["suspicious_entry"],
                )
            )

        if _should_allow_absent_review(record):
            exception_groups.append(
                _single_record_group(
                    record,
                    category="absent_review",
                    severity="warning",
                    summary="Absent day available for HR review.",
                    details="This day is currently absent in payroll, but HR can override it and recalculate attendance instantly.",
                    suggested_action="keep_as_is",
                    anomaly_flags=["absent_review"],
                    requires_review=False,
                )
            )

        if _should_allow_late_review(record):
            exception_groups.append(
                _single_record_group(
                    record,
                    category="late_review",
                    severity="warning",
                    summary="Late entry available for HR regularization.",
                    details="This row is currently treated as a late attendance day. HR can regularize it and recalculate late deductions immediately.",
                    suggested_action="keep_as_is",
                    anomaly_flags=["late_entry"],
                    requires_review=False,
                )
            )

    return AttendanceAnomalyResult(exception_groups=exception_groups)


def _annotate_row_level_flags(record: AttendanceNormalizedRecord, today: pd.Timestamp) -> None:
    normalized_status = (record.attendance_status or "").strip().lower()
    is_non_working_status = _is_non_working_status(normalized_status)

    if record.date_value is not None and record.date_value > today:
        _add_flag(record, "future_date")

    if record.in_time is None and record.out_time is not None and not is_non_working_status:
        _add_flag(record, "missing_in_time")
    if record.out_time is None and record.in_time is not None and not is_non_working_status:
        _add_flag(record, "missing_out_time")

    if record.in_time is not None and record.out_time is not None and record.out_time < record.in_time:
        record.out_time = record.out_time + pd.Timedelta(days=1)
        _add_flag(record, "overnight_punch")

    if record.work_duration_hours is None and record.in_time is not None and record.out_time is not None:
        record.work_duration_hours = round((record.out_time - record.in_time).total_seconds() / 3600, 2)

    if record.work_duration_hours is not None:
        if record.work_duration_hours < 0:
            _add_flag(record, "negative_duration")
            logger.warning(
                "Negative attendance duration detected employee_code=%s employee_name=%s row=%s duration=%s",
                record.employee_code,
                record.employee_name,
                record.source_row_number,
                record.work_duration_hours,
            )
        if (record.work_duration_hours == 0 and not is_non_working_status) or record.work_duration_hours > 20:
            _add_flag(record, "invalid_duration")
            logger.warning(
                "Invalid attendance duration detected employee_code=%s employee_name=%s row=%s duration=%s",
                record.employee_code,
                record.employee_name,
                record.source_row_number,
                record.work_duration_hours,
            )
        if record.work_duration_hours > 16:
            _add_flag(record, "suspicious_entry")
            if "overnight_punch" in record.anomaly_flags:
                _add_flag(record, "impossible_overnight_shift")
                logger.warning(
                    "Impossible overnight shift detected employee_code=%s employee_name=%s row=%s duration=%s",
                    record.employee_code,
                    record.employee_name,
                    record.source_row_number,
                    record.work_duration_hours,
                )

    if (
        not record.employee_code
        and not record.employee_name
        and not record.attendance_status
        and record.date_value is not None
    ):
        _add_flag(record, "suspicious_entry")


def _single_record_group(
    record: AttendanceNormalizedRecord,
    *,
    category: str,
    severity: str,
    summary: str,
    details: str,
    suggested_action: str,
    anomaly_flags: list[str],
    requires_review: bool = True,
) -> AttendanceExceptionGroup:
    action_options = _action_options_for_category(category)
    if category == "missing_punch" and _is_late_candidate(record):
        action_options = [
            *action_options[:1],
            AttendanceExceptionActionOption(
                action_key="mark_present_but_late",
                label="Mark present but late",
                description="Approve the day as payable while keeping the late flag and late deduction impact active.",
            ),
            *action_options[1:],
        ]
    exception_id = _build_exception_id(
        category,
        record,
        record.date_value.strftime("%Y-%m-%d") if record.date_value is not None else "unknown-date",
    )
    return AttendanceExceptionGroup(
        exception_id=exception_id,
        category=category,
        severity=severity,
        employee_code=record.employee_code,
        employee_name=record.employee_name,
        date=record.date_value.strftime("%Y-%m-%d") if record.date_value is not None else "",
        unit=record.unit,
        summary=summary,
        details=details,
        suggested_action=suggested_action,
        selected_action="",
        requires_review=requires_review,
        anomaly_flags=anomaly_flags,
        action_options=action_options,
        candidate_rows=[_candidate_from_record(record)],
    )


def _action_options_for_category(category: str) -> list[AttendanceExceptionActionOption]:
    if category in {"multiple_entries", "duplicate_punches"}:
        return [
            AttendanceExceptionActionOption(
                action_key="keep_first_punch",
                label="Keep first punch",
                description="Use the earliest candidate row for this employee and date.",
            ),
            AttendanceExceptionActionOption(
                action_key="keep_latest_punch",
                label="Keep latest punch",
                description="Use the latest candidate row for this employee and date.",
            ),
            AttendanceExceptionActionOption(
                action_key="merge_punches",
                label="Merge punches",
                description="Combine the earliest in-time with the latest out-time across duplicate rows.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_absent",
                label="Mark absent",
                description="Ignore punch candidates and mark the day as absent.",
            ),
            AttendanceExceptionActionOption(
                action_key="manual_override",
                label="Manual override",
                description="Flag this row for manual attendance handling.",
            ),
            AttendanceExceptionActionOption(
                action_key="ignore_anomaly",
                label="Ignore anomaly",
                description="Keep a provisional result and retain the anomaly flag.",
            ),
        ]

    if category == "missing_punch":
        options = [
            AttendanceExceptionActionOption(
                action_key="mark_present",
                label="Mark present",
                description="Approve the day as present after checking the missing punch.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_half_day",
                label="Mark half day",
                description="Approve the day as half day after checking the missing punch.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_paid_holiday",
                label="Mark paid holiday",
                description="Treat the day as a paid holiday and recalculate payroll.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_comp_off",
                label="Mark comp off",
                description="Use this worked day as a comp off adjustment instead of direct pay.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_absent",
                label="Mark absent",
                description="Treat the day as absent after HR review.",
            ),
            AttendanceExceptionActionOption(
                action_key="manual_override",
                label="Manual override",
                description="Keep this row pending until HR completes a manual adjustment.",
            ),
            AttendanceExceptionActionOption(
                action_key="ignore_anomaly",
                label="Ignore anomaly",
                description="Keep the punch row and continue attendance calculation despite the missing punch.",
            ),
        ]
        return options

    if category == "absent_review":
        return [
            AttendanceExceptionActionOption(
                action_key="mark_present",
                label="Mark present",
                description="Approve the absent day as present and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_half_day",
                label="Mark half day",
                description="Approve the absent day as half day and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_paid_leave",
                label="Mark paid leave / paid day",
                description="Approve the absent day as a fully paid leave day and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_comp_off_adjusted",
                label="Mark comp off adjusted",
                description="Adjust this absent day against comp off and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_leave_adjusted",
                label="Mark leave adjusted",
                description="Adjust this absent day against approved leave and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_paid_holiday",
                label="Mark paid holiday",
                description="Convert this absent day into a paid holiday and recalculate payroll immediately.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_unpaid_leave",
                label="Mark unpaid leave",
                description="Finalize this absent day as unpaid leave with zero payroll impact.",
            ),
            AttendanceExceptionActionOption(
                action_key="keep_as_is",
                label="Keep as absent",
                description="Keep the current absent result and payroll impact unchanged.",
            ),
        ]

    if category == "late_review":
        return [
            AttendanceExceptionActionOption(
                action_key="keep_as_is",
                label="Keep as is",
                description="Keep the existing late payroll effect for this attendance day.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_present",
                label="Mark present",
                description="Regularize the late entry and remove the late payroll effect.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_present_but_late",
                label="Mark present but late",
                description="Approve the day as payable while keeping the late flag and late deduction impact active.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_half_day",
                label="Mark half day",
                description="Override this attendance day to half day and remove the late payroll effect.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_paid_holiday",
                label="Mark paid holiday",
                description="Convert the day into a paid holiday and remove the late payroll effect.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_comp_off",
                label="Mark comp off",
                description="Convert the day into a comp off case instead of applying the late payroll effect.",
            ),
            AttendanceExceptionActionOption(
                action_key="mark_absent",
                label="Mark absent",
                description="Finalize the day as absent instead of keeping the late payroll effect.",
            ),
            AttendanceExceptionActionOption(
                action_key="manual_override",
                label="Manual override",
                description="Send this late row for manual HR handling.",
            ),
        ]

    return [
        AttendanceExceptionActionOption(
            action_key="mark_present",
            label="Mark present",
            description="Approve the current row as present after HR review.",
        ),
        AttendanceExceptionActionOption(
            action_key="mark_half_day",
            label="Mark half day",
            description="Approve the current row as half day after HR review.",
        ),
        AttendanceExceptionActionOption(
            action_key="mark_paid_holiday",
            label="Mark paid holiday",
            description="Mark the selected date as a paid holiday and recalculate attendance.",
        ),
        AttendanceExceptionActionOption(
            action_key="mark_comp_off",
            label="Mark comp off",
            description="Approve the day as comp off and use it for absence adjustment.",
        ),
        AttendanceExceptionActionOption(
            action_key="manual_override",
            label="Manual override",
            description="Flag this entry for manual attendance handling.",
        ),
        AttendanceExceptionActionOption(
            action_key="mark_absent",
            label="Mark absent",
            description="Mark this employee-date combination as absent.",
        ),
        AttendanceExceptionActionOption(
            action_key="ignore_anomaly",
            label="Ignore anomaly",
            description="Keep the row provisionally and retain the anomaly flag.",
        ),
    ]


def _is_late_candidate(record: AttendanceNormalizedRecord) -> bool:
    return (
        record.in_time is not None
        and (record.in_time.time().hour, record.in_time.time().minute, record.in_time.time().second)
        > (LATE_REVIEW_CUTOFF.hour, LATE_REVIEW_CUTOFF.minute, LATE_REVIEW_CUTOFF.second)
    )


def _candidate_from_record(record: AttendanceNormalizedRecord) -> AttendanceExceptionCandidate:
    return AttendanceExceptionCandidate(
        record_id=record.record_id,
        source_row_number=record.source_row_number,
        employee_code=record.employee_code,
        employee_name=record.employee_name,
        date=record.date_value.strftime("%Y-%m-%d") if record.date_value is not None else "",
        in_time=_timestamp_to_text(record.in_time),
        out_time=_timestamp_to_text(record.out_time),
        work_duration=_duration_to_text(record.work_duration_hours),
        attendance_status=record.attendance_status,
        remarks=record.remarks,
    )


def _has_duplicate_punch_signature(records: list[AttendanceNormalizedRecord]) -> bool:
    signatures = set()
    duplicate_count = 0
    for record in records:
        signature = (
            _timestamp_to_text(record.in_time),
            _timestamp_to_text(record.out_time),
            _duration_to_text(record.work_duration_hours),
        )
        if signature in signatures:
            duplicate_count += 1
        signatures.add(signature)
    return duplicate_count > 0


def _build_exception_id(category: str, record: AttendanceNormalizedRecord, date_key: str) -> str:
    owner = _employee_key(record) or f"row-{record.source_row_number}"
    safe_owner = re.sub(r"[^a-z0-9]+", "-", owner.lower()).strip("-") or "unknown"
    return f"{category}-{safe_owner}-{date_key}"


def _employee_key(record: AttendanceNormalizedRecord) -> str:
    return record.employee_code or record.employee_name or f"row-{record.source_row_number}"


def _timestamp_to_text(value: Optional[pd.Timestamp]) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%d %H:%M")


def _duration_to_text(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def _add_flag(record: AttendanceNormalizedRecord, flag: str) -> None:
    if flag not in record.anomaly_flags:
        record.anomaly_flags.append(flag)


def _should_allow_absent_review(record: AttendanceNormalizedRecord) -> bool:
    if "administrative_exception_override" in record.anomaly_flags:
        return False

    normalized_status = (record.attendance_status or "").strip().lower()
    if normalized_status in {"wo", "week off", "weekly off"}:
        return False

    if any(token in normalized_status for token in HOLIDAY_STATUS_TOKENS):
        return False

    if record.in_time is None and record.out_time is None and normalized_status in {"a", "absent"}:
        return True

    if record.work_duration_hours is not None and record.work_duration_hours < 3:
        return True

    return False


def _should_allow_late_review(record: AttendanceNormalizedRecord) -> bool:
    normalized_status = (record.attendance_status or "").strip().lower()
    if _is_non_working_status(normalized_status):
        return False

    if record.in_time is None or record.out_time is None:
        return False

    if record.work_duration_hours is None or record.work_duration_hours < 3:
        return False

    if any(
        flag in record.anomaly_flags
        for flag in {
            "missing_in_time",
            "missing_out_time",
            "invalid_duration",
            "negative_duration",
            "impossible_overnight_shift",
            "pending_review",
        }
    ):
        return False

    return (
        record.in_time.time().hour,
        record.in_time.time().minute,
        record.in_time.time().second,
    ) > (
        LATE_REVIEW_CUTOFF.hour,
        LATE_REVIEW_CUTOFF.minute,
        LATE_REVIEW_CUTOFF.second,
    )


def _is_auto_payable_missing_out_time(record: AttendanceNormalizedRecord) -> bool:
    return (
        record.in_time is not None
        and record.out_time is None
        and "missing_out_time" in record.anomaly_flags
        and "missing_in_time" not in record.anomaly_flags
    )


def _is_non_working_status(normalized_status: str) -> bool:
    if normalized_status in NON_WORKING_EXACT_STATUSES:
        return True

    return any(token in normalized_status for token in HOLIDAY_STATUS_TOKENS)
