from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from app.schemas.upload import (
    AttendanceCompOffUsageTrailItem,
    AttendanceEmployeeMonthlyExplainability,
    AttendanceEmployeeMonthlySummaryItem,
    AttendanceProcessedRow,
    AttendanceStatusSummary,
    AttendanceUnitSummaryItem,
)

PAYROLL_DAY_STATUS_CODES = {
    "present",
    "present_late",
    "half_day",
    "absent",
    "paid_wo",
    "unpaid_wo",
    "paid_holiday",
    "unpaid_holiday",
    "irregular_review",
}


@dataclass
class EmployeeMonthReconciliation:
    gross_payable_days: float
    final_payable_days: float
    late_penalty_before_comp_off: float
    late_penalty_after_comp_off: float
    comp_off_earned_days: float
    comp_off_adjusted_against_absent_days: float
    comp_off_adjusted_against_late_days: float
    comp_off_adjusted_days: float
    comp_off_balance_days: float
    comp_off_carry_forward_days: float
    comp_off_usage_trail: list[AttendanceCompOffUsageTrailItem]


@dataclass
class CompOffSourceBalance:
    row: Optional[AttendanceProcessedRow]
    available: float
    earned_value: float
    source_record_id: str
    source_date: str
    source_day: str
    source_working_hours: str


@dataclass
class CompOffUsageTarget:
    row: Optional[AttendanceProcessedRow]
    adjusted_against_record_id: str
    adjusted_against_date: str
    adjusted_against_day: str
    adjusted_against_type: str
    adjusted_against_reason: str
    reference_dates: list[str]
    payroll_effect: str


def apply_monthly_payroll_reconciliation(
    processed_rows: list[AttendanceProcessedRow],
) -> None:
    employee_month_groups = _group_rows_by_employee_month(processed_rows)
    month_groups_by_employee: dict[str, list[tuple[str, list[AttendanceProcessedRow]]]] = defaultdict(list)

    for (employee_key, month), rows in employee_month_groups.items():
        month_groups_by_employee[employee_key].append((month, rows))

    for employee_key, month_groups in month_groups_by_employee.items():
        carry_forward_balance = 0.0
        for _, rows in sorted(month_groups, key=lambda item: item[0]):
            metrics = _reconcile_employee_month_rows(rows, carry_forward_balance)
            carry_forward_balance = metrics.comp_off_carry_forward_days


def build_status_summary(
    processed_rows: list[AttendanceProcessedRow],
) -> AttendanceStatusSummary:
    present_count = 0
    absent_count = 0
    half_day_count = 0
    paid_week_off_count = 0
    unpaid_week_off_count = 0
    paid_holiday_count = 0
    unpaid_holiday_count = 0
    irregular_punch_count = 0
    pending_review_count = 0
    comp_off_earned_count = 0
    comp_off_adjusted_days = 0.0
    late_entry_count = 0
    early_login_count = 0
    early_logout_count = 0
    overnight_exit_count = 0
    missing_punch_count = 0

    for row in processed_rows:
        is_irregular_punch = (
            row.final_status_code == "irregular_review"
            or "missing_in_time" in row.derived_flags
            or "missing_out_time" in row.derived_flags
        )
        if row.final_status_code in {"present", "present_late"}:
            present_count += 1
        elif row.final_status_code == "absent":
            absent_count += 1
        elif row.final_status_code == "half_day":
            half_day_count += 1
        elif row.final_status_code == "paid_wo":
            paid_week_off_count += 1
        elif row.final_status_code == "unpaid_wo":
            unpaid_week_off_count += 1
        elif row.final_status_code == "paid_holiday":
            paid_holiday_count += 1
        elif row.final_status_code == "unpaid_holiday":
            unpaid_holiday_count += 1
        elif row.final_status_code == "irregular_review":
            pending_review_count += 1

        if is_irregular_punch:
            irregular_punch_count += 1

        if row.comp_off_earned > 0:
            comp_off_earned_count += 1
        comp_off_adjusted_days += row.comp_off_adjusted

        if "late_entry" in row.derived_flags:
            late_entry_count += 1
        if "early_login" in row.derived_flags:
            early_login_count += 1
        if "early_logout" in row.derived_flags:
            early_logout_count += 1
        if "overnight_exit" in row.derived_flags:
            overnight_exit_count += 1
        if "missing_in_time" in row.derived_flags or "missing_out_time" in row.derived_flags:
            missing_punch_count += 1

    return AttendanceStatusSummary(
        present_count=present_count,
        absent_count=absent_count,
        half_day_count=half_day_count,
        paid_week_off_count=paid_week_off_count,
        unpaid_week_off_count=unpaid_week_off_count,
        paid_holiday_count=paid_holiday_count,
        unpaid_holiday_count=unpaid_holiday_count,
        irregular_punch_count=irregular_punch_count,
        pending_review_count=pending_review_count,
        comp_off_earned_count=comp_off_earned_count,
        comp_off_adjusted_days=round(comp_off_adjusted_days, 2),
        late_entry_count=late_entry_count,
        early_login_count=early_login_count,
        early_logout_count=early_logout_count,
        overnight_exit_count=overnight_exit_count,
        missing_punch_count=missing_punch_count,
    )


