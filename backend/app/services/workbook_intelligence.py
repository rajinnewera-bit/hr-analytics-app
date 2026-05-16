from collections import Counter
import logging
from pathlib import Path
from typing import Optional
import warnings

import pandas as pd

from app.schemas.upload import WorkbookSheetSummary

logger = logging.getLogger(__name__)

SHEET_TYPE_RULES = {
    "salary/payroll sheet": [
        "salary",
        "payroll",
        "department",
        "basic pay",
        "net pay",
        "gross pay",
        "ctc",
        "compensation",
    ],
    "attendance sheet": [
        "attendance",
        "timesheet",
        "date",
        "working day",
        "in time",
        "out time",
        "working hours",
        "shift",
        "work description",
        "activity",
        "location",
        "remarks",
    ],
    "sales sheet": [
        "sales",
        "revenue",
        "invoice",
        "customer",
        "order",
        "amount",
        "price",
    ],
    "purchase sheet": [
        "purchase",
        "supplier",
        "vendor",
        "procurement",
        "invoice",
        "cost",
        "quantity",
    ],
    "expense sheet": [
        "expense",
        "category",
        "reimbursement",
        "cost",
        "amount",
        "spent",
        "payment",
    ],
    "inventory/stock sheet": [
        "inventory",
        "stock",
        "sku",
        "warehouse",
        "item",
        "quantity",
        "balance",
    ],
}

DATE_COLUMN_KEYWORDS = [
    "date",
    "month",
    "year",
    "time",
    "in time",
    "out time",
]

AMOUNT_COLUMN_KEYWORDS = [
    "amount",
    "value",
    "salary",
    "total",
    "price",
    "cost",
    "expense",
    "revenue",
    "sales",
    "purchase",
    "balance",
    "pay",
]

ID_NAME_COLUMN_KEYWORDS = [
    "id",
    "name",
    "employee",
    "department",
    "customer",
    "vendor",
    "supplier",
    "item",
    "sku",
    "code",
]


def build_workbook_intelligence_summary(
    *,
    extension: str,
    file_path: Path,
    csv_dataframe: Optional[pd.DataFrame] = None,
    csv_sheet_name: str = "CSV Data",
    workbook: Optional[pd.ExcelFile] = None,
    parsed_sheets: Optional[dict[str, pd.DataFrame]] = None,
) -> list[WorkbookSheetSummary]:
    if extension == ".csv":
        if csv_dataframe is None:
            raise ValueError("CSV dataframe is required for workbook intelligence.")

        return [_analyze_sheet(csv_sheet_name, csv_dataframe)]

    workbook_handle = workbook or pd.ExcelFile(file_path, engine="openpyxl")
    cached_sheets = parsed_sheets or {}
    summaries: list[WorkbookSheetSummary] = []

    for sheet_name in workbook_handle.sheet_names:
        try:
            dataframe = cached_sheets.get(str(sheet_name))
            if dataframe is None:
                dataframe = workbook_handle.parse(sheet_name=sheet_name)
            summaries.append(_analyze_sheet(str(sheet_name), dataframe))
        except Exception:
            logger.exception("Workbook intelligence failed for sheet=%s", sheet_name)
            summaries.append(
                WorkbookSheetSummary(
                    sheet_name=str(sheet_name),
                    row_count=0,
                    column_count=0,
                    detected_column_names=[],
                    likely_sheet_type="unknown",
                    date_columns=[],
                    amount_value_columns=[],
                    id_name_columns=[],
                    warnings=["Sheet analysis failed"],
                )
            )

    return summaries


def _analyze_sheet(sheet_name: str, dataframe: pd.DataFrame) -> WorkbookSheetSummary:
    columns = _stringify_columns(dataframe.columns.tolist())
    normalized_columns = [_normalize_text(column) for column in columns]
    date_columns = _detect_date_columns(dataframe, columns)
    amount_value_columns = _detect_amount_columns(dataframe, columns)
    id_name_columns = _detect_id_name_columns(columns)
    likely_sheet_type = _detect_sheet_type(normalized_columns)
    warnings = _build_sheet_warnings(dataframe, columns, date_columns)

    return WorkbookSheetSummary(
        sheet_name=sheet_name,
        row_count=int(dataframe.shape[0]),
        column_count=int(dataframe.shape[1]),
        detected_column_names=columns,
        likely_sheet_type=likely_sheet_type,
        date_columns=date_columns,
        amount_value_columns=amount_value_columns,
        id_name_columns=id_name_columns,
        warnings=warnings,
    )


