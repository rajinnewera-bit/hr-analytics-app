import type { AttendanceProcessedRow } from "@/types/upload";
import type { EmployeeMasterRecord } from "@/types/employee-master";
import type {
  AttendanceMatchResult,
  AttendanceMatchStatus,
  AttendanceVerificationStore,
} from "@/types/attendance-verification";
import {
  buildAttendanceVerificationRegistry,
  displayCategoryBadgeClassName,
  toDisplayCategory,
} from "@/lib/attendance-verification-registry";
import {
  findAliasForEmployeeAttendance,
  getActiveDecision,
  getDecisionHistory,
  loadAttendanceVerificationStore,
} from "@/lib/attendance-verification-storage";

const TOKEN_SIMILARITY_THRESHOLD = 0.72;
const PARTIAL_NAME_SIMILARITY_THRESHOLD = 0.78;

export function normalizeEmployeeName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function nameSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeEmployeeName(left);
  const normalizedRight = normalizeEmployeeName(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return maxLength === 0 ? 0 : 1 - distance / maxLength;
}

function nameTokens(name: string): string[] {
  return normalizeEmployeeName(name).split(" ").filter(Boolean);
}

function tokensMatchMinorSpelling(left: string, right: string): boolean {
  return nameSimilarity(left, right) >= TOKEN_SIMILARITY_THRESHOLD;
}

function statusBadgeLabel(status: AttendanceMatchStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "warning":
      return "Warning";
    case "pending_review":
      return "Pending Review";
    case "manually_approved":
      return "Manually Approved";
    case "rejected":
      return "Rejected";
    default:
      return "Attendance Missing";
  }
}

function payrollEligibleForStatus(status: AttendanceMatchStatus): boolean {
  return (
    status === "verified" ||
    status === "warning" ||
    status === "manually_approved"
  );
}

function buildResult(
  status: AttendanceMatchStatus,
  message: string,
  showAttendanceDetails: boolean,
  similarity: number,
  attendanceEmployeeName: string,
  employeeIdMatched: boolean,
  store: AttendanceVerificationStore,
  employeeCode: string,
  masterName: string,
  appliedAlias: AttendanceMatchResult["appliedAlias"]
): AttendanceMatchResult {
  const approvalHistory = getDecisionHistory(store, employeeCode);
  const activeDecision = attendanceEmployeeName
    ? getActiveDecision(store, employeeCode, attendanceEmployeeName)
    : null;

  let resolvedStatus = status;
  let resolvedMessage = message;

  if (activeDecision?.status === "manually_approved") {
    resolvedStatus = "manually_approved";
    resolvedMessage =
      activeDecision.remarks ||
      `Manually approved by ${activeDecision.actor} on ${new Date(activeDecision.acted_at).toLocaleString()}.`;
  } else if (activeDecision?.status === "rejected") {
    resolvedStatus = "rejected";
    resolvedMessage =
      activeDecision.remarks ||
      `Rejected by ${activeDecision.actor} on ${new Date(activeDecision.acted_at).toLocaleString()}.`;
  }

  const canManuallyApprove =
    employeeIdMatched && resolvedStatus === "pending_review";

  return {
    status: resolvedStatus,
    badgeLabel: statusBadgeLabel(resolvedStatus),
    message: resolvedMessage,
    reason: resolvedMessage,
    payrollEligible: payrollEligibleForStatus(resolvedStatus),
    showAttendanceDetails,
    similarity,
    attendanceEmployeeName,
    employeeIdMatched,
    canManuallyApprove,
    appliedAlias,
    activeDecision,
    approvalHistory,
  };
}

