import type {
  AttendanceCalculationBreakdown,
  AttendanceCompOffLedgerItem,
  AttendanceCompOffUsageTrailItem,
  AttendanceEmployeeMonthlyExplainability,
  AttendanceEmployeeMonthlySummaryItem,
  AttendanceExceptionGroup,
  AttendanceLateDeductionExplanation,
  AttendanceProcessedRow,
  AttendanceStatusSummary,
  AttendanceUnitSummaryItem,
  AttendanceValidationSummary
} from "@/types/upload";

type DerivedAnomalySummary = {
  duplicatePunches: number;
  invalidDurations: number;
  overnightAnomalies: number;
  missingOutTime: number;
  irregularPunch: number;
  impossibleTimings: number;
};

export type EmployeeAttendanceRegisterRow = {
  employeeCode: string;
  employeeName: string;
  gender: string;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  paidWeekOffs: number;
  unpaidWeekOffs: number;
  paidHolidays: number;
  unpaidHolidays: number;
  pendingReviewDays: number;
  grossPayableDays: number;
  lateDeduction: number;
  finalPayableDays: number;
  lateFlags: number;
  earlyLoginFlags: number;
  irregularPunchFlags: number;
  earlyLogoutFlags: number;
  overnightFlags: number;
  compOffEarned: number;
  compOffAdjusted: number;
  compOffBalance: number;
  leaveAdjusted: number;
  primaryDayTotal: number;
  calendarDays: number;
};

export function deriveEmployeeCount(rows: AttendanceProcessedRow[]): number {
  const safeRows = Array.isArray(rows) ? rows : [];
  return new Set(
    safeRows
      .map((row) => row.employee_code || row.employee_name)
      .filter(Boolean)
  ).size;
}

export function deriveStatusSummary(rows: AttendanceProcessedRow[]): AttendanceStatusSummary {
  const safeRows = Array.isArray(rows) ? rows : [];
  const summary: AttendanceStatusSummary = {
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
  };

  safeRows.forEach((row) => {
    const irregularPunchFlag = isIrregularPunchRow(row);
    if (isPresentClassification(row)) {
      summary.present_count += 1;
    }
    if (isAbsentClassification(row)) {
      summary.absent_count += 1;
    }
    if (isHalfDayClassification(row)) {
      summary.half_day_count += 1;
    }
    if (row.final_status_code === "paid_wo") {
      summary.paid_week_off_count += 1;
    }
    if (row.final_status_code === "unpaid_wo") {
      summary.unpaid_week_off_count += 1;
    }
    if (row.final_status_code === "paid_holiday") {
      summary.paid_holiday_count += 1;
    }
    if (row.final_status_code === "unpaid_holiday") {
      summary.unpaid_holiday_count += 1;
    }
    if (row.final_status_code === "irregular_review") {
      summary.pending_review_count += 1;
    }
    if (irregularPunchFlag) {
      summary.irregular_punch_count += 1;
    }
    if (row.comp_off_earned > 0) {
      summary.comp_off_earned_count += 1;
    }
    summary.comp_off_adjusted_days += row.comp_off_adjusted;
    if (row.derived_flags.includes("late_entry")) {
      summary.late_entry_count += 1;
    }
    if (hasEarlyLoginFlag(row)) {
      summary.early_login_count += 1;
    }
    if (row.derived_flags.includes("early_logout")) {
      summary.early_logout_count += 1;
    }
    if (row.derived_flags.includes("overnight_exit")) {
      summary.overnight_exit_count += 1;
    }
    if (
      row.derived_flags.includes("missing_in_time") ||
      row.derived_flags.includes("missing_out_time")
    ) {
      summary.missing_punch_count += 1;
    }
  });

  return summary;
}

