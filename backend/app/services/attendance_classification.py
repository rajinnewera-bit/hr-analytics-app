from dataclasses import dataclass
from datetime import time
from typing import Optional

import pandas as pd

from app.schemas.upload import AttendancePolicyRule, AttendanceProcessedRow
from app.services.attendance_ingestion import AttendanceNormalizedRecord
from app.services.attendance_rule_engine import rule_hours, rule_time, rule_tokens

FEMALE_TOKENS = {"female", "f", "woman", "women", "lady"}


@dataclass
class AttendanceClassificationResult:
    processed_rows: list[AttendanceProcessedRow]


@dataclass
class FinalAttendanceDecision:
    status_code: str
    status_label: str
    rule_id: str
    explanation: str
    payroll_value: float
    payroll_label: str
    derived_flags: list[str]


def classify_attendance_records(
    records: list[AttendanceNormalizedRecord],
    policy_rules: list[AttendancePolicyRule],
) -> AttendanceClassificationResult:
    rule_map = {rule.rule_id: rule for rule in policy_rules}
    late_after = rule_time(rule_map, "late_after_time", "10:11")
    half_day_after = rule_time(rule_map, "half_day_after_time", "12:00")
    full_shift_hours = rule_hours(rule_map, "full_shift_hours_threshold", 10.0)
    female_full_shift_hours = rule_hours(
        rule_map,
        "female_full_shift_hours_threshold",
        9.0,
    )
    minimum_present_hours = rule_hours(
        rule_map,
        "minimum_present_hours_threshold",
        5.0,
    )
    non_working_day_full_present_hours = rule_hours(
        rule_map,
        "non_working_day_full_present_hours_threshold",
        minimum_present_hours,
    )
    wo_tokens = rule_tokens(rule_map, "wo_tokens", "wo,week off,weekly off")
    holiday_tokens = rule_tokens(
        rule_map,
        "holiday_tokens",
        "holiday,public holiday,national holiday",
    )

    processed_rows: list[AttendanceProcessedRow] = []
    for record in records:
        decision = _classify_record(
            record,
            late_after=late_after,
            half_day_after=half_day_after,
            full_shift_hours=full_shift_hours,
            female_full_shift_hours=female_full_shift_hours,
            minimum_present_hours=minimum_present_hours,
            non_working_day_full_present_hours=non_working_day_full_present_hours,
            wo_tokens=wo_tokens,
            holiday_tokens=holiday_tokens,
        )
        processed_rows.append(
            AttendanceProcessedRow(
                record_id=record.record_id,
                employee_code=record.employee_code,
                employee_name=record.employee_name,
                gender=record.gender,
                date=record.date_value.strftime("%Y-%m-%d") if record.date_value is not None else "",
                day_label=record.day_label,
                unit=record.unit,
                raw_status=record.attendance_status,
                in_time=_format_timestamp(record.in_time),
                out_time=_format_timestamp(record.out_time),
                working_hours=_format_duration(record.work_duration_hours),
                final_status_code=decision.status_code,
                attendance_classification=decision.status_label,
                payable_day_impact=decision.payroll_value,
                payable_value=decision.payroll_value,
                comp_off_earned=0.0,
                comp_off_adjusted=0.0,
                late_deduction_adjusted=0.0,
                payroll_impact_label=decision.payroll_label,
                detected_rule_id=decision.rule_id,
                rule_explanation=decision.explanation,
                remarks=record.remarks,
                hr_override_status=record.hr_override_status,
                hr_reviewed_by=record.hr_reviewed_by,
                hr_reviewed_at=record.hr_reviewed_at,
                action_source=record.action_source,
                action_reason=record.action_reason,
                action_remarks=record.action_remarks,
                derived_flags=decision.derived_flags,
                anomaly_flags=record.anomaly_flags,
                source_row_numbers=[record.source_row_number],
            )
        )

    _apply_weekoff_and_holiday_pay_rules(processed_rows)
    processed_rows.sort(
        key=lambda item: (
            item.date,
            item.employee_code or item.employee_name,
            item.record_id,
        )
    )
    return AttendanceClassificationResult(processed_rows=processed_rows)


