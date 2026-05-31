from datetime import datetime, timezone
import sqlite3
from typing import Optional

from fastapi import HTTPException, status

from app.db import db_cursor
from app.schemas.hr_master import EmployeeMasterRecord, SalaryComponentRecord


DEFAULT_SALARY_COMPONENTS = [
    {"id": "basic", "component_name": "Basic", "percentage": 50.0, "active": True},
    {"id": "hra", "component_name": "HRA", "percentage": 20.0, "active": True},
    {
        "id": "conveyance_allowance",
        "component_name": "Conveyance Allowance",
        "percentage": 10.0,
        "active": True,
    },
    {
        "id": "medical_allowance",
        "component_name": "Medical Allowance",
        "percentage": 5.0,
        "active": True,
    },
    {
        "id": "special_allowance",
        "component_name": "Special Allowance",
        "percentage": 15.0,
        "active": True,
    },
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_employee(record: EmployeeMasterRecord) -> EmployeeMasterRecord:
    return EmployeeMasterRecord(
        employee_code=record.employee_code.strip(),
        employee_name=record.employee_name.strip(),
        department=record.department.strip(),
        designation=record.designation.strip(),
        salary_mode="Cash" if record.salary_mode == "Cash" else "Bank",
        unit=record.unit.strip() or "Bath & Sanitary",
        doj=record.doj.strip(),
        gross_monthly_salary=float(record.gross_monthly_salary or 0.0),
        opening_leave_balance=float(record.opening_leave_balance or 0.0),
        leave_accrued=float(record.leave_accrued or 0.0),
        leave_availed=float(record.leave_availed or 0.0),
        closing_leave_balance=float(record.closing_leave_balance or 0.0),
        comp_off_balance=float(record.comp_off_balance or 0.0),
        status="Inactive" if record.status == "Inactive" else "Active",
    )


def _row_to_employee(row: sqlite3.Row) -> EmployeeMasterRecord:
    return EmployeeMasterRecord(
        employee_code=row["employee_code"],
        employee_name=row["employee_name"],
        department=row["department"],
        designation=row["designation"],
        salary_mode="Cash" if row["salary_mode"] == "Cash" else "Bank",
        unit=row["unit"],
        doj=row["doj"],
        gross_monthly_salary=float(row["gross_monthly_salary"] or 0.0),
        opening_leave_balance=float(row["opening_leave_balance"] or 0.0),
        leave_accrued=float(row["leave_accrued"] or 0.0),
        leave_availed=float(row["leave_availed"] or 0.0),
        closing_leave_balance=float(row["closing_leave_balance"] or 0.0),
        comp_off_balance=float(row["comp_off_balance"] or 0.0),
        status="Inactive" if row["status"] == "Inactive" else "Active",
    )


def _row_to_salary_component(row: sqlite3.Row) -> SalaryComponentRecord:
    return SalaryComponentRecord(
        id=row["id"],
        component_name=row["component_name"],
        percentage=float(row["percentage"] or 0.0),
        active=bool(row["active"]),
    )


def list_employees() -> list[EmployeeMasterRecord]:
    with db_cursor() as connection:
        rows = connection.execute(
            """
            SELECT employee_code, employee_name, department, designation, salary_mode, unit, doj,
                   gross_monthly_salary, opening_leave_balance, leave_accrued, leave_availed,
                   closing_leave_balance, comp_off_balance, status
            FROM employees
            ORDER BY employee_code ASC
            """
        ).fetchall()
    return [_row_to_employee(row) for row in rows]


def get_employee(employee_code: str) -> EmployeeMasterRecord:
    with db_cursor() as connection:
        row = connection.execute(
            """
            SELECT employee_code, employee_name, department, designation, salary_mode, unit, doj,
                   gross_monthly_salary, opening_leave_balance, leave_accrued, leave_availed,
                   closing_leave_balance, comp_off_balance, status
            FROM employees
            WHERE lower(employee_code) = lower(?)
            """,
            (employee_code.strip(),),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
    return _row_to_employee(row)


def create_employee(record: EmployeeMasterRecord) -> EmployeeMasterRecord:
    normalized = _normalize_employee(record)
    if not normalized.employee_code or not normalized.employee_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee code and employee name are required.",
        )
    now = _now_iso()
    try:
        with db_cursor() as connection:
            connection.execute(
                """
                INSERT INTO employees (
                    employee_code, employee_name, department, designation, salary_mode, unit, doj,
                    gross_monthly_salary, opening_leave_balance, leave_accrued, leave_availed,
                    closing_leave_balance, comp_off_balance, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized.employee_code,
                    normalized.employee_name,
                    normalized.department,
                    normalized.designation,
                    normalized.salary_mode,
                    normalized.unit,
                    normalized.doj,
                    normalized.gross_monthly_salary,
                    normalized.opening_leave_balance,
                    normalized.leave_accrued,
                    normalized.leave_availed,
                    normalized.closing_leave_balance,
                    normalized.comp_off_balance,
                    normalized.status,
                    now,
                    now,
                ),
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Employee ID "{normalized.employee_code}" already exists.',
        ) from exc
    return normalized


def update_employee(existing_employee_code: str, record: EmployeeMasterRecord) -> EmployeeMasterRecord:
    normalized = _normalize_employee(record)
    if not normalized.employee_code or not normalized.employee_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee code and employee name are required.",
        )

    with db_cursor() as connection:
        existing = connection.execute(
            "SELECT employee_code, created_at FROM employees WHERE lower(employee_code) = lower(?)",
            (existing_employee_code.strip(),),
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        duplicate = connection.execute(
            "SELECT employee_code FROM employees WHERE lower(employee_code) = lower(?) AND lower(employee_code) != lower(?)",
            (normalized.employee_code, existing_employee_code.strip()),
        ).fetchone()
        if duplicate is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'Employee ID "{normalized.employee_code}" already exists.',
            )

        connection.execute(
            """
            UPDATE employees
            SET employee_code = ?, employee_name = ?, department = ?, designation = ?, salary_mode = ?,
                unit = ?, doj = ?, gross_monthly_salary = ?, opening_leave_balance = ?, leave_accrued = ?,
                leave_availed = ?, closing_leave_balance = ?, comp_off_balance = ?, status = ?, updated_at = ?
            WHERE lower(employee_code) = lower(?)
            """,
            (
                normalized.employee_code,
                normalized.employee_name,
                normalized.department,
                normalized.designation,
                normalized.salary_mode,
                normalized.unit,
                normalized.doj,
                normalized.gross_monthly_salary,
                normalized.opening_leave_balance,
                normalized.leave_accrued,
                normalized.leave_availed,
                normalized.closing_leave_balance,
                normalized.comp_off_balance,
                normalized.status,
                _now_iso(),
                existing_employee_code.strip(),
            ),
        )

    return normalized


def delete_employee(employee_code: str) -> None:
    with db_cursor() as connection:
        cursor = connection.execute(
            "DELETE FROM employees WHERE lower(employee_code) = lower(?)",
            (employee_code.strip(),),
        )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")


def clear_employees() -> None:
    with db_cursor() as connection:
        connection.execute("DELETE FROM employees")


def bulk_upsert_employees(records: list[EmployeeMasterRecord]) -> list[EmployeeMasterRecord]:
    normalized_records = [_normalize_employee(record) for record in records]
    now = _now_iso()
    with db_cursor() as connection:
        for record in normalized_records:
            if not record.employee_code or not record.employee_name:
                continue
            created_at_row = connection.execute(
                "SELECT created_at FROM employees WHERE lower(employee_code) = lower(?)",
                (record.employee_code,),
            ).fetchone()
            created_at = created_at_row["created_at"] if created_at_row is not None else now
            connection.execute(
                """
                INSERT INTO employees (
                    employee_code, employee_name, department, designation, salary_mode, unit, doj,
                    gross_monthly_salary, opening_leave_balance, leave_accrued, leave_availed,
                    closing_leave_balance, comp_off_balance, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(employee_code) DO UPDATE SET
                    employee_name = excluded.employee_name,
                    department = excluded.department,
                    designation = excluded.designation,
                    salary_mode = excluded.salary_mode,
                    unit = excluded.unit,
                    doj = excluded.doj,
                    gross_monthly_salary = excluded.gross_monthly_salary,
                    opening_leave_balance = excluded.opening_leave_balance,
                    leave_accrued = excluded.leave_accrued,
                    leave_availed = excluded.leave_availed,
                    closing_leave_balance = excluded.closing_leave_balance,
                    comp_off_balance = excluded.comp_off_balance,
                    status = excluded.status,
                    updated_at = excluded.updated_at
                """,
                (
                    record.employee_code,
                    record.employee_name,
                    record.department,
                    record.designation,
                    record.salary_mode,
                    record.unit,
                    record.doj,
                    record.gross_monthly_salary,
                    record.opening_leave_balance,
                    record.leave_accrued,
                    record.leave_availed,
                    record.closing_leave_balance,
                    record.comp_off_balance,
                    record.status,
                    created_at,
                    now,
                ),
            )
    return list_employees()


def list_salary_components() -> list[SalaryComponentRecord]:
    with db_cursor() as connection:
        rows = connection.execute(
            """
            SELECT id, component_name, percentage, active
            FROM salary_components
            ORDER BY sort_order ASC, component_name ASC
            """
        ).fetchall()
        if not rows:
            _seed_default_salary_components(connection)
            rows = connection.execute(
                """
                SELECT id, component_name, percentage, active
                FROM salary_components
                ORDER BY sort_order ASC, component_name ASC
                """
            ).fetchall()
    return [_row_to_salary_component(row) for row in rows]


def save_salary_components(components: list[SalaryComponentRecord]) -> list[SalaryComponentRecord]:
    normalized_components = [
        SalaryComponentRecord(
            id=item.id.strip(),
            component_name=item.component_name.strip(),
            percentage=float(item.percentage or 0.0),
            active=bool(item.active),
        )
        for item in components
        if item.id.strip()
    ]
    now = _now_iso()
    with db_cursor() as connection:
        connection.execute("DELETE FROM salary_components")
        for index, component in enumerate(normalized_components):
            connection.execute(
                """
                INSERT INTO salary_components (
                    id, component_name, percentage, active, sort_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    component.id,
                    component.component_name,
                    component.percentage,
                    1 if component.active else 0,
                    index,
                    now,
                    now,
                ),
            )
    return list_salary_components()


def _seed_default_salary_components(connection: sqlite3.Connection) -> None:
    now = _now_iso()
    for index, component in enumerate(DEFAULT_SALARY_COMPONENTS):
        connection.execute(
            """
            INSERT INTO salary_components (
                id, component_name, percentage, active, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                component["id"],
                component["component_name"],
                component["percentage"],
                1 if component["active"] else 0,
                index,
                now,
                now,
            ),
        )

