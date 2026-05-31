import { validateEmployeeAttendance } from "@/lib/attendance-employee-validation";
import {
  buildEmployeeAttendanceSummary,
  filterAttendanceRowsByEmployeeCode,
} from "@/lib/attendance-employee-summary";
import { loadAttendanceVerificationStore } from "@/lib/attendance-verification-storage";
import type { EmployeeMasterRecord } from "@/types/employee-master";
import type {
  AttendanceMatchResult,
  AttendanceMatchStatus,
  AttendanceVerificationRegistry,
  AttendanceVerificationStore,
  EmployeeVerificationRecord,
  PayrollBlockReason,
  VerificationDisplayCategory,
  VerificationDrillDownFilter,
  WarningReasonKind,
} from "@/types/attendance-verification";
import type { AttendanceProcessedRow } from "@/types/upload";

const DISPLAY_CATEGORY_LABELS: Record<VerificationDisplayCategory, string> = {
  verified: "Verified",
  warning: "Warning",
  pending_review: "Pending Review",
  blocked: "Blocked",
};

import { BLOCK_REASON_LABELS } from "@/lib/attendance-verification-registry-constants";

export { BLOCK_REASON_LABELS };

export function toDisplayCategory(status: AttendanceMatchStatus): VerificationDisplayCategory {
  switch (status) {
    case "verified":
    case "manually_approved":
      return "verified";
    case "warning":
      return "warning";
    case "pending_review":
      return "pending_review";
    case "rejected":
    case "missing":
      return "blocked";
    default:
      return "blocked";
  }
}

export function resolveBlockReason(
  status: AttendanceMatchStatus,
  match: AttendanceMatchResult
): PayrollBlockReason {
  if (match.payrollEligible) {
    return "verification_failed";
  }
  if (status === "missing") {
    return "attendance_missing";
  }
  if (status === "rejected") {
    return "rejected_match";
  }
  if (status === "pending_review") {
    return "pending_review";
  }
  return "verification_failed";
}

export function resolveWarningReasonKind(match: AttendanceMatchResult): WarningReasonKind {
  if (match.appliedAlias) {
    return "alias_match";
  }
  const reason = match.reason.toLowerCase();
  if (reason.includes("surname missing") || reason.includes("first name matches")) {
    return "first_name_only";
  }
  if (reason.includes("minor spelling")) {
    return "minor_spelling";
  }
  if (reason.includes("partial name")) {
    return "partial_match";
  }
  if (reason.includes("alias")) {
    return "alias_match";
  }
  return "other_warning";
}

const WARNING_REASON_LABELS: Record<WarningReasonKind, string> = {
  alias_match: "Alias match",
  first_name_only: "First name match only",
  minor_spelling: "Minor spelling variation",
  partial_match: "Partial name match",
  other_warning: "Warning",
};

function buildRecord(
  employee: EmployeeMasterRecord,
  attendanceRows: AttendanceProcessedRow[],
  store: AttendanceVerificationStore
): EmployeeVerificationRecord {
  const match = validateEmployeeAttendance(employee, attendanceRows, store);
  const displayCategory = toDisplayCategory(match.status);
  const rows = filterAttendanceRowsByEmployeeCode(employee.employee_code, attendanceRows);
  const attendanceSummary =
    match.showAttendanceDetails && rows.length > 0 ? buildEmployeeAttendanceSummary(rows) : null;

  const warningReasonKind =
    displayCategory === "warning" ? resolveWarningReasonKind(match) : null;
  const warningReasonLabel = warningReasonKind ? WARNING_REASON_LABELS[warningReasonKind] : null;

  const blockReason = !match.payrollEligible ? resolveBlockReason(match.status, match) : null;
  const blockReasonLabel = blockReason ? BLOCK_REASON_LABELS[blockReason] : null;

  const displayCategoryLabel = DISPLAY_CATEGORY_LABELS[displayCategory];

  return {
    employeeCode: employee.employee_code,
    employeeName: employee.employee_name,
    employee,
    match,
    displayCategory,
    displayCategoryLabel,
    warningReasonKind,
    warningReasonLabel,
    blockReason,
    blockReasonLabel,
    payrollEligible: match.payrollEligible,
    attendanceSummary,
    audit: {
      verificationState: displayCategoryLabel,
      verificationReason: match.reason,
      payrollEligible: match.payrollEligible ? "Yes" : "No",
    },
  };
}

export function buildAttendanceVerificationRegistry(
  employees: EmployeeMasterRecord[],
  attendanceRows: AttendanceProcessedRow[],
  store: AttendanceVerificationStore = loadAttendanceVerificationStore()
): AttendanceVerificationRegistry {
  const items = employees.map((employee) => buildRecord(employee, attendanceRows, store));

  const byCategory: Record<VerificationDisplayCategory, EmployeeVerificationRecord[]> = {
    verified: [],
    warning: [],
    pending_review: [],
    blocked: [],
  };

  items.forEach((item) => {
    byCategory[item.displayCategory].push(item);
  });

  const payrollReady = items.filter((item) => item.payrollEligible);
  const payrollBlocked = items.filter((item) => !item.payrollEligible);

  const verified = byCategory.verified.length;
  const warning = byCategory.warning.length;
  const pendingReview = byCategory.pending_review.length;
  const blocked = byCategory.blocked.length;
  const categorySum = verified + warning + pendingReview + blocked;
  const totalConsidered = items.length;

  return {
    items,
    byCategory,
    payrollReady,
    payrollBlocked,
    summary: {
      totalConsidered,
      verified,
      warning,
      pendingReview,
      blocked,
      payrollReady: payrollReady.length,
      payrollBlocked: payrollBlocked.length,
      categorySum,
      categorySumValid: categorySum === totalConsidered,
    },
  };
}

export function getRegistryRecordForEmployee(
  registry: AttendanceVerificationRegistry,
  employeeCode: string
): EmployeeVerificationRecord | null {
  return registry.items.find((item) => item.employeeCode === employeeCode) ?? null;
}

export function filterRegistryForDrillDown(
  registry: AttendanceVerificationRegistry,
  filter: VerificationDrillDownFilter
): EmployeeVerificationRecord[] {
  switch (filter) {
    case "total":
      return registry.items;
    case "verified":
      return registry.byCategory.verified;
    case "warning":
      return registry.byCategory.warning;
    case "pending_review":
      return registry.byCategory.pending_review;
    case "payroll_ready":
      return registry.payrollReady;
    case "payroll_blocked":
      return registry.payrollBlocked;
    default:
      return registry.items;
  }
}

export function displayCategoryBadgeClassName(category: VerificationDisplayCategory): string {
  switch (category) {
    case "verified":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "pending_review":
      return "border-orange-200 bg-orange-50 text-orange-900";
    case "blocked":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

/** @deprecated Use displayCategoryBadgeClassName */
export { displayCategoryBadgeClassName as attendanceDisplayBadgeClassName };
