from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
import logging
import re
from typing import Optional

import pandas as pd

from app.services.attendance_structure import (
    AttendanceSheetPreparation,
    build_raw_like_dataframe,
    prepare_attendance_sheet,
)

logger = logging.getLogger(__name__)

MATRIX_DAY_HEADER_PATTERN = re.compile(r"^\s*(\d{1,2})\s+([A-Za-z]{1,3})\s*$")
REPORT_DATE_RANGE_PATTERN = re.compile(
    r"([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\s+To\s+([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})",
    re.IGNORECASE,
)
EMPLOYEE_CODE_LABELS = {"emp. code:", "emp. code", "emp code:", "emp code"}
EMPLOYEE_NAME_LABELS = {"emp. name:", "emp. name", "emp name:", "emp name"}
DEPARTMENT_LABELS = {"department:", "department", "unit:", "unit", "branch:", "branch"}
GENDER_LABELS = {"gender:", "gender", "sex:", "sex"}
STATUS_ROW_LABELS = {"status"}
IN_TIME_ROW_LABELS = {"intime", "in time"}
OUT_TIME_ROW_LABELS = {"outtime", "out time"}
WORK_DURATION_ROW_LABELS = {"total", "workduration", "work duration", "duration"}


@dataclass
class MatrixDateColumn:
    column_index: int
    date_value: pd.Timestamp
    day_header: str


@dataclass
class AttendanceNormalizedRecord:
    record_id: str
    source_row_number: int
    employee_code: str = ""
    employee_name: str = ""
    gender: str = ""
    date_value: Optional[pd.Timestamp] = None
    day_label: str = ""
    unit: str = ""
    in_time: Optional[pd.Timestamp] = None
    out_time: Optional[pd.Timestamp] = None
    work_duration_hours: Optional[float] = None
    attendance_status: str = ""
    activity: str = ""
    work_description: str = ""
    remarks: str = ""
    review_action: str = ""
    hr_override_status: str = ""
    hr_reviewed_by: str = ""
    hr_reviewed_at: str = ""
    action_source: str = ""
    action_reason: str = ""
    action_remarks: str = ""
    anomaly_flags: list[str] = field(default_factory=list)


@dataclass
class AttendanceIngestionResult:
    dataframe: pd.DataFrame
    structure_preparation: AttendanceSheetPreparation
    processing_mode: str
    missing_required_columns: list[str]
    mapped_columns: dict[str, str]
    records: list[AttendanceNormalizedRecord]


def ingest_attendance_dataframe(
    dataframe: pd.DataFrame,
    structure_preparation: Optional[AttendanceSheetPreparation] = None,
) -> AttendanceIngestionResult:
    raw_like_dataframe = build_raw_like_dataframe(dataframe)
    matrix_result = _ingest_matrix_attendance(raw_like_dataframe)
    if matrix_result is not None:
        return matrix_result

    preparation = structure_preparation or prepare_attendance_sheet(raw_like_dataframe)
    structured_dataframe = preparation.dataframe if preparation.should_use_structured_dataframe else dataframe
    mapped_columns = _mapped_columns(preparation)
    processing_mode = _detect_processing_mode(mapped_columns)
    missing_required_columns = _detect_missing_required_columns(processing_mode, mapped_columns)
    records = _build_records(structured_dataframe, preparation, mapped_columns)

    return AttendanceIngestionResult(
        dataframe=structured_dataframe,
        structure_preparation=preparation,
        processing_mode=processing_mode,
        missing_required_columns=missing_required_columns,
        mapped_columns=mapped_columns,
        records=records,
    )


def looks_like_matrix_attendance_dataframe(dataframe: pd.DataFrame) -> bool:
    raw_like_dataframe = build_raw_like_dataframe(dataframe)
    return _detect_matrix_date_header_row(raw_like_dataframe) is not None


