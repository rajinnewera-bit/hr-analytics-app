from dataclasses import dataclass
from datetime import date, datetime
import re

import pandas as pd

HEADER_CONFIDENCE_THRESHOLD = 4.0
MAPPING_CONFIDENCE_THRESHOLD = 0.6

FIELD_CONFIGS = {
    "date": {
        "label": "Date",
        "keywords": ["date", "work date", "entry date", "attendance date"],
    },
    "day": {
        "label": "Day",
        "keywords": ["day", "weekday"],
    },
    "employee_code": {
        "label": "Employee Code",
        "keywords": [
            "employee code",
            "employee id",
            "emp code",
            "emp id",
            "employee no",
            "enroll no",
            "code",
            "card no",
            "biometric id",
        ],
    },
    "employee_name": {
        "label": "Employee Name",
        "keywords": ["employee name", "emp name", "associate name", "staff name", "name"],
    },
    "gender": {
        "label": "Gender",
        "keywords": ["gender", "sex", "employee gender"],
    },
    "in_time": {
        "label": "In Time",
        "keywords": ["in time", "intime", "check in", "login time", "punch in", "first in"],
    },
    "out_time": {
        "label": "Out Time",
        "keywords": ["out time", "outtime", "check out", "logout time", "punch out", "last out"],
    },
    "work_duration": {
        "label": "Work Duration",
        "keywords": [
            "work duration",
            "duration",
            "working hours",
            "work hours",
            "total hours",
            "hours worked",
            "hrs worked",
        ],
    },
    "attendance_status": {
        "label": "Attendance Status",
        "keywords": ["status", "attendance status", "att status", "punch status", "state"],
    },
    "location": {
        "label": "Location / District",
        "keywords": [
            "location",
            "district",
            "location district",
            "site",
            "office",
            "branch",
            "unit",
            "department",
        ],
    },
    "activity": {
        "label": "Work / Activity",
        "keywords": ["work", "activity", "task", "work done"],
    },
    "work_description": {
        "label": "Description of Work",
        "keywords": [
            "description of work",
            "description",
            "details performed",
            "work details",
            "details",
        ],
    },
    "remarks": {
        "label": "Remarks",
        "keywords": ["remarks", "remark", "notes", "comment", "comments"],
    },
}

WEEKDAY_NAMES = {
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
}

STATUS_TOKENS = {
    "present",
    "absent",
    "holiday",
    "wo",
    "week off",
    "leave",
    "late",
    "half day",
    "halfday",
    "miss",
}

GENDER_TOKENS = {
    "male",
    "female",
    "m",
    "f",
    "woman",
    "man",
}


@dataclass
class AttendanceSheetPreparation:
    dataframe: pd.DataFrame
    detected_header_row_number: int
    header_confidence_score: float
    mapped_fields: list[dict[str, object]]
    warnings: list[str]
    should_use_structured_dataframe: bool


def build_raw_like_dataframe(dataframe: pd.DataFrame) -> pd.DataFrame:
    header_row = pd.DataFrame([list(dataframe.columns)], columns=dataframe.columns)
    combined = pd.concat([header_row, dataframe], ignore_index=True)
    combined.columns = list(range(combined.shape[1]))
    return combined


def prepare_attendance_sheet(raw_dataframe: pd.DataFrame) -> AttendanceSheetPreparation:
    header_row_index, header_confidence_score = _detect_header_row(raw_dataframe)
    cleaned_dataframe = _build_dataframe_from_header(raw_dataframe, header_row_index)
    mapped_fields = _build_field_mappings(cleaned_dataframe)
    warnings = _build_mapping_warnings(mapped_fields)
    should_use_structured_dataframe = (
        header_confidence_score >= HEADER_CONFIDENCE_THRESHOLD
        and cleaned_dataframe.shape[1] > 0
    )

    return AttendanceSheetPreparation(
        dataframe=cleaned_dataframe,
        detected_header_row_number=header_row_index + 1,
        header_confidence_score=round(header_confidence_score, 2),
        mapped_fields=mapped_fields,
        warnings=warnings,
        should_use_structured_dataframe=should_use_structured_dataframe,
    )


