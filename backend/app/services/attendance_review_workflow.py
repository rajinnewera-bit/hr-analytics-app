from dataclasses import dataclass, replace
from datetime import datetime, time, timezone
from typing import Optional

import pandas as pd

from app.schemas.upload import AttendanceExceptionGroup, AttendanceReviewDecision
from app.services.attendance_ingestion import AttendanceNormalizedRecord

LATE_REGULARIZATION_CUTOFF = time(hour=10, minute=11)


@dataclass
class AttendanceReviewWorkflowResult:
    resolved_records: list[AttendanceNormalizedRecord]
    exception_groups: list[AttendanceExceptionGroup]


def apply_attendance_review_workflow(
    records: list[AttendanceNormalizedRecord],
    exception_groups: list[AttendanceExceptionGroup],
    decisions: Optional[list[AttendanceReviewDecision]] = None,
) -> AttendanceReviewWorkflowResult:
    decision_map = {
        item.exception_id: item
        for item in (decisions or [])
        if item.action_key
        and (
            not explicit_hr_action(item.action_key)
            or _decision_has_comment(item)
        )
    }
    record_map = {record.record_id: record for record in records}
    consumed_record_ids: set[str] = set()
    resolved_records: list[AttendanceNormalizedRecord] = []
    updated_groups: list[AttendanceExceptionGroup] = []

    for group in exception_groups:
        group_record_ids = [candidate.record_id for candidate in group.candidate_rows if candidate.record_id]
        candidate_records = [
            record_map[record_id]
            for record_id in group_record_ids
            if record_id in record_map and record_id not in consumed_record_ids
        ]
        if not candidate_records:
            updated_groups.append(group)
            continue

        explicit_decision = decision_map.get(group.exception_id)
        explicit_action = explicit_decision.action_key if explicit_decision else ""
        effective_action = explicit_action or group.selected_action or group.suggested_action or "manual_override"
        requires_review = False if explicit_action else group.requires_review
        resolved_group_records = _resolve_group_records(
            candidate_records,
            effective_action,
            requires_review,
            explicit_decision=explicit_decision,
        )
        consumed_record_ids.update(record.record_id for record in candidate_records)
        resolved_records.extend(resolved_group_records)

        updated_groups.append(
            group.model_copy(
                update={
                    "selected_action": explicit_action or group.selected_action,
                    "requires_review": requires_review,
                }
            )
        )

    for record in records:
        if record.record_id in consumed_record_ids:
            continue
        resolved_records.append(replace(record))

    resolved_records.sort(
        key=lambda item: (
            item.date_value.strftime("%Y-%m-%d") if item.date_value is not None else "9999-99-99",
            item.employee_code or item.employee_name or item.record_id,
            item.source_row_number,
        )
    )

    return AttendanceReviewWorkflowResult(
        resolved_records=resolved_records,
        exception_groups=updated_groups,
    )


def _resolve_group_records(
    records: list[AttendanceNormalizedRecord],
    action_key: str,
    pending_review: bool,
    explicit_decision: Optional[AttendanceReviewDecision] = None,
) -> list[AttendanceNormalizedRecord]:
    sorted_records = sorted(records, key=lambda item: item.source_row_number)

    if action_key == "keep_first_punch":
        resolved_record = replace(sorted_records[0])
    elif action_key == "keep_latest_punch":
        resolved_record = replace(sorted_records[-1])
    elif action_key == "merge_punches":
        resolved_record = _merge_records(sorted_records)
    elif action_key == "mark_present":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Present"
        _append_flag(resolved_record, "hr_override_present")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row as present.",
        )
    elif action_key == "mark_present_but_late":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Present but Late"
        _append_flag(resolved_record, "hr_override_present_but_late")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row as present but late.",
        )
    elif action_key == "mark_half_day":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Half Day"
        _append_flag(resolved_record, "hr_override_half_day")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row as half day.",
        )
    elif action_key == "mark_paid_holiday":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Paid Holiday"
        _append_flag(resolved_record, "hr_override_paid_holiday")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row as a paid holiday.",
        )
    elif action_key == "mark_paid_leave":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Paid Leave"
        _append_flag(resolved_record, "hr_override_paid_leave")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row as a paid leave day.",
        )
    elif action_key == "mark_comp_off":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Comp Off"
        _append_flag(resolved_record, "hr_override_comp_off")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR approved this attendance row for comp off adjustment.",
        )
    elif action_key == "mark_comp_off_adjusted":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Comp Off Adjusted"
        _append_flag(resolved_record, "hr_override_comp_off_adjusted")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR adjusted this absent day against comp off.",
        )
    elif action_key == "mark_leave_adjusted":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Leave Adjusted"
        _append_flag(resolved_record, "hr_override_leave_adjusted")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR adjusted this absent day against approved leave.",
        )
    elif action_key == "mark_unpaid_leave":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        resolved_record.hr_override_status = "Unpaid Leave"
        _append_flag(resolved_record, "hr_override_unpaid_leave")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "HR finalized this day as unpaid leave.",
        )
    elif action_key == "mark_absent":
        resolved_record = _mark_absent(sorted_records[0])
    elif action_key == "manual_override":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        _append_flag(resolved_record, "manual_override")
        resolved_record.remarks = _append_text(resolved_record.remarks, "Manual override requested by HR.")
    elif action_key == "ignore_anomaly":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
        _append_flag(resolved_record, "ignored_anomaly")
    elif action_key == "keep_as_is":
        resolved_record = _merge_records(sorted_records) if len(sorted_records) > 1 else replace(sorted_records[0])
    else:
        resolved_record = replace(sorted_records[0])

    resolved_record.review_action = action_key
    if explicit_hr_action(action_key):
        if action_key != "mark_present_but_late":
            _apply_late_regularization_if_needed(resolved_record)
        resolved_record.action_source = "HR Regularization"
        resolved_record.action_reason = (
            explicit_decision.reason.strip() if explicit_decision and explicit_decision.reason.strip() else ""
        )
        resolved_record.action_remarks = (
            explicit_decision.remarks.strip() if explicit_decision and explicit_decision.remarks.strip() else ""
        )
        resolved_record.hr_reviewed_by = (
            explicit_decision.action_by.strip()
            if explicit_decision and explicit_decision.action_by.strip()
            else "HR"
        )
        resolved_record.hr_reviewed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            explicit_decision.remarks.strip() if explicit_decision and explicit_decision.remarks.strip() else "",
        )
        resolved_record.activity = explicit_decision.reason.strip() if explicit_decision else resolved_record.activity

    if pending_review:
        _append_flag(resolved_record, "pending_review")
        resolved_record.remarks = _append_text(
            resolved_record.remarks,
            "Pending HR review. Provisional action applied.",
        )

    return [resolved_record]


