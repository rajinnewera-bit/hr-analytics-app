import type {
  AnalysisOverview,
  AttendanceValidationSummary,
  UploadResponse,
  ValidationSummary,
  WorkbookSheetSummary
} from "@/types/upload";

const emptyAnalysisOverview: AnalysisOverview = {
  engine: "generic",
  title: "Auto Detect",
  status: "info",
  message: "No specialized analysis has been selected yet."
};

const emptyValidationSummary: ValidationSummary = {
  status: "valid",
  total_valid_rows: 0,
  total_invalid_rows: 0,
  warnings_count: 0,
  errors_count: 0,
  missing_required_columns: [],
  duplicate_employee_ids: [],
  blank_row_numbers: [],
  negative_salary_values: [],
  low_working_hours: [],
  missing_in_out_time: []
};

const emptyAttendanceValidationSummary: AttendanceValidationSummary = {
  status: "valid",
  total_valid_rows: 0,
  total_invalid_rows: 0,
  warnings_count: 0,
  errors_count: 0,
  processing_mode: "timesheet",
  missing_required_columns: [],
  structure_summary: {
    detected_header_row_number: 0,
    mapped_fields: [],
    warnings: []
  },
  policy_rules: [],
  processing_summary: {
    processing_mode: "timesheet",
    unique_employees: 0,
    total_records: 0,
    total_exception_groups: 0,
    pending_review_groups: 0,
    future_date_count: 0,
    overnight_punch_count: 0,
    missing_punch_count: 0,
    suspicious_entry_count: 0,
    date_range_start: "",
    date_range_end: "",
    unit_options: [],
    employee_options: [],
    status_summary: {
      present_count: 0,
      absent_count: 0,
      half_day_count: 0,
      paid_week_off_count: 0,
      unpaid_week_off_count: 0,
              paid_holiday_count: 0,
              unpaid_holiday_count: 0,
              irregular_punch_count: 0,
              pending_review_count: 0,
              comp_off_earned_count: 0,
              comp_off_adjusted_days: 0,
              late_entry_count: 0,
              early_login_count: 0,
              early_logout_count: 0,
              overnight_exit_count: 0,
      missing_punch_count: 0
    }
  },
  exception_groups: [],
  detected_columns: {
    employee_code_columns: [],
    employee_name_columns: [],
    employee_id_columns: [],
    gender_columns: [],
    date_columns: [],
    day_columns: [],
    in_time_columns: [],
    out_time_columns: [],
    work_duration_columns: [],
    attendance_status_columns: [],
    working_day_columns: [],
    activity_columns: [],
    work_description_columns: [],
    unit_columns: [],
    location_columns: [],
    remarks_columns: []
  },
  working_days_count: 0,
  working_day_labels: [],
  date_range_start: "",
  date_range_end: "",
  missing_dates: [],
  duplicate_dates: [],
  blank_work_descriptions: [],
  missing_remarks: [],
  daily_activity_gaps: [],
  location_coverage: [],
  total_entries_per_month: [],
  monthly_consistency: [],
  employee_activity_message: "",
  employee_activity_summary: [],
  marked_holidays: [],
  administrative_exceptions: [],
  employee_monthly_summary: [],
  unit_summary: [],
  processed_attendance_rows: []
};

const emptyMonthlyExplainability = {
  month: "",
  calendar_days: 0,
  comp_off_ledger: [],
  comp_off_usage_trail: [],
  late_deduction: {
    late_rule_label: "3 Late Flags = 1 Deduction",
    late_cutoff_time: "10:11 AM",
    total_late_flags: 0,
    late_source_dates: [],
    late_source_record_ids: [],
    deductions_before_comp_off: 0,
    comp_off_adjusted_against_late_days: 0,
    deductions_after_comp_off: 0,
    formula_text: "0 late flags ÷ 3 = 0 deductions"
  },
  calculation_breakdown: {
    calendar_days: 0,
    present_days: 0,
    half_days: 0,
    absent_days: 0,
    paid_week_off_days: 0,
    unpaid_week_off_days: 0,
    paid_holiday_days: 0,
    unpaid_holiday_days: 0,
    pending_review_days: 0,
    half_day_deduction_days: 0,
    gross_payable_days: 0,
    late_penalty_before_comp_off: 0,
    late_penalty_after_comp_off: 0,
    comp_off_adjusted_against_absent_days: 0,
    comp_off_adjusted_against_late_days: 0,
    final_payable_days: 0
  }
};

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safeStringArray(value: string[] | null | undefined): string[] {
  return safeArray(value).map((item) => safeString(item)).filter(Boolean);
}

