from typing import Optional

from pydantic import BaseModel


class DuplicateEmployeeIdIssue(BaseModel):
    employee_id: str
    row_numbers: list[int]


class NegativeSalaryIssue(BaseModel):
    row_number: int
    employee_name: str
    employee_id: str
    salary_value: str


class LowWorkingHoursIssue(BaseModel):
    row_number: int
    employee_name: str
    employee_id: str
    working_hours: str


class MissingTimeIssue(BaseModel):
    row_number: int
    employee_name: str
    employee_id: str
    missing_fields: list[str]


class ValidationSummary(BaseModel):
    status: str
    total_valid_rows: int
    total_invalid_rows: int
    warnings_count: int
    errors_count: int
    missing_required_columns: list[str]
    duplicate_employee_ids: list[DuplicateEmployeeIdIssue]
    blank_row_numbers: list[int]
    negative_salary_values: list[NegativeSalaryIssue]
    low_working_hours: list[LowWorkingHoursIssue]
    missing_in_out_time: list[MissingTimeIssue]


class AnalysisOverview(BaseModel):
    engine: str
    title: str
    status: str
    message: str


class AttendanceDetectedColumns(BaseModel):
    employee_code_columns: list[str]
    employee_name_columns: list[str]
    employee_id_columns: list[str]
    gender_columns: list[str]
    date_columns: list[str]
    day_columns: list[str]
    in_time_columns: list[str]
    out_time_columns: list[str]
    work_duration_columns: list[str]
    attendance_status_columns: list[str]
    working_day_columns: list[str]
    activity_columns: list[str]
    work_description_columns: list[str]
    unit_columns: list[str]
    location_columns: list[str]
    remarks_columns: list[str]


class AttendanceFieldMapping(BaseModel):
    field_name: str
    detected_column_name: str
    confidence_score: float
    reason: str
    status: str


class AttendanceStructureSummary(BaseModel):
    detected_header_row_number: int
    mapped_fields: list[AttendanceFieldMapping]
    warnings: list[str]


class AttendancePolicyRule(BaseModel):
    rule_id: str
    label: str
    description: str
    value: str
    value_type: str
    enabled: bool


class AttendanceExceptionActionOption(BaseModel):
    action_key: str
    label: str
    description: str


class AttendanceExceptionCandidate(BaseModel):
    record_id: str
    source_row_number: int
    employee_code: str
    employee_name: str
    date: str
    in_time: str
    out_time: str
    work_duration: str
    attendance_status: str
    remarks: str


class AttendanceExceptionGroup(BaseModel):
    exception_id: str
    category: str
    severity: str
    employee_code: str
    employee_name: str
    date: str
    unit: str
    summary: str
    details: str
    suggested_action: str
    selected_action: str
    requires_review: bool
    anomaly_flags: list[str]
    action_options: list[AttendanceExceptionActionOption]
    candidate_rows: list[AttendanceExceptionCandidate]


class AttendanceProcessedRow(BaseModel):
    record_id: str
    employee_code: str
    employee_name: str
    gender: str
    date: str
    day_label: str
    unit: str
    raw_status: str
    in_time: str
    out_time: str
    working_hours: str
    final_status_code: str
    attendance_classification: str
    payable_day_impact: float
    payable_value: float
    comp_off_earned: float
    comp_off_adjusted: float
    late_deduction_adjusted: float = 0.0
    payroll_impact_label: str
    detected_rule_id: str
    rule_explanation: str
    remarks: str
    hr_override_status: str
    hr_reviewed_by: str
    hr_reviewed_at: str
    action_source: str = ""
    action_reason: str = ""
    action_remarks: str = ""
    derived_flags: list[str]
    anomaly_flags: list[str]
    source_row_numbers: list[int]


class AttendanceStatusSummary(BaseModel):
    present_count: int
    absent_count: int
    half_day_count: int
    paid_week_off_count: int
    unpaid_week_off_count: int
    paid_holiday_count: int
    unpaid_holiday_count: int
    irregular_punch_count: int
    pending_review_count: int
    comp_off_earned_count: int
    comp_off_adjusted_days: float
    late_entry_count: int
    early_logout_count: int
    overnight_exit_count: int
    missing_punch_count: int


class AttendanceEmployeeMonthlySummaryItem(BaseModel):
    employee_name: str
    employee_id: str
    month: str
    present_count: int
    absent_count: int
    half_day_count: int
    paid_week_off_count: int
    unpaid_week_off_count: int
    paid_holiday_count: int
    unpaid_holiday_count: int
    irregular_punch_count: int
    pending_review_count: int
    comp_off_earned_count: int
    comp_off_adjusted_days: float
    late_entry_count: int
    early_logout_count: int
    overnight_exit_count: int
    missing_punch_count: int
    gross_payable_days: float = 0.0
    late_penalty_deductions: float
    late_penalty_after_comp_off: float = 0.0
    comp_off_adjusted_against_absent_days: float = 0.0
    comp_off_adjusted_against_late_days: float = 0.0
    comp_off_balance: float = 0.0
    comp_off_balance_days: float = 0.0
    comp_off_carry_forward_days: float = 0.0
    payable_days: float


