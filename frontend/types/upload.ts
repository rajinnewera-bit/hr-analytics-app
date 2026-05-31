export type DuplicateEmployeeIdIssue = {
  employee_id: string;
  row_numbers: number[];
};

export type NegativeSalaryIssue = {
  row_number: number;
  employee_name: string;
  employee_id: string;
  salary_value: string;
};

export type LowWorkingHoursIssue = {
  row_number: number;
  employee_name: string;
  employee_id: string;
  working_hours: string;
};

export type MissingTimeIssue = {
  row_number: number;
  employee_name: string;
  employee_id: string;
  missing_fields: string[];
};

export type ValidationSummary = {
  status: "valid" | "warning" | "error";
  total_valid_rows: number;
  total_invalid_rows: number;
  warnings_count: number;
  errors_count: number;
  missing_required_columns: string[];
  duplicate_employee_ids: DuplicateEmployeeIdIssue[];
  blank_row_numbers: number[];
  negative_salary_values: NegativeSalaryIssue[];
  low_working_hours: LowWorkingHoursIssue[];
  missing_in_out_time: MissingTimeIssue[];
};

export type AnalysisOverview = {
  engine: "payroll" | "attendance" | "generic";
  title: string;
  status: "valid" | "warning" | "error" | "info";
  message: string;
};

export type AttendanceDetectedColumns = {
  employee_code_columns: string[];
  employee_name_columns: string[];
  employee_id_columns: string[];
  gender_columns: string[];
  date_columns: string[];
  day_columns: string[];
  in_time_columns: string[];
  out_time_columns: string[];
  work_duration_columns: string[];
  attendance_status_columns: string[];
  working_day_columns: string[];
  activity_columns: string[];
  work_description_columns: string[];
  unit_columns: string[];
  location_columns: string[];
  remarks_columns: string[];
};

export type AttendanceFieldMapping = {
  field_name: string;
  detected_column_name: string;
  confidence_score: number;
  reason: string;
  status: "mapped" | "warning";
};

export type AttendanceStructureSummary = {
  detected_header_row_number: number;
  mapped_fields: AttendanceFieldMapping[];
  warnings: string[];
};

export type AttendanceRowIssue = {
  row_number: number;
  employee_name: string;
  employee_id: string;
  date_value: string;
  details: string;
};

export type AttendanceDuplicateDateIssue = {
  employee_name: string;
  employee_id: string;
  date_value: string;
  row_numbers: number[];
};

export type AttendanceLocationCoverageItem = {
  location_name: string;
  total_entries: number;
};

export type AttendanceMonthlyEntryItem = {
  month: string;
  total_entries: number;
};

export type AttendanceMonthlyConsistencyIssue = {
  employee_name: string;
  employee_id: string;
  months: string[];
  entry_counts: number[];
  details: string;
};

export type AttendanceEmployeeActivityItem = {
  employee_name: string;
  employee_id: string;
  total_entries: number;
  active_days: number;
  months_active: number;
  locations_covered: number;
};

export type AttendancePolicyRule = {
  rule_id: string;
  label: string;
  description: string;
  value: string;
  value_type: string;
  enabled: boolean;
};

export type AttendanceExceptionActionOption = {
  action_key: string;
  label: string;
  description: string;
};

export type AttendanceExceptionCandidate = {
  record_id: string;
  source_row_number: number;
  employee_code: string;
  employee_name: string;
  date: string;
  in_time: string;
  out_time: string;
  work_duration: string;
  attendance_status: string;
  remarks: string;
};

export type AttendanceExceptionGroup = {
  exception_id: string;
  category: string;
  severity: "warning" | "error";
  employee_code: string;
  employee_name: string;
  date: string;
  unit: string;
  summary: string;
  details: string;
  suggested_action: string;
  selected_action: string;
  requires_review: boolean;
  anomaly_flags: string[];
  action_options: AttendanceExceptionActionOption[];
  candidate_rows: AttendanceExceptionCandidate[];
};

export type AttendanceProcessedRow = {
  record_id: string;
  employee_code: string;
  employee_name: string;
  gender: string;
  date: string;
  day_label: string;
  unit: string;
  raw_status: string;
  in_time: string;
  out_time: string;
  working_hours: string;
  final_status_code: string;
  attendance_classification: string;
  payable_day_impact: number;
  payable_value: number;
  comp_off_earned: number;
  comp_off_adjusted: number;
  late_deduction_adjusted: number;
  payroll_impact_label: string;
  detected_rule_id: string;
  rule_explanation: string;
  remarks: string;
  hr_override_status: string;
  hr_reviewed_by: string;
  hr_reviewed_at: string;
  action_source: string;
  action_reason: string;
  action_remarks: string;
  derived_flags: string[];
  anomaly_flags: string[];
  source_row_numbers: number[];
  original_employee_names?: string[];
  original_employee_codes?: string[];
  merged_from_record_ids?: string[];
};

export type EmployeePayableAdjustment = {
  final_employee_name: string;
  final_employee_code?: string;
  payable_days_adjustment?: number;
  comp_off_adjustment?: number;
  leave_adjustment?: number;
  adjustment_remarks?: string;
};

export type AttendanceEmployeeMergeSource = {
  source_names?: string[];
  source_codes?: string[];
};

export type AttendanceMergeInstruction = {
  final_employee_name: string;
  final_employee_code?: string;
  sources: AttendanceEmployeeMergeSource;
  adjustments?: EmployeePayableAdjustment;
};

export type AttendanceMergeRequest = {
  sheet_name: string;
  merge_instructions?: AttendanceMergeInstruction[];
  dry_run?: boolean;
};

