from dataclasses import dataclass


@dataclass
class EmployeeLeaveBalanceModel:
    opening_leave_balance: float
    leave_accrued: float
    leave_availed: float
    closing_leave_balance: float
    comp_off_balance: float


@dataclass
class EmployeeMasterModel:
    employee_code: str
    employee_name: str
    department: str
    designation: str
    salary_mode: str
    unit: str
    doj: str
    gross_monthly_salary: float
    leave_balance: EmployeeLeaveBalanceModel
    status: str
    created_at: str
    updated_at: str


@dataclass
class SalaryComponentModel:
    id: str
    component_name: str
    percentage: float
    active: bool
    sort_order: int
    created_at: str
    updated_at: str


@dataclass
class AttendanceVerificationDecisionModel:
    id: str
    employee_code: str
    attendance_name: str
    master_name: str
    action: str
    status: str
    remarks: str
    actor: str
    acted_at: str
    created_at: str


@dataclass
class AttendanceNameAliasModel:
    id: str
    employee_code: str
    attendance_name: str
    master_name: str
    normalized_attendance_name: str
    created_at: str
    created_by: str

