import type { PayrollBlockReason, VerificationDrillDownFilter } from "@/types/attendance-verification";

export const BLOCK_REASON_LABELS: Record<PayrollBlockReason, string> = {
  attendance_missing: "Attendance Missing",
  pending_review: "Pending Review",
  rejected_match: "Rejected Match",
  verification_failed: "Verification Failed",
};

export const DRILL_DOWN_TITLES: Record<VerificationDrillDownFilter, string> = {
  total: "All Employees",
  verified: "Verified Employees",
  warning: "Warning Matches",
  pending_review: "Pending Review",
  payroll_ready: "Payroll Ready Employees",
  payroll_blocked: "Payroll Blocked Employees",
};
