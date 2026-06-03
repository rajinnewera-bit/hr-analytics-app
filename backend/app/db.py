import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import APP_DB_PATH


SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS employees (
        employee_code TEXT PRIMARY KEY,
        employee_name TEXT NOT NULL,
        department TEXT NOT NULL DEFAULT '',
        designation TEXT NOT NULL DEFAULT '',
        salary_mode TEXT NOT NULL DEFAULT 'Bank',
        unit TEXT NOT NULL DEFAULT 'Bath & Sanitary',
        doj TEXT NOT NULL DEFAULT '',
        gross_monthly_salary REAL NOT NULL DEFAULT 0,
        opening_leave_balance REAL NOT NULL DEFAULT 0,
        leave_accrued REAL NOT NULL DEFAULT 0,
        leave_availed REAL NOT NULL DEFAULT 0,
        closing_leave_balance REAL NOT NULL DEFAULT 0,
        comp_off_balance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS salary_components (
        id TEXT PRIMARY KEY,
        component_name TEXT NOT NULL,
        percentage REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_verification_aliases (
        id TEXT PRIMARY KEY,
        employee_code TEXT NOT NULL,
        attendance_name TEXT NOT NULL,
        master_name TEXT NOT NULL,
        normalized_attendance_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_employee_name
    ON attendance_verification_aliases (employee_code, normalized_attendance_name)
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_verification_decisions (
        id TEXT PRIMARY KEY,
        employee_code TEXT NOT NULL,
        attendance_name TEXT NOT NULL,
        master_name TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        remarks TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL,
        acted_at TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_decision_employee_code
    ON attendance_verification_decisions (employee_code)
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_merge_rules (
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        merge_instructions_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (dataset_key, sheet_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_review_decisions (
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        review_decisions_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (dataset_key, sheet_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_policy_rules (
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        policy_rules_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (dataset_key, sheet_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_holiday_markers (
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        holiday_markers_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (dataset_key, sheet_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_administrative_exceptions (
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        administrative_exceptions_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (dataset_key, sheet_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS attendance_saved_audit_log (
        id TEXT PRIMARY KEY,
        dataset_key TEXT NOT NULL,
        sheet_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        employee TEXT NOT NULL DEFAULT '',
        previous_value TEXT NOT NULL DEFAULT '',
        new_value TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_attendance_saved_audit_log_dataset_sheet
    ON attendance_saved_audit_log (dataset_key, sheet_name, created_at DESC)
    """,
)


def _ensure_parent_dir() -> None:
    Path(APP_DB_PATH).parent.mkdir(parents=True, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    _ensure_parent_dir()
    connection = sqlite3.connect(APP_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def db_cursor() -> Iterator[sqlite3.Connection]:
    connection = get_connection()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_database() -> None:
    with db_cursor() as connection:
        for statement in SCHEMA_STATEMENTS:
            connection.execute(statement)