def _ingest_matrix_attendance(raw_dataframe: pd.DataFrame) -> Optional[AttendanceIngestionResult]:
    date_header_row_index = _detect_matrix_date_header_row(raw_dataframe)
    if date_header_row_index is None:
        return None

    report_month = _extract_report_month(raw_dataframe, date_header_row_index)
    if report_month is None:
        return None

    date_columns = _extract_matrix_date_columns(raw_dataframe, date_header_row_index, report_month)
    if len(date_columns) < 7:
        return None

    employee_blocks = _extract_matrix_employee_blocks(
        raw_dataframe,
        date_header_row_index,
        date_columns,
    )
    if not employee_blocks:
        return None

    logger.info(
        "Matrix attendance parser activated header_row=%s employees=%s records=%s",
        date_header_row_index + 1,
        len({record.employee_code or record.employee_name for record in employee_blocks}),
        len(employee_blocks),
    )

    normalized_dataframe = _records_to_dataframe(employee_blocks)
    mapped_columns = {
        "Employee Code": "Emp. Code block",
        "Employee Name": "Emp. Name block",
        "Date": "Days row",
        "Day": "Days row",
        "In Time": "InTime row",
        "Out Time": "OutTime row",
        "Work Duration": "Total row",
        "Attendance Status": "Status row",
        "Location / District": "Department row",
    }
    preparation = AttendanceSheetPreparation(
        dataframe=normalized_dataframe,
        detected_header_row_number=date_header_row_index + 1,
        header_confidence_score=9.9,
        mapped_fields=[
            _matrix_mapped_field("Date", "Days row", 0.98, "Matrix day columns were detected horizontally across the report."),
            _matrix_mapped_field("Day", "Days row", 0.92, "Weekday labels were detected from the horizontal matrix date headers."),
            _matrix_mapped_field("Employee Code", "Emp. Code block", 0.98, "Employee blocks contain Emp. Code labels with nearby code values."),
            _matrix_mapped_field("Employee Name", "Emp. Name block", 0.98, "Employee blocks contain Emp. Name labels with nearby name values."),
            _matrix_mapped_field("Gender", "", 0.0, "Could not confidently detect Gender from the matrix attendance block."),
            _matrix_mapped_field("In Time", "InTime row", 0.96, "Daily punch-in values are stored in the InTime row of each employee block."),
            _matrix_mapped_field("Out Time", "OutTime row", 0.96, "Daily punch-out values are stored in the OutTime row of each employee block."),
            _matrix_mapped_field("Work Duration", "Total row", 0.92, "Daily work duration values are stored in the Total row of each employee block."),
            _matrix_mapped_field("Attendance Status", "Status row", 0.96, "Daily attendance status values are stored in the Status row of each employee block."),
            _matrix_mapped_field("Location / District", "Department row", 0.7, "Department or unit labels were detected above or inside the attendance block."),
            _matrix_mapped_field("Work / Activity", "", 0.0, "Matrix biometric reports do not expose a work activity row."),
            _matrix_mapped_field("Description of Work", "", 0.0, "Matrix biometric reports do not expose a work description row."),
            _matrix_mapped_field("Remarks", "", 0.0, "No remarks row was detected in the matrix attendance block."),
        ],
        warnings=[],
        should_use_structured_dataframe=True,
    )

    return AttendanceIngestionResult(
        dataframe=normalized_dataframe,
        structure_preparation=preparation,
        processing_mode="matrix_biometric",
        missing_required_columns=[],
        mapped_columns=mapped_columns,
        records=employee_blocks,
    )


def _detect_matrix_date_header_row(raw_dataframe: pd.DataFrame) -> Optional[int]:
    rows_to_scan = min(len(raw_dataframe.index), 40)
    best_index: Optional[int] = None
    best_score = 0

    for row_index in range(rows_to_scan):
        row_values = raw_dataframe.iloc[row_index].tolist()
        normalized_values = [_normalize_matrix_text(value) for value in row_values]
        if "days" not in normalized_values:
            continue

        header_count = sum(
            1
            for value in row_values
            if MATRIX_DAY_HEADER_PATTERN.match(_stringify_cell(value))
        )
        if header_count > best_score:
            best_score = header_count
            best_index = row_index

    if best_index is None or best_score < 7:
        return None

    return best_index


def _extract_report_month(
    raw_dataframe: pd.DataFrame,
    date_header_row_index: int,
) -> Optional[pd.Timestamp]:
    rows_to_scan = min(date_header_row_index + 1, 12)
    for row_index in range(rows_to_scan):
        row_text = " ".join(
            _stringify_cell(value)
            for value in raw_dataframe.iloc[row_index].tolist()
            if not _is_empty_value(value)
        )
        if not row_text:
            continue

        match = REPORT_DATE_RANGE_PATTERN.search(row_text)
        if match:
            parsed = pd.to_datetime(match.group(1), errors="coerce")
            if not pd.isna(parsed):
                return pd.Timestamp(parsed).normalize()

    return None