export function deriveEmployeeMonthlySummary(
  rows: AttendanceProcessedRow[],
  fallback: AttendanceEmployeeMonthlySummaryItem[]
): AttendanceEmployeeMonthlySummaryItem[] {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeFallback = Array.isArray(fallback) ? fallback : [];
  if (safeRows.length === 0) {
    return safeFallback;
  }

  const grouped = groupRowsByEmployeeMonth(safeRows);

  return Array.from(grouped.entries())
    .map(([key, groupRows]) => {
      const [employeeKey, month] = key.split("__");
      const statusSummary = deriveStatusSummary(groupRows);
      const firstRow = groupRows[0];
      const grossPayableDays = roundNumber(
        groupRows.reduce((sum, row) => sum + row.payable_day_impact, 0)
      );
      const latePenaltyDeductions = calculateLatePenaltyDeductions(
        statusSummary.late_entry_count
      );
      const compOffAdjustedAgainstLateDays = roundNumber(
        groupRows.reduce((sum, row) => sum + row.late_deduction_adjusted, 0)
      );
      const compOffAdjustedDays = roundNumber(
        groupRows.reduce((sum, row) => sum + row.comp_off_adjusted, 0)
      );
      const compOffAdjustedAgainstAbsentDays = roundNumber(
        Math.max(compOffAdjustedDays - compOffAdjustedAgainstLateDays, 0)
      );
      const latePenaltyAfterCompOff = roundNumber(
        Math.max(latePenaltyDeductions - compOffAdjustedAgainstLateDays, 0)
      );
      const compOffBalance = roundNumber(
        Math.max(
          groupRows.reduce((sum, row) => sum + row.comp_off_earned, 0) - compOffAdjustedDays,
          0
        )
      );
      const explainability = deriveEmployeeMonthlyExplainability(
        firstRow.employee_code || employeeKey,
        month,
        groupRows,
        {
          present_count: statusSummary.present_count,
          absent_count: statusSummary.absent_count,
          half_day_count: statusSummary.half_day_count,
          paid_week_off_count: statusSummary.paid_week_off_count,
          unpaid_week_off_count: statusSummary.unpaid_week_off_count,
          paid_holiday_count: statusSummary.paid_holiday_count,
          unpaid_holiday_count: statusSummary.unpaid_holiday_count,
          pending_review_count: statusSummary.pending_review_count,
          gross_payable_days: grossPayableDays,
          late_penalty_deductions: latePenaltyDeductions,
          late_penalty_after_comp_off: latePenaltyAfterCompOff,
          comp_off_adjusted_against_absent_days: compOffAdjustedAgainstAbsentDays,
          comp_off_adjusted_against_late_days: compOffAdjustedAgainstLateDays,
          payable_days: calculateFinalPayableDays(groupRows),
        }
      );
      return {
        employee_name: firstRow.employee_name,
        employee_id: firstRow.employee_code || employeeKey,
        month,
        present_count: statusSummary.present_count,
        absent_count: statusSummary.absent_count,
        half_day_count: statusSummary.half_day_count,
        paid_week_off_count: statusSummary.paid_week_off_count,
        unpaid_week_off_count: statusSummary.unpaid_week_off_count,
        paid_holiday_count: statusSummary.paid_holiday_count,
        unpaid_holiday_count: statusSummary.unpaid_holiday_count,
        irregular_punch_count: statusSummary.irregular_punch_count,
        pending_review_count: statusSummary.pending_review_count,
        comp_off_earned_count: statusSummary.comp_off_earned_count,
        comp_off_adjusted_days: compOffAdjustedDays,
        late_entry_count: statusSummary.late_entry_count,
        early_login_count: statusSummary.early_login_count,
        early_logout_count: statusSummary.early_logout_count,
        overnight_exit_count: statusSummary.overnight_exit_count,
        missing_punch_count: statusSummary.missing_punch_count,
        gross_payable_days: grossPayableDays,
        late_penalty_deductions: latePenaltyDeductions,
        late_penalty_after_comp_off: latePenaltyAfterCompOff,
        comp_off_adjusted_against_absent_days: compOffAdjustedAgainstAbsentDays,
        comp_off_adjusted_against_late_days: compOffAdjustedAgainstLateDays,
        comp_off_balance: compOffBalance,
        comp_off_balance_days: compOffBalance,
        comp_off_carry_forward_days: 0,
        payable_days: calculateFinalPayableDays(groupRows),
        explainability,
      };
    })
    .sort((left, right) =>
      `${left.month}-${left.employee_name || left.employee_id}`.localeCompare(
        `${right.month}-${right.employee_name || right.employee_id}`
      )
    );
}

