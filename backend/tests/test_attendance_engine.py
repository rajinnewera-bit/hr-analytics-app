import unittest
from typing import Optional

import pandas as pd

from app.schemas.upload import (
    AttendanceAdministrativeException,
    AttendanceExceptionActionOption,
    AttendanceExceptionCandidate,
    AttendanceExceptionGroup,
    AttendanceHolidayMarker,
    AttendanceReviewDecision,
)
from app.services.attendance_anomaly import detect_attendance_anomalies
from app.services.attendance_classification import classify_attendance_records
from app.services.attendance_ingestion import AttendanceNormalizedRecord
from app.services.attendance_payroll import (
    _calculate_comp_off_balance,
    apply_monthly_payroll_reconciliation,
    build_employee_monthly_summary,
    build_status_summary,
    calculate_late_penalty_deductions,
)
from app.services.attendance_review_workflow import apply_attendance_review_workflow
from app.services.attendance_rule_engine import build_default_attendance_policy_rules
from app.services.attendance_validation import _apply_marked_holidays
from app.services.attendance_validation import _apply_administrative_exceptions


def make_record(
    *,
    record_id: str,
    employee_code: str,
    employee_name: str,
    date_value: str,
    raw_status: str = "P",
    in_time: Optional[str] = "10:00",
    out_time: Optional[str] = "19:00",
    work_duration_hours: Optional[float] = None,
    gender: str = "",
    anomaly_flags: Optional[list[str]] = None,
) -> AttendanceNormalizedRecord:
    date_timestamp = pd.Timestamp(date_value)
    in_timestamp = (
        pd.Timestamp(f"{date_value} {in_time}")
        if in_time is not None
        else None
    )
    out_timestamp = (
        pd.Timestamp(f"{date_value} {out_time}")
        if out_time is not None
        else None
    )
    duration = work_duration_hours
    if duration is None and in_timestamp is not None and out_timestamp is not None:
        duration = round((out_timestamp - in_timestamp).total_seconds() / 3600, 2)

    return AttendanceNormalizedRecord(
        record_id=record_id,
        source_row_number=1,
        employee_code=employee_code,
        employee_name=employee_name,
        gender=gender,
        date_value=date_timestamp,
        day_label=date_timestamp.day_name(),
        unit="Unit A",
        in_time=in_timestamp,
        out_time=out_timestamp,
        work_duration_hours=duration,
        attendance_status=raw_status,
        anomaly_flags=list(anomaly_flags or []),
    )


def classify_single_record(record: AttendanceNormalizedRecord):
    result = classify_attendance_records(
        [record],
        build_default_attendance_policy_rules(),
    )
    return result.processed_rows[0]