export function normalizeAttendanceValidationSummary(
  attendanceValidationSummary: Partial<AttendanceValidationSummary> | null | undefined
): AttendanceValidationSummary {
  if (!attendanceValidationSummary) {
    return emptyAttendanceValidationSummary;
  }

  return {
    status: attendanceValidationSummary.status ?? emptyAttendanceValidationSummary.status,
    total_valid_rows: attendanceValidationSummary.total_valid_rows ?? 0,
    total_invalid_rows: attendanceValidationSummary.total_invalid_rows ?? 0,
    warnings_count: attendanceValidationSummary.warnings_count ?? 0,
    errors_count: attendanceValidationSummary.errors_count ?? 0,
    processing_mode:
      attendanceValidationSummary.processing_mode ??
      emptyAttendanceValidationSummary.processing_mode,
    missing_required_columns: safeStringArray(
      attendanceValidationSummary.missing_required_columns
    ),
    structure_summary: {
      detected_header_row_number:
        attendanceValidationSummary.structure_summary?.detected_header_row_number ?? 0,
      mapped_fields: safeArray(attendanceValidationSummary.structure_summary?.mapped_fields).map(
        (item) => ({
          field_name: safeString(item?.field_name),
          detected_column_name: safeString(item?.detected_column_name),
          confidence_score: safeNumber(item?.confidence_score),
          reason: safeString(item?.reason),
          status: item?.status === "warning" ? "warning" : "mapped"
        })
      ),
      warnings: safeStringArray(attendanceValidationSummary.structure_summary?.warnings)
    },
    policy_rules: safeArray(attendanceValidationSummary.policy_rules).map((rule) => ({
      rule_id: safeString(rule?.rule_id),
      label: safeString(rule?.label),
      description: safeString(rule?.description),
      value: safeString(rule?.value),
      value_type: safeString(rule?.value_type),
      enabled: Boolean(rule?.enabled)
    })),
    processing_summary: {
      processing_mode:
        attendanceValidationSummary.processing_summary?.processing_mode ??
        emptyAttendanceValidationSummary.processing_summary.processing_mode,
      unique_employees:
        attendanceValidationSummary.processing_summary?.unique_employees ?? 0,
      total_records:
        attendanceValidationSummary.processing_summary?.total_records ?? 0,
      total_exception_groups:
        attendanceValidationSummary.processing_summary?.total_exception_groups ?? 0,
      pending_review_groups:
        attendanceValidationSummary.processing_summary?.pending_review_groups ?? 0,
      future_date_count:
        attendanceValidationSummary.processing_summary?.future_date_count ?? 0,
      overnight_punch_count:
        attendanceValidationSummary.processing_summary?.overnight_punch_count ?? 0,
      missing_punch_count:
        attendanceValidationSummary.processing_summary?.missing_punch_count ?? 0,
      suspicious_entry_count:
        attendanceValidationSummary.processing_summary?.suspicious_entry_count ?? 0,
      date_range_start:
        attendanceValidationSummary.processing_summary?.date_range_start ?? "",
      date_range_end:
        attendanceValidationSummary.processing_summary?.date_range_end ?? "",
      unit_options: safeStringArray(
        attendanceValidationSummary.processing_summary?.unit_options
      ),
      employee_options: safeStringArray(
        attendanceValidationSummary.processing_summary?.employee_options
      ),
      status_summary: {
        present_count:
          attendanceValidationSummary.processing_summary?.status_summary?.present_count ?? 0,
        absent_count:
          attendanceValidationSummary.processing_summary?.status_summary?.absent_count ?? 0,
        half_day_count:
          attendanceValidationSummary.processing_summary?.status_summary?.half_day_count ?? 0,
        paid_week_off_count:
          attendanceValidationSummary.processing_summary?.status_summary?.paid_week_off_count ?? 0,
        unpaid_week_off_count:
          attendanceValidationSummary.processing_summary?.status_summary?.unpaid_week_off_count ?? 0,
        paid_holiday_count:
          attendanceValidationSummary.processing_summary?.status_summary?.paid_holiday_count ?? 0,
        unpaid_holiday_count:
          attendanceValidationSummary.processing_summary?.status_summary?.unpaid_holiday_count ?? 0,
        irregular_punch_count:
          attendanceValidationSummary.processing_summary?.status_summary?.irregular_punch_count ?? 0,
        pending_review_count:
          attendanceValidationSummary.processing_summary?.status_summary?.pending_review_count ?? 0,
        comp_off_earned_count:
          attendanceValidationSummary.processing_summary?.status_summary?.comp_off_earned_count ?? 0,
        comp_off_adjusted_days:
          attendanceValidationSummary.processing_summary?.status_summary?.comp_off_adjusted_days ?? 0,
        late_entry_count:
          attendanceValidationSummary.processing_summary?.status_summary?.late_entry_count ?? 0,
        early_login_count:
          attendanceValidationSummary.processing_summary?.status_summary?.early_login_count ?? 0,
        early_logout_count:
          attendanceValidationSummary.processing_summary?.status_summary?.early_logout_count ?? 0,
        overnight_exit_count:
          attendanceValidationSummary.processing_summary?.status_summary?.overnight_exit_count ?? 0,
        missing_punch_count:
          attendanceValidationSummary.processing_summary?.status_summary?.missing_punch_count ?? 0
      }
    },
    exception_groups: safeArray(attendanceValidationSummary.exception_groups).map((group) => ({
      exception_id: safeString(group?.exception_id),
      category: safeString(group?.category),
      severity: group?.severity === "error" ? "error" : "warning",
      employee_code: safeString(group?.employee_code),
      employee_name: safeString(group?.employee_name),
      date: safeString(group?.date),
      unit: safeString(group?.unit),
      summary: safeString(group?.summary),
      details: safeString(group?.details),
      suggested_action: safeString(group?.suggested_action),
      selected_action: safeString(group?.selected_action),
      requires_review: Boolean(group?.requires_review),
      anomaly_flags: safeStringArray(group?.anomaly_flags),
      action_options: safeArray(group?.action_options).map((option) => ({
        action_key: safeString(option?.action_key),
        label: safeString(option?.label),
        description: safeString(option?.description)
      })),
      candidate_rows: safeArray(group?.candidate_rows).map((candidate) => ({
        record_id: safeString(candidate?.record_id),
        source_row_number: safeNumber(candidate?.source_row_number),
        employee_code: safeString(candidate?.employee_code),
        employee_name: safeString(candidate?.employee_name),
        date: safeString(candidate?.date),
        in_time: safeString(candidate?.in_time),
        out_time: safeString(candidate?.out_time),
        work_duration: safeString(candidate?.work_duration),
        attendance_status: safeString(candidate?.attendance_status),
        remarks: safeString(candidate?.remarks)
      }))
    })),
    detected_columns: {
      employee_code_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.employee_code_columns
      ),
      employee_name_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.employee_name_columns
      ),
      employee_id_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.employee_id_columns
      ),
      gender_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.gender_columns
      ),
      date_columns: safeStringArray(attendanceValidationSummary.detected_columns?.date_columns),
      day_columns: safeStringArray(attendanceValidationSummary.detected_columns?.day_columns),
      in_time_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.in_time_columns
      ),
      out_time_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.out_time_columns
      ),
      work_duration_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.work_duration_columns
      ),
      attendance_status_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.attendance_status_columns
      ),
      working_day_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.working_day_columns
      ),
      activity_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.activity_columns
      ),
      work_description_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.work_description_columns
      ),
      unit_columns: safeStringArray(attendanceValidationSummary.detected_columns?.unit_columns),
      location_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.location_columns
      ),
      remarks_columns: safeStringArray(
        attendanceValidationSummary.detected_columns?.remarks_columns
      )
    },
    working_days_count: attendanceValidationSummary.working_days_count ?? 0,
    working_day_labels: safeStringArray(attendanceValidationSummary.working_day_labels),
    date_range_start: attendanceValidationSummary.date_range_start ?? "",
    date_range_end: attendanceValidationSummary.date_range_end ?? "",
    missing_dates: safeArray(attendanceValidationSummary.missing_dates),
    duplicate_dates: safeArray(attendanceValidationSummary.duplicate_dates),
    blank_work_descriptions: safeArray(attendanceValidationSummary.blank_work_descriptions),
    missing_remarks: safeArray(attendanceValidationSummary.missing_remarks),
    daily_activity_gaps: safeArray(attendanceValidationSummary.daily_activity_gaps),
    location_coverage: safeArray(attendanceValidationSummary.location_coverage),
    total_entries_per_month: safeArray(attendanceValidationSummary.total_entries_per_month),
    monthly_consistency: safeArray(attendanceValidationSummary.monthly_consistency),
    employee_activity_message:
      attendanceValidationSummary.employee_activity_message ?? "",
    employee_activity_summary: safeArray(attendanceValidationSummary.employee_activity_summary),
    marked_holidays: safeArray(attendanceValidationSummary.marked_holidays).map((item) => ({
      date: safeString(item?.date),
      holiday_type: safeString(item?.holiday_type),
      reason: safeString(item?.reason),
      remarks: safeString(item?.remarks),
      action_by: safeString(item?.action_by, "HR"),
      action_at: safeString(item?.action_at),
      source: safeString(item?.source, "Holiday Marker")
    })),
    administrative_exceptions: safeArray(
      attendanceValidationSummary.administrative_exceptions
    ).map((item) => ({
      date: safeString(item?.date),
      scope: safeString(item?.scope, "all_employees"),
      treatment_type: safeString(item?.treatment_type, "Paid Present"),
      unit_name: safeString(item?.unit_name),
      employee_ids: safeStringArray(item?.employee_ids),
      custom_status_label: safeString(item?.custom_status_label),
      custom_payable_value:
        typeof item?.custom_payable_value === "number"
          ? item.custom_payable_value
          : null,
      reason: safeString(item?.reason),
      remarks: safeString(item?.remarks),
      action_by: safeString(item?.action_by, "HR"),
      action_at: safeString(item?.action_at),
      source: safeString(item?.source, "Administrative Attendance Exception")
    })),
    employee_monthly_summary: safeArray(
      attendanceValidationSummary.employee_monthly_summary
    ).map((item) => ({
      ...item,
      employee_name: safeString(item?.employee_name),
      employee_id: safeString(item?.employee_id),
      month: safeString(item?.month),
      pending_review_count: item?.pending_review_count ?? 0,
      comp_off_earned_count: item?.comp_off_earned_count ?? 0,
      comp_off_adjusted_days: item?.comp_off_adjusted_days ?? 0,
      early_login_count: item?.early_login_count ?? 0,
      gross_payable_days: item?.gross_payable_days ?? item?.payable_days ?? 0,
      late_penalty_after_comp_off:
        item?.late_penalty_after_comp_off ?? item?.late_penalty_deductions ?? 0,
      comp_off_adjusted_against_absent_days:
        item?.comp_off_adjusted_against_absent_days ?? 0,
      comp_off_adjusted_against_late_days:
        item?.comp_off_adjusted_against_late_days ?? 0,
      comp_off_balance:
        item?.comp_off_balance ?? item?.comp_off_balance_days ?? 0,
      comp_off_balance_days: item?.comp_off_balance_days ?? 0,
      comp_off_carry_forward_days: item?.comp_off_carry_forward_days ?? 0,
      explainability: item?.explainability
        ? {
            month: safeString(item.explainability.month, safeString(item?.month)),
            calendar_days:
              item.explainability.calendar_days ??
              item.explainability.calculation_breakdown?.calendar_days ??
              0,
            comp_off_ledger: safeArray(item.explainability.comp_off_ledger).map((ledgerItem) => ({
              source_kind: safeString(ledgerItem?.source_kind, "attendance_day"),
              source_record_id: safeString(ledgerItem?.source_record_id),
              source_date: safeString(ledgerItem?.source_date),
              source_day_label: safeString(ledgerItem?.source_day_label),
              source_attendance_result: safeString(ledgerItem?.source_attendance_result),
              source_working_hours: safeString(ledgerItem?.source_working_hours),
              source_reason: safeString(ledgerItem?.source_reason),
              earned_value: safeNumber(ledgerItem?.earned_value),
              used_value: safeNumber(ledgerItem?.used_value),
              balance_value: safeNumber(ledgerItem?.balance_value)
            })),
            comp_off_usage_trail: safeArray(item.explainability.comp_off_usage_trail).map((trailItem) => ({
              source_kind: safeString(trailItem?.source_kind, "attendance_day"),
              source_record_id: safeString(trailItem?.source_record_id),
              source_date: safeString(trailItem?.source_date),
              source_day_label: safeString(trailItem?.source_day_label),
              source_attendance_result: safeString(trailItem?.source_attendance_result),
              source_working_hours: safeString(trailItem?.source_working_hours),
              source_reason: safeString(trailItem?.source_reason),
              earned_value: safeNumber(trailItem?.earned_value),
              adjusted_record_id: safeString(trailItem?.adjusted_record_id),
              adjusted_date: safeString(trailItem?.adjusted_date),
              adjusted_day_label: safeString(trailItem?.adjusted_day_label),
              adjusted_attendance_result: safeString(trailItem?.adjusted_attendance_result),
              adjusted_working_hours: safeString(trailItem?.adjusted_working_hours),
              adjustment_value: safeNumber(trailItem?.adjustment_value),
              adjustment_kind: safeString(trailItem?.adjustment_kind),
              adjustment_reason: safeString(trailItem?.adjustment_reason),
              payroll_impact: safeString(trailItem?.payroll_impact)
            })),
            late_deduction: {
              late_rule_label: safeString(
                item.explainability.late_deduction?.late_rule_label,
                emptyMonthlyExplainability.late_deduction.late_rule_label
              ),
              late_cutoff_time: safeString(
                item.explainability.late_deduction?.late_cutoff_time,
                emptyMonthlyExplainability.late_deduction.late_cutoff_time
              ),
              total_late_flags: safeNumber(
                item.explainability.late_deduction?.total_late_flags
              ),
              late_source_dates: safeStringArray(
                item.explainability.late_deduction?.late_source_dates
              ),
              late_source_record_ids: safeStringArray(
                item.explainability.late_deduction?.late_source_record_ids
              ),
              deductions_before_comp_off: safeNumber(
                item.explainability.late_deduction?.deductions_before_comp_off
              ),
              comp_off_adjusted_against_late_days: safeNumber(
                item.explainability.late_deduction?.comp_off_adjusted_against_late_days
              ),
              deductions_after_comp_off: safeNumber(
                item.explainability.late_deduction?.deductions_after_comp_off
              ),
              formula_text: safeString(
                item.explainability.late_deduction?.formula_text,
                emptyMonthlyExplainability.late_deduction.formula_text
              )
            },
            calculation_breakdown: {
              calendar_days: safeNumber(
                item.explainability.calculation_breakdown?.calendar_days
              ),
              present_days: safeNumber(
                item.explainability.calculation_breakdown?.present_days
              ),
              half_days: safeNumber(item.explainability.calculation_breakdown?.half_days),
              absent_days: safeNumber(
                item.explainability.calculation_breakdown?.absent_days
              ),
              paid_week_off_days: safeNumber(
                item.explainability.calculation_breakdown?.paid_week_off_days
              ),
              unpaid_week_off_days: safeNumber(
                item.explainability.calculation_breakdown?.unpaid_week_off_days
              ),
              paid_holiday_days: safeNumber(
                item.explainability.calculation_breakdown?.paid_holiday_days
              ),
              unpaid_holiday_days: safeNumber(
                item.explainability.calculation_breakdown?.unpaid_holiday_days
              ),
              pending_review_days: safeNumber(
                item.explainability.calculation_breakdown?.pending_review_days
              ),
              half_day_deduction_days: safeNumber(
                item.explainability.calculation_breakdown?.half_day_deduction_days
              ),
              gross_payable_days: safeNumber(
                item.explainability.calculation_breakdown?.gross_payable_days
              ),
              late_penalty_before_comp_off: safeNumber(
                item.explainability.calculation_breakdown?.late_penalty_before_comp_off
              ),
              late_penalty_after_comp_off: safeNumber(
                item.explainability.calculation_breakdown?.late_penalty_after_comp_off
              ),
              comp_off_adjusted_against_absent_days: safeNumber(
                item.explainability.calculation_breakdown?.comp_off_adjusted_against_absent_days
              ),
              comp_off_adjusted_against_late_days: safeNumber(
                item.explainability.calculation_breakdown?.comp_off_adjusted_against_late_days
              ),
              final_payable_days: safeNumber(
                item.explainability.calculation_breakdown?.final_payable_days
              )
            }
          }
        : null
    })),
    unit_summary: safeArray(attendanceValidationSummary.unit_summary).map((item) => ({
      ...item,
      unit_name: safeString(item?.unit_name),
      pending_review_count: item?.pending_review_count ?? 0,
      comp_off_earned_count: item?.comp_off_earned_count ?? 0,
      comp_off_adjusted_days: item?.comp_off_adjusted_days ?? 0,
      early_login_count: item?.early_login_count ?? 0,
    })),
    processed_attendance_rows: safeArray(
      attendanceValidationSummary.processed_attendance_rows
    ).map((row) => ({
      ...row,
      record_id: safeString(row?.record_id),
      employee_code: safeString(row?.employee_code),
      employee_name: safeString(row?.employee_name),
      gender: safeString(row?.gender),
      date: safeString(row?.date),
      day_label: safeString(row?.day_label),
      unit: safeString(row?.unit),
      raw_status: safeString(row?.raw_status),
      in_time: safeString(row?.in_time),
      out_time: safeString(row?.out_time),
      working_hours: safeString(row?.working_hours),
      final_status_code: safeString(row?.final_status_code),
      attendance_classification: safeString(row?.attendance_classification),
      payable_day_impact: row?.payable_day_impact ?? 0,
      payable_value: row?.payable_value ?? row?.payable_day_impact ?? 0,
      comp_off_earned: row?.comp_off_earned ?? 0,
      comp_off_adjusted: row?.comp_off_adjusted ?? 0,
      late_deduction_adjusted: row?.late_deduction_adjusted ?? 0,
      payroll_impact_label: safeString(row?.payroll_impact_label),
      detected_rule_id: safeString(row?.detected_rule_id),
      rule_explanation: safeString(row?.rule_explanation),
      remarks: safeString(row?.remarks),
      hr_override_status: safeString(row?.hr_override_status),
      hr_reviewed_by: safeString(row?.hr_reviewed_by),
      hr_reviewed_at: safeString(row?.hr_reviewed_at),
      action_source: safeString(row?.action_source),
      action_reason: safeString(row?.action_reason),
      action_remarks: safeString(row?.action_remarks),
      derived_flags: safeStringArray(row?.derived_flags),
      anomaly_flags: safeStringArray(row?.anomaly_flags),
      source_row_numbers: safeArray(row?.source_row_numbers).map((item) => safeNumber(item))
    }))
  };
}

