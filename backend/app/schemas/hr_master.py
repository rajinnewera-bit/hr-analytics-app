from typing import Literal

from pydantic import BaseModel, Field


EmployeeStatus = Literal["Active", "Inactive"]
SalaryMode = Literal["Cash", "Bank"]
AttendanceVerificationAction = Literal["approved", "rejected", "alias_created"]
AttendanceVerificationDecisionStatus = Literal["manually_approved", "rejected"]


class SalaryComponentRecord(BaseModel):
    id: str
    component_name: str
    percentage: float
    active: bool


class EmployeeMasterRecord(BaseModel):
    employee_code: str
    employee_name: str
    department: str = ""
    designation: str = ""
    salary_mode: SalaryMode = "Bank"
    unit: str = "Bath & Sanitary"
    doj: str = ""
    gross_monthly_salary: float = 0.0
    opening_leave_balance: float = 0.0
    leave_accrued: float = 0.0
    leave_availed: float = 0.0
    closing_leave_balance: float = 0.0
    comp_off_balance: float = 0.0
    status: EmployeeStatus = "Active"


class EmployeeBulkUpsertRequest(BaseModel):
    employees: list[EmployeeMasterRecord] = Field(default_factory=list)


class SalaryComponentsUpdateRequest(BaseModel):
    components: list[SalaryComponentRecord] = Field(default_factory=list)


class AttendanceNameAliasRecord(BaseModel):
    id: str
    employee_code: str
    attendance_name: str
    master_name: str
    normalized_attendance_name: str
    created_at: str
    created_by: str


class AttendanceVerificationDecisionRecord(BaseModel):
    id: str
    employee_code: str
    attendance_name: str
    master_name: str
    action: AttendanceVerificationAction
    status: AttendanceVerificationDecisionStatus
    remarks: str
    actor: str
    acted_at: str


class AttendanceVerificationStoreResponse(BaseModel):
    version: int = 1
    aliases: list[AttendanceNameAliasRecord] = Field(default_factory=list)
    decisions: list[AttendanceVerificationDecisionRecord] = Field(default_factory=list)


class AttendanceVerificationApproveRequest(BaseModel):
    employee_code: str
    attendance_name: str
    master_name: str
    remarks: str = ""
    actor: str = "HR Operator"


class AttendanceVerificationRejectRequest(BaseModel):
    employee_code: str
    attendance_name: str
    master_name: str
    remarks: str = ""
    actor: str = "HR Operator"


class AttendanceVerificationAliasRequest(BaseModel):
    employee_code: str
    attendance_name: str
    master_name: str
    remarks: str = ""
    actor: str = "HR Operator"