def build_employee_monthly_summary(
    processed_rows: list[AttendanceProcessedRow],
) -> list[AttendanceEmployeeMonthlySummaryItem]:
    grouped_rows = _group_rows_by_employee_month(processed_rows)
    month_groups_by_employee: dict[str, list[tuple[str, list[AttendanceProcessedRow]]]] = defaultdict(list)
    summary: list[AttendanceEmployeeMonthlySummaryItem] = []

    for (employee_key, month), rows in grouped_rows.items():
        month_groups_by_employee[employee_key].append((month, rows))

    for employee_key, month_groups in month_groups_by_employee.items():
        carry_forward_balance = 0.0
        for month, rows in sorted(month_groups, key=lambda item: item[0]):
            metrics = _reconcile_employee_month_rows(rows, carry_forward_balance)
            carry_forward_balance = metrics.comp_off_carry_forward_days
            first_row = rows[0]
            status_summary = build_status_summary(rows)
            summary.append(
                AttendanceEmployeeMonthlySummaryItem(
                    employee_name=first_row.employee_name,
                    employee_id=first_row.employee_code or employee_key,
                    month=month,
                    present_count=status_summary.present_count,
                    absent_count=status_summary.absent_count,
                    half_day_count=status_summary.half_day_count,
                    paid_week_off_count=status_summary.paid_week_off_count,
                    unpaid_week_off_count=status_summary.unpaid_week_off_count,
                    paid_holiday_count=status_summary.paid_holiday_count,
                    unpaid_holiday_count=status_summary.unpaid_holiday_count,
                    irregular_punch_count=status_summary.irregular_punch_count,
                    pending_review_count=status_summary.pending_review_count,
                    comp_off_earned_count=status_summary.comp_off_earned_count,
                    comp_off_adjusted_days=round(metrics.comp_off_adjusted_days, 2),
                    late_entry_count=status_summary.late_entry_count,
                    early_login_count=status_summary.early_login_count,
                    early_logout_count=status_summary.early_logout_count,
                    overnight_exit_count=status_summary.overnight_exit_count,
                    missing_punch_count=status_summary.missing_punch_count,
                    gross_payable_days=round(metrics.gross_payable_days, 2),
                    late_penalty_deductions=round(metrics.late_penalty_before_comp_off, 2),
                    late_penalty_after_comp_off=round(metrics.late_penalty_after_comp_off, 2),
                    comp_off_adjusted_against_absent_days=round(
                        metrics.comp_off_adjusted_against_absent_days,
                        2,
                    ),
                    comp_off_adjusted_against_late_days=round(
                        metrics.comp_off_adjusted_against_late_days,
                        2,
                    ),
                    comp_off_balance=round(
                        _calculate_comp_off_balance(
                            metrics.comp_off_earned_days,
                            metrics.comp_off_adjusted_days,
                        ),
                        2,
                    ),
                    comp_off_balance_days=round(metrics.comp_off_balance_days, 2),
                    comp_off_carry_forward_days=round(metrics.comp_off_carry_forward_days, 2),
                    payable_days=round(metrics.final_payable_days, 2),
                    explainability=AttendanceEmployeeMonthlyExplainability(
                        comp_off_usage_trail=metrics.comp_off_usage_trail,
                    ),
                )
            )

    summary.sort(key=lambda item: (item.month, item.employee_name or item.employee_id))
    return summary