def _extract_matrix_date_columns(
    raw_dataframe: pd.DataFrame,
    date_header_row_index: int,
    report_month: pd.Timestamp,
) -> list[MatrixDateColumn]:
    date_columns: list[MatrixDateColumn] = []
    year = report_month.year
    month = report_month.month

    for column_index, value in enumerate(raw_dataframe.iloc[date_header_row_index].tolist()):
        text_value = _stringify_cell(value)
        match = MATRIX_DAY_HEADER_PATTERN.match(text_value)
        if match is None:
            continue

        day_number = int(match.group(1))
        try:
            date_value = pd.Timestamp(year=year, month=month, day=day_number)
        except ValueError:
            continue

        date_columns.append(
            MatrixDateColumn(
                column_index=column_index,
                date_value=date_value.normalize(),
                day_header=match.group(2),
            )
        )

    return date_columns


def _extract_matrix_employee_blocks(
    raw_dataframe: pd.DataFrame,
    date_header_row_index: int,
    date_columns: list[MatrixDateColumn],
) -> list[AttendanceNormalizedRecord]:
    records: list[AttendanceNormalizedRecord] = []
    default_unit = _find_default_unit(raw_dataframe, date_header_row_index)
    row_index = date_header_row_index + 1
    max_rows = len(raw_dataframe.index)

    while row_index < max_rows:
        row_values = raw_dataframe.iloc[row_index].tolist()
        if not _is_matrix_employee_header_row(row_values):
            row_index += 1
            continue

        next_header_row = row_index + 1
        while next_header_row < max_rows:
            next_values = raw_dataframe.iloc[next_header_row].tolist()
            if _is_matrix_employee_header_row(next_values):
                break
            next_header_row += 1

        block_rows = raw_dataframe.iloc[row_index:next_header_row].copy()
        records.extend(
            _build_matrix_employee_records(
                block_rows,
                row_index,
                date_columns,
                default_unit=default_unit,
            )
        )
        row_index = next_header_row

    return records


def _build_matrix_employee_records(
    block_rows: pd.DataFrame,
    block_start_row_index: int,
    date_columns: list[MatrixDateColumn],
    *,
    default_unit: str,
) -> list[AttendanceNormalizedRecord]:
    header_values = block_rows.iloc[0].tolist()
    employee_code = _extract_label_value(header_values, EMPLOYEE_CODE_LABELS)
    employee_name = _extract_label_value(header_values, EMPLOYEE_NAME_LABELS)
    gender = _extract_label_value(header_values, GENDER_LABELS)
    unit = _extract_label_value(header_values, DEPARTMENT_LABELS) or default_unit

    status_row: Optional[pd.Series] = None
    in_time_row: Optional[pd.Series] = None
    out_time_row: Optional[pd.Series] = None
    duration_row: Optional[pd.Series] = None

    for offset in range(1, len(block_rows.index)):
        row = block_rows.iloc[offset]
        label = _first_row_label(row.tolist())
        if label in STATUS_ROW_LABELS:
            status_row = row
        elif label in IN_TIME_ROW_LABELS:
            in_time_row = row
        elif label in OUT_TIME_ROW_LABELS:
            out_time_row = row
        elif label in WORK_DURATION_ROW_LABELS:
            duration_row = row
        elif label in GENDER_LABELS and not gender:
            gender = _extract_label_value(row.tolist(), GENDER_LABELS)
        elif label in DEPARTMENT_LABELS and not unit:
            unit = _extract_label_value(row.tolist(), DEPARTMENT_LABELS)

    records: list[AttendanceNormalizedRecord] = []
    for date_column in date_columns:
        raw_status = _format_text(_series_value(status_row, date_column.column_index))
        raw_in_time = _series_value(in_time_row, date_column.column_index)
        raw_out_time = _series_value(out_time_row, date_column.column_index)
        raw_duration = _series_value(duration_row, date_column.column_index)

        if not any(
            not _is_empty_value(value)
            for value in (raw_status, raw_in_time, raw_out_time, raw_duration)
        ):
            continue

        date_value = date_column.date_value
        in_time = _parse_time(raw_in_time, date_value)
        out_time = _parse_time(raw_out_time, date_value)
        duration_hours = _parse_duration_hours(raw_duration, in_time, out_time)
        duration_hours = _clean_matrix_duration_hours(
            raw_status=raw_status,
            duration_hours=duration_hours,
            in_time=in_time,
            out_time=out_time,
        )

        source_row_number = block_start_row_index + 2
        if status_row is None and in_time_row is not None:
            source_row_number = block_start_row_index + 3

        employee_key = employee_code or employee_name or f"block-{block_start_row_index + 1}"
        records.append(
            AttendanceNormalizedRecord(
                record_id=f"attendance-{_slugify(employee_key)}-{date_value.strftime('%Y%m%d')}",
                source_row_number=source_row_number,
                employee_code=employee_code,
                employee_name=employee_name,
                gender=gender,
                date_value=date_value,
                day_label=date_value.day_name(),
                unit=unit,
                in_time=in_time,
                out_time=out_time,
                work_duration_hours=duration_hours,
                attendance_status=raw_status,
                remarks="",
            )
        )

    return records