export function deriveUnitSummary(
  rows: AttendanceProcessedRow[],
  fallback: AttendanceUnitSummaryItem[]
): AttendanceUnitSummaryItem[] {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeFallback = Array.isArray(fallback) ? fallback : [];
  if (safeRows.length === 0) {
    return safeFallback;
  }

  const grouped = new Map<string, AttendanceProcessedRow[]>();
  safeRows.forEach((row) => {
    const unitName = row.unit || "Unassigned Unit";
    const current = grouped.get(unitName) ?? [];
    current.push(row);
    grouped.set(unitName, current);
  });

  return Array.from(grouped.entries())
    .map(([unitName, groupRows]) => {
      const statusSummary = deriveStatusSummary(groupRows);
      const payableDays = Array.from(groupRowsByEmployeeMonth(groupRows).values()).reduce(
        (sum, employeeMonthRows) => sum + calculateFinalPayableDays(employeeMonthRows),
        0
      );
      return {
        unit_name: unitName,
        total_records: groupRows.length,
        present_count: statusSummary.present_count,
        absent_count: statusSummary.absent_count,
        half_day_count: statusSummary.half_day_count,
        paid_week_off_count: statusSummary.paid_week_off_count,
        unpaid_week_off_count: statusSummary.unpaid_week_off_count,
        paid_holiday_count: statusSummary.paid_holiday_count,
        unpaid_holiday_count: statusSummary.unpaid_holiday_count,
        irregular_punch_count: statusSummary.irregular_punch_count,
        pending_review_count: statusSummary.pending_review_count,
        comp_off_earned_count: statusSummary.comp_off_earned_count,
        comp_off_adjusted_days: statusSummary.comp_off_adjusted_days,
        late_entry_count: statusSummary.late_entry_count,
        early_login_count: statusSummary.early_login_count,
        early_logout_count: statusSummary.early_logout_count,
        overnight_exit_count: statusSummary.overnight_exit_count,
        missing_punch_count: statusSummary.missing_punch_count,
        payable_days: roundNumber(payableDays)
      };
    })
    .sort((left, right) => left.unit_name.localeCompare(right.unit_name));
}

export function deriveAnomalySummary(
  rows: AttendanceProcessedRow[],
  exceptions: AttendanceExceptionGroup[]
): DerivedAnomalySummary {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeExceptions = Array.isArray(exceptions) ? exceptions : [];
  const rowFlags = safeRows.flatMap((row) =>
    Array.isArray(row.anomaly_flags) ? row.anomaly_flags : []
  );
  return {
    duplicatePunches: safeExceptions.filter((group) =>
      ["duplicate_punches", "multiple_entries"].includes(group.category)
    ).length,
    invalidDurations: rowFlags.filter((flag) =>
      ["invalid_duration", "negative_duration"].includes(flag)
    ).length,
    overnightAnomalies: rowFlags.filter((flag) =>
      ["overnight_punch", "impossible_overnight_shift"].includes(flag)
    ).length,
    missingOutTime: rowFlags.filter((flag) => flag === "missing_out_time").length,
    irregularPunch: safeRows.filter((row) => isIrregularPunchRow(row)).length,
    impossibleTimings: rowFlags.filter((flag) =>
      ["impossible_overnight_shift", "negative_duration", "future_date"].includes(flag)
    ).length
  };
}