def _detect_header_row(raw_dataframe: pd.DataFrame) -> tuple[int, float]:
    best_row_index = 0
    best_score = float("-inf")
    rows_to_scan = min(len(raw_dataframe.index), 25)

    for row_index in range(rows_to_scan):
        score = _score_header_candidate(raw_dataframe, row_index)
        if score > best_score:
            best_score = score
            best_row_index = row_index

    return best_row_index, best_score


def _score_header_candidate(raw_dataframe: pd.DataFrame, row_index: int) -> float:
    row_values = raw_dataframe.iloc[row_index].tolist()
    normalized_cells: list[str] = []
    candidate_cells: list[tuple[int, object, str]] = []

    for column_index, value in enumerate(row_values):
        if _is_empty(value):
            continue
        normalized_value = _normalize_text(value)
        candidate_cells.append((column_index, value, normalized_value))
        normalized_cells.append(normalized_value)

    if len(candidate_cells) < 3:
        return -5.0

    if len(candidate_cells) <= 2 and any(
        token in " ".join(normalized_cells)
        for token in ("report", "summary", "attendance register", "time sheet", "month", "from", "to")
    ):
        return -10.0

    keyword_hits = 0
    short_text_hits = 0
    numeric_like_hits = 0
    datetime_like_hits = 0
    long_text_hits = 0
    unnamed_like_hits = 0

    for _, raw_value, normalized_value in candidate_cells:
        if any(
            keyword in normalized_value
            for config in FIELD_CONFIGS.values()
            for keyword in config["keywords"]
        ):
            keyword_hits += 1

        if normalized_value.startswith("unnamed"):
            unnamed_like_hits += 1

        if _is_datetime_like_value(raw_value):
            datetime_like_hits += 1
            continue

        if _is_numeric_like_text(str(raw_value)):
            numeric_like_hits += 1

        if len(normalized_value.split()) <= 6 and len(normalized_value) <= 40:
            short_text_hits += 1

        if len(normalized_value) >= 60:
            long_text_hits += 1

    next_rows_bonus = _score_rows_below_candidate(raw_dataframe, row_index, candidate_cells)
    unique_ratio = len(set(normalized_cells)) / max(len(normalized_cells), 1)

    score = 0.0
    score += keyword_hits * 1.85
    score += short_text_hits * 0.4
    score += next_rows_bonus
    score += unique_ratio
    score -= numeric_like_hits * 0.8
    score -= datetime_like_hits * 1.6
    score -= long_text_hits * 0.55
    score -= unnamed_like_hits * 1.2

    if any(cell in {"s n", "sn", "s no", "sr no"} for cell in normalized_cells):
        score += 0.8
    if any("date" == cell for cell in normalized_cells):
        score += 1.2
    if any("day" == cell for cell in normalized_cells):
        score += 0.9
    if any("in time" in cell or "out time" in cell for cell in normalized_cells):
        score += 1.0
    if any("status" == cell or "attendance status" in cell for cell in normalized_cells):
        score += 0.7

    return score


def _score_rows_below_candidate(
    raw_dataframe: pd.DataFrame,
    row_index: int,
    candidate_cells: list[tuple[int, object, str]],
) -> float:
    data_rows = raw_dataframe.iloc[row_index + 1 : row_index + 6]
    if data_rows.empty:
        return 0.0

    score = 0.0
    for column_index, _, normalized_header in candidate_cells:
        if column_index >= raw_dataframe.shape[1]:
            continue

        sample = data_rows.iloc[:, column_index].dropna().head(4).tolist()
        if not sample:
            continue

        if "date" in normalized_header and _date_like_ratio(sample) >= 0.6:
            score += 1.4
        elif "day" in normalized_header and _weekday_ratio([_stringify_value(item) for item in sample]) >= 0.6:
            score += 1.0
        elif normalized_header in {"s n", "sn", "s no", "sr no"} and _sequence_ratio(sample) >= 0.6:
            score += 0.8
        elif ("in time" in normalized_header or "out time" in normalized_header) and _time_like_ratio(sample) >= 0.6:
            score += 1.2
        elif any(token in normalized_header for token in ("duration", "hours")) and _duration_like_ratio(sample) >= 0.6:
            score += 1.0
        elif "status" in normalized_header and _status_ratio([_stringify_value(item) for item in sample]) >= 0.5:
            score += 0.8
        elif any(token in normalized_header for token in ("work", "description", "remarks", "location", "unit")):
            score += 0.35
        else:
            score += 0.15

    return score


