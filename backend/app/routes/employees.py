from fastapi import APIRouter

from app.schemas.hr_master import (
    EmployeeBulkUpsertRequest,
    EmployeeMasterRecord,
    SalaryComponentRecord,
    SalaryComponentsUpdateRequest,
)
from app.services.employee_master_service import (
    bulk_upsert_employees,
    clear_employees,
    create_employee,
    delete_employee,
    get_employee,
    list_employees,
    list_salary_components,
    save_salary_components,
    update_employee,
)

router = APIRouter()


@router.get("/employees", response_model=list[EmployeeMasterRecord])
async def get_employees() -> list[EmployeeMasterRecord]:
    return list_employees()


@router.post("/employees", response_model=EmployeeMasterRecord)
async def create_employee_record(payload: EmployeeMasterRecord) -> EmployeeMasterRecord:
    return create_employee(payload)


@router.post("/employees/bulk-upsert", response_model=list[EmployeeMasterRecord])
async def bulk_upsert_employee_records(
    payload: EmployeeBulkUpsertRequest,
) -> list[EmployeeMasterRecord]:
    return bulk_upsert_employees(payload.employees)


@router.get("/employees/{employee_code}", response_model=EmployeeMasterRecord)
async def get_employee_record(employee_code: str) -> EmployeeMasterRecord:
    return get_employee(employee_code)


@router.put("/employees/{employee_code}", response_model=EmployeeMasterRecord)
async def update_employee_record(
    employee_code: str,
    payload: EmployeeMasterRecord,
) -> EmployeeMasterRecord:
    return update_employee(employee_code, payload)


@router.delete("/employees/{employee_code}")
async def delete_employee_record(employee_code: str) -> dict[str, bool]:
    delete_employee(employee_code)
    return {"ok": True}


@router.delete("/employees")
async def clear_all_employees() -> dict[str, bool]:
    clear_employees()
    return {"ok": True}


@router.get("/salary-components", response_model=list[SalaryComponentRecord])
async def get_salary_components() -> list[SalaryComponentRecord]:
    return list_salary_components()


@router.put("/salary-components", response_model=list[SalaryComponentRecord])
async def update_salary_components(
    payload: SalaryComponentsUpdateRequest,
) -> list[SalaryComponentRecord]:
    return save_salary_components(payload.components)

