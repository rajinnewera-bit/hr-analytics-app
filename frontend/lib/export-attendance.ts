import type {
  AttendanceProcessedRow,
  AttendanceEmployeeMonthlySummaryItem,
} from "@/types/upload";

/**
 * Generate CSV content for detailed attendance report
 */
export function generateDetailedAttendanceCSV(
  rows: AttendanceProcessedRow[],
  fileName: string = "detailed_attendance_report.csv"
): void {
  const headers = [
    "Date",
    "Employee Name",
    "Original Names",
    "Employee Code",
    "Gender",
    "Unit",
    "IN Time",
    "OUT Time",
    "Working Hours",
    "Status",
    "Classification",
    "Payable Days",
    "Comp Off Earned",
    "Comp Off Adjusted",
    "Late Deduction",
    "HR Override",
    "Remarks",
  ];

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.date,
        `"${row.employee_name}"`,
        `"${(row.original_employee_names || []).join("; ")}"`,
        row.employee_code,
        row.gender,
        row.unit,
        row.in_time || "",
        row.out_time || "",
        row.working_hours,
        row.final_status_code,
        row.attendance_classification,
        row.payable_day_impact,
        row.comp_off_earned,
        row.comp_off_adjusted,
        row.late_deduction_adjusted,
        row.hr_override_status,
        `"${row.remarks.replace(/"/g, '""')}"`,
      ]
        .map((v) => v?.toString() || "")
        .join(",")
    ),
  ].join("\n");

  downloadCSV(csvContent, fileName);
}

/**
 * Generate CSV content for payroll-ready report (only merged/final rows)
 */
export function generatePayrollReadyCSV(
  rows: AttendanceProcessedRow[],
  monthlySummary: AttendanceEmployeeMonthlySummaryItem[] = [],
  fileName: string = "payroll_ready_report.csv"
): void {
  // Filter to only show final merged rows (deduplicate by employee_name+date)
  const finalRows: Record<string, AttendanceProcessedRow> = {};

  rows.forEach((row) => {
    const key = `${row.employee_name}|${row.date}`;
    if (!finalRows[key]) {
      finalRows[key] = row;
    }
  });

  const finalRowsArray = Object.values(finalRows).sort(
    (a, b) => a.date.localeCompare(b.date) || (a.employee_name || "").localeCompare(b.employee_name || "")
  );

  const headers = [
    "Date",
    "Employee Name",
    "Employee Code",
    "Gender",
    "Unit",
    "Status",
    "Classification",
    "IN Time",
    "OUT Time",
    "Working Hours",
    "Payable Days",
    "Comp Off Earned",
    "Comp Off Adjusted",
    "Late Deduction",
    "Payroll Impact Label",
  ];

  const csvContent = [
    headers.join(","),
    ...finalRowsArray.map((row) =>
      [
        row.date,
        `"${row.employee_name}"`,
        row.employee_code,
        row.gender,
        row.unit,
        row.final_status_code,
        row.attendance_classification,
        row.in_time || "",
        row.out_time || "",
        row.working_hours,
        row.payable_day_impact,
        row.comp_off_earned,
        row.comp_off_adjusted,
        row.late_deduction_adjusted,
        `"${row.payroll_impact_label}"`,
      ]
        .map((v) => v?.toString() || "")
        .join(",")
    ),
  ].join("\n");

  downloadCSV(csvContent, fileName);
}

/**
 * Generate CSV for employee monthly summary
 */
export function generateEmployeeMonthlySummaryCSV(
  summary: AttendanceEmployeeMonthlySummaryItem[],
  fileName: string = "employee_monthly_summary.csv"
): void {
  const headers = [
    "Employee Name",
    "Employee ID",
    "Month",
    "Present",
    "Absent",
    "Half Day",
    "Paid WO",
    "Unpaid WO",
    "Paid Holiday",
    "Unpaid Holiday",
    "Irregular Punch",
    "Pending Review",
    "Comp Off Earned",
    "Comp Off Adjusted",
    "Late Entry Count",
    "Early Logout",
    "Overnight Exit",
    "Missing Punch",
    "Gross Payable Days",
    "Late Penalty",
    "Late Penalty After Comp Off",
    "Comp Off Adjusted (Absent)",
    "Comp Off Adjusted (Late)",
    "Comp Off Balance",
    "Comp Off Carry Forward",
    "Final Payable Days",
  ];

  const csvContent = [
    headers.join(","),
    ...summary.map((item) =>
      [
        `"${item.employee_name}"`,
        item.employee_id,
        item.month,
        item.present_count,
        item.absent_count,
        item.half_day_count,
        item.paid_week_off_count,
        item.unpaid_week_off_count,
        item.paid_holiday_count,
        item.unpaid_holiday_count,
        item.irregular_punch_count,
        item.pending_review_count,
        item.comp_off_earned_count,
        item.comp_off_adjusted_days,
        item.late_entry_count,
        item.early_logout_count,
        item.overnight_exit_count,
        item.missing_punch_count,
        item.gross_payable_days,
        item.late_penalty_deductions,
        item.late_penalty_after_comp_off,
        item.comp_off_adjusted_against_absent_days,
        item.comp_off_adjusted_against_late_days,
        item.comp_off_balance,
        item.comp_off_carry_forward_days,
        item.payable_days,
      ]
        .map((v) => v?.toString() || "")
        .join(",")
    ),
  ].join("\n");

  downloadCSV(csvContent, fileName);
}

/**
 * Download CSV file
 */
function downloadCSV(csvContent: string, fileName: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(isoString: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleString("en-IN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