class AttendanceEngineTests(unittest.TestCase):
    def test_comp_off_balance_returns_remaining_positive_amount(self):
        self.assertEqual(_calculate_comp_off_balance(4.0, 1.5), 2.5)

    def test_comp_off_balance_returns_zero_when_fully_adjusted(self):
        self.assertEqual(_calculate_comp_off_balance(2.0, 2.0), 0.0)

    def test_comp_off_balance_never_goes_negative(self):
        self.assertEqual(_calculate_comp_off_balance(1.0, 4.0), 0.0)

    def test_normal_present_full_shift_is_payable(self):
        row = classify_single_record(
            make_record(
                record_id="record-present",
                employee_code="E0",
                employee_name="Full Shift",
                date_value="2026-04-01",
                raw_status="P",
                in_time="09:58",
                out_time="20:05",
                work_duration_hours=10.12,
                gender="Male",
            )
        )

        self.assertEqual(row.attendance_classification, "Present")
        self.assertEqual(row.payable_day_impact, 1.0)

    def test_raw_absent_with_valid_punch_uses_punch_logic(self):
        row = classify_single_record(
            make_record(
                record_id="record-1",
                employee_code="E1",
                employee_name="Rakesh",
                date_value="2026-04-01",
                raw_status="A",
                in_time="10:09",
                out_time="19:38",
                gender="Male",
            )
        )

        self.assertNotEqual(row.attendance_classification, "Absent")
        self.assertEqual(row.payable_day_impact, 1.0)

    def test_missing_out_time_before_late_cutoff_is_payable_by_default(self):
        record = make_record(
            record_id="record-2",
            employee_code="E2",
            employee_name="Mousumi",
            date_value="2026-04-02",
            raw_status="P",
            in_time="09:55",
            out_time=None,
            work_duration_hours=None,
            gender="Female",
        )
        row = classify_single_record(record)
        anomalies = detect_attendance_anomalies([record])
        missing_punch_groups = [
            group for group in anomalies.exception_groups if group.category == "missing_punch"
        ]

        self.assertEqual(row.attendance_classification, "Present - Missing Out Time")
        self.assertEqual(row.payroll_impact_label, "1.0 Payable Day")
        self.assertEqual(row.payable_day_impact, 1.0)
        self.assertNotIn("late_entry", row.derived_flags)
        self.assertIn("missing_out_time", row.derived_flags)
        self.assertEqual(len(missing_punch_groups), 1)
        self.assertFalse(missing_punch_groups[0].requires_review)

    def test_missing_out_time_after_late_cutoff_stays_payable_and_late(self):
        record = make_record(
            record_id="record-2b",
            employee_code="E2",
            employee_name="Mousumi",
            date_value="2026-04-03",
            raw_status="P",
            in_time="10:45",
            out_time=None,
            work_duration_hours=None,
            gender="Female",
        )
        row = classify_single_record(record)
        anomalies = detect_attendance_anomalies([record])
        summary = build_status_summary([row])
        missing_punch_groups = [
            group for group in anomalies.exception_groups if group.category == "missing_punch"
        ]

        self.assertEqual(row.attendance_classification, "Present but Late - Missing Out Time")
        self.assertEqual(row.payroll_impact_label, "1.0 Payable Day")
        self.assertEqual(row.payable_day_impact, 1.0)
        self.assertIn("late_entry", row.derived_flags)
        self.assertIn("missing_out_time", row.derived_flags)
        self.assertEqual(summary.late_entry_count, 1)
        self.assertEqual(summary.irregular_punch_count, 1)
        self.assertEqual(summary.pending_review_count, 0)
        self.assertEqual(len(missing_punch_groups), 1)
        self.assertFalse(missing_punch_groups[0].requires_review)

    def test_early_login_flag_is_informational_only(self):
        record = make_record(
            record_id="record-early-login",
            employee_code="E2C",
            employee_name="Early Reporter",
            date_value="2026-04-04",
            raw_status="P",
            in_time="09:45",
            out_time="20:00",
            work_duration_hours=10.25,
            gender="Male",
        )
        row = classify_single_record(record)
        status_summary = build_status_summary([row])
        monthly_summary = build_employee_monthly_summary([row])[0]

        self.assertEqual(row.attendance_classification, "Present")
        self.assertEqual(row.payable_day_impact, 1.0)
        self.assertIn("early_login", row.derived_flags)
        self.assertEqual(status_summary.early_login_count, 1)
        self.assertEqual(monthly_summary.early_login_count, 1)
        self.assertEqual(monthly_summary.payable_days, 1.0)

    def test_both_missing_punches_become_absent_without_review_group(self):
        record = make_record(
            record_id="record-both-missing",
            employee_code="E2B",
            employee_name="No Punch",
            date_value="2026-04-02",
            raw_status="P",
            in_time=None,
            out_time=None,
            work_duration_hours=None,
        )

        anomalies = detect_attendance_anomalies([record])
        categories = [group.category for group in anomalies.exception_groups]
        row = classify_single_record(record)

        self.assertNotIn("missing_punch", categories)
        self.assertNotIn("future_date", categories)
        self.assertEqual(row.final_status_code, "absent")
        self.assertEqual(row.payable_day_impact, 0.0)
        self.assertNotIn("missing_in_time", row.derived_flags)
        self.assertNotIn("missing_out_time", row.derived_flags)

    def test_pending_review_duplicate_is_not_finalized(self):
        record = make_record(
            record_id="matrix-e1-20260403",
            employee_code="E1",
            employee_name="Mahfuz",
            date_value="2026-04-03",
            raw_status="P",
            in_time="10:00",
            out_time="20:00",
        )
        exception_group = AttendanceExceptionGroup(
            exception_id="duplicate-E1-2026-04-03",
            category="duplicate_punches",
            severity="warning",
            employee_code="E1",
            employee_name="Mahfuz",
            date="2026-04-03",
            unit="Unit A",
            summary="Duplicate punch",
            details="Duplicate",
            suggested_action="merge_punches",
            selected_action="",
            requires_review=True,
            anomaly_flags=["duplicate_punches"],
            action_options=[
                AttendanceExceptionActionOption(
                    action_key="merge_punches",
                    label="Merge punches",
                    description="Merge",
                )
            ],
            candidate_rows=[
                AttendanceExceptionCandidate(
                    record_id="matrix-e1-20260403",
                    source_row_number=10,
                    employee_code="E1",
                    employee_name="Mahfuz",
                    date="2026-04-03",
                    in_time="2026-04-03 10:00",
                    out_time="2026-04-03 20:00",
                    work_duration="10.00",
                    attendance_status="P",
                    remarks="",
                )
            ],
        )

        reviewed = apply_attendance_review_workflow([record], [exception_group], decisions=[])
        row = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows[0]

        self.assertEqual(row.attendance_classification, "Irregular Punch Pending HR Review")
        self.assertEqual(row.payable_day_impact, 0.0)

    def test_review_workflow_does_not_duplicate_same_record_across_multiple_groups(self):
        record = make_record(
            record_id="dup-record",
            employee_code="E1",
            employee_name="Mahfuz",
            date_value="2026-04-03",
            raw_status="P",
            in_time="10:00",
            out_time=None,
            work_duration_hours=None,
            anomaly_flags=["missing_out_time", "pending_review"],
        )
        groups = [
            AttendanceExceptionGroup(
                exception_id="group-1",
                category="missing_punch",
                severity="warning",
                employee_code="E1",
                employee_name="Mahfuz",
                date="2026-04-03",
                unit="Unit A",
                summary="Missing punch",
                details="Missing out-time",
                suggested_action="manual_override",
                selected_action="",
                requires_review=True,
                anomaly_flags=["missing_out_time"],
                action_options=[],
                candidate_rows=[
                    AttendanceExceptionCandidate(
                        record_id="dup-record",
                        source_row_number=10,
                        employee_code="E1",
                        employee_name="Mahfuz",
                        date="2026-04-03",
                        in_time="2026-04-03 10:00",
                        out_time="",
                        work_duration="",
                        attendance_status="P",
                        remarks="",
                    )
                ],
            ),
            AttendanceExceptionGroup(
                exception_id="group-2",
                category="invalid_duration",
                severity="warning",
                employee_code="E1",
                employee_name="Mahfuz",
                date="2026-04-03",
                unit="Unit A",
                summary="Invalid duration",
                details="Duplicate group reference",
                suggested_action="manual_override",
                selected_action="",
                requires_review=True,
                anomaly_flags=["invalid_duration"],
                action_options=[],
                candidate_rows=[
                    AttendanceExceptionCandidate(
                        record_id="dup-record",
                        source_row_number=10,
                        employee_code="E1",
                        employee_name="Mahfuz",
                        date="2026-04-03",
                        in_time="2026-04-03 10:00",
                        out_time="",
                        work_duration="",
                        attendance_status="P",
                        remarks="",
                    )
                ],
            ),
        ]

        reviewed = apply_attendance_review_workflow([record], groups, decisions=[])

        self.assertEqual(len(reviewed.resolved_records), 1)
        self.assertEqual(reviewed.resolved_records[0].record_id, "dup-record")

    def test_hr_mark_present_override_makes_row_payable(self):
        record = make_record(
            record_id="matrix-e2-20260404",
            employee_code="E2",
            employee_name="Janki",
            date_value="2026-04-06",
            raw_status="P",
            in_time="11:05",
            out_time=None,
            work_duration_hours=None,
            gender="Female",
        )
        anomalies = detect_attendance_anomalies([record])
        self.assertGreaterEqual(len(anomalies.exception_groups), 1)

        reviewed = apply_attendance_review_workflow(
            [record],
            anomalies.exception_groups,
            decisions=[
                AttendanceReviewDecision(
                    exception_id=next(
                        group.exception_id
                        for group in anomalies.exception_groups
                        if group.category == "missing_punch"
                    ),
                    action_key="mark_present",
                    reason="Forgot biometric punch",
                )
            ],
        )
        row = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows[0]

        self.assertEqual(row.attendance_classification, "Present")
        self.assertEqual(row.payable_day_impact, 1.0)

    def test_half_day_rule_applies_for_less_than_five_hours(self):
        row = classify_single_record(
            make_record(
                record_id="record-3",
                employee_code="E3",
                employee_name="Dona",
                date_value="2026-04-06",
                raw_status="P",
                in_time="10:00",
                out_time="14:00",
                work_duration_hours=4.0,
            )
        )

        self.assertEqual(row.attendance_classification, "Half Day")
        self.assertEqual(row.payable_day_impact, 0.5)

    def test_exactly_five_hours_remains_half_day(self):
        row = classify_single_record(
            make_record(
                record_id="record-3b",
                employee_code="E3AA",
                employee_name="Boundary Half Day",
                date_value="2026-04-06",
                raw_status="P",
                in_time="10:00",
                out_time="15:00",
                work_duration_hours=5.0,
            )
        )

        self.assertEqual(row.attendance_classification, "Half Day")
        self.assertEqual(row.payable_day_impact, 0.5)

    def test_more_than_five_hours_becomes_present(self):
        row = classify_single_record(
            make_record(
                record_id="record-3c",
                employee_code="E3AB",
                employee_name="Boundary Present",
                date_value="2026-04-06",
                raw_status="P",
                in_time="10:00",
                out_time="15:01",
                work_duration_hours=5.01,
            )
        )

        self.assertEqual(row.attendance_classification, "Present")
        self.assertEqual(row.payable_day_impact, 1.0)

    def test_half_day_entry_time_override_applies_even_when_hours_are_below_three(self):
        row = classify_single_record(
            make_record(
                record_id="record-3d",
                employee_code="E3AC",
                employee_name="Late Entry Override",
                date_value="2026-04-06",
                raw_status="P",
                in_time="12:15",
                out_time="14:30",
                work_duration_hours=2.25,
            )
        )

        self.assertEqual(row.attendance_classification, "Half Day")
        self.assertEqual(row.payable_day_impact, 0.5)

    def test_early_login_flag_is_added_before_ten_am(self):
        row = classify_single_record(
            make_record(
                record_id="record-3e",
                employee_code="E3AD",
                employee_name="Early Login",
                date_value="2026-04-06",
                raw_status="P",
                in_time="09:59",
                out_time="20:00",
                work_duration_hours=10.02,
            )
        )

        self.assertIn("early_login", row.derived_flags)

    def test_early_login_flag_is_not_added_at_ten_am(self):
        row = classify_single_record(
            make_record(
                record_id="record-3f",
                employee_code="E3AE",
                employee_name="Not Early Login",
                date_value="2026-04-06",
                raw_status="P",
                in_time="10:00",
                out_time="20:00",
                work_duration_hours=10.0,
            )
        )

        self.assertNotIn("early_login", row.derived_flags)

    def test_early_login_counts_appear_in_status_and_monthly_summary(self):
        processed_rows = [
            classify_single_record(
                make_record(
                    record_id="record-3g",
                    employee_code="E3AF",
                    employee_name="Summary Early Login",
                    date_value="2026-04-06",
                    raw_status="P",
                    in_time="09:45",
                    out_time="20:00",
                    work_duration_hours=10.25,
                )
            ),
            classify_single_record(
                make_record(
                    record_id="record-3h",
                    employee_code="E3AF",
                    employee_name="Summary Early Login",
                    date_value="2026-04-07",
                    raw_status="P",
                    in_time="10:05",
                    out_time="20:05",
                    work_duration_hours=10.0,
                )
            ),
        ]

        apply_monthly_payroll_reconciliation(processed_rows)
        status_summary = build_status_summary(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)

        self.assertEqual(status_summary.early_login_count, 1)
        self.assertEqual(monthly_summary[0].early_login_count, 1)

    def test_late_present_is_payable_and_counted_as_late(self):
        row = classify_single_record(
            make_record(
                record_id="record-late",
                employee_code="E3B",
                employee_name="Late Worker",
                date_value="2026-04-07",
                raw_status="P",
                in_time="10:30",
                out_time="19:10",
                work_duration_hours=8.67,
                gender="Female",
            )
        )

        self.assertEqual(row.attendance_classification, "Present but Late")
        self.assertEqual(row.payable_day_impact, 1.0)

    def test_late_rows_create_optional_hr_review_group(self):
        record = make_record(
            record_id="record-late-review",
            employee_code="E3C",
            employee_name="Late Review",
            date_value="2026-04-08",
            raw_status="P",
            in_time="10:35",
            out_time="19:15",
            work_duration_hours=8.67,
            gender="Female",
        )

        anomalies = detect_attendance_anomalies([record])
        late_group = next(
            (group for group in anomalies.exception_groups if group.category == "late_review"),
            None,
        )

        self.assertIsNotNone(late_group)
        self.assertFalse(late_group.requires_review)
        self.assertEqual(late_group.suggested_action, "keep_as_is")

    def test_hr_late_regularization_reduces_late_deduction_and_refreshes_payable(self):
        records = [
            make_record(
                record_id=f"late-review-{index}",
                employee_code="E3D",
                employee_name="Late Regularized",
                date_value=date_value,
                raw_status="P",
                in_time="10:30",
                out_time="19:10",
                work_duration_hours=8.67,
                gender="Female",
            )
            for index, date_value in enumerate(
                ["2026-04-07", "2026-04-08", "2026-04-09"],
                start=1,
            )
        ]

        anomalies = detect_attendance_anomalies(records)
        late_group_ids = {
            group.date: group.exception_id
            for group in anomalies.exception_groups
            if group.category == "late_review"
        }

        reviewed = apply_attendance_review_workflow(
            records,
            anomalies.exception_groups,
            decisions=[
                AttendanceReviewDecision(
                    exception_id=late_group_ids["2026-04-07"],
                    action_key="mark_present",
                    reason="Management-approved late waiver",
                )
            ],
        )
        processed_rows = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)
        status_summary = build_status_summary(processed_rows)

        regularized_row = next(
            row for row in processed_rows if row.record_id == "late-review-1"
        )

        self.assertNotIn("late_entry", regularized_row.derived_flags)
        self.assertIn("late_regularized", regularized_row.derived_flags)
        self.assertEqual(status_summary.late_entry_count, 2)
        self.assertEqual(monthly_summary[0].late_penalty_deductions, 0)
        self.assertEqual(monthly_summary[0].payable_days, 3.0)

    def test_mark_present_but_late_keeps_late_flag_after_missing_punch_review(self):
        record = make_record(
            record_id="late-missing-out-review",
            employee_code="E3E",
            employee_name="Late Missing Out",
            date_value="2026-04-10",
            raw_status="P",
            in_time="11:01",
            out_time=None,
            work_duration_hours=None,
            gender="Female",
            anomaly_flags=["missing_out_time", "pending_review"],
        )

        anomalies = detect_attendance_anomalies([record])
        missing_group = next(
            group for group in anomalies.exception_groups if group.category == "missing_punch"
        )

        self.assertIn(
            "mark_present_but_late",
            [option.action_key for option in missing_group.action_options],
        )

        reviewed = apply_attendance_review_workflow(
            [record],
            anomalies.exception_groups,
            decisions=[
                AttendanceReviewDecision(
                    exception_id=missing_group.exception_id,
                    action_key="mark_present_but_late",
                    reason="Forgot to punch out",
                )
            ],
        )
        processed_rows = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        status_summary = build_status_summary(processed_rows)
        reviewed_row = processed_rows[0]

        self.assertEqual(reviewed_row.final_status_code, "present_late")
        self.assertEqual(reviewed_row.attendance_classification, "Present but Late")
        self.assertEqual(reviewed_row.payable_day_impact, 1.0)
        self.assertIn("late_entry", reviewed_row.derived_flags)
        self.assertNotIn("late_regularized", reviewed_row.derived_flags)
        self.assertEqual(status_summary.late_entry_count, 1)
        self.assertEqual(status_summary.pending_review_count, 0)

    def test_paid_sunday_requires_same_week_work(self):
        rules = build_default_attendance_policy_rules()
        payable_rows = classify_attendance_records(
            [
                make_record(
                    record_id="e4-mon",
                    employee_code="E4",
                    employee_name="Worker",
                    date_value="2026-04-06",
                    raw_status="P",
                    in_time="10:00",
                    out_time="20:00",
                ),
                make_record(
                    record_id="e4-sun",
                    employee_code="E4",
                    employee_name="Worker",
                    date_value="2026-04-12",
                    raw_status="WO",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=0.0,
                ),
            ],
            rules,
        ).processed_rows
        unpaid_rows = classify_attendance_records(
            [
                make_record(
                    record_id="e5-sun",
                    employee_code="E5",
                    employee_name="NoWeekdayWork",
                    date_value="2026-04-12",
                    raw_status="WO",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=0.0,
                )
            ],
            rules,
        ).processed_rows

        self.assertEqual(payable_rows[-1].payable_day_impact, 1.0)
        self.assertEqual(payable_rows[-1].attendance_classification, "Paid WO")
        self.assertEqual(unpaid_rows[0].payable_day_impact, 0.0)
        self.assertEqual(unpaid_rows[0].attendance_classification, "Unpaid WO")

    def test_late_penalty_deduction_every_three_lates(self):
        rows = []
        for offset, date_value in enumerate(
            [
                "2026-04-06",
                "2026-04-07",
                "2026-04-08",
                "2026-04-09",
                "2026-04-10",
                "2026-04-13",
                "2026-04-14",
            ],
            start=1,
        ):
            rows.append(
                make_record(
                    record_id=f"late-{offset}",
                    employee_code="E6",
                    employee_name="Late Employee",
                    date_value=date_value,
                    raw_status="P",
                    in_time="10:30",
                    out_time="19:30",
                    work_duration_hours=9.0,
                    gender="Female",
                )
            )

        processed_rows = classify_attendance_records(
            rows,
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)

        self.assertEqual(calculate_late_penalty_deductions(7), 2)
        self.assertEqual(monthly_summary[0].late_entry_count, 7)
        self.assertEqual(monthly_summary[0].payable_days, 5.0)

    def test_irregular_rows_are_excluded_from_payable_until_review(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="irregular-1",
                    employee_code="E7",
                    employee_name="Irregular",
                    date_value="2026-04-01",
                    raw_status="P",
                    in_time="10:05",
                    out_time=None,
                    work_duration_hours=None,
                    anomaly_flags=["missing_out_time", "pending_review"],
                )
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)

        self.assertEqual(processed_rows[0].final_status_code, "irregular_review")
        self.assertEqual(processed_rows[0].payable_day_impact, 0.0)
        self.assertEqual(monthly_summary[0].payable_days, 0.0)

    def test_comp_off_adjusts_absent_days_without_double_counting(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="rajdeep-workday",
                    employee_code="E8",
                    employee_name="Rajdeep Datta",
                    date_value="2026-04-07",
                    raw_status="P",
                    in_time="10:00",
                    out_time="20:00",
                    work_duration_hours=10.0,
                ),
                make_record(
                    record_id="rajdeep-absent",
                    employee_code="E8",
                    employee_name="Rajdeep Datta",
                    date_value="2026-04-08",
                    raw_status="A",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=None,
                ),
                make_record(
                    record_id="rajdeep-sunday-work",
                    employee_code="E8",
                    employee_name="Rajdeep Datta",
                    date_value="2026-04-12",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)

        comp_off_row = next(row for row in processed_rows if row.record_id == "rajdeep-sunday-work")
        self.assertEqual(comp_off_row.comp_off_earned, 1.0)
        self.assertEqual(comp_off_row.comp_off_adjusted, 1.0)
        self.assertEqual(monthly_summary[0].absent_count, 1)
        self.assertEqual(monthly_summary[0].gross_payable_days, 2.0)
        self.assertEqual(monthly_summary[0].payable_days, 3.0)
        self.assertEqual(len(monthly_summary[0].explainability.comp_off_usage_trail), 1)
        self.assertEqual(
            monthly_summary[0].explainability.comp_off_usage_trail[0].adjusted_against_date,
            "2026-04-08",
        )
        self.assertEqual(
            monthly_summary[0].explainability.comp_off_usage_trail[0].source_date,
            "2026-04-12",
        )

    def test_status_summary_reconciles_without_double_counting_flags(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="aa1",
                    employee_code="E9",
                    employee_name="AAJAD KUMAR",
                    date_value="2026-04-01",
                    raw_status="P",
                    in_time="10:30",
                    out_time="20:30",
                    work_duration_hours=10.0,
                ),
                make_record(
                    record_id="aa2",
                    employee_code="E9",
                    employee_name="AAJAD KUMAR",
                    date_value="2026-04-02",
                    raw_status="P",
                    in_time="10:05",
                    out_time=None,
                    work_duration_hours=None,
                    anomaly_flags=["missing_out_time", "pending_review"],
                ),
                make_record(
                    record_id="aa3",
                    employee_code="E9",
                    employee_name="AAJAD KUMAR",
                    date_value="2026-04-03",
                    raw_status="A",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=None,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        status_summary = build_status_summary(processed_rows)

        reconciled_total = (
            status_summary.present_count
            + status_summary.half_day_count
            + status_summary.absent_count
            + status_summary.paid_week_off_count
            + status_summary.unpaid_week_off_count
            + status_summary.paid_holiday_count
            + status_summary.unpaid_holiday_count
            + status_summary.pending_review_count
        )
        self.assertEqual(reconciled_total, 3)

    def test_marked_holiday_recalculates_employee_payable_days(self):
        records = [
            make_record(
                record_id="holiday-workday",
                employee_code="E10",
                employee_name="Rajesh Das",
                date_value="2026-04-13",
                raw_status="P",
                in_time="10:00",
                out_time="20:00",
                work_duration_hours=10.0,
            ),
            make_record(
                record_id="holiday-target",
                employee_code="E10",
                employee_name="Rajesh Das",
                date_value="2026-04-14",
                raw_status="A",
                in_time=None,
                out_time=None,
                work_duration_hours=None,
            ),
        ]
        marked_records = _apply_marked_holidays(
            records,
            [
                AttendanceHolidayMarker(
                    date="2026-04-14",
                    holiday_type="Declared Holiday",
                    reason="Bohag Bihu Holiday",
                )
            ],
        )
        processed_rows = classify_attendance_records(
            marked_records,
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        status_summary = build_status_summary(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)

        self.assertEqual(marked_records[1].attendance_status, "Declared Holiday")
        self.assertEqual(status_summary.paid_holiday_count, 1)
        self.assertEqual(monthly_summary[0].payable_days, 2.0)

    def test_declared_holiday_rows_do_not_create_absent_or_missing_review_groups(self):
        holiday_record = make_record(
            record_id="holiday-absent",
            employee_code="E11",
            employee_name="Holiday Employee",
            date_value="2026-04-14",
            raw_status="Declared Holiday",
            in_time=None,
            out_time=None,
            work_duration_hours=None,
        )

        anomalies = detect_attendance_anomalies([holiday_record])
        categories = [group.category for group in anomalies.exception_groups]
        row = classify_single_record(holiday_record)

        self.assertNotIn("missing_punch", categories)
        self.assertNotIn("absent_review", categories)
        self.assertNotIn("missing_in_time", row.derived_flags)
        self.assertNotIn("missing_out_time", row.derived_flags)

    def test_absent_review_can_be_regularized_as_paid_leave(self):
        record = make_record(
            record_id="absent-paid-leave",
            employee_code="E12",
            employee_name="Paid Leave Employee",
            date_value="2026-04-18",
            raw_status="A",
            in_time=None,
            out_time=None,
            work_duration_hours=None,
        )

        anomalies = detect_attendance_anomalies([record])
        absent_group = next(
            group for group in anomalies.exception_groups if group.category == "absent_review"
        )
        reviewed = apply_attendance_review_workflow(
            [record],
            anomalies.exception_groups,
            decisions=[
                AttendanceReviewDecision(
                    exception_id=absent_group.exception_id,
                    action_key="mark_paid_leave",
                    reason="Official duty approved",
                )
            ],
        )
        processed_rows = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)

        self.assertEqual(processed_rows[0].attendance_classification, "Paid Leave")
        self.assertEqual(processed_rows[0].payable_day_impact, 1.0)
        self.assertEqual(processed_rows[0].final_status_code, "present")
        self.assertEqual(build_employee_monthly_summary(processed_rows)[0].payable_days, 1.0)

    def test_administrative_exception_overrides_absent_day_before_anomalies(self):
        record = make_record(
            record_id="admin-exception-paid-present",
            employee_code="E13",
            employee_name="Exception Employee",
            date_value="2026-04-20",
            raw_status="A",
            in_time=None,
            out_time=None,
            work_duration_hours=None,
        )

        updated_records = _apply_administrative_exceptions(
            [record],
            [
                AttendanceAdministrativeException(
                    date="2026-04-20",
                    scope="all_employees",
                    treatment_type="Paid Present",
                    reason="Biometric outage",
                    remarks="Approved by management",
                )
            ],
        )
        anomalies = detect_attendance_anomalies(updated_records)
        processed_row = classify_attendance_records(
            updated_records,
            build_default_attendance_policy_rules(),
        ).processed_rows[0]

        self.assertEqual(len(anomalies.exception_groups), 0)
        self.assertEqual(processed_row.final_status_code, "present")
        self.assertEqual(processed_row.payable_day_impact, 1.0)
        self.assertEqual(processed_row.action_source, "Administrative Attendance Exception")

    def test_sunday_work_above_five_hours_is_full_present_without_late_flag(self):
        row = classify_single_record(
            make_record(
                record_id="sunday-full-present",
                employee_code="E14",
                employee_name="Sunday Worker",
                date_value="2026-04-12",
                raw_status="P",
                in_time="13:30",
                out_time="19:30",
                work_duration_hours=6.0,
            )
        )

        self.assertEqual(row.final_status_code, "present")
        self.assertEqual(row.attendance_classification, "Present")
        self.assertIn("worked_on_weekoff", row.derived_flags)
        self.assertNotIn("late_entry", row.derived_flags)
        self.assertEqual(row.payable_day_impact, 1.0)
        self.assertEqual(row.comp_off_earned, 0.0)

    def test_sunday_work_below_five_hours_is_half_day_without_late_flag(self):
        row = classify_single_record(
            make_record(
                record_id="sunday-half-day",
                employee_code="E15",
                employee_name="Sunday Half Day",
                date_value="2026-04-12",
                raw_status="P",
                in_time="14:00",
                out_time="17:00",
                work_duration_hours=3.0,
            )
        )

        self.assertEqual(row.final_status_code, "half_day")
        self.assertEqual(row.attendance_classification, "Half Day")
        self.assertIn("worked_on_weekoff", row.derived_flags)
        self.assertNotIn("late_entry", row.derived_flags)
        self.assertEqual(row.payable_day_impact, 0.5)

    def test_comp_off_adjusts_late_deduction_after_absent_adjustment(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="late-employee-1",
                    employee_code="E16",
                    employee_name="Late Offset",
                    date_value="2026-04-07",
                    raw_status="P",
                    in_time="10:35",
                    out_time="19:30",
                    work_duration_hours=8.92,
                    gender="Female",
                ),
                make_record(
                    record_id="late-employee-2",
                    employee_code="E16",
                    employee_name="Late Offset",
                    date_value="2026-04-08",
                    raw_status="P",
                    in_time="10:30",
                    out_time="19:15",
                    work_duration_hours=8.75,
                    gender="Female",
                ),
                make_record(
                    record_id="late-employee-3",
                    employee_code="E16",
                    employee_name="Late Offset",
                    date_value="2026-04-09",
                    raw_status="P",
                    in_time="10:40",
                    out_time="19:20",
                    work_duration_hours=8.67,
                    gender="Female",
                ),
                make_record(
                    record_id="late-employee-sunday",
                    employee_code="E16",
                    employee_name="Late Offset",
                    date_value="2026-04-12",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)[0]

        self.assertEqual(monthly_summary.late_entry_count, 3)
        self.assertEqual(monthly_summary.late_penalty_deductions, 1.0)
        self.assertEqual(monthly_summary.late_penalty_after_comp_off, 0.0)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_late_days, 1.0)
        self.assertEqual(monthly_summary.gross_payable_days, 4.0)
        self.assertEqual(monthly_summary.payable_days, 4.0)
        self.assertEqual(len(monthly_summary.explainability.comp_off_usage_trail[0].reference_dates), 3)
        self.assertEqual(
            monthly_summary.explainability.comp_off_usage_trail[0].adjusted_against_type,
            "late_deduction",
        )

    def test_may_2026_rajdeep_comp_off_usage_trail_matches_live_payroll_story(self):
        may_rows = [
            ("2026-05-01", "P", "09:50", "19:21", 9.52),
            ("2026-05-02", "P", "10:28", "19:42", 9.23),
            ("2026-05-03", "WO", None, None, 0.0),
            ("2026-05-04", "P", "09:59", "19:24", 9.42),
            ("2026-05-05", "P", "11:13", "19:54", 8.68),
            ("2026-05-06", "P", "09:58", "19:26", 9.47),
            ("2026-05-07", "P", "09:53", "19:35", 9.70),
            ("2026-05-08", "P", "09:54", "20:03", 10.15),
            ("2026-05-09", "P", "09:44", "19:30", 9.77),
            ("2026-05-10", "WO", None, None, 0.0),
            ("2026-05-11", "P", "09:54", "19:19", 9.42),
            ("2026-05-12", "P", "10:18", "19:35", 9.28),
            ("2026-05-13", "P", "09:56", "19:58", 10.03),
            ("2026-05-14", "P", "09:57", "19:42", 9.75),
            ("2026-05-15", "P", "09:56", "19:48", 9.87),
            ("2026-05-16", "P", "09:52", "19:23", 9.52),
            ("2026-05-17", "WO", None, None, 0.0),
            ("2026-05-18", "P", "09:45", "19:21", 9.60),
            ("2026-05-19", "A", None, None, None),
            ("2026-05-20", "P", "10:09", "19:48", 9.65),
            ("2026-05-21", "P", "10:02", "20:06", 10.07),
            ("2026-05-22", "P", "09:51", "20:02", 10.18),
            ("2026-05-23", "P", "10:01", "19:14", 9.22),
            ("2026-05-24", "P", "09:48", "20:02", 10.23),
            ("2026-05-25", "P", "09:56", "19:36", 9.67),
            ("2026-05-26", "P", "10:32", "19:35", 9.05),
            ("2026-05-27", "P", "09:48", "19:36", 9.80),
            ("2026-05-28", "P", "09:39", "19:13", 9.57),
            ("2026-05-29", "P", "09:51", "19:10", 9.32),
            ("2026-05-30", "P", "09:56", None, None),
            ("2026-05-31", "P", "09:39", "19:10", 9.52),
        ]

        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id=f"rajdeep-may-{date_value}",
                    employee_code="B&S119",
                    employee_name="Rajdeep Dutta",
                    date_value=date_value,
                    raw_status=raw_status,
                    in_time=in_time,
                    out_time=out_time,
                    work_duration_hours=work_duration_hours,
                    gender="Male",
                )
                for date_value, raw_status, in_time, out_time, work_duration_hours in may_rows
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows

        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)[0]
        absent_row = next(
            row for row in processed_rows if row.final_status_code == "absent"
        )
        comp_off_earned_dates = sorted(
            row.date for row in processed_rows if row.comp_off_earned > 0
        )
        comp_off_adjusted_rows = sorted(
            row.date for row in processed_rows if row.comp_off_adjusted > 0
        )
        late_adjusted_rows = sorted(
            row.date for row in processed_rows if row.late_deduction_adjusted > 0
        )
        usage_trail = monthly_summary.explainability.comp_off_usage_trail
        absent_usage = next(
            item for item in usage_trail if item.adjusted_against_type == "absent"
        )
        late_usage = next(
            item
            for item in usage_trail
            if item.adjusted_against_type == "late_deduction"
        )

        self.assertEqual(absent_row.date, "2026-05-19")
        self.assertEqual(comp_off_earned_dates, ["2026-05-24", "2026-05-31"])
        self.assertEqual(comp_off_adjusted_rows, ["2026-05-24", "2026-05-31"])
        self.assertEqual(late_adjusted_rows, ["2026-05-31"])
        self.assertEqual(monthly_summary.present_count, 27)
        self.assertEqual(monthly_summary.absent_count, 1)
        self.assertEqual(monthly_summary.paid_week_off_count, 3)
        self.assertEqual(monthly_summary.comp_off_earned_count, 2)
        self.assertEqual(monthly_summary.comp_off_adjusted_days, 2.0)
        self.assertEqual(monthly_summary.late_entry_count, 4)
        self.assertEqual(monthly_summary.gross_payable_days, 30.0)
        self.assertEqual(monthly_summary.late_penalty_deductions, 1.0)
        self.assertEqual(monthly_summary.late_penalty_after_comp_off, 0.0)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_absent_days, 1.0)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_late_days, 1.0)
        self.assertEqual(monthly_summary.comp_off_balance, 0.0)
        self.assertEqual(monthly_summary.payable_days, 31.0)
        self.assertEqual(absent_usage.source_date, "2026-05-24")
        self.assertEqual(absent_usage.adjusted_against_date, "2026-05-19")
        self.assertEqual(absent_usage.adjusted_against_type, "absent")
        self.assertEqual(absent_usage.payroll_effect, "+1 payable day")
        self.assertEqual(late_usage.source_date, "2026-05-31")
        self.assertEqual(late_usage.adjusted_against_type, "late_deduction")
        self.assertEqual(
            late_usage.reference_dates,
            ["2026-05-02", "2026-05-05", "2026-05-12"],
        )
        self.assertEqual(late_usage.payroll_effect, "Late deduction reduced by 1 day")

    def test_unused_comp_off_carries_forward_when_month_has_no_pending_deductions(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="carry-forward-workday",
                    employee_code="E18",
                    employee_name="Carry Forward",
                    date_value="2026-04-07",
                    raw_status="P",
                    in_time="10:00",
                    out_time="20:00",
                    work_duration_hours=10.0,
                ),
                make_record(
                    record_id="carry-forward-sunday",
                    employee_code="E18",
                    employee_name="Carry Forward",
                    date_value="2026-04-12",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)[0]

        self.assertEqual(monthly_summary.comp_off_earned_count, 1)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_absent_days, 0.0)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_late_days, 0.0)
        self.assertEqual(monthly_summary.comp_off_carry_forward_days, 1.0)
        self.assertEqual(monthly_summary.gross_payable_days, 2.0)
        self.assertEqual(monthly_summary.payable_days, 2.0)

    def test_full_month_payable_is_not_reduced_by_extra_non_working_day_work(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="full-month-workday-1",
                    employee_code="E19",
                    employee_name="Full Month Worker",
                    date_value="2026-04-06",
                    raw_status="P",
                    in_time="10:00",
                    out_time="20:00",
                    work_duration_hours=10.0,
                ),
                make_record(
                    record_id="full-month-workday-2",
                    employee_code="E19",
                    employee_name="Full Month Worker",
                    date_value="2026-04-07",
                    raw_status="P",
                    in_time="10:00",
                    out_time="20:00",
                    work_duration_hours=10.0,
                ),
                make_record(
                    record_id="full-month-sunday",
                    employee_code="E19",
                    employee_name="Full Month Worker",
                    date_value="2026-04-12",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
                make_record(
                    record_id="full-month-holiday",
                    employee_code="E19",
                    employee_name="Full Month Worker",
                    date_value="2026-04-14",
                    raw_status="Declared Holiday",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)[0]

        self.assertEqual(monthly_summary.gross_payable_days, 4.0)
        self.assertEqual(monthly_summary.payable_days, 4.0)
        self.assertEqual(monthly_summary.comp_off_earned_count, 2)
        self.assertEqual(monthly_summary.comp_off_carry_forward_days, 2.0)

    def test_comp_off_restores_absent_days_without_reducing_base_payable(self):
        processed_rows = classify_attendance_records(
            [
                make_record(
                    record_id="restore-absent-1",
                    employee_code="E20",
                    employee_name="Restore Absent",
                    date_value="2026-04-07",
                    raw_status="A",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=None,
                ),
                make_record(
                    record_id="restore-absent-2",
                    employee_code="E20",
                    employee_name="Restore Absent",
                    date_value="2026-04-08",
                    raw_status="A",
                    in_time=None,
                    out_time=None,
                    work_duration_hours=None,
                ),
                make_record(
                    record_id="restore-sunday-1",
                    employee_code="E20",
                    employee_name="Restore Absent",
                    date_value="2026-04-12",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
                make_record(
                    record_id="restore-sunday-2",
                    employee_code="E20",
                    employee_name="Restore Absent",
                    date_value="2026-04-19",
                    raw_status="P",
                    in_time="10:00",
                    out_time="18:00",
                    work_duration_hours=8.0,
                ),
            ],
            build_default_attendance_policy_rules(),
        ).processed_rows
        apply_monthly_payroll_reconciliation(processed_rows)
        monthly_summary = build_employee_monthly_summary(processed_rows)[0]

        self.assertEqual(monthly_summary.gross_payable_days, 2.0)
        self.assertEqual(monthly_summary.comp_off_adjusted_against_absent_days, 2.0)
        self.assertEqual(monthly_summary.payable_days, 4.0)

    def test_hr_review_action_without_comment_does_not_apply(self):
        record = make_record(
            record_id="review-no-comment",
            employee_code="E17",
            employee_name="No Comment",
            date_value="2026-04-22",
            raw_status="P",
            in_time="10:10",
            out_time=None,
            work_duration_hours=None,
            anomaly_flags=["missing_out_time", "pending_review"],
        )
        anomalies = detect_attendance_anomalies([record])
        reviewed = apply_attendance_review_workflow(
            [record],
            anomalies.exception_groups,
            decisions=[
                AttendanceReviewDecision(
                    exception_id=anomalies.exception_groups[0].exception_id,
                    action_key="mark_present",
                )
            ],
        )
        processed_row = classify_attendance_records(
            reviewed.resolved_records,
            build_default_attendance_policy_rules(),
        ).processed_rows[0]

        self.assertEqual(processed_row.final_status_code, "irregular_review")
        self.assertEqual(processed_row.action_source, "")


if __name__ == "__main__":
    unittest.main()