def _merge_records(records: list[AttendanceNormalizedRecord]) -> AttendanceNormalizedRecord:
    base_record = replace(records[0])
    base_record.source_row_number = min(record.source_row_number for record in records)

    in_times = [record.in_time for record in records if record.in_time is not None]
    out_times = [record.out_time for record in records if record.out_time is not None]
    duration_candidates = [record.work_duration_hours for record in records if record.work_duration_hours is not None]
    remarks = [record.remarks for record in records if record.remarks]
    statuses = [record.attendance_status for record in records if record.attendance_status]
    anomaly_flags: list[str] = []

    if in_times:
        base_record.in_time = min(in_times)
    if out_times:
        base_record.out_time = max(out_times)

    if base_record.in_time is not None and base_record.out_time is not None:
        duration = (base_record.out_time - base_record.in_time).total_seconds() / 3600
        if duration < 0:
            duration += 24
        base_record.work_duration_hours = round(duration, 2)
    elif duration_candidates:
        base_record.work_duration_hours = max(duration_candidates)

    if not base_record.employee_code:
        base_record.employee_code = next((record.employee_code for record in records if record.employee_code), "")
    if not base_record.employee_name:
        base_record.employee_name = next((record.employee_name for record in records if record.employee_name), "")
    if not base_record.unit:
        base_record.unit = next((record.unit for record in records if record.unit), "")

    base_record.attendance_status = statuses[0] if statuses else base_record.attendance_status
    base_record.remarks = " | ".join(dict.fromkeys(remarks))

    for record in records:
        for flag in record.anomaly_flags:
            if flag not in anomaly_flags:
                anomaly_flags.append(flag)
    base_record.anomaly_flags = anomaly_flags

    return base_record


def _mark_absent(record: AttendanceNormalizedRecord) -> AttendanceNormalizedRecord:
    absent_record = replace(record)
    absent_record.in_time = None
    absent_record.out_time = None
    absent_record.work_duration_hours = 0.0
    absent_record.attendance_status = "Absent"
    _append_flag(absent_record, "marked_absent")
    absent_record.remarks = _append_text(absent_record.remarks, "Marked absent during HR review.")
    return absent_record


def _append_flag(record: AttendanceNormalizedRecord, flag: str) -> None:
    if flag not in record.anomaly_flags:
        record.anomaly_flags.append(flag)


def _append_text(existing_text: str, extra_text: str) -> str:
    if not existing_text:
        return extra_text
    if extra_text in existing_text:
        return existing_text
    return f"{existing_text} | {extra_text}"


def _decision_has_comment(decision: AttendanceReviewDecision) -> bool:
    return bool((decision.reason or "").strip() or (decision.remarks or "").strip())


def explicit_hr_action(action_key: str) -> bool:
    return action_key in {
        "mark_present",
        "mark_present_but_late",
        "mark_half_day",
        "mark_paid_holiday",
        "mark_paid_leave",
        "mark_comp_off",
        "mark_comp_off_adjusted",
        "mark_leave_adjusted",
        "mark_unpaid_leave",
        "mark_absent",
    }


def _apply_late_regularization_if_needed(record: AttendanceNormalizedRecord) -> None:
    if record.in_time is None:
        return

    if (record.in_time.time().hour, record.in_time.time().minute, record.in_time.time().second) <= (
        LATE_REGULARIZATION_CUTOFF.hour,
        LATE_REGULARIZATION_CUTOFF.minute,
        LATE_REGULARIZATION_CUTOFF.second,
    ):
        return

    if "late_regularized" not in record.anomaly_flags:
        record.anomaly_flags.append("late_regularized")

    record.remarks = _append_text(
        record.remarks,
        "HR regularized the late entry for payroll calculation.",
    )