export type AttendanceStatusSummary = {
  present_count: number;
  absent_count: number;
  half_day_count: number;
  paid_week_off_count: number;
  unpaid_week_off_count: number;
  paid_holiday_count: number;
  unpaid_holiday_count: number;
  irregular_punch_count: number;
  pending_review_count: number;
  comp_off_earned_count: number;
  comp_off_adjusted_days: number;
  late_entry_count: number;
  early_logout_count: number;
  overnight_exit_count: number;
  missing_punch_count: number;
};

export type AttendanceEmployeeMonthlySummaryItem = {
  employee_name: string;
  employee_id: string;
  month: string;
  present_count: number;
  absent_count: number;
  half_day_count: number;
  paid_week_off_count: number;
  unpaid_week_off_count: number;
  paid_holiday_count: number;
  unpaid_holiday_count: number;
  irregular_punch_count: number;
  pending_review_count: number;
  comp_off_earned_count: number;
  comp_off_adjusted_days: number;
  late_entry_count: number;
  early_logout_count: number;
  overnight_exit_count: number;
  missing_punch_count: number;
  gross_payable_days: number;
  late_penalty_deductions: number;
  late_penalty_after_comp_off: number;
  comp_off_adjusted_against_absent_days: number;
  comp_off_adjusted_against_late_days: number;
  comp_off_balance: number;
  comp_off_balance_days: number;
  comp_off_carry_forward_days: number;
  payable_days: number;
};

export type AttendanceUnitSummaryItem = {
  unit_name: string;
  total_records: number;
  present_count: number;
  absent_count: number;
  half_day_count: number;
  paid_week_off_count: number;
  unpaid_week_off_count: number;
  paid_holiday_count: number;
  unpaid_holiday_count: number;
  irregular_punch_count: number;
  pending_review_count: number;
  comp_off_earned_count: number;
  comp_off_adjusted_days: number;
  late_entry_count: number;
  early_logout_count: number;
  overnight_exit_count: number;
  missing_punch_count: number;
  payable_days: number;
};

export type AttendanceProcessingSummary = {
  processing_mode: string;
  unique_employees: number;
  total_records: number;
  total_exception_groups: number;
  pending_review_groups: number;
  future_date_count: number;
  overnight_punch_count: number;
  missing_punch_count: number;
  suspicious_entry_count: number;
  date_range_start: string;
  date_range_end: string;
  unit_options: string[];
  employee_options: string[];
  status_summary: AttendanceStatusSummary;
};

export type AttendanceReviewDecision = {
  exception_id: string;
  action_key: string;
  action_by?: string;
  reason?: string;
  remarks?: string;
};

export type AttendanceHolidayMarker = {
  date: string;
  holiday_type: string;
  reason: string;
  remarks: string;
  action_by: string;
  action_at: string;
  source: string;
};

export type AttendanceAdministrativeException = {
  date: string;
  scope: string;
  treatment_type: string;
  unit_name: string;
  employee_ids: string[];
  custom_status_label: string;
  custom_payable_value: number | null;
  reason: string;
  remarks: string;
  action_by: string;
  action_at: string;
  source: string;
};

export type AttendanceValidationSummary = {
  status: "valid" | "warning" | "error";
  total_valid_rows: number;
  total_invalid_rows: number;
  warnings_count: number;
  errors_count: number;
  processing_mode: string;
  missing_required_columns: string[];
  structure_summary: AttendanceStructureSummary;
  policy_rules: AttendancePolicyRule[];
  processing_summary: AttendanceProcessingSummary;
  exception_groups: AttendanceExceptionGroup[];
  detected_columns: AttendanceDetectedColumns;
  working_days_count: number;
  working_day_labels: string[];
  date_range_start: string;
  date_range_end: string;
  missing_dates: AttendanceRowIssue[];
  duplicate_dates: AttendanceDuplicateDateIssue[];
  blank_work_descriptions: AttendanceRowIssue[];
  missing_remarks: AttendanceRowIssue[];
  daily_activity_gaps: AttendanceRowIssue[];
  location_coverage: AttendanceLocationCoverageItem[];
  total_entries_per_month: AttendanceMonthlyEntryItem[];
  monthly_consistency: AttendanceMonthlyConsistencyIssue[];
  employee_activity_message: string;
  employee_activity_summary: AttendanceEmployeeActivityItem[];
  marked_holidays: AttendanceHolidayMarker[];
  administrative_exceptions: AttendanceAdministrativeException[];
  employee_monthly_summary: AttendanceEmployeeMonthlySummaryItem[];
  unit_summary: AttendanceUnitSummaryItem[];
  processed_attendance_rows: AttendanceProcessedRow[];
};

export type WorkbookSheetSummary = {
  sheet_name: string;
  row_count: number;
  column_count: number;
  detected_column_names: string[];
  likely_sheet_type:
    | "salary/payroll sheet"
    | "attendance sheet"
    | "sales sheet"
    | "purchase sheet"
    | "expense sheet"
    | "inventory/stock sheet"
    | "unknown";
  date_columns: string[];
  amount_value_columns: string[];
  id_name_columns: string[];
  warnings: string[];
};

export type UploadResponse = {
  upload_id: string;
  analysis_type: string;
  analysis_overview: AnalysisOverview;
  file_name: string;
  file_type: string;
  upload_status: string;
  message: string;
  sheet_names: string[];
  selected_sheet: string;
  total_rows: number;
  total_columns: number;
  column_headers: string[];
  preview_rows: string[][];
  payroll_validation_summary: ValidationSummary | null;
  attendance_validation_summary: AttendanceValidationSummary | null;
  workbook_intelligence_summary: WorkbookSheetSummary[];
};