def build_unit_summary(
    processed_rows: list[AttendanceProcessedRow],
) -> list[AttendanceUnitSummaryItem]:
    rows_by_unit: dict[str, list[AttendanceProcessedRow]] = defaultdict(list)
    final_payable_days_by_unit: dict[str, float] = defaultdict(float)

    employee_month_groups = _group_rows_by_employee_month(processed_rows)
    month_groups_by_employee: dict[str, list[tuple[str, list[AttendanceProcessedRow]]]] = defaultdict(list)
    for (employee_key, month), rows in employee_month_groups.items():
        month_groups_by_employee[employee_key].append((month, rows))

    for employee_key, month_groups in month_groups_by_employee.items():
        carry_forward_balance = 0.0
        for _, rows in sorted(month_groups, key=lambda item: item[0]):
            metrics = _reconcile_employee_month_rows(rows, carry_forward_balance)
            carry_forward_balance = metrics.comp_off_carry_forward_days
            first_row = rows[0]
            unit_name = first_row.unit or "Unassigned Unit"
            final_payable_days_by_unit[unit_name] += metrics.final_payable_days

    for row in processed_rows:
        rows_by_unit[row.unit or "Unassigned Unit"].append(row)

    summary: list[AttendanceUnitSummaryItem] = []
    for unit_name, rows in rows_by_unit.items():
        status_summary = build_status_summary(rows)
        summary.append(
            AttendanceUnitSummaryItem(
                unit_name=unit_name,
                total_records=len(rows),
                present_count=status_summary.present_count,
                absent_count=status_summary.absent_count,
                half_day_count=status_summary.half_day_count,
                paid_week_off_count=status_summary.paid_week_off_count,
                unpaid_week_off_count=status_summary.unpaid_week_off_count,
                paid_holiday_count=status_summary.paid_holiday_count,
                unpaid_holiday_count=status_summary.unpaid_holiday_count,
                irregular_punch_count=status_summary.irregular_punch_count,
                pending_review_count=status_summary.pending_review_count,
                comp_off_earned_count=status_summary.comp_off_earned_count,
                comp_off_adjusted_days=status_summary.comp_off_adjusted_days,
                late_entry_count=status_summary.late_entry_count,
                early_login_count=status_summary.early_login_count,
                early_logout_count=status_summary.early_logout_count,
                overnight_exit_count=status_summary.overnight_exit_count,
                missing_punch_count=status_summary.missing_punch_count,
                payable_days=round(final_payable_days_by_unit.get(unit_name, 0.0), 2),
            )
        )

    summary.sort(key=lambda item: item.unit_name)
    return summary


def calculate_late_penalty_deductions(late_entry_count: int) -> int:
    return max(int(late_entry_count), 0) // 3


def _group_rows_by_employee_month(
    processed_rows: list[AttendanceProcessedRow],
) -> dict[tuple[str, str], list[AttendanceProcessedRow]]:
    grouped_rows: dict[tuple[str, str], list[AttendanceProcessedRow]] = defaultdict(list)

    for row in processed_rows:
        if not row.date:
            continue
        employee_key = row.employee_code or row.employee_name or row.record_id
        grouped_rows[(employee_key, row.date[:7])].append(row)

    return grouped_rows