def _classify_record(
    record: AttendanceNormalizedRecord,
    *,
    late_after: time,
    half_day_after: time,
    full_shift_hours: float,
    female_full_shift_hours: float,
    minimum_present_hours: float,
    non_working_day_full_present_hours: float,
    wo_tokens: list[str],
    holiday_tokens: list[str],
) -> FinalAttendanceDecision:
    normalized_status = (record.attendance_status or "").strip().lower()
    is_explicit_holiday = _is_explicit_holiday(normalized_status, holiday_tokens)
    is_week_off = _is_week_off(record, normalized_status, wo_tokens)
    threshold_hours = _full_shift_threshold_for_record(
        record,
        full_shift_hours,
        female_full_shift_hours,
    )
    is_late = record.in_time is not None and _time_is_after(record.in_time.time(), late_after)
    is_half_day_entry = record.in_time is not None and _time_is_after_or_equal(
        record.in_time.time(),
        half_day_after,
    )
    is_overnight = "overnight_punch" in record.anomaly_flags
    no_in_time = record.in_time is None
    no_out_time = record.out_time is None
    no_punches = no_in_time and no_out_time
    worked_hours = record.work_duration_hours
    suppress_discipline_flags = (is_week_off or is_explicit_holiday) and not no_punches
    derived_flags = _build_derived_flags(
        is_late=is_late,
        is_overnight=is_overnight,
        worked_hours=worked_hours,
        threshold_hours=threshold_hours,
        minimum_present_hours=minimum_present_hours,
        no_in_time=no_in_time,
        no_out_time=no_out_time,
        anomaly_flags=record.anomaly_flags,
        suppress_discipline_flags=suppress_discipline_flags,
    )

    if record.hr_override_status:
        return _classify_hr_override(record.hr_override_status, derived_flags)

    if "pending_review" in record.anomaly_flags or record.review_action == "manual_override":
        return FinalAttendanceDecision(
            status_code="irregular_review",
            status_label="Irregular Punch Pending HR Review",
            rule_id="pending_hr_review",
            explanation="This attendance row has unresolved anomalies and is waiting for HR review before payroll can be finalized.",
            payroll_value=0.0,
            payroll_label="Pending HR Review",
            derived_flags=derived_flags,
        )

    if no_punches:
        if is_explicit_holiday:
            return FinalAttendanceDecision(
                status_code="holiday",
                status_label="Holiday",
                rule_id="holiday",
                explanation="The raw attendance status marks this date as a holiday.",
                payroll_value=1.0,
                payroll_label="Paid Holiday",
                derived_flags=derived_flags,
            )
        if is_week_off:
            return FinalAttendanceDecision(
                status_code="week_off",
                status_label="WO",
                rule_id="wo_or_holiday",
                explanation="The row was classified as a weekly off based on status labels or a Sunday attendance date.",
                payroll_value=1.0,
                payroll_label="Paid WO",
                derived_flags=derived_flags,
            )
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Absent",
            rule_id="absent_no_valid_punch",
            explanation="No valid in-time or out-time was available for this employee-date combination.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=derived_flags,
        )

    if no_out_time and not no_in_time:
        if is_late:
            return FinalAttendanceDecision(
                status_code="present_late",
                status_label="Present but Late - Missing Out Time",
                rule_id="late_missing_out_time_payable",
                explanation="An in-time exists after the late cutoff and the out-time is missing. The day stays payroll-payable by default, while the late-entry impact remains active.",
                payroll_value=1.0,
                payroll_label="1.0 Payable Day",
                derived_flags=derived_flags,
            )
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Present - Missing Out Time",
            rule_id="missing_out_time_payable",
            explanation="An in-time exists within the allowed cutoff and the out-time is missing. The day stays payroll-payable by default while the missing out-time anomaly remains visible.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=derived_flags,
        )

    if no_in_time and not no_out_time:
        return FinalAttendanceDecision(
            status_code="irregular_review",
            status_label="Irregular Punch Pending HR Review",
            rule_id="missing_in_time",
            explanation="An out-time exists without a corresponding in-time, so the row remains a missing-punch case for HR review.",
            payroll_value=0.0,
            payroll_label="Pending HR Review",
            derived_flags=derived_flags,
        )

    if worked_hours is None:
        return FinalAttendanceDecision(
            status_code="irregular_review",
            status_label="Irregular Punch Pending HR Review",
            rule_id="unreadable_work_duration",
            explanation="Working hours could not be derived reliably from the punch data, so this row requires HR review.",
            payroll_value=0.0,
            payroll_label="Pending HR Review",
            derived_flags=derived_flags,
        )

    if "invalid_duration" in record.anomaly_flags or "negative_duration" in record.anomaly_flags:
        return FinalAttendanceDecision(
            status_code="irregular_review",
            status_label="Irregular Punch Pending HR Review",
            rule_id="invalid_or_negative_duration",
            explanation="The working duration is invalid or negative, so the row requires HR review before payroll is finalized.",
            payroll_value=0.0,
            payroll_label="Pending HR Review",
            derived_flags=derived_flags,
        )

    if "impossible_overnight_shift" in record.anomaly_flags:
        return FinalAttendanceDecision(
            status_code="irregular_review",
            status_label="Irregular Punch Pending HR Review",
            rule_id="impossible_overnight_shift",
            explanation="The overnight punch pattern is beyond the configured reasonable shift window and requires HR review.",
            payroll_value=0.0,
            payroll_label="Pending HR Review",
            derived_flags=derived_flags,
        )

    if is_week_off or is_explicit_holiday:
        return _classify_worked_non_working_day(
            is_week_off=is_week_off,
            is_explicit_holiday=is_explicit_holiday,
            worked_hours=worked_hours,
            non_working_day_full_present_hours=non_working_day_full_present_hours,
            derived_flags=derived_flags,
        )

    if normalized_status in {"a", "absent"} and not _has_valid_punch(record):
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Absent",
            rule_id="absent_raw_status",
            explanation="The raw attendance status marks this date as absent and no valid punch data was available.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=derived_flags,
        )

    if worked_hours < 3:
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Absent",
            rule_id="below_three_hours",
            explanation="The employee worked for less than 3.00 hours, so the day is treated as absent.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=derived_flags,
        )

    if worked_hours < minimum_present_hours:
        return _non_working_day_adjustment(
            FinalAttendanceDecision(
            status_code="half_day",
            status_label="Half Day",
            rule_id="half_day_below_minimum_hours",
            explanation=f"Working hours are below the configured minimum present threshold of {minimum_present_hours:.2f} hours.",
            payroll_value=0.5,
            payroll_label="0.5 Payable Day",
            derived_flags=derived_flags,
            ),
            is_week_off=is_week_off,
            is_explicit_holiday=is_explicit_holiday,
        )

    if is_half_day_entry:
        return _non_working_day_adjustment(
            FinalAttendanceDecision(
            status_code="half_day",
            status_label="Half Day",
            rule_id="half_day_late_start",
            explanation="The in-time is at or after the half-day cutoff for the day.",
            payroll_value=0.5,
            payroll_label="0.5 Payable Day",
            derived_flags=derived_flags,
            ),
            is_week_off=is_week_off,
            is_explicit_holiday=is_explicit_holiday,
        )

    if worked_hours >= threshold_hours:
        if is_late:
            return _non_working_day_adjustment(
                FinalAttendanceDecision(
                status_code="present_late",
                status_label="Present but Late",
                rule_id="late_present",
                explanation="The employee reported after the late cutoff but completed a payable attendance day.",
                payroll_value=1.0,
                payroll_label="1.0 Payable Day",
                derived_flags=derived_flags,
                ),
                is_week_off=is_week_off,
                is_explicit_holiday=is_explicit_holiday,
            )
        return _non_working_day_adjustment(
            FinalAttendanceDecision(
            status_code="present",
            status_label="Present",
            rule_id="present_full_shift",
            explanation=f"The employee reported within the late cutoff and completed the required full-shift hours of {threshold_hours:.2f}.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=derived_flags,
            ),
            is_week_off=is_week_off,
            is_explicit_holiday=is_explicit_holiday,
        )

    if is_late:
        return _non_working_day_adjustment(
            FinalAttendanceDecision(
            status_code="present_late",
            status_label="Present but Late",
            rule_id="late_present",
            explanation="The employee reported after the late cutoff but still worked long enough to remain payable for the day.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=derived_flags,
            ),
            is_week_off=is_week_off,
            is_explicit_holiday=is_explicit_holiday,
        )

    return _non_working_day_adjustment(
        FinalAttendanceDecision(
        status_code="present",
        status_label="Present",
        rule_id="present_with_flags",
        explanation=f"The employee reported within the late cutoff and the day remains payable, but worked below the standard full-shift expectation of {threshold_hours:.2f} hours.",
        payroll_value=1.0,
        payroll_label="1.0 Payable Day",
        derived_flags=derived_flags,
        ),
        is_week_off=is_week_off,
        is_explicit_holiday=is_explicit_holiday,
    )