def _build_dataframe_from_header(raw_dataframe: pd.DataFrame, header_row_index: int) -> pd.DataFrame:
    header_values = raw_dataframe.iloc[header_row_index].tolist()
    data_values = raw_dataframe.iloc[header_row_index + 1 :].copy()

    cleaned_headers: list[str] = []
    columns_to_keep: list[int] = []
    header_counts: dict[str, int] = {}

    for column_index, header_value in enumerate(header_values):
        series = data_values.iloc[:, column_index]
        header_text = _clean_header_value(header_value)
        has_data = not series.dropna().empty and any(
            not _is_empty(value) for value in series.tolist()
        )

        if not header_text and not has_data:
            continue

        if not header_text:
            header_text = f"Column {column_index + 1}"

        count = header_counts.get(header_text, 0) + 1
        header_counts[header_text] = count
        if count > 1:
            header_text = f"{header_text} ({count})"

        cleaned_headers.append(header_text)
        columns_to_keep.append(column_index)

    if not columns_to_keep:
        return pd.DataFrame()

    rebuilt_dataframe = data_values.iloc[:, columns_to_keep].copy()
    rebuilt_dataframe.columns = cleaned_headers
    rebuilt_dataframe = rebuilt_dataframe.map(_strip_string_value)
    rebuilt_dataframe = rebuilt_dataframe.dropna(how="all").reset_index(drop=True)
    return rebuilt_dataframe


def _build_field_mappings(dataframe: pd.DataFrame) -> list[dict[str, object]]:
    mappings: list[dict[str, object]] = []

    for field_key, config in FIELD_CONFIGS.items():
        best_mapping = {
            "field_name": str(config["label"]),
            "detected_column_name": "",
            "confidence_score": 0.0,
            "reason": f"Could not confidently detect {config['label']}.",
            "status": "warning",
        }

        for column_name in dataframe.columns.tolist():
            score, reason = _score_field_against_column(field_key, dataframe[column_name], str(column_name))
            if score > float(best_mapping["confidence_score"]):
                best_mapping = {
                    "field_name": str(config["label"]),
                    "detected_column_name": str(column_name) if score >= MAPPING_CONFIDENCE_THRESHOLD else "",
                    "confidence_score": round(score, 2),
                    "reason": reason,
                    "status": "mapped" if score >= MAPPING_CONFIDENCE_THRESHOLD else "warning",
                }

        mappings.append(best_mapping)

    return mappings


def _build_mapping_warnings(mapped_fields: list[dict[str, object]]) -> list[str]:
    warnings = []
    for mapping in mapped_fields:
        if mapping["status"] != "mapped":
            warnings.append(
                f"Could not confidently detect {mapping['field_name']}. Please check the header structure."
            )
    return warnings


def _score_field_against_column(
    field_key: str,
    series: pd.Series,
    column_name: str,
) -> tuple[float, str]:
    normalized_header = _normalize_text(column_name)
    if field_key in {"activity", "work_description"} and any(
        token in normalized_header for token in ("duration", "hours", "status", "in time", "out time")
    ):
        return 0.0, "Header is closer to punch or duration data than work activity."

    keywords = FIELD_CONFIGS[field_key]["keywords"]
    header_score = _header_keyword_score(normalized_header, keywords)
    sample_values = [_stringify_value(value) for value in series.dropna().head(8).tolist() if not _is_empty(value)]
    value_score, value_reason = _value_based_score(field_key, sample_values, series)

    confidence = min(0.99, header_score + value_score)
    reason_parts = []
    if header_score > 0:
        reason_parts.append(f"Header matches {column_name}.")
    if value_reason:
        reason_parts.append(value_reason)
    if not reason_parts:
        reason_parts.append("Header and sample values do not strongly support this mapping.")

    return confidence, " ".join(reason_parts)


