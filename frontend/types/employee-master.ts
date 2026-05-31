export type EmployeeStatus = "Active" | "Inactive";
export type SalaryMode = "Cash" | "Bank";
export type UnitName = "Bath & Sanitary" | "Marble Centre" | "Tiles Mart";

export type EmployeeMasterRecord = {
  employee_code: string;
  employee_name: string;
  department: string;
  designation: string;
  salary_mode: SalaryMode;
  unit: UnitName;
  doj: string;
  gross_monthly_salary: number;
  opening_leave_balance: number;
  leave_accrued: number;
  leave_availed: number;
  closing_leave_balance: number;
  comp_off_balance: number;
  status: EmployeeStatus;
};

export type SalaryComponent = {
  id: string;
  component_name: string;
  percentage: number;
  active: boolean;
};

export type {
  AttendanceMatchResult,
  AttendanceMatchStatus,
  AttendanceNameAlias,
  AttendanceVerificationDecision,
  AttendanceVerificationRegistry,
  AttendanceVerificationStore,
  EmployeeVerificationAudit,
  EmployeeVerificationRecord,
  VerificationDisplayCategory,
} from "@/types/attendance-verification";

export type EmployeeAttendanceSummary = {
  total_days: number;
  present_days: number;
  weekly_offs: number;
  holidays: number;
  paid_leave: number;
  lop_days: number;
  payable_days: number;
  ot_hours: number;
  late_marks: number;
};