export function buildPayrollReadySpreadsheet(
  rows: AttendanceProcessedRow[],
  fileName: string
): void {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeFileName = fileName.replace(/[^a-z0-9-_]+/gi, "_");
  const headers = [
    "Day",
    "Employee Code",
    "Employee Name",
    "Gender",
    "Date",
    "Raw Status",
    "In Time",
    "Out Time",
    "Total Working Hours",
    "Final Attendance Classification",
    "Rule Applied",
    "Rule Explanation",
    "Payroll Impact"
  ];
  const tableRows = safeRows.map((row) => [
    formatDayLabelForExport(row.date),
    row.employee_code,
    row.employee_name,
    row.gender,
    row.date,
    row.raw_status,
    row.in_time,
    row.out_time,
    row.working_hours,
    row.attendance_classification,
    formatRuleId(row.detected_rule_id),
    row.rule_explanation,
    row.payroll_impact_label
  ]);

  const html = [
    "<html><head><meta charset=\"utf-8\" /></head><body><table border=\"1\">",
    `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`,
    ...tableRows.map(
      (cells) =>
        `<tr>${cells.map((cell) => `<td>${escapeHtml(cell || "")}</td>`).join("")}</tr>`
    ),
    "</table></body></html>"
  ].join("");

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName || "processed_attendance_working"}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildMonthlyMatrixRows(rows: AttendanceProcessedRow[]) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const dateColumns = Array.from(
    new Set(safeRows.map((row) => row.date).filter(Boolean))
  ).sort();

  const grouped = new Map<
    string,
    {
      employeeCode: string;
      employeeName: string;
      gender: string;
      unit: string;
      byDate: Record<string, AttendanceProcessedRow>;
    }
  >();

  safeRows.forEach((row) => {
    const key = row.employee_code || row.employee_name || row.record_id;
    const current = grouped.get(key) ?? {
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      gender: row.gender,
      unit: row.unit,
      byDate: {}
    };
    current.byDate[row.date] = row;
    grouped.set(key, current);
  });

  return {
    dateColumns,
    employees: Array.from(grouped.values()).sort((left, right) =>
      `${left.employeeName || left.employeeCode}`.localeCompare(
        `${right.employeeName || right.employeeCode}`
      )
    )
  };
}

export function buildDisplayState(
  summary: AttendanceValidationSummary,
  filteredRows: AttendanceProcessedRow[]
) {
  const safeRows = Array.isArray(filteredRows) ? filteredRows : [];
  const employeeMonthlySummary = deriveEmployeeMonthlySummary(
    safeRows,
    summary.employee_monthly_summary
  );
  return {
    employeeMonthlySummary,
    employeeCount:
      deriveEmployeeCount(safeRows) ||
      summary.processing_summary.unique_employees,
    statusSummary:
      safeRows.length > 0
        ? deriveStatusSummary(safeRows)
        : summary.processing_summary.status_summary,
    unitSummary: deriveUnitSummary(safeRows, summary.unit_summary),
    anomalySummary: deriveAnomalySummary(safeRows, summary.exception_groups),
    matrixRows: buildMonthlyMatrixRows(safeRows),
    employeeRegister: deriveEmployeeRegister(safeRows, employeeMonthlySummary),
    payableSundays: derivePayableSundayCount(safeRows),
    unpaidSundays: deriveUnpaidSundayCount(safeRows),
    irregularPunchCount: deriveIrregularPunchCount(safeRows)
  };
}

