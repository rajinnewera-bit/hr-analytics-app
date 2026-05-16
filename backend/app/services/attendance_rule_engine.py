from datetime import datetime, time
from typing import Optional

from app.schemas.upload import AttendancePolicyRule


def build_default_attendance_policy_rules() -> list[AttendancePolicyRule]:
    return [
        AttendancePolicyRule(
            rule_id="late_after_time",
            label="Late after",
            description="Mark as late entry when the first punch is after this time.",
            value="10:11",
            value_type="time",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="half_day_after_time",
            label="Half-day after",
            description="Mark as half day when the first punch is after this time.",
            value="12:00",
            value_type="time",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="full_shift_hours_threshold",
            label="Full-shift hours",
            description="Minimum hours for a full paid shift for the standard workforce.",
            value="10.00",
            value_type="hours",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="female_full_shift_hours_threshold",
            label="Female full-shift hours",
            description="Minimum hours for a full paid shift for female employees when gender is available.",
            value="9.00",
            value_type="hours",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="minimum_present_hours_threshold",
            label="Minimum present hours",
            description="If working hours fall below this value, classify the day as present with working hours less than the minimum.",
            value="5.00",
            value_type="hours",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="non_working_day_full_present_hours_threshold",
            label="Non-working day full present hours",
            description="Minimum hours required to treat Sunday, weekoff, or holiday work as a full present day instead of a half day.",
            value="5.00",
            value_type="hours",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="impossible_overnight_hours_threshold",
            label="Impossible overnight threshold",
            description="Overnight shifts above this duration should be flagged as impossible or suspicious.",
            value="16.00",
            value_type="hours",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="wo_tokens",
            label="WO tokens",
            description="Attendance status keywords that should be treated as weekly off.",
            value="wo,week off,weekly off",
            value_type="tokens",
            enabled=True,
        ),
        AttendancePolicyRule(
            rule_id="holiday_tokens",
            label="Holiday tokens",
            description="Attendance status keywords that should be treated as holiday.",
            value="holiday,public holiday,national holiday,declared holiday,paid holiday",
            value_type="tokens",
            enabled=True,
        ),
    ]


def merge_attendance_policy_rules(
    provided_rules: Optional[list[AttendancePolicyRule]],
) -> list[AttendancePolicyRule]:
    defaults = build_default_attendance_policy_rules()
    if not provided_rules:
        return defaults

    provided_by_id = {rule.rule_id: rule for rule in provided_rules}
    merged_rules: list[AttendancePolicyRule] = []
    for default_rule in defaults:
        merged_rules.append(provided_by_id.get(default_rule.rule_id, default_rule))
    return merged_rules


def rule_time(rule_map: dict[str, AttendancePolicyRule], rule_id: str, fallback: str) -> time:
    rule = rule_map.get(rule_id)
    raw_value = (rule.value if rule and rule.enabled else fallback).strip()
    try:
        parsed = datetime.strptime(raw_value, "%H:%M")
        return parsed.time()
    except ValueError:
        parsed = datetime.strptime(fallback, "%H:%M")
        return parsed.time()


def rule_hours(rule_map: dict[str, AttendancePolicyRule], rule_id: str, fallback: float) -> float:
    rule = rule_map.get(rule_id)
    raw_value = rule.value if rule and rule.enabled else str(fallback)
    try:
        return float(raw_value)
    except ValueError:
        return fallback


def rule_tokens(rule_map: dict[str, AttendancePolicyRule], rule_id: str, fallback: str) -> list[str]:
    rule = rule_map.get(rule_id)
    raw_value = rule.value if rule and rule.enabled else fallback
    return [
        token.strip().lower()
        for token in raw_value.split(",")
        if token.strip()
    ]
