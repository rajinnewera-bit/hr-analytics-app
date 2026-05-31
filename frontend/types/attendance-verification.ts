import type { EmployeeAttendanceSummary, EmployeeMasterRecord } from "@/types/employee-master";

export type AttendanceMatchStatus =
  | "verified"
  | "warning"
  | "pending_review"
  | "manually_approved"
  | "rejected"
  | "missing";

export type AttendanceVerificationAction = "approved" | "rejected" | "alias_created";

export type AttendanceNameAlias = {
  id: string;
  employee_code: string;
  attendance_name: string;
  master_name: string;
  normalized_attendance_name: string;
  created_at: string;
  created_by: string;
};

export type AttendanceVerificationDecision = {
  id: string;
  employee_code: string;
  attendance_name: string;
  master_name: string;
  action: AttendanceVerificationAction;
  status: "manually_approved" | "rejected";
  remarks: string;
  actor: string;
  acted_at: string;
};

export type AttendanceVerificationStore = {
  version: 1;
  aliases: AttendanceNameAlias[];
  decisions: AttendanceVerificationDecision[];
};

export type AttendanceMatchResult = {
  status: AttendanceMatchStatus;
  badgeLabel: string;
  message: string;
  reason: string;
  payrollEligible: boolean;
  showAttendanceDetails: boolean;
  similarity: number;
  attendanceEmployeeName: string;
  employeeIdMatched: boolean;
  canManuallyApprove: boolean;
  appliedAlias: AttendanceNameAlias | null;
  activeDecision: AttendanceVerificationDecision | null;
  approvalHistory: AttendanceVerificationDecision[];
};

/** Exactly one display category per employee for dashboard + cards. */
export type VerificationDisplayCategory = "verified" | "warning" | "pending_review" | "blocked";

export type PayrollBlockReason =
  | "attendance_missing"
  | "pending_review"
  | "rejected_match"
  | "verification_failed";

export type WarningReasonKind =
  | "alias_match"
  | "first_name_only"
  | "minor_spelling"
  | "partial_match"
  | "other_warning";

export type EmployeeVerificationAudit = {
  verificationState: string;
  verificationReason: string;
  payrollEligible: "Yes" | "No";
};

export type EmployeeVerificationRecord = {
  employeeCode: string;
  employeeName: string;
  employee: EmployeeMasterRecord;
  match: AttendanceMatchResult;
  displayCategory: VerificationDisplayCategory;
  displayCategoryLabel: string;
  warningReasonKind: WarningReasonKind | null;
  warningReasonLabel: string | null;
  blockReason: PayrollBlockReason | null;
  blockReasonLabel: string | null;
  payrollEligible: boolean;
  attendanceSummary: EmployeeAttendanceSummary | null;
  audit: EmployeeVerificationAudit;
};

export type AttendanceVerificationRegistrySummary = {
  totalConsidered: number;
  verified: number;
  warning: number;
  pendingReview: number;
  blocked: number;
  payrollReady: number;
  payrollBlocked: number;
  categorySum: number;
  categorySumValid: boolean;
};

export type AttendanceVerificationRegistry = {
  items: EmployeeVerificationRecord[];
  byCategory: Record<VerificationDisplayCategory, EmployeeVerificationRecord[]>;
  payrollReady: EmployeeVerificationRecord[];
  payrollBlocked: EmployeeVerificationRecord[];
  summary: AttendanceVerificationRegistrySummary;
};

export type VerificationDrillDownFilter =
  | "total"
  | "verified"
  | "warning"
  | "pending_review"
  | "payroll_ready"
  | "payroll_blocked";