def _header_keyword_score(normalized_header: str, keywords: list[str]) -> float:
    best_score = 0.0
    for keyword in keywords:
        if normalized_header == keyword:
            best_score = max(best_score, 0.72)
        elif keyword in normalized_header:
            best_score = max(best_score, 0.62)
    return best_score


def _value_based_score(
    field_key: str,
    sample_values: list[str],
    series: pd.Series,
) -> tuple[float, str]:
    raw_sample_values = series.dropna().head(12).tolist()

    if field_key == "date":
        ratio = _date_like_ratio(raw_sample_values)
        if ratio >= 0.7:
            return 0.26, "Sample values behave like calendar dates."
        return 0.0, ""

    if field_key == "day":
        ratio = _weekday_ratio(sample_values)
        if ratio >= 0.7:
            return 0.24, "Sample values are weekday names."
        return 0.0, ""

    if field_key == "employee_code":
        ratio = _employee_id_ratio(sample_values)
        if ratio >= 0.65:
            return 0.2, "Sample values follow an employee code or ID pattern."
        return 0.0, ""

    if field_key == "employee_name":
        ratio = _person_name_ratio(sample_values)
        if ratio >= 0.65:
            return 0.18, "Sample values look like person names."
        return 0.0, ""

    if field_key == "gender":
        ratio = _gender_ratio(sample_values)
        if ratio >= 0.6:
            return 0.2, "Sample values look like gender labels."
        return 0.0, ""

    if field_key == "in_time" or field_key == "out_time":
        ratio = _time_like_ratio(raw_sample_values)
        if ratio >= 0.65:
            return 0.24, "Sample values behave like punch times."
        return 0.0, ""

    if field_key == "work_duration":
        ratio = _duration_like_ratio(raw_sample_values)
        if ratio >= 0.65:
            return 0.24, "Sample values behave like work durations or hour totals."
        return 0.0, ""

    if field_key == "attendance_status":
        ratio = _status_ratio(sample_values)
        if ratio >= 0.45:
            return 0.18, "Sample values look like attendance status labels."
        return 0.0, ""

    if field_key == "location":
        ratio = _location_ratio(sample_values)
        if ratio >= 0.55:
            return 0.22, "Sample values look like units, locations, or district labels."
        return 0.0, ""

    if field_key == "activity":
        ratio = _activity_ratio(sample_values)
        if ratio >= 0.5:
            return 0.18, "Sample values look like short work or activity entries."
        return 0.0, ""

    if field_key == "work_description":
        ratio = _description_ratio(sample_values)
        if ratio >= 0.45:
            return 0.22, "Sample values look like longer work descriptions."
        return 0.0, ""

    if field_key == "remarks":
        non_empty_ratio = len(sample_values) / max(len(series.dropna().head(12).tolist()), 1)
        if non_empty_ratio <= 0.5:
            return 0.08, "The column is often blank, which is common for remarks."
        return 0.0, ""

    return 0.0, ""