def _classify_hr_override(
    override_status: str,
    derived_flags: list[str],
) -> FinalAttendanceDecision:
    normalized_override = (override_status or "").strip().lower()
    if normalized_override == "absent":
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Absent",
            rule_id="hr_override_absent",
            explanation="HR reviewed the anomaly and finalized this day as absent.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=derived_flags,
        )
    if normalized_override == "half day":
        return FinalAttendanceDecision(
            status_code="half_day",
            status_label="Half Day",
            rule_id="hr_override_half_day",
            explanation="HR reviewed the anomaly and finalized this day as half day.",
            payroll_value=0.5,
            payroll_label="0.5 Payable Day",
            derived_flags=derived_flags,
        )
    if normalized_override == "present but late":
        next_flags = [flag for flag in derived_flags if flag != "late_regularized"]
        if "late_entry" not in next_flags:
            next_flags.append("late_entry")
        return FinalAttendanceDecision(
            status_code="present_late",
            status_label="Present but Late",
            rule_id="hr_override_present_but_late",
            explanation="HR reviewed the anomaly and finalized this day as present while keeping the late-entry payroll effect active.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "paid holiday":
        return FinalAttendanceDecision(
            status_code="paid_holiday",
            status_label="Paid Holiday",
            rule_id="hr_override_paid_holiday",
            explanation="HR reviewed the anomaly and finalized this day as a paid holiday.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=derived_flags,
        )
    if normalized_override == "paid leave":
        next_flags = list(derived_flags)
        if "paid_leave" not in next_flags:
            next_flags.append("paid_leave")
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Paid Leave",
            rule_id="hr_override_paid_leave",
            explanation="HR approved this day as paid leave and it is fully payroll-payable.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "special paid off":
        next_flags = list(derived_flags)
        if "special_paid_off" not in next_flags:
            next_flags.append("special_paid_off")
        return FinalAttendanceDecision(
            status_code="paid_holiday",
            status_label="Special Paid Off",
            rule_id="hr_override_special_paid_off",
            explanation="This day was approved as a special paid off and remains payroll-payable.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "unpaid off":
        next_flags = list(derived_flags)
        if "unpaid_off" not in next_flags:
            next_flags.append("unpaid_off")
        return FinalAttendanceDecision(
            status_code="unpaid_holiday",
            status_label="Unpaid Off",
            rule_id="hr_override_unpaid_off",
            explanation="This day was approved as unpaid off and does not add any payroll value.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "custom hr approved status":
        next_flags = list(derived_flags)
        if "custom_hr_approved_status" not in next_flags:
            next_flags.append("custom_hr_approved_status")
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Custom HR Approved Status",
            rule_id="hr_override_custom_hr_approved_status",
            explanation="HR applied a custom approved attendance status for this day.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "comp off adjusted":
        next_flags = list(derived_flags)
        if "comp_off_adjusted" not in next_flags:
            next_flags.append("comp_off_adjusted")
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Comp Off Adjusted",
            rule_id="hr_override_comp_off_adjusted",
            explanation="HR adjusted this day against comp off and made it payroll-payable immediately.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "leave adjusted":
        next_flags = list(derived_flags)
        if "leave_adjusted" not in next_flags:
            next_flags.append("leave_adjusted")
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Leave Adjusted",
            rule_id="hr_override_leave_adjusted",
            explanation="HR adjusted this day against approved leave and made it payroll-payable immediately.",
            payroll_value=1.0,
            payroll_label="1.0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "unpaid leave":
        next_flags = list(derived_flags)
        if "unpaid_leave" not in next_flags:
            next_flags.append("unpaid_leave")
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Unpaid Leave",
            rule_id="hr_override_unpaid_leave",
            explanation="HR reviewed the day and finalized it as unpaid leave.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=next_flags,
        )
    if normalized_override == "comp off":
        return FinalAttendanceDecision(
            status_code="present",
            status_label="Present",
            rule_id="hr_override_comp_off",
            explanation="HR reviewed the anomaly and approved this day for comp off adjustment instead of direct pay.",
            payroll_value=0.0,
            payroll_label="Comp Off Earned",
            derived_flags=derived_flags,
        )
    return FinalAttendanceDecision(
        status_code="present",
        status_label="Present",
        rule_id="hr_override_present",
        explanation="HR reviewed the anomaly and finalized this day as present.",
        payroll_value=1.0,
        payroll_label="1.0 Payable Day",
        derived_flags=derived_flags,
    )


def _full_shift_threshold_for_record(
    record: AttendanceNormalizedRecord,
    full_shift_hours: float,
    female_full_shift_hours: float,
) -> float:
    normalized_gender = (record.gender or "").strip().lower()
    if normalized_gender in FEMALE_TOKENS:
        return female_full_shift_hours
    return full_shift_hours


def _is_explicit_holiday(
    normalized_status: str,
    holiday_tokens: list[str],
) -> bool:
    return any(token in normalized_status for token in holiday_tokens)


def _is_week_off(
    record: AttendanceNormalizedRecord,
    normalized_status: str,
    wo_tokens: list[str],
) -> bool:
    if any(token in normalized_status for token in wo_tokens):
        return True

    day_label = (record.day_label or "").strip().lower()
    if day_label == "sunday":
        return True

    if record.date_value is not None and record.date_value.day_name().lower() == "sunday":
        return True

    return False


def _apply_weekoff_and_holiday_pay_rules(processed_rows: list[AttendanceProcessedRow]) -> None:
    weekly_work_map: dict[tuple[str, str], bool] = {}

    for row in processed_rows:
        if not row.date:
            continue
        date_value = pd.Timestamp(row.date)
        employee_key = row.employee_code or row.employee_name or row.record_id
        week_key = _week_key(date_value)
        is_weekday_work = (
            date_value.dayofweek < 6
            and row.final_status_code in {"present", "present_late", "half_day"}
            and row.payable_day_impact > 0
        )
        if is_weekday_work:
            weekly_work_map[(employee_key, week_key)] = True

    for row in processed_rows:
        if not row.date:
            continue
        if row.final_status_code not in {"week_off", "holiday"}:
            continue

        date_value = pd.Timestamp(row.date)
        employee_key = row.employee_code or row.employee_name or row.record_id
        week_key = _week_key(date_value)
        is_payable = weekly_work_map.get((employee_key, week_key), False)

        if row.final_status_code == "week_off":
            row.payable_day_impact = 1.0 if is_payable else 0.0
            row.final_status_code = "paid_wo" if is_payable else "unpaid_wo"
            row.attendance_classification = "Paid WO" if is_payable else "Unpaid WO"
            row.payroll_impact_label = "1.0 Payable Day" if is_payable else "0 Payable Day"
            row.rule_explanation = (
                "Sunday or weekly off is payable because the employee worked at least one day in the same week."
                if is_payable
                else "Sunday or weekly off is unpaid because the employee did not work on any weekday in the same week."
            )
        else:
            row.payable_day_impact = 1.0 if is_payable else 0.0
            row.final_status_code = "paid_holiday" if is_payable else "unpaid_holiday"
            row.attendance_classification = "Paid Holiday" if is_payable else "Unpaid Holiday"
            row.payroll_impact_label = "1.0 Payable Day" if is_payable else "0 Payable Day"
            row.rule_explanation = (
                "Holiday is payable because the employee worked at least one day in the same week."
                if is_payable
                else "Holiday is unpaid because the employee did not work on any day in the same week."
            )


def _has_valid_punch(record: AttendanceNormalizedRecord) -> bool:
    return (
        record.in_time is not None
        and record.out_time is not None
        and record.work_duration_hours is not None
        and record.work_duration_hours > 0
    )


def _build_derived_flags(
    *,
    is_late: bool,
    is_overnight: bool,
    worked_hours: Optional[float],
    threshold_hours: float,
    minimum_present_hours: float,
    no_in_time: bool,
    no_out_time: bool,
    anomaly_flags: list[str],
    suppress_discipline_flags: bool,
) -> list[str]:
    flags: list[str] = []
    late_flag_suppressed = "late_regularized" in anomaly_flags
    if is_late and not late_flag_suppressed and not suppress_discipline_flags:
        flags.append("late_entry")
    if is_overnight:
        flags.append("overnight_exit")
    if (
        worked_hours is not None
        and worked_hours < threshold_hours
        and worked_hours >= minimum_present_hours
        and not suppress_discipline_flags
    ):
        flags.append("early_logout")
    if no_in_time and not no_out_time:
        flags.append("missing_in_time")
    if no_out_time and not no_in_time:
        flags.append("missing_out_time")
    for flag in anomaly_flags:
        if flag not in flags:
            flags.append(flag)
    return flags


def _non_working_day_adjustment(
    decision: FinalAttendanceDecision,
    *,
    is_week_off: bool,
    is_explicit_holiday: bool,
) -> FinalAttendanceDecision:
    if not is_week_off and not is_explicit_holiday:
        return decision

    next_flags = list(decision.derived_flags)
    if is_week_off and "worked_on_weekoff" not in next_flags:
        next_flags.append("worked_on_weekoff")
    if is_explicit_holiday and "worked_on_holiday" not in next_flags:
        next_flags.append("worked_on_holiday")

    worked_label = "week off" if is_week_off and not is_explicit_holiday else "holiday"
    return FinalAttendanceDecision(
        status_code=decision.status_code,
        status_label=decision.status_label,
        rule_id=f"{decision.rule_id}_worked_non_working_day",
        explanation=(
            f"The employee worked on a {worked_label}, so the day remains payroll-payable for the current month "
            "and also earns comp off credit in the separate comp off ledger."
        ),
        payroll_value=decision.payroll_value,
        payroll_label=decision.payroll_label,
        derived_flags=next_flags,
    )


def _classify_worked_non_working_day(
    *,
    is_week_off: bool,
    is_explicit_holiday: bool,
    worked_hours: Optional[float],
    non_working_day_full_present_hours: float,
    derived_flags: list[str],
) -> FinalAttendanceDecision:
    if worked_hours is None or worked_hours <= 0:
        return FinalAttendanceDecision(
            status_code="absent",
            status_label="Absent",
            rule_id="non_working_day_no_valid_duration",
            explanation="This non-working day did not contain enough valid punch duration to award attendance credit.",
            payroll_value=0.0,
            payroll_label="0 Payable Day",
            derived_flags=derived_flags,
        )

    base_decision = FinalAttendanceDecision(
        status_code="present" if worked_hours >= non_working_day_full_present_hours else "half_day",
        status_label="Present" if worked_hours >= non_working_day_full_present_hours else "Half Day",
        rule_id=(
            "non_working_day_full_present"
            if worked_hours >= non_working_day_full_present_hours
            else "non_working_day_half_day"
        ),
        explanation=(
            f"Sunday, weekoff, or holiday work is classified as a full present day because working hours reached {non_working_day_full_present_hours:.2f} or more."
            if worked_hours >= non_working_day_full_present_hours
            else f"Sunday, weekoff, or holiday work is classified as a half day because working hours stayed below {non_working_day_full_present_hours:.2f}."
        ),
        payroll_value=1.0 if worked_hours >= non_working_day_full_present_hours else 0.5,
        payroll_label="1.0 Payable Day" if worked_hours >= non_working_day_full_present_hours else "0.5 Payable Day",
        derived_flags=derived_flags,
    )
    return _non_working_day_adjustment(
        base_decision,
        is_week_off=is_week_off,
        is_explicit_holiday=is_explicit_holiday,
    )


def _week_key(date_value: pd.Timestamp) -> str:
    week_start = date_value.normalize() - pd.Timedelta(days=int(date_value.dayofweek))
    return week_start.strftime("%Y-%m-%d")


def _time_is_after(actual: time, threshold: time) -> bool:
    return (actual.hour, actual.minute, actual.second) > (
        threshold.hour,
        threshold.minute,
        threshold.second,
    )


def _time_is_after_or_equal(actual: time, threshold: time) -> bool:
    return (actual.hour, actual.minute, actual.second) >= (
        threshold.hour,
        threshold.minute,
        threshold.second,
    )


def _format_timestamp(value: Optional[pd.Timestamp]) -> str:
    if value is None:
        return ""
    return value.strftime("%Y-%m-%d %H:%M")


def _format_duration(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"