export function deriveEmployeeRegister(
  rows: AttendanceProcessedRow[],
  employeeMonthlySummary: AttendanceEmployeeMonthlySummaryItem[] = []
): EmployeeAttendanceRegisterRow[] {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeEmployeeMonthlySummary = Array.isArray(employeeMonthlySummary)
    ? employeeMonthlySummary
    : [];
  const grouped = new Map<string, AttendanceProcessedRow[]>();
  safeRows.forEach((row) => {
    const key = row.employee_code || row.employee_name || row.record_id;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });

  return Array.from(grouped.entries())
    .map(([employeeKey, groupRows]) => {
      const firstRow = groupRows[0];
      const presentDays = groupRows.filter((row) =>
        isPresentClassification(row)
      ).length;
      const halfDays = groupRows.filter((row) =>
        isHalfDayClassification(row)
      ).length;
      const absentDays = groupRows.filter((row) =>
        isAbsentClassification(row)
      ).length;
      const paidWeekOffs = groupRows.filter((row) => row.final_status_code === "paid_wo").length;
      const unpaidWeekOffs = groupRows.filter((row) => row.final_status_code === "unpaid_wo").length;
      const paidHolidays = groupRows.filter((row) => row.final_status_code === "paid_holiday").length;
      const unpaidHolidays = groupRows.filter((row) => row.final_status_code === "unpaid_holiday").length;
      const pendingReviewDays = groupRows.filter((row) => row.final_status_code === "irregular_review").length;
      const lateFlags = groupRows.filter((row) =>
        row.derived_flags.includes("late_entry")
      ).length;
      const earlyLoginFlags = groupRows.filter((row) => hasEarlyLoginFlag(row)).length;
      const irregularPunchFlags = groupRows.filter((row) =>
        row.final_status_code === "irregular_review"
      ).length;
      const earlyLogoutFlags = groupRows.filter((row) =>
        row.derived_flags.includes("early_logout")
      ).length;
      const overnightFlags = groupRows.filter((row) =>
        row.derived_flags.includes("overnight_exit")
      ).length;
      const compOffEarned = roundNumber(
        groupRows.reduce((sum, row) => sum + row.comp_off_earned, 0)
      );
      const compOffAdjusted = roundNumber(
        groupRows.reduce((sum, row) => sum + row.comp_off_adjusted, 0)
      );
      const compOffBalance = roundNumber(
        Math.max(
          safeEmployeeMonthlySummary
            .filter(
              (item) =>
                (item.employee_id || item.employee_name) ===
                (firstRow.employee_code || firstRow.employee_name || employeeKey)
            )
            .reduce((sum, item) => sum + (item.comp_off_balance ?? item.comp_off_balance_days ?? 0), 0),
          0
        )
      );
      const compOffAdjustedAgainstLateDays = roundNumber(
        groupRows.reduce((sum, row) => sum + row.late_deduction_adjusted, 0)
      );
      const compOffAdjustedAgainstAbsentDays = roundNumber(
        Math.max(compOffAdjusted - compOffAdjustedAgainstLateDays, 0)
      );
      const leaveAdjusted = groupRows.filter((row) =>
        normalizeText(row.hr_override_status) === "leave adjusted"
      ).length;
      const grossPayableDays = roundNumber(
        groupRows.reduce((sum, row) => sum + row.payable_day_impact, 0)
      );
      const lateDeduction = roundNumber(
        Math.max(calculateLatePenaltyDeductions(lateFlags) - compOffAdjustedAgainstLateDays, 0)
      );
      const finalPayableDays = roundNumber(
        Math.max(grossPayableDays + compOffAdjustedAgainstAbsentDays - lateDeduction, 0)
      );
      const primaryDayTotal =
        presentDays +
        halfDays +
        absentDays +
        paidWeekOffs +
        unpaidWeekOffs +
        paidHolidays +
        unpaidHolidays +
        pendingReviewDays;
      const calendarDays = new Set(groupRows.map((row) => row.date).filter(Boolean)).size;

      return {
        employeeCode: firstRow.employee_code || employeeKey,
        employeeName: firstRow.employee_name,
        gender: firstRow.gender,
        presentDays,
        halfDays,
        absentDays,
        paidWeekOffs,
        unpaidWeekOffs,
        paidHolidays,
        unpaidHolidays,
        pendingReviewDays,
        grossPayableDays,
        lateDeduction,
        finalPayableDays,
        lateFlags,
        earlyLoginFlags,
        irregularPunchFlags,
        earlyLogoutFlags,
        overnightFlags,
        compOffEarned,
        compOffAdjusted,
        compOffBalance,
        leaveAdjusted,
        primaryDayTotal,
        calendarDays
      };
    })
    .sort((left, right) =>
      `${left.employeeName || left.employeeCode}`.localeCompare(
        `${right.employeeName || right.employeeCode}`
      )
    );
}

