import re
from datetime import timedelta
import logging
from typing import Optional

import pandas as pd

from app.schemas.upload import (
    DuplicateEmployeeIdIssue,
    LowWorkingHoursIssue,
    MissingTimeIssue,
    NegativeSalaryIssue,
    ValidationSummary,
)

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = [
    "Employee Name",
    "Employee ID",
    "Department",
    "In Time",
    "Out Time",
    "Working Hours",
    "Salary",
]


def _normalize_column_name(column_name: str) -> str:
    collapsed = re.sub(r"[\s_]+", " ", column_name.strip().lower())
    return collapsed


def _build_column_lookup(columns: list[str]) -> dict[str, str]:
    return {_normalize_column_name(column): column for column in columns}


def _build_column_position_lookup(columns: list[str]) -> dict[str, int]:
    lookup: dict[str, int] = {}

    for index, column in enumerate(columns):
        normalized = _normalize_column_name(column)
        lookup.setdefault(normalized, index)

    return lookup


def _is_empty_value(value: object) -> bool:
    if isinstance(value, pd.Series):
        return all(_is_empty_value(item) for item in value.tolist())

    if pd.isna(value):
        return True

    if isinstance(value, str) and value.strip() == "":
        return True

    return False


def _format_cell(value: object) -> str:
    if _is_empty_value(value):
        return ""

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    return str(value)