export function normalizeUploadResponse(
  data: Partial<UploadResponse> | null | undefined
): UploadResponse {
  const payrollValidationSummary = data?.payroll_validation_summary;
  const attendanceValidationSummary = data?.attendance_validation_summary;

  return {
    upload_id: data?.upload_id ?? "",
    analysis_type: data?.analysis_type ?? "Auto Detect",
    analysis_overview: {
      engine: data?.analysis_overview?.engine ?? emptyAnalysisOverview.engine,
      title: data?.analysis_overview?.title ?? emptyAnalysisOverview.title,
      status: data?.analysis_overview?.status ?? emptyAnalysisOverview.status,
      message: data?.analysis_overview?.message ?? emptyAnalysisOverview.message
    },
    file_name: data?.file_name ?? "Uploaded File",
    file_type: data?.file_type ?? "unknown",
    upload_status: data?.upload_status ?? "success",
    message: data?.message ?? "File analyzed successfully.",
    sheet_names: Array.isArray(data?.sheet_names) ? data.sheet_names : [],
    selected_sheet: data?.selected_sheet ?? "",
    total_rows: Number.isFinite(data?.total_rows) ? (data?.total_rows as number) : 0,
    total_columns: Number.isFinite(data?.total_columns)
      ? (data?.total_columns as number)
      : 0,
    column_headers: Array.isArray(data?.column_headers) ? data.column_headers : [],
    preview_rows: Array.isArray(data?.preview_rows) ? data.preview_rows : [],
    payroll_validation_summary: payrollValidationSummary
      ? {
          status: payrollValidationSummary.status ?? emptyValidationSummary.status,
          total_valid_rows: payrollValidationSummary.total_valid_rows ?? 0,
          total_invalid_rows: payrollValidationSummary.total_invalid_rows ?? 0,
          warnings_count: payrollValidationSummary.warnings_count ?? 0,
          errors_count: payrollValidationSummary.errors_count ?? 0,
          missing_required_columns:
            payrollValidationSummary.missing_required_columns ?? [],
          duplicate_employee_ids: payrollValidationSummary.duplicate_employee_ids ?? [],
          blank_row_numbers: payrollValidationSummary.blank_row_numbers ?? [],
          negative_salary_values: payrollValidationSummary.negative_salary_values ?? [],
          low_working_hours: payrollValidationSummary.low_working_hours ?? [],
          missing_in_out_time: payrollValidationSummary.missing_in_out_time ?? []
        }
      : null,
    attendance_validation_summary: attendanceValidationSummary
      ? normalizeAttendanceValidationSummary(attendanceValidationSummary)
      : null,
    workbook_intelligence_summary: Array.isArray(data?.workbook_intelligence_summary)
      ? (data?.workbook_intelligence_summary as WorkbookSheetSummary[])
      : []
  };
}