def _reconcile_employee_month_rows(
    rows: list[AttendanceProcessedRow],
    opening_comp_off_balance: float,
) -> EmployeeMonthReconciliation:
    for row in rows:
        row.payable_value = row.payable_day_impact
        row.comp_off_earned = 0.0
        row.comp_off_adjusted = 0.0
        row.late_deduction_adjusted = 0.0

    status_summary = build_status_summary(rows)
    late_penalty_before = float(calculate_late_penalty_deductions(status_summary.late_entry_count))
    comp_off_rows = [row for row in rows if _is_comp_off_source(row)]
    absent_rows = sorted(
        [row for row in rows if row.final_status_code == "absent"],
        key=lambda row: row.date,
    )

    source_balances: list[CompOffSourceBalance] = []
    if opening_comp_off_balance > 0:
        source_balances.append(
            CompOffSourceBalance(
                row=None,
                available=round(opening_comp_off_balance, 2),
                earned_value=round(opening_comp_off_balance, 2),
                source_record_id="carry_forward_balance",
                source_date="",
                source_day="",
                source_working_hours="",
            )
        )
    for row in comp_off_rows:
        earned_value = _comp_off_value_for_row(row)
        row.comp_off_earned = earned_value
        source_balances.append(
            CompOffSourceBalance(
                row=row,
                available=earned_value,
                earned_value=earned_value,
                source_record_id=row.record_id,
                source_date=row.date,
                source_day=row.day_label,
                source_working_hours=row.working_hours,
            )
        )

    total_comp_off_earned = round(sum(row.comp_off_earned for row in comp_off_rows), 2)
    total_available = round(opening_comp_off_balance + total_comp_off_earned, 2)
    comp_off_usage_trail: list[AttendanceCompOffUsageTrailItem] = []

    absent_adjustment_target = min(total_available, float(len(absent_rows)))
    comp_off_adjusted_against_absent_days = _allocate_comp_off_adjustment(
        usage_targets=[
            CompOffUsageTarget(
                row=row,
                adjusted_against_record_id=row.record_id,
                adjusted_against_date=row.date,
                adjusted_against_day=row.day_label,
                adjusted_against_type="absent",
                adjusted_against_reason="Absent day restored with comp off credit.",
                reference_dates=[row.date] if row.date else [],
                payroll_effect="+1 payable day",
            )
            for row in absent_rows
        ],
        adjustment_amount=absent_adjustment_target,
        source_balances=source_balances,
        fallback_rows=absent_rows,
        label_prefix="Comp Off Adjusted",
        explanation_suffix="Comp off was applied against an absent day.",
        usage_trail=comp_off_usage_trail,
    )

    remaining_available = round(total_available - comp_off_adjusted_against_absent_days, 2)
    late_adjustment_target = min(remaining_available, late_penalty_before)
    late_rows = sorted(
        [row for row in rows if "late_entry" in row.derived_flags],
        key=lambda row: row.date,
    )
    comp_off_adjusted_against_late_days = _allocate_comp_off_adjustment(
        usage_targets=_build_late_deduction_targets(late_rows),
        adjustment_amount=late_adjustment_target,
        source_balances=source_balances,
        fallback_rows=late_rows or rows,
        label_prefix="Comp Off Late Adjustment",
        explanation_suffix="Comp off was applied against a late deduction.",
        track_late_deduction_adjustment=True,
        usage_trail=comp_off_usage_trail,
    )

    total_adjusted = round(
        comp_off_adjusted_against_absent_days + comp_off_adjusted_against_late_days,
        2,
    )
    carry_forward_balance = round(max(total_available - total_adjusted, 0.0), 2)
    late_penalty_after = round(max(late_penalty_before - comp_off_adjusted_against_late_days, 0.0), 2)

    for row in rows:
        row.payable_value = round(row.payable_day_impact, 2)

    gross_payable_days = round(
        sum(_payable_components(row) for row in rows),
        2,
    )
    final_payable_days = round(
        max(
            gross_payable_days
            + comp_off_adjusted_against_absent_days
            - late_penalty_after,
            0.0,
        ),
        2,
    )

    return EmployeeMonthReconciliation(
        gross_payable_days=gross_payable_days,
        final_payable_days=final_payable_days,
        late_penalty_before_comp_off=late_penalty_before,
        late_penalty_after_comp_off=late_penalty_after,
        comp_off_earned_days=total_comp_off_earned,
        comp_off_adjusted_against_absent_days=comp_off_adjusted_against_absent_days,
        comp_off_adjusted_against_late_days=comp_off_adjusted_against_late_days,
        comp_off_adjusted_days=total_adjusted,
        comp_off_balance_days=carry_forward_balance,
        comp_off_carry_forward_days=carry_forward_balance,
        comp_off_usage_trail=comp_off_usage_trail,
    )


