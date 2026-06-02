import type { AttendanceProcessedRow } from "@/types/upload";
import type { EmployeeAttendanceSummary } from "@/types/employee-master";

function statusIncludes(status: string, token: string): boolean {
  return status.toLowerCase().includes(token.toLowerCase());
}

function parseWorkingHours(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyStatus(status: string): keyof Omit<EmployeeAttendanceSummary, "payable_days" | "ot_hours" | "late_marks" | "total_days"> | "other" {
  const normalized = status.toLowerCase();
  if (statusIncludes(normalized, "week off") || normalized === "wo" || statusIncludes(normalized, "weekly off")) {
    return "weekly_offs";
  }
  if (statusIncludes(normalized, "holiday")) {
    return "holidays";
  }
  if (statusIncludes(normalized, "leave") && !statusIncludes(normalized, "unpaid")) {
    return "paid_leave";
  }
  if (statusIncludes(normalized, "absent") || statusIncludes(normalized, "lop") || statusIncludes(normalized, "unpaid")) {
    return "lop_days";
  }
  if (statusIncludes(normalized, "present") || statusIncludes(normalized, "half day")) {
    return "present_days";
  }
  return "other";
}

export function buildEmployeeAttendanceSummary(
  rows: AttendanceProcessedRow[]
): EmployeeAttendanceSummary {
  const uniqueDates = new Set(rows.map((row) => row.date).filter(Boolean));
  const summary: EmployeeAttendanceSummary = {
    total_days: uniqueDates.size,
    present_days: 0,
    weekly_offs: 0,
    holidays: 0,
    paid_leave: 0,
    lop_days: 0,
    payable_days: 0,
    ot_hours: 0,
    late_marks: 0,
    early_login_marks: 0,
  };

  rows.forEach((row) => {
    const status = row.final_status_code || row.attendance_classification || row.raw_status;
    const bucket = classifyStatus(status);
    if (bucket === "present_days") {
      summary.present_days += 1;
    } else if (bucket === "weekly_offs") {
      summary.weekly_offs += 1;
    } else if (bucket === "holidays") {
      summary.holidays += 1;
    } else if (bucket === "paid_leave") {
      summary.paid_leave += 1;
    } else if (bucket === "lop_days") {
      summary.lop_days += 1;
    }

    summary.payable_days += Number.isFinite(row.payable_day_impact)
      ? row.payable_day_impact
      : 0;

    const hours = parseWorkingHours(row.working_hours);
    if (hours > 8) {
      summary.ot_hours += hours - 8;
    }

    const lateFlags = [...row.anomaly_flags, ...row.derived_flags].map((flag) =>
      flag.toLowerCase()
    );
    if (lateFlags.some((flag) => flag.includes("late"))) {
      summary.late_marks += 1;
    }
    if (row.derived_flags.some((flag) => flag.toLowerCase() === "early_login")) {
      summary.early_login_marks += 1;
    }
  });

  summary.payable_days = Number(summary.payable_days.toFixed(2));
  summary.ot_hours = Number(summary.ot_hours.toFixed(2));

  return summary;
}

export function filterAttendanceRowsByEmployeeCode(
  employeeCode: string,
  attendanceRows: AttendanceProcessedRow[]
): AttendanceProcessedRow[] {
  const normalizedCode = employeeCode.trim().toLowerCase();
  return attendanceRows.filter(
    (row) => row.employee_code.trim().toLowerCase() === normalizedCode
  );
}