def _to_float(value: object):
    if _is_empty_value(value):
        return None

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)

    cleaned = str(value).strip().replace(",", "")
    cleaned = cleaned.replace("₹", "").replace("$", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_working_hours(value: object):
    if _is_empty_value(value):
        return None

    if isinstance(value, pd.Timedelta):
        return value.total_seconds() / 3600

    if isinstance(value, timedelta):
        return value.total_seconds() / 3600

    numeric_value = _to_float(value)
    if numeric_value is not None:
        return numeric_value

    text_value = str(value).strip()
    if ":" not in text_value:
        return None

    try:
        timed_value = pd.to_timedelta(text_value)
        return timed_value.total_seconds() / 3600
    except ValueError:
        return None


def _is_blank_row(row: pd.Series) -> bool:
    return all(_is_empty_value(value) for value in row.tolist())


def _get_row_value(row: pd.Series, column_index: Optional[int]):
    if column_index is None:
        return None

    try:
        return row.iloc[column_index]
    except IndexError:
        return None


def _get_text_value(row: pd.Series, column_index: Optional[int]) -> str:
    if column_index is None:
        return ""

    return _format_cell(_get_row_value(row, column_index))


def build_empty_validation_summary() -> ValidationSummary:
    return ValidationSummary(
        status="valid",
        total_valid_rows=0,
        total_invalid_rows=0,
        warnings_count=0,
        errors_count=0,
        missing_required_columns=[],
        duplicate_employee_ids=[],
        blank_row_numbers=[],
        negative_salary_values=[],
        low_working_hours=[],
        missing_in_out_time=[],
    )


def build_validation_summary(dataframe: pd.DataFrame) -> ValidationSummary:
    column_headers = [str(column) for column in dataframe.columns.tolist()]
    column_lookup = _build_column_lookup(column_headers)
    column_position_lookup = _build_column_position_lookup(column_headers)

    missing_required_columns = [
        column_name
        for column_name in REQUIRED_COLUMNS
        if _normalize_column_name(column_name) not in column_lookup
    ]

    employee_name_column_index = column_position_lookup.get(_normalize_column_name("Employee Name"))
    employee_id_column_index = column_position_lookup.get(_normalize_column_name("Employee ID"))
    in_time_column_index = column_position_lookup.get(_normalize_column_name("In Time"))
    out_time_column_index = column_position_lookup.get(_normalize_column_name("Out Time"))
    working_hours_column_index = column_position_lookup.get(
        _normalize_column_name("Working Hours")
    )
    salary_column_index = column_position_lookup.get(_normalize_column_name("Salary"))

    blank_row_numbers: list[int] = []
    duplicate_id_rows: dict[str, list[int]] = {}
    negative_salary_values: list[NegativeSalaryIssue] = []
    low_working_hours: list[LowWorkingHoursIssue] = []
    missing_in_out_time: list[MissingTimeIssue] = []
    invalid_row_numbers: set[int] = set()
    employee_id_occurrences: dict[str, list[int]] = {}

    for row_index, (_, row) in enumerate(dataframe.iterrows(), start=2):
        if _is_blank_row(row):
            blank_row_numbers.append(row_index)
            invalid_row_numbers.add(row_index)
            continue

        employee_name = _get_text_value(row, employee_name_column_index)
        employee_id = _get_text_value(row, employee_id_column_index)

        if employee_id_column_index is not None and employee_id:
            employee_id_occurrences.setdefault(employee_id, []).append(row_index)

        if salary_column_index is not None:
            salary_cell = _get_row_value(row, salary_column_index)
            salary_value = _to_float(salary_cell)
            if salary_value is not None and salary_value < 0:
                negative_salary_values.append(
                    NegativeSalaryIssue(
                        row_number=row_index,
                        employee_name=employee_name,
                        employee_id=employee_id,
                        salary_value=_format_cell(salary_cell),
                    )
                )
                invalid_row_numbers.add(row_index)

        if working_hours_column_index is not None:
            working_hours_cell = _get_row_value(row, working_hours_column_index)
            working_hours_value = _parse_working_hours(working_hours_cell)
            if working_hours_value is not None and working_hours_value < 4:
                low_working_hours.append(
                    LowWorkingHoursIssue(
                        row_number=row_index,
                        employee_name=employee_name,
                        employee_id=employee_id,
                        working_hours=_format_cell(working_hours_cell),
                    )
                )
                invalid_row_numbers.add(row_index)

        if in_time_column_index is not None or out_time_column_index is not None:
            missing_fields: list[str] = []

            if in_time_column_index is not None and _is_empty_value(
                _get_row_value(row, in_time_column_index)
            ):
                missing_fields.append("In Time")
            if out_time_column_index is not None and _is_empty_value(
                _get_row_value(row, out_time_column_index)
            ):
                missing_fields.append("Out Time")

            if missing_fields:
                missing_in_out_time.append(
                    MissingTimeIssue(
                        row_number=row_index,
                        employee_name=employee_name,
                        employee_id=employee_id,
                        missing_fields=missing_fields,
                    )
                )
                invalid_row_numbers.add(row_index)

    duplicate_employee_ids: list[DuplicateEmployeeIdIssue] = []
    for employee_id, row_numbers in employee_id_occurrences.items():
        if len(row_numbers) > 1:
            duplicate_employee_ids.append(
                DuplicateEmployeeIdIssue(
                    employee_id=employee_id,
                    row_numbers=row_numbers,
                )
            )
            duplicate_id_rows[employee_id] = row_numbers
            invalid_row_numbers.update(row_numbers)

    warnings_count = len(blank_row_numbers) + len(low_working_hours) + len(missing_in_out_time)
    errors_count = (
        len(missing_required_columns)
        + len(duplicate_employee_ids)
        + len(negative_salary_values)
    )

    if errors_count > 0:
        status = "error"
    elif warnings_count > 0:
        status = "warning"
    else:
        status = "valid"

    total_invalid_rows = len(invalid_row_numbers)
    total_valid_rows = max(int(dataframe.shape[0]) - total_invalid_rows, 0)

    return ValidationSummary(
        status=status,
        total_valid_rows=total_valid_rows,
        total_invalid_rows=total_invalid_rows,
        warnings_count=warnings_count,
        errors_count=errors_count,
        missing_required_columns=missing_required_columns,
        duplicate_employee_ids=duplicate_employee_ids,
        blank_row_numbers=blank_row_numbers,
        negative_salary_values=negative_salary_values,
        low_working_hours=low_working_hours,
        missing_in_out_time=missing_in_out_time,
    )