def _find_default_unit(raw_dataframe: pd.DataFrame, date_header_row_index: int) -> str:
    rows_to_scan = min(date_header_row_index + 3, len(raw_dataframe.index))
    for row_index in range(rows_to_scan):
        row_values = raw_dataframe.iloc[row_index].tolist()
        if _first_row_label(row_values) not in DEPARTMENT_LABELS:
            continue

        return _extract_label_value(row_values, DEPARTMENT_LABELS)

    return ""


def _matrix_mapped_field(
    field_name: str,
    detected_column_name: str,
    confidence_score: float,
    reason: str,
) -> dict[str, object]:
    return {
        "field_name": field_name,
        "detected_column_name": detected_column_name,
        "confidence_score": round(confidence_score, 2),
        "reason": reason,
        "status": "mapped" if detected_column_name else "warning",
    }


def _records_to_dataframe(records: list[AttendanceNormalizedRecord]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()

    return pd.DataFrame(
        [
            {
                "Employee Code": record.employee_code,
                "Employee Name": record.employee_name,
                "Gender": record.gender,
                "Date": record.date_value.strftime("%Y-%m-%d") if record.date_value is not None else "",
                "Day": record.day_label,
                "In Time": _format_text(record.in_time),
                "Out Time": _format_text(record.out_time),
                "Work Duration": record.work_duration_hours,
                "Attendance Status": record.attendance_status,
                "Unit": record.unit,
            }
            for record in records
        ]
    )


def _build_records(
    dataframe: pd.DataFrame,
    preparation: AttendanceSheetPreparation,
    mapped_columns: dict[str, str],
) -> list[AttendanceNormalizedRecord]:
    records: list[AttendanceNormalizedRecord] = []
    data_row_start = preparation.detected_header_row_number + 1

    for row_index, (_, row) in enumerate(dataframe.iterrows()):
        if _is_blank_row(row):
            continue

        date_value = _parse_date(_get_value(row, mapped_columns.get("Date", "")))
        in_time = _parse_time(_get_value(row, mapped_columns.get("In Time", "")), date_value)
        out_time = _parse_time(_get_value(row, mapped_columns.get("Out Time", "")), date_value)
        duration_hours = _parse_duration_hours(
            _get_value(row, mapped_columns.get("Work Duration", "")),
            in_time,
            out_time,
        )

        records.append(
            AttendanceNormalizedRecord(
                record_id=f"attendance-row-{data_row_start + row_index}",
                source_row_number=data_row_start + row_index,
                employee_code=_format_text(_get_value(row, mapped_columns.get("Employee Code", ""))),
                employee_name=_format_text(_get_value(row, mapped_columns.get("Employee Name", ""))),
                gender=_format_text(_get_value(row, mapped_columns.get("Gender", ""))),
                date_value=date_value,
                day_label=_format_text(_get_value(row, mapped_columns.get("Day", ""))),
                unit=_format_text(_get_value(row, mapped_columns.get("Location / District", ""))),
                in_time=in_time,
                out_time=out_time,
                work_duration_hours=duration_hours,
                attendance_status=_format_text(_get_value(row, mapped_columns.get("Attendance Status", ""))),
                activity=_format_text(_get_value(row, mapped_columns.get("Work / Activity", ""))),
                work_description=_format_text(_get_value(row, mapped_columns.get("Description of Work", ""))),
                remarks=_format_text(_get_value(row, mapped_columns.get("Remarks", ""))),
            )
        )

    return records


def _mapped_columns(preparation: AttendanceSheetPreparation) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for item in preparation.mapped_fields:
        if str(item.get("status", "")) != "mapped":
            continue
        mapped[str(item.get("field_name", ""))] = str(item.get("detected_column_name", ""))
    return mapped


def _detect_processing_mode(mapped_columns: dict[str, str]) -> str:
    biometric_score = sum(
        1
        for field_name in (
            "Employee Code",
            "Employee Name",
            "Date",
            "In Time",
            "Out Time",
            "Work Duration",
            "Attendance Status",
        )
        if mapped_columns.get(field_name)
    )
    timesheet_score = sum(
        1
        for field_name in (
            "Date",
            "Day",
            "Location / District",
            "Work / Activity",
            "Description of Work",
            "Remarks",
        )
        if mapped_columns.get(field_name)
    )

    if biometric_score >= 4 and mapped_columns.get("Date"):
        return "biometric"

    if timesheet_score >= 3:
        return "timesheet"

    if biometric_score >= 2:
        return "biometric"

    return "timesheet"


def _detect_missing_required_columns(
    processing_mode: str,
    mapped_columns: dict[str, str],
) -> list[str]:
    missing: list[str] = []

    if not mapped_columns.get("Date"):
        missing.append("Date")

    if not mapped_columns.get("Employee Code") and not mapped_columns.get("Employee Name"):
        missing.append("Employee Code or Employee Name")

    if processing_mode == "biometric":
        if not mapped_columns.get("In Time") and not mapped_columns.get("Out Time"):
            missing.append("In Time or Out Time")
        if not mapped_columns.get("Work Duration"):
            missing.append("Work Duration")
        if not mapped_columns.get("Attendance Status"):
            missing.append("Attendance Status")
    else:
        if not mapped_columns.get("Work / Activity") and not mapped_columns.get("Description of Work"):
            missing.append("Work / Activity or Description of Work")

    return missing


def _get_value(row: pd.Series, column_name: str) -> object:
    if not column_name:
        return None

    for current_column in row.index.tolist():
        if str(current_column) == column_name:
            return row[current_column]

    return None


def _parse_date(value: object) -> Optional[pd.Timestamp]:
    if _is_empty_value(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.normalize()
    if isinstance(value, (datetime, date)):
        return pd.Timestamp(value).normalize()

    parsed = pd.to_datetime(str(value), errors="coerce")
    if pd.isna(parsed):
        return None

    return pd.Timestamp(parsed).normalize()


def _parse_time(value: object, base_date: Optional[pd.Timestamp]) -> Optional[pd.Timestamp]:
    if _is_empty_value(value):
        return None

    if isinstance(value, pd.Timestamp):
        return _apply_base_date(pd.Timestamp(value), base_date)
    if isinstance(value, datetime):
        return _apply_base_date(pd.Timestamp(value), base_date)
    if isinstance(value, time):
        return _combine_time_with_base(value, base_date)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        numeric = float(value)
        if 0 <= numeric < 2 and base_date is not None:
            return base_date.normalize() + pd.to_timedelta(numeric, unit="D")

    text_value = str(value).strip()
    if base_date is not None and re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?", text_value):
        parsed_time = pd.to_datetime(text_value, errors="coerce")
        if not pd.isna(parsed_time):
            return base_date.normalize() + pd.to_timedelta(
                parsed_time.hour, unit="h"
            ) + pd.to_timedelta(parsed_time.minute, unit="m") + pd.to_timedelta(
                parsed_time.second, unit="s"
            )

    parsed = pd.to_datetime(text_value, errors="coerce")
    if pd.isna(parsed):
        return None

    return _apply_base_date(pd.Timestamp(parsed), base_date)


def _apply_base_date(timestamp: pd.Timestamp, base_date: Optional[pd.Timestamp]) -> pd.Timestamp:
    if base_date is None:
        return timestamp

    normalized = timestamp.normalize()
    if normalized.year in (1899, 1900, 1970):
        return base_date.normalize() + (timestamp - normalized)

    if normalized == base_date.normalize():
        return timestamp

    if timestamp.hour or timestamp.minute or timestamp.second:
        return timestamp

    return base_date.normalize()


def _combine_time_with_base(
    value: time,
    base_date: Optional[pd.Timestamp],
) -> Optional[pd.Timestamp]:
    if base_date is None:
        return None

    return base_date.normalize() + pd.to_timedelta(value.hour, unit="h") + pd.to_timedelta(
        value.minute, unit="m"
    ) + pd.to_timedelta(value.second, unit="s")


def _parse_duration_hours(
    value: object,
    in_time: Optional[pd.Timestamp],
    out_time: Optional[pd.Timestamp],
) -> Optional[float]:
    if not _is_empty_value(value):
        if isinstance(value, pd.Timedelta):
            return round(value.total_seconds() / 3600, 2)
        if isinstance(value, timedelta):
            return round(value.total_seconds() / 3600, 2)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric = float(value)
            if -1 <= numeric <= 1:
                return round(numeric * 24, 2)
            return round(numeric, 2)

        text_value = str(value).strip()
        if re.fullmatch(r"-?\d{1,2}:\d{2}(:\d{2})?", text_value):
            parts = text_value.split(":")
            sign = -1 if parts[0].startswith("-") else 1
            hours = abs(int(parts[0]))
            minutes = int(parts[1])
            seconds = int(parts[2]) if len(parts) > 2 else 0
            total = sign * (hours + minutes / 60 + seconds / 3600)
            return round(total, 2)
        if re.fullmatch(r"-?\d+(\.\d+)?", text_value):
            return round(float(text_value), 2)

    if in_time is not None and out_time is not None:
        delta = (out_time - in_time).total_seconds() / 3600
        if delta < 0:
            delta += 24
        return round(delta, 2)

    return None


def _format_text(value: object) -> str:
    if _is_empty_value(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip()


def _is_blank_row(row: pd.Series) -> bool:
    return all(_is_empty_value(value) for value in row.tolist())


def _is_empty_value(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    if isinstance(value, pd.Timestamp) and pd.isna(value):
        return True
    return isinstance(value, str) and value.strip() == ""


def _stringify_cell(value: object) -> str:
    if _is_empty_value(value):
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value).strip()


def _normalize_matrix_text(value: object) -> str:
    return " ".join(_stringify_cell(value).lower().replace("_", " ").split())


def _is_matrix_employee_header_row(row_values: list[object]) -> bool:
    normalized_values = {_normalize_matrix_text(value) for value in row_values if not _is_empty_value(value)}
    return bool(normalized_values.intersection(EMPLOYEE_CODE_LABELS)) and bool(
        normalized_values.intersection(EMPLOYEE_NAME_LABELS)
    )


def _extract_label_value(row_values: list[object], labels: set[str]) -> str:
    for index, value in enumerate(row_values):
        if _normalize_matrix_text(value) not in labels:
            continue

        for candidate_index in range(index + 1, min(index + 7, len(row_values))):
            candidate_value = row_values[candidate_index]
            if _is_empty_value(candidate_value):
                continue
            normalized_candidate = _normalize_matrix_text(candidate_value)
            if normalized_candidate in EMPLOYEE_CODE_LABELS | EMPLOYEE_NAME_LABELS | DEPARTMENT_LABELS | GENDER_LABELS:
                break
            return _format_text(candidate_value)

    return ""


def _first_row_label(row_values: list[object]) -> str:
    for value in row_values:
        normalized_value = _normalize_matrix_text(value)
        if normalized_value:
            return normalized_value
    return ""


def _series_value(row: Optional[pd.Series], column_index: int) -> object:
    if row is None:
        return None
    try:
        return row.iloc[column_index]
    except IndexError:
        return None


def _slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return cleaned.strip("-") or "employee"


def _clean_matrix_duration_hours(
    *,
    raw_status: str,
    duration_hours: Optional[float],
    in_time: Optional[pd.Timestamp],
    out_time: Optional[pd.Timestamp],
) -> Optional[float]:
    normalized_status = raw_status.strip().lower()

    if duration_hours is None:
        return None

    if duration_hours == 0 and (
        normalized_status in {"a", "absent", "wo", "week off", "weekly off", "holiday"}
        or (in_time is None and out_time is None)
    ):
        return None

    if duration_hours > 16 and out_time is None:
        return None

    return duration_hours