function resolveAttendanceName(rows: AttendanceProcessedRow[]): string {
  const names = rows.map((row) => row.employee_name.trim()).filter(Boolean);
  if (names.length === 0) {
    return "";
  }

  const frequency = new Map<string, number>();
  names.forEach((name) => {
    frequency.set(name, (frequency.get(name) ?? 0) + 1);
  });

  return [...frequency.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function compareNamesAfterIdMatch(
  masterName: string,
  attendanceName: string
): Pick<
  AttendanceMatchResult,
  "status" | "message" | "similarity"
> {
  const masterNorm = normalizeEmployeeName(masterName);
  const attendanceNorm = normalizeEmployeeName(attendanceName);
  const similarity = nameSimilarity(masterName, attendanceName);

  if (!masterNorm || !attendanceNorm) {
    return {
      status: "pending_review",
      message:
        "Attendance name is missing or invalid. HR review required before payroll release.",
      similarity,
    };
  }

  if (masterNorm === attendanceNorm) {
    return {
      status: "verified",
      message: "Exact full name match between Employee Master and attendance.",
      similarity: 1,
    };
  }

  const masterTokens = nameTokens(masterName);
  const attendanceTokens = nameTokens(attendanceName);
  const masterFirst = masterTokens[0] ?? "";
  const attendanceFirst = attendanceTokens[0] ?? "";
  const masterLast = masterTokens[masterTokens.length - 1] ?? "";
  const attendanceLast = attendanceTokens[attendanceTokens.length - 1] ?? "";

  if (
    attendanceTokens.length === 1 &&
    masterTokens.length >= 2 &&
    tokensMatchMinorSpelling(attendanceFirst, masterFirst)
  ) {
    return {
      status: "warning",
      message: "First name matches; surname missing in attendance.",
      similarity,
    };
  }

  if (attendanceTokens.length < masterTokens.length) {
    const prefixMatch = attendanceTokens.every((token, index) =>
      tokensMatchMinorSpelling(token, masterTokens[index] ?? "")
    );
    if (prefixMatch) {
      return {
        status: "warning",
        message: "Partial name match; additional name parts present in Employee Master.",
        similarity,
      };
    }
  }

  if (masterTokens.length < attendanceTokens.length) {
    const prefixMatch = masterTokens.every((token, index) =>
      tokensMatchMinorSpelling(token, attendanceTokens[index] ?? "")
    );
    if (prefixMatch) {
      return {
        status: "warning",
        message: "Partial name match; additional name parts present in attendance.",
        similarity,
      };
    }
  }

  if (masterTokens.length === attendanceTokens.length && masterTokens.length >= 2) {
    const firstNamesMatch = tokensMatchMinorSpelling(masterFirst, attendanceFirst);
    const lastNamesMatch = tokensMatchMinorSpelling(masterLast, attendanceLast);

    if (firstNamesMatch && lastNamesMatch) {
      const allTokensMinorVariant = masterTokens.every((token, index) =>
        tokensMatchMinorSpelling(token, attendanceTokens[index] ?? "")
      );
      if (allTokensMinorVariant) {
        return {
          status: "warning",
          message:
            "Minor spelling variation detected between Employee Master and attendance names.",
          similarity,
        };
      }
    }

    if (firstNamesMatch && !lastNamesMatch) {
      return {
        status: "pending_review",
        message:
          "Different surname detected between Employee Master and attendance. HR review required.",
        similarity,
      };
    }
  }

  if (similarity >= PARTIAL_NAME_SIMILARITY_THRESHOLD) {
    return {
      status: "warning",
      message: "Partial name match with minor differences between master and attendance.",
      similarity,
    };
  }

  if (
    masterTokens.length >= 2 &&
    attendanceTokens.length >= 2 &&
    tokensMatchMinorSpelling(masterFirst, attendanceFirst) &&
    !tokensMatchMinorSpelling(masterLast, attendanceLast)
  ) {
    return {
      status: "pending_review",
      message:
        "Different surname detected between Employee Master and attendance. HR review required.",
      similarity,
    };
  }

  if (tokensMatchMinorSpelling(masterFirst, attendanceFirst)) {
    return {
      status: "warning",
      message: "Partial name match between Employee Master and attendance.",
      similarity,
    };
  }

  return {
    status: "pending_review",
    message:
      "Attendance name does not match Employee Master. HR review required before payroll release.",
    similarity,
  };
}

export function validateEmployeeAttendance(
  employee: Pick<EmployeeMasterRecord, "employee_code" | "employee_name">,
  attendanceRows: AttendanceProcessedRow[],
  store: AttendanceVerificationStore = loadAttendanceVerificationStore()
): AttendanceMatchResult {
  const employeeCode = employee.employee_code.trim();
  const employeeCodeKey = employeeCode.toLowerCase();

  if (!employeeCode) {
    return buildResult(
      "missing",
      "Employee ID is required for attendance validation.",
      false,
      0,
      "",
      false,
      store,
      employeeCode,
      employee.employee_name,
      null
    );
  }

  const matchedRows = attendanceRows.filter(
    (row) => row.employee_code.trim().toLowerCase() === employeeCodeKey
  );
  const employeeIdMatched = matchedRows.length > 0;

  if (!employeeIdMatched) {
    return buildResult(
      "missing",
      "No attendance record found for this Employee ID. Payroll blocked until attendance is available.",
      false,
      0,
      "",
      false,
      store,
      employeeCode,
      employee.employee_name,
      null
    );
  }

  const attendanceName = resolveAttendanceName(matchedRows);
  const masterName = employee.employee_name.trim();
  const appliedAlias = findAliasForEmployeeAttendance(store, employeeCode, attendanceName);

  if (appliedAlias) {
    return buildResult(
      "verified",
      `Recognized via approved alias mapping "${appliedAlias.attendance_name}" → "${appliedAlias.master_name}".`,
      true,
      1,
      attendanceName,
      true,
      store,
      employeeCode,
      masterName,
      appliedAlias
    );
  }

  const nameResult = compareNamesAfterIdMatch(masterName, attendanceName);

  return buildResult(
    nameResult.status,
    nameResult.message,
    true,
    nameResult.similarity,
    attendanceName,
    true,
    store,
    employeeCode,
    masterName,
    null
  );
}

export type AttendanceVerificationSummary = {
  totalEmployees: number;
  verified: number;
  warning: number;
  pendingReview: number;
  manuallyApproved: number;
  rejected: number;
  missing: number;
  payrollReady: number;
  payrollBlocked: number;
};

export function summarizeAttendanceVerification(
  employees: EmployeeMasterRecord[],
  attendanceRows: AttendanceProcessedRow[],
  store: AttendanceVerificationStore = loadAttendanceVerificationStore()
): AttendanceVerificationSummary {
  const registry = buildAttendanceVerificationRegistry(employees, attendanceRows, store);
  const { summary } = registry;
  return {
    totalEmployees: summary.totalConsidered,
    verified: summary.verified,
    warning: summary.warning,
    pendingReview: summary.pendingReview,
    manuallyApproved: 0,
    rejected: 0,
    missing: 0,
    payrollReady: summary.payrollReady,
    payrollBlocked: summary.payrollBlocked,
  };
}

export function attendanceBadgeClassName(status: AttendanceMatchStatus): string {
  return displayCategoryBadgeClassName(toDisplayCategory(status));
}