def _allocate_comp_off_adjustment(
    *,
    usage_targets: list[CompOffUsageTarget],
    adjustment_amount: float,
    source_balances: list[CompOffSourceBalance],
    fallback_rows: list[AttendanceProcessedRow],
    label_prefix: str,
    explanation_suffix: str,
    usage_trail: list[AttendanceCompOffUsageTrailItem],
    track_late_deduction_adjustment: bool = False,
) -> float:
    remaining = round(adjustment_amount, 2)
    if remaining <= 0:
        return 0.0

    applied = 0.0
    for target_index, target in enumerate(usage_targets):
        target_remaining = round(min(1.0, remaining), 2)
        while target_remaining > 0 and remaining > 0:
            source_balance = next(
                (source for source in source_balances if source.available > 0),
                None,
            )
            if source_balance is None:
                break

            allocation = min(source_balance.available, target_remaining, remaining)
            source_balance.available = round(source_balance.available - allocation, 2)

            row_to_mark = source_balance.row or target.row
            if row_to_mark is None and fallback_rows:
                row_to_mark = fallback_rows[min(target_index, len(fallback_rows) - 1)]

            if row_to_mark is not None:
                row_to_mark.comp_off_adjusted = round(
                    row_to_mark.comp_off_adjusted + allocation,
                    2,
                )
                if track_late_deduction_adjustment:
                    row_to_mark.late_deduction_adjusted = round(
                        row_to_mark.late_deduction_adjusted + allocation,
                        2,
                    )
                row_to_mark.payroll_impact_label = (
                    f"{label_prefix} ({row_to_mark.comp_off_adjusted:.1f})"
                )
                row_to_mark.rule_explanation = _append_note(
                    row_to_mark.rule_explanation,
                    explanation_suffix,
                )

            usage_trail.append(
                AttendanceCompOffUsageTrailItem(
                    source_record_id=source_balance.source_record_id,
                    source_date=source_balance.source_date,
                    source_day=source_balance.source_day,
                    source_working_hours=source_balance.source_working_hours,
                    earned_value=round(source_balance.earned_value, 2),
                    used_value=round(allocation, 2),
                    adjusted_against_record_id=target.adjusted_against_record_id,
                    adjusted_against_date=target.adjusted_against_date,
                    adjusted_against_day=target.adjusted_against_day,
                    adjusted_against_type=target.adjusted_against_type,
                    adjusted_against_reason=target.adjusted_against_reason,
                    reference_dates=target.reference_dates,
                    payroll_effect=target.payroll_effect,
                )
            )

            applied = round(applied + allocation, 2)
            remaining = round(remaining - allocation, 2)
            target_remaining = round(target_remaining - allocation, 2)

    return applied


def _build_late_deduction_targets(
    late_rows: list[AttendanceProcessedRow],
) -> list[CompOffUsageTarget]:
    if not late_rows:
        return []

    targets: list[CompOffUsageTarget] = []
    sorted_rows = sorted(late_rows, key=lambda row: row.date)
    for index in range(0, len(sorted_rows) // 3):
        group_rows = sorted_rows[index * 3 : (index + 1) * 3]
        reference_dates = [row.date for row in group_rows if row.date]
        reference_copy = ", ".join(reference_dates)
        targets.append(
            CompOffUsageTarget(
                row=group_rows[-1] if group_rows else None,
                adjusted_against_record_id="",
                adjusted_against_date="",
                adjusted_against_day="",
                adjusted_against_type="late_deduction",
                adjusted_against_reason=(
                    "Late deduction offset using the three-late policy"
                    + (f" for dates {reference_copy}." if reference_copy else ".")
                ),
                reference_dates=reference_dates,
                payroll_effect="Late deduction reduced by 1 day",
            )
        )
    return targets


def _append_note(existing_text: str, extra_text: str) -> str:
    if not extra_text:
        return existing_text
    if not existing_text:
        return extra_text
    if extra_text in existing_text:
        return existing_text
    return f"{existing_text} {extra_text}".strip()


def _is_comp_off_source(row: AttendanceProcessedRow) -> bool:
    return (
        row.final_status_code in {"present", "present_late", "half_day"}
        and (
            "worked_on_weekoff" in row.derived_flags
            or "worked_on_holiday" in row.derived_flags
            or row.hr_override_status.lower() == "comp off"
        )
        and row.final_status_code != "irregular_review"
    )


def _comp_off_value_for_row(row: AttendanceProcessedRow) -> float:
    if row.hr_override_status.lower() == "comp off":
        return 1.0
    return 0.5 if row.final_status_code == "half_day" else 1.0


def _calculate_comp_off_balance(comp_off_earned: float, comp_off_adjusted: float) -> float:
    return max(round(comp_off_earned - comp_off_adjusted, 2), 0.0)


def _payable_components(row: AttendanceProcessedRow) -> float:
    return row.payable_day_impact