class AttendanceUnitSummaryItem(BaseModel):
    unit_name: str
    total_records: int
    present_count: int
    absent_count: int
    half_day_count: int
    paid_week_off_count: int
    unpaid_week_off_count: int
    paid_holiday_count: int
    unpaid_holiday_count: int
    irregular_punch_count: int
    pending_review_count: int
    comp_off_earned_count: int
    comp_off_adjusted_days: float
    late_entry_count: int
    early_logout_count: int
    overnight_exit_count: int
    missing_punch_count: int
    payable_days: float


class AttendanceProcessingSummary(BaseModel):
    processing_mode: str
    unique_employees: int
    total_records: int
    total_exception_groups: int
    pending_review_groups: int
    future_date_count: int
    overnight_punch_count: int
    missing_punch_count: int
    suspicious_entry_count: int
    date_range_start: str
    date_range_end: str
    unit_options: list[str]
    employee_options: list[str]
    status_summary: AttendanceStatusSummary


class AttendanceReviewDecision(BaseModel):
    exception_id: str
    action_key: str
    action_by: str = "HR"
    reason: str = ""
    remarks: str = ""


class AttendanceAdministrativeException(BaseModel):
    date: str
    scope: str
    treatment_type: str
    unit_name: str = ""
    employee_ids: list[str] = []
    custom_status_label: str = ""
    custom_payable_value: Optional[float] = None
    reason: str = ""
    remarks: str = ""
    action_by: str = "HR"
    action_at: str = ""
    source: str = "Administrative Attendance Exception"


class AttendanceHolidayMarker(BaseModel):
    date: str
    holiday_type: str
    reason: str = ""
    remarks: str = ""
    action_by: str = "HR"
    action_at: str = ""
    source: str = "Holiday Marker"


class AttendanceReviewRequest(BaseModel):
    sheet_name: str
    decisions: list[AttendanceReviewDecision] = []
    policy_rules: list[AttendancePolicyRule] = []
    holiday_markers: list[AttendanceHolidayMarker] = []
    administrative_exceptions: list[AttendanceAdministrativeException] = []


class AttendanceRowIssue(BaseModel):
    row_number: int
    employee_name: str
    employee_id: str
    date_value: str
    details: str


class AttendanceDuplicateDateIssue(BaseModel):
    employee_name: str
    employee_id: str
    date_value: str
    row_numbers: list[int]


class AttendanceLocationCoverageItem(BaseModel):
    location_name: str
    total_entries: int


class AttendanceMonthlyEntryItem(BaseModel):
    month: str
    total_entries: int


class AttendanceMonthlyConsistencyIssue(BaseModel):
    employee_name: str
    employee_id: str
    months: list[str]
    entry_counts: list[int]
    details: str


class AttendanceEmployeeActivityItem(BaseModel):
    employee_name: str
    employee_id: str
    total_entries: int
    active_days: int
    months_active: int
    locations_covered: int


class AttendanceValidationSummary(BaseModel):
    status: str
    total_valid_rows: int
    total_invalid_rows: int
    warnings_count: int
    errors_count: int
    processing_mode: str
    missing_required_columns: list[str]
    structure_summary: AttendanceStructureSummary
    policy_rules: list[AttendancePolicyRule]
    processing_summary: AttendanceProcessingSummary
    exception_groups: list[AttendanceExceptionGroup]
    detected_columns: AttendanceDetectedColumns
    working_days_count: int
    working_day_labels: list[str]
    date_range_start: str
    date_range_end: str
    missing_dates: list[AttendanceRowIssue]
    duplicate_dates: list[AttendanceDuplicateDateIssue]
    blank_work_descriptions: list[AttendanceRowIssue]
    missing_remarks: list[AttendanceRowIssue]
    daily_activity_gaps: list[AttendanceRowIssue]
    location_coverage: list[AttendanceLocationCoverageItem]
    total_entries_per_month: list[AttendanceMonthlyEntryItem]
    monthly_consistency: list[AttendanceMonthlyConsistencyIssue]
    employee_activity_message: str
    employee_activity_summary: list[AttendanceEmployeeActivityItem]
    marked_holidays: list[AttendanceHolidayMarker]
    administrative_exceptions: list[AttendanceAdministrativeException] = []
    employee_monthly_summary: list[AttendanceEmployeeMonthlySummaryItem]
    unit_summary: list[AttendanceUnitSummaryItem]
    processed_attendance_rows: list[AttendanceProcessedRow]


class WorkbookSheetSummary(BaseModel):
    sheet_name: str
    row_count: int
    column_count: int
    detected_column_names: list[str]
    likely_sheet_type: str
    date_columns: list[str]
    amount_value_columns: list[str]
    id_name_columns: list[str]
    warnings: list[str]


class UploadResponse(BaseModel):
    upload_id: str
    analysis_type: str
    analysis_overview: AnalysisOverview
    file_name: str
    file_type: str
    upload_status: str
    message: str
    sheet_names: list[str]
    selected_sheet: str
    total_rows: int
    total_columns: int
    column_headers: list[str]
    preview_rows: list[list[str]]
    payroll_validation_summary: Optional[ValidationSummary] = None
    attendance_validation_summary: Optional[AttendanceValidationSummary] = None
    workbook_intelligence_summary: list[WorkbookSheetSummary]