def _stringify_columns(raw_columns: list[object]) -> list[str]:
    stringified: list[str] = []

    for index, column in enumerate(raw_columns, start=1):
        if column is None or (isinstance(column, float) and pd.isna(column)):
            stringified.append(f"Unnamed Column {index}")
        else:
            text_value = str(column).strip()
            stringified.append(text_value if text_value else f"Unnamed Column {index}")

    return stringified


def _normalize_text(value: object) -> str:
    if value is None:
        return ""

    return " ".join(str(value).strip().lower().replace("_", " ").split())


def _detect_sheet_type(normalized_columns: list[str]) -> str:
    scores: dict[str, int] = {}

    for sheet_type, keywords in SHEET_TYPE_RULES.items():
        score = 0
        for column_name in normalized_columns:
            for keyword in keywords:
                if keyword in column_name:
                    score += 1
        scores[sheet_type] = score

    best_type = max(scores, key=scores.get)
    if scores[best_type] == 0:
        return "unknown"

    return best_type


def _detect_date_columns(dataframe: pd.DataFrame, columns: list[str]) -> list[str]:
    detected: list[str] = []

    for index, column in enumerate(columns):
        normalized_column = _normalize_text(column)
        series = dataframe.iloc[:, index]

        if any(keyword in normalized_column for keyword in DATE_COLUMN_KEYWORDS):
            detected.append(column)
            continue

        if pd.api.types.is_datetime64_any_dtype(series):
            detected.append(column)
            continue

        sample = series.dropna().head(5)
        if sample.empty:
            continue

        if not _sample_looks_like_datetime(sample):
            continue

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                parsed = pd.to_datetime(sample.astype(str), errors="coerce")
        except Exception:
            continue

        if parsed.notna().sum() >= max(1, len(sample) // 2):
            detected.append(column)

    return _deduplicate_preserve_order(detected)


def _detect_amount_columns(dataframe: pd.DataFrame, columns: list[str]) -> list[str]:
    detected: list[str] = []

    for index, column in enumerate(columns):
        normalized_column = _normalize_text(column)
        series = dataframe.iloc[:, index]

        if any(keyword in normalized_column for keyword in AMOUNT_COLUMN_KEYWORDS):
            detected.append(column)
            continue

        if pd.api.types.is_numeric_dtype(series):
            detected.append(column)

    return _deduplicate_preserve_order(detected)


def _detect_id_name_columns(columns: list[str]) -> list[str]:
    detected = []

    for column in columns:
        normalized_column = _normalize_text(column)
        if any(keyword in normalized_column for keyword in ID_NAME_COLUMN_KEYWORDS):
            detected.append(column)

    return _deduplicate_preserve_order(detected)


def _build_sheet_warnings(
    dataframe: pd.DataFrame,
    columns: list[str],
    date_columns: list[str],
) -> list[str]:
    warnings: list[str] = []

    if dataframe.empty or len(columns) == 0:
        warnings.append("Empty sheet")

    blank_rows = 0
    if not dataframe.empty:
        blank_ready = dataframe.copy()
        blank_ready = blank_ready.replace(r"^\s*$", pd.NA, regex=True)
        blank_rows = int(blank_ready.isna().all(axis=1).sum())

    if dataframe.shape[0] > 0 and blank_rows / max(dataframe.shape[0], 1) >= 0.25:
        warnings.append("Too many blank rows")

    normalized_columns = [_normalize_text(column) for column in columns if _normalize_text(column)]
    duplicate_columns = [
        column_name for column_name, count in Counter(normalized_columns).items() if count > 1
    ]
    if duplicate_columns:
        warnings.append("Duplicate column names")

    numeric_column_count = int(dataframe.select_dtypes(include=["number"]).shape[1])
    if numeric_column_count == 0:
        warnings.append("No numeric columns")

    if not date_columns:
        warnings.append("No date columns")

    return warnings


def _deduplicate_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduplicated: list[str] = []

    for value in values:
        if value in seen:
            continue
        seen.add(value)
        deduplicated.append(value)

    return deduplicated


def _sample_looks_like_datetime(sample: pd.Series) -> bool:
    month_tokens = {
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
    }
    likely_matches = 0

    for raw_value in sample.tolist():
        text_value = str(raw_value).strip().lower()
        if not text_value:
            continue

        has_date_separator = any(separator in text_value for separator in ("-", "/", ":"))
        has_month_token = any(month in text_value for month in month_tokens)
        digit_count = sum(character.isdigit() for character in text_value)

        if (has_date_separator and digit_count >= 3) or has_month_token:
            likely_matches += 1

    return likely_matches >= max(1, len(sample) // 2)