export function derivePayableSundayCount(rows: AttendanceProcessedRow[]) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.filter(
    (row) =>
      isSunday(row.date) &&
      (
        row.final_status_code === "paid_wo" ||
        row.final_status_code === "present" ||
        row.final_status_code === "present_late" ||
        row.final_status_code === "half_day" ||
        row.comp_off_earned > 0
      )
  ).length;
}

export function deriveUnpaidSundayCount(rows: AttendanceProcessedRow[]) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.filter((row) => isSunday(row.date) && row.final_status_code === "unpaid_wo").length;
}

export function deriveIrregularPunchCount(rows: AttendanceProcessedRow[]) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.filter((row) => isIrregularPunchRow(row)).length;
}

function formatRuleId(value: string) {
  return value.replace(/_/g, " ");
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateLatePenaltyDeductions(lateEntryCount: number) {
  return Math.floor(Math.max(lateEntryCount, 0) / 3);
}

function calculateFinalPayableDays(rows: AttendanceProcessedRow[]) {
  const statusSummary = deriveStatusSummary(rows);
  const basePayableDays = rows.reduce((sum, row) => sum + row.payable_day_impact, 0);
  const lateDeductionOffset = rows.reduce(
    (sum, row) => sum + row.late_deduction_adjusted,
    0
  );
  const compOffAdjustedDays = rows.reduce((sum, row) => sum + row.comp_off_adjusted, 0);
  const absentCompOffAdjustment = Math.max(compOffAdjustedDays - lateDeductionOffset, 0);
  return roundNumber(
    Math.max(
      basePayableDays +
        absentCompOffAdjustment -
        Math.max(
          calculateLatePenaltyDeductions(statusSummary.late_entry_count) - lateDeductionOffset,
          0
        ),
      0
    )
  );
}

function groupRowsByEmployeeMonth(rows: AttendanceProcessedRow[]) {
  const grouped = new Map<string, AttendanceProcessedRow[]>();
  rows.forEach((row) => {
    if (!row.date) {
      return;
    }
    const month = row.date.slice(0, 7);
    const key = `${row.employee_code || row.employee_name || row.record_id}__${month}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  });
  return grouped;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDayLabelForExport(dateValue: string) {
  if (!dateValue) {
    return "";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date);
}

function deriveEmployeeMonthlyExplainability(
  employeeId: string,
  month: string,
  rows: AttendanceProcessedRow[],
  metrics: {
    present_count: number;
    absent_count: number;
    half_day_count: number;
    paid_week_off_count: number;
    unpaid_week_off_count: number;
    paid_holiday_count: number;
    unpaid_holiday_count: number;
    pending_review_count: number;
    gross_payable_days: number;
    late_penalty_deductions: number;
    late_penalty_after_comp_off: number;
    comp_off_adjusted_against_absent_days: number;
    comp_off_adjusted_against_late_days: number;
    payable_days: number;
  }
): AttendanceEmployeeMonthlyExplainability {
  const sortedRows = [...rows].sort((left, right) =>
    `${left.date}-${left.record_id}`.localeCompare(`${right.date}-${right.record_id}`)
  );
  const lateRows = sortedRows.filter((row) => row.derived_flags.includes("late_entry"));
  const lateDeduction: AttendanceLateDeductionExplanation = {
    late_rule_label: "3 Late Flags = 1 Deduction",
    late_cutoff_time: "10:11",
    total_late_flags: lateRows.length,
    late_source_dates: lateRows.map((row) => row.date),
    late_source_record_ids: lateRows.map((row) => row.record_id),
    deductions_before_comp_off: roundNumber(metrics.late_penalty_deductions),
    comp_off_adjusted_against_late_days: roundNumber(
      metrics.comp_off_adjusted_against_late_days
    ),
    deductions_after_comp_off: roundNumber(metrics.late_penalty_after_comp_off),
    formula_text: `${lateRows.length} late flags ÷ 3 = ${formatMetricNumber(
      metrics.late_penalty_deductions
    )} deductions`,
  };

  const compOffSourceRows = sortedRows.filter((row) => row.comp_off_earned > 0);
  const openingBalanceUsed = roundNumber(
    Math.max(
      metrics.comp_off_adjusted_against_absent_days +
        metrics.comp_off_adjusted_against_late_days -
        compOffSourceRows.reduce((sum, row) => sum + row.comp_off_earned, 0),
      0
    )
  );

  const sourceBalances: Array<{
    source_kind: string;
    source_record_id: string;
    source_date: string;
    source_day_label: string;
    source_attendance_result: string;
    source_working_hours: string;
    source_reason: string;
    earned_value: number;
    remaining_value: number;
  }> = [];

  if (openingBalanceUsed > 0) {
    sourceBalances.push({
      source_kind: "opening_balance",
      source_record_id: `opening-balance-${employeeId}-${month}`,
      source_date: "",
      source_day_label: "",
      source_attendance_result: "Opening Balance",
      source_working_hours: "",
      source_reason: "Comp off balance carried into this month.",
      earned_value: openingBalanceUsed,
      remaining_value: openingBalanceUsed,
    });
  }

  compOffSourceRows.forEach((row) => {
    sourceBalances.push({
      source_kind: "worked_non_working_day",
      source_record_id: row.record_id,
      source_date: row.date,
      source_day_label: row.day_label,
      source_attendance_result: row.attendance_classification,
      source_working_hours: row.working_hours,
      source_reason:
        row.rule_explanation ||
        "Employee worked on Sunday or holiday and became eligible for comp off.",
      earned_value: roundNumber(row.comp_off_earned),
      remaining_value: roundNumber(row.comp_off_earned),
    });
  });

  const compOffUsageTrail: AttendanceCompOffUsageTrailItem[] = [];
  const absentTargets = sortedRows
    .filter((row) => row.comp_off_adjusted > 0)
    .map((row) => ({
      row,
      adjustment_value: roundNumber(row.comp_off_adjusted),
      adjustment_kind: "absent_offset",
      adjustment_reason: "Absent Day Offset",
      payroll_impact: "Final payable increased by 1.0 day",
    }));
  const lateTargets = sortedRows
    .filter((row) => row.late_deduction_adjusted > 0)
    .map((row) => ({
      row,
      adjustment_value: roundNumber(row.late_deduction_adjusted),
      adjustment_kind: "late_offset",
      adjustment_reason: "Late Deduction Offset",
      payroll_impact: "Late deduction reduced by 1.0 day",
    }));

  [...absentTargets, ...lateTargets].forEach((target) => {
    let remaining = target.adjustment_value;
    for (const sourceBalance of sourceBalances) {
      if (remaining <= 0) {
        break;
      }
      if (sourceBalance.remaining_value <= 0) {
        continue;
      }
      const allocation = roundNumber(
        Math.min(sourceBalance.remaining_value, remaining)
      );
      sourceBalance.remaining_value = roundNumber(
        sourceBalance.remaining_value - allocation
      );
      remaining = roundNumber(remaining - allocation);
      compOffUsageTrail.push({
        source_kind: sourceBalance.source_kind,
        source_record_id: sourceBalance.source_record_id,
        source_date: sourceBalance.source_date,
        source_day_label: sourceBalance.source_day_label,
        source_attendance_result: sourceBalance.source_attendance_result,
        source_working_hours: sourceBalance.source_working_hours,
        source_reason: sourceBalance.source_reason,
        earned_value: sourceBalance.earned_value,
        adjusted_record_id: target.row.record_id,
        adjusted_date: target.row.date,
        adjusted_day_label: target.row.day_label,
        adjusted_attendance_result: target.row.attendance_classification,
        adjusted_working_hours: target.row.working_hours,
        adjustment_value: allocation,
        adjustment_kind: target.adjustment_kind,
        adjustment_reason: target.adjustment_reason,
        payroll_impact: target.payroll_impact,
      });
    }
  });

  const compOffLedger: AttendanceCompOffLedgerItem[] = sourceBalances.map((sourceBalance) => ({
    source_kind: sourceBalance.source_kind,
    source_record_id: sourceBalance.source_record_id,
    source_date: sourceBalance.source_date,
    source_day_label: sourceBalance.source_day_label,
    source_attendance_result: sourceBalance.source_attendance_result,
    source_working_hours: sourceBalance.source_working_hours,
    source_reason: sourceBalance.source_reason,
    earned_value: sourceBalance.earned_value,
    used_value: roundNumber(sourceBalance.earned_value - sourceBalance.remaining_value),
    balance_value: roundNumber(Math.max(sourceBalance.remaining_value, 0)),
  }));

  const calculationBreakdown: AttendanceCalculationBreakdown = {
    calendar_days: new Set(rows.map((row) => row.date).filter(Boolean)).size,
    present_days: metrics.present_count,
    half_days: metrics.half_day_count,
    absent_days: metrics.absent_count,
    paid_week_off_days: metrics.paid_week_off_count,
    unpaid_week_off_days: metrics.unpaid_week_off_count,
    paid_holiday_days: metrics.paid_holiday_count,
    unpaid_holiday_days: metrics.unpaid_holiday_count,
    pending_review_days: metrics.pending_review_count,
    half_day_deduction_days: roundNumber(metrics.half_day_count * 0.5),
    gross_payable_days: roundNumber(metrics.gross_payable_days),
    late_penalty_before_comp_off: roundNumber(metrics.late_penalty_deductions),
    late_penalty_after_comp_off: roundNumber(metrics.late_penalty_after_comp_off),
    comp_off_adjusted_against_absent_days: roundNumber(
      metrics.comp_off_adjusted_against_absent_days
    ),
    comp_off_adjusted_against_late_days: roundNumber(
      metrics.comp_off_adjusted_against_late_days
    ),
    final_payable_days: roundNumber(metrics.payable_days),
  };

  return {
    month,
    calendar_days: calculationBreakdown.calendar_days,
    comp_off_ledger: compOffLedger,
    comp_off_usage_trail: compOffUsageTrail,
    late_deduction: lateDeduction,
    calculation_breakdown: calculationBreakdown,
  };
}

function isSunday(dateValue: string) {
  if (!dateValue) {
    return false;
  }
  return new Date(`${dateValue}T00:00:00`).getDay() === 0;
}

function isHolidayRow(row: AttendanceProcessedRow) {
  return row.final_status_code === "paid_holiday" || row.final_status_code === "unpaid_holiday";
}

function isWeekOffRow(row: AttendanceProcessedRow) {
  return row.final_status_code === "paid_wo" || row.final_status_code === "unpaid_wo";
}

function isIrregularPunchRow(row: AttendanceProcessedRow) {
  return (
    row.final_status_code === "irregular_review" ||
    row.derived_flags.includes("missing_in_time") ||
    row.derived_flags.includes("missing_out_time")
  );
}

function hasEarlyLoginFlag(row: AttendanceProcessedRow) {
  if (row.derived_flags.includes("early_login")) {
    return true;
  }
  if (!row.in_time) {
    return false;
  }
  const timeMatch = row.in_time.match(/(\d{2}):(\d{2})$/);
  if (!timeMatch) {
    return false;
  }
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return false;
  }
  return hours < 10;
}

function isPresentClassification(row: AttendanceProcessedRow) {
  return row.final_status_code === "present" || row.final_status_code === "present_late";
}

function isAbsentClassification(row: AttendanceProcessedRow) {
  return row.final_status_code === "absent";
}

function isHalfDayClassification(row: AttendanceProcessedRow) {
  return row.final_status_code === "half_day";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function formatMetricNumber(value: number) {
  const rounded = roundNumber(value);
  return rounded.toFixed(Number.isInteger(rounded) ? 0 : 2);
}