def _date_like_ratio(values: list[object]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        if _is_datetime_like_value(value):
            matches += 1
            continue

        text_value = _stringify_value(value)
        if not text_value:
            continue

        parsed = pd.to_datetime(text_value, errors="coerce")
        if not pd.isna(parsed):
            matches += 1

    return matches / len(values)


def _weekday_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        if _normalize_text(value) in WEEKDAY_NAMES:
            matches += 1
    return matches / len(values)


def _sequence_ratio(values: list[object]) -> float:
    numeric_values = []
    for value in values:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric_values.append(int(value))
        else:
            text_value = _stringify_value(value)
            if text_value.isdigit():
                numeric_values.append(int(text_value))

    if len(numeric_values) < 2:
        return 0.0

    sequential_steps = 0
    for current, nxt in zip(numeric_values, numeric_values[1:]):
        if nxt - current == 1:
            sequential_steps += 1

    return sequential_steps / max(len(numeric_values) - 1, 1)


def _person_name_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        normalized = _normalize_text(value)
        if not normalized or normalized in WEEKDAY_NAMES:
            continue
        words = normalized.split()
        if 1 <= len(words) <= 4 and all(word.isalpha() for word in words):
            matches += 1
    return matches / len(values)


def _employee_id_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        cleaned = value.strip()
        if re.fullmatch(r"[A-Za-z0-9._/-]{2,20}", cleaned):
            matches += 1
    return matches / len(values)


def _time_like_ratio(values: list[object]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        if isinstance(value, pd.Timestamp):
            matches += 1
            continue
        if isinstance(value, datetime):
            matches += 1
            continue
        if isinstance(value, (int, float)) and 0 <= float(value) < 2:
            matches += 1
            continue

        text_value = _stringify_value(value)
        if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?(\s?[AaPp][Mm])?", text_value):
            matches += 1
            continue

        parsed = pd.to_datetime(text_value, errors="coerce")
        if not pd.isna(parsed) and (parsed.hour or parsed.minute or parsed.second):
            matches += 1

    return matches / len(values)


def _duration_like_ratio(values: list[object]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        if isinstance(value, pd.Timedelta):
            matches += 1
            continue
        if isinstance(value, (int, float)) and -1 <= float(value) <= 24:
            matches += 1
            continue
        text_value = _stringify_value(value)
        if re.fullmatch(r"-?\d{1,2}:\d{2}(:\d{2})?", text_value):
            matches += 1
            continue
        if re.fullmatch(r"-?\d+(\.\d+)?", text_value):
            numeric = float(text_value)
            if -1 <= numeric <= 24:
                matches += 1

    return matches / len(values)


def _status_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        normalized = _normalize_text(value)
        if not normalized:
            continue
        if any(token in normalized for token in STATUS_TOKENS):
            matches += 1
    return matches / len(values)


def _location_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    tokens = ("district", "office", "site", "branch", "ward", "block", "division", "taluka", "unit")
    matches = 0
    for value in values:
        normalized = _normalize_text(value)
        if not normalized:
            continue
        if any(token in normalized for token in tokens) or 1 <= len(normalized.split()) <= 5:
            matches += 1
    return matches / len(values)


def _gender_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        normalized = _normalize_text(value)
        if normalized in GENDER_TOKENS:
            matches += 1

    return matches / len(values)


def _activity_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        if 3 <= len(normalized) <= 120 and len(normalized.split()) <= 20:
            matches += 1
    return matches / len(values)


def _description_ratio(values: list[str]) -> float:
    if not values:
        return 0.0

    matches = 0
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        if len(normalized) >= 24 or "\n" in normalized:
            matches += 1
    return matches / len(values)


def _clean_header_value(value: object) -> str:
    if _is_empty(value):
        return ""
    header = _stringify_value(value).replace("\n", " ")
    header = re.sub(r"\s+", " ", header).strip()
    if header.lower().startswith("unnamed:"):
        return ""
    return header


def _strip_string_value(value: object) -> object:
    if isinstance(value, str):
        stripped = re.sub(r"\s+", " ", value.replace("\n", " ")).strip()
        return stripped or None
    return value


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().replace("_", " ").replace("/", " ").split())


def _stringify_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value).strip()


def _is_empty(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and pd.isna(value):
        return True
    return isinstance(value, str) and value.strip() == ""


def _is_numeric_like_text(value: str) -> bool:
    cleaned = value.strip().replace(",", "")
    return bool(cleaned) and bool(re.fullmatch(r"[0-9]+(\.[0-9]+)?", cleaned))


def _is_datetime_like_value(value: object) -> bool:
    return isinstance(value, (pd.Timestamp, datetime, date))
