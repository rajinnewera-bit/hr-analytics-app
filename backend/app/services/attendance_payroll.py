from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from app.schemas.upload import (
    AttendanceCalculationBreakdown,
    AttendanceCompOffLedgerItem,
    AttendanceCompOffUsageTrailItem,
    AttendanceEmployeeMonthlyExplainability,
    AttendanceEmployeeMonthlySummaryItem,
    AttendanceLateDeductionExplanation,
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
    late_source_dates: list[str]
    late_source_record_ids: list[str]


@dataclass
class CompOffSourceBalance:
    source_kind: str
    record_id: str
    date: str
    day_label: str
    attendance_result: str
    working_hours: str
    reason: str
    earned_value: float
    available: float
    row: Optional[AttendanceProcessedRow] = None


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
                    explainability=_build_employee_month_explainability(
                        month=month,
                        rows=rows,
                        status_summary=status_summary,
                        metrics=metrics,
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
    absent_rows = [row for row in rows if row.final_status_code == "absent"]
    late_rows = [row for row in rows if "late_entry" in row.derived_flags]
    late_source_dates = [row.date for row in late_rows if row.date]
    late_source_record_ids = [row.record_id for row in late_rows if row.record_id]

    source_balances: list[CompOffSourceBalance] = []
    if opening_comp_off_balance > 0:
        source_balances.append(
            CompOffSourceBalance(
                source_kind="carry_forward_balance",
                record_id="carry_forward_balance",
                date="",
                day_label="",
                attendance_result="Opening Comp Off Balance",
                working_hours="",
                reason="Comp off balance carried forward from a previous month.",
                earned_value=round(opening_comp_off_balance, 2),
                available=round(opening_comp_off_balance, 2),
                row=None,
            )
        )
    for row in comp_off_rows:
        earned_value = _comp_off_value_for_row(row)
        row.comp_off_earned = earned_value
        source_balances.append(
            CompOffSourceBalance(
                source_kind="attendance_day",
                record_id=row.record_id,
                date=row.date,
                day_label=row.day_label,
                attendance_result=row.attendance_classification,
                working_hours=row.working_hours,
                reason=_build_comp_off_source_reason(row),
                earned_value=earned_value,
                available=earned_value,
                row=row,
            )
        )

    total_comp_off_earned = round(sum(row.comp_off_earned for row in comp_off_rows), 2)
    total_available = round(opening_comp_off_balance + total_comp_off_earned, 2)
    comp_off_usage_trail: list[AttendanceCompOffUsageTrailItem] = []

    absent_adjustment_target = min(total_available, float(len(absent_rows)))
    comp_off_adjusted_against_absent_days = _allocate_comp_off_adjustment(
        target_rows=absent_rows,
        adjustment_amount=absent_adjustment_target,
        source_balances=source_balances,
        label_prefix="Comp Off Adjusted",
        explanation_suffix="Comp off was applied against an absent day.",
        adjustment_kind="absent",
        adjustment_reason="Absent day",
        usage_trail=comp_off_usage_trail,
    )

    remaining_available = round(total_available - comp_off_adjusted_against_absent_days, 2)
    late_adjustment_target = min(remaining_available, late_penalty_before)
    comp_off_adjusted_against_late_days = _allocate_comp_off_adjustment(
        target_rows=late_rows,
        adjustment_amount=late_adjustment_target,
        source_balances=source_balances,
        label_prefix="Comp Off Late Adjustment",
        explanation_suffix="Comp off was applied against a late deduction.",
        adjustment_kind="late_deduction",
        adjustment_reason="Late deduction",
        usage_trail=comp_off_usage_trail,
        track_late_deduction_adjustment=True,
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
        late_source_dates=late_source_dates,
        late_source_record_ids=late_source_record_ids,
    )


def _allocate_comp_off_adjustment(
    *,
    target_rows: list[AttendanceProcessedRow],
    adjustment_amount: float,
    source_balances: list[CompOffSourceBalance],
    label_prefix: str,
    explanation_suffix: str,
    adjustment_kind: str,
    adjustment_reason: str,
    usage_trail: list[AttendanceCompOffUsageTrailItem],
    track_late_deduction_adjustment: bool = False,
) -> float:
    remaining = round(adjustment_amount, 2)
    if remaining <= 0 or not target_rows:
        return 0.0

    applied = 0.0
    target_capacities: list[float] = [1.0 for _ in target_rows]
    target_index = 0

    def advance_target_index(current_index: int) -> int:
        next_index = current_index
        while next_index < len(target_capacities) and target_capacities[next_index] <= 0:
            next_index += 1
        return next_index

    target_index = advance_target_index(target_index)
    for source_balance in source_balances:
        while (
            remaining > 0
            and source_balance.available > 0
            and target_index < len(target_rows)
        ):
            target_index = advance_target_index(target_index)
            if target_index >= len(target_rows):
                break

            target_row = target_rows[target_index]
            target_capacity = target_capacities[target_index]
            allocation = min(source_balance.available, remaining, target_capacity)
            if allocation <= 0:
                target_index += 1
                continue

            if source_balance.row is not None:
                source_balance.row.comp_off_adjusted = round(
                    source_balance.row.comp_off_adjusted + allocation,
                    2,
                )
                if track_late_deduction_adjustment:
                    source_balance.row.late_deduction_adjusted = round(
                        source_balance.row.late_deduction_adjusted + allocation,
                        2,
                    )
                source_balance.row.payroll_impact_label = (
                    f"{label_prefix} ({source_balance.row.comp_off_adjusted:.1f})"
                )
                source_balance.row.rule_explanation = _append_note(
                    source_balance.row.rule_explanation,
                    explanation_suffix,
                )
            else:
                target_row.comp_off_adjusted = round(target_row.comp_off_adjusted + allocation, 2)
                if track_late_deduction_adjustment:
                    target_row.late_deduction_adjusted = round(
                        target_row.late_deduction_adjusted + allocation,
                        2,
                    )
                target_row.payroll_impact_label = (
                    f"{label_prefix} ({target_row.comp_off_adjusted:.1f})"
                )
                target_row.rule_explanation = _append_note(
                    target_row.rule_explanation,
                    explanation_suffix,
                )

            source_balance.available = round(source_balance.available - allocation, 2)
            target_capacities[target_index] = round(target_capacity - allocation, 2)
            applied = round(applied + allocation, 2)
            remaining = round(remaining - allocation, 2)

            usage_trail.append(
                AttendanceCompOffUsageTrailItem(
                    source_kind=source_balance.source_kind,
                    source_record_id=source_balance.record_id,
                    source_date=source_balance.date,
                    source_day_label=source_balance.day_label,
                    source_attendance_result=source_balance.attendance_result,
                    source_working_hours=source_balance.working_hours,
                    source_reason=source_balance.reason,
                    earned_value=round(source_balance.earned_value, 2),
                    adjusted_record_id=target_row.record_id,
                    adjusted_date=target_row.date,
                    adjusted_day_label=target_row.day_label,
                    adjusted_attendance_result=target_row.attendance_classification,
                    adjusted_working_hours=target_row.working_hours,
                    adjustment_value=round(allocation, 2),
                    adjustment_kind=adjustment_kind,
                    adjustment_reason=adjustment_reason,
                    payroll_impact=_build_comp_off_payroll_impact(
                        adjustment_kind,
                        allocation,
                    ),
                )
            )

            if target_capacities[target_index] <= 0:
                target_index += 1

    return applied


def _build_employee_month_explainability(
    *,
    month: str,
    rows: list[AttendanceProcessedRow],
    status_summary: AttendanceStatusSummary,
    metrics: EmployeeMonthReconciliation,
) -> AttendanceEmployeeMonthlyExplainability:
    late_cutoff_time = "10:11 AM"
    calendar_days = len({row.date for row in rows if row.date})
    comp_off_ledger = _build_comp_off_ledger(rows)
    half_day_deduction_days = round(status_summary.half_day_count * 0.5, 2)

    return AttendanceEmployeeMonthlyExplainability(
        month=month,
        calendar_days=calendar_days,
        comp_off_ledger=comp_off_ledger,
        comp_off_usage_trail=metrics.comp_off_usage_trail,
        late_deduction=AttendanceLateDeductionExplanation(
            late_rule_label="3 Late Flags = 1 Deduction",
            late_cutoff_time=late_cutoff_time,
            total_late_flags=status_summary.late_entry_count,
            late_source_dates=metrics.late_source_dates,
            late_source_record_ids=metrics.late_source_record_ids,
            deductions_before_comp_off=round(metrics.late_penalty_before_comp_off, 2),
            comp_off_adjusted_against_late_days=round(
                metrics.comp_off_adjusted_against_late_days,
                2,
            ),
            deductions_after_comp_off=round(metrics.late_penalty_after_comp_off, 2),
            formula_text=(
                f"{status_summary.late_entry_count} late flags ÷ 3 = "
                f"{round(metrics.late_penalty_before_comp_off, 2)} deductions"
            ),
        ),
        calculation_breakdown=AttendanceCalculationBreakdown(
            calendar_days=calendar_days,
            present_days=status_summary.present_count,
            half_days=status_summary.half_day_count,
            absent_days=status_summary.absent_count,
            paid_week_off_days=status_summary.paid_week_off_count,
            unpaid_week_off_days=status_summary.unpaid_week_off_count,
            paid_holiday_days=status_summary.paid_holiday_count,
            unpaid_holiday_days=status_summary.unpaid_holiday_count,
            pending_review_days=status_summary.pending_review_count,
            half_day_deduction_days=half_day_deduction_days,
            gross_payable_days=round(metrics.gross_payable_days, 2),
            late_penalty_before_comp_off=round(metrics.late_penalty_before_comp_off, 2),
            late_penalty_after_comp_off=round(metrics.late_penalty_after_comp_off, 2),
            comp_off_adjusted_against_absent_days=round(
                metrics.comp_off_adjusted_against_absent_days,
                2,
            ),
            comp_off_adjusted_against_late_days=round(
                metrics.comp_off_adjusted_against_late_days,
                2,
            ),
            final_payable_days=round(metrics.final_payable_days, 2),
        ),
    )


def _build_comp_off_ledger(
    rows: list[AttendanceProcessedRow],
) -> list[AttendanceCompOffLedgerItem]:
    ledger: list[AttendanceCompOffLedgerItem] = []
    for row in rows:
        if row.comp_off_earned <= 0:
            continue
        ledger.append(
            AttendanceCompOffLedgerItem(
                source_kind="attendance_day",
                source_record_id=row.record_id,
                source_date=row.date,
                source_day_label=row.day_label,
                source_attendance_result=row.attendance_classification,
                source_working_hours=row.working_hours,
                source_reason=_build_comp_off_source_reason(row),
                earned_value=round(row.comp_off_earned, 2),
                used_value=round(row.comp_off_adjusted, 2),
                balance_value=round(max(row.comp_off_earned - row.comp_off_adjusted, 0.0), 2),
            )
        )

    return ledger


def _build_comp_off_source_reason(row: AttendanceProcessedRow) -> str:
    if "worked_on_weekoff" in row.derived_flags:
        return "Employee worked on a Sunday or weekly off."
    if "worked_on_holiday" in row.derived_flags:
        return "Employee worked on a holiday."
    if row.hr_override_status.lower() == "comp off":
        return "HR marked the day as a comp off credit."
    return "Comp off credit was earned by an approved non-working-day attendance result."


def _build_comp_off_payroll_impact(adjustment_kind: str, adjustment_value: float) -> str:
    if adjustment_kind == "late_deduction":
        return f"Late deduction reduced by {adjustment_value:.1f} day"
    return f"Final payable increased by {adjustment_value:.1f} day"


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
