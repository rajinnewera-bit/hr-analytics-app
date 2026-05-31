from datetime import datetime, timezone
import re
import sqlite3
from typing import Optional
from uuid import uuid4

from app.db import db_cursor
from app.schemas.hr_master import (
    AttendanceNameAliasRecord,
    AttendanceVerificationAliasRequest,
    AttendanceVerificationApproveRequest,
    AttendanceVerificationDecisionRecord,
    AttendanceVerificationRejectRequest,
    AttendanceVerificationStoreResponse,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_employee_name(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", "", (value or "").lower().strip())).strip()


def _row_to_alias(row: sqlite3.Row) -> AttendanceNameAliasRecord:
    return AttendanceNameAliasRecord(
        id=row["id"],
        employee_code=row["employee_code"],
        attendance_name=row["attendance_name"],
        master_name=row["master_name"],
        normalized_attendance_name=row["normalized_attendance_name"],
        created_at=row["created_at"],
        created_by=row["created_by"],
    )


def _row_to_decision(row: sqlite3.Row) -> AttendanceVerificationDecisionRecord:
    return AttendanceVerificationDecisionRecord(
        id=row["id"],
        employee_code=row["employee_code"],
        attendance_name=row["attendance_name"],
        master_name=row["master_name"],
        action=row["action"],
        status=row["status"],
        remarks=row["remarks"],
        actor=row["actor"],
        acted_at=row["acted_at"],
    )


def load_verification_store() -> AttendanceVerificationStoreResponse:
    with db_cursor() as connection:
        alias_rows = connection.execute(
            """
            SELECT id, employee_code, attendance_name, master_name,
                   normalized_attendance_name, created_at, created_by
            FROM attendance_verification_aliases
            ORDER BY created_at DESC
            """
        ).fetchall()
        decision_rows = connection.execute(
            """
            SELECT id, employee_code, attendance_name, master_name, action, status,
                   remarks, actor, acted_at
            FROM attendance_verification_decisions
            ORDER BY acted_at DESC, created_at DESC
            """
        ).fetchall()
    return AttendanceVerificationStoreResponse(
        version=1,
        aliases=[_row_to_alias(row) for row in alias_rows],
        decisions=[_row_to_decision(row) for row in decision_rows],
    )


def list_employee_history(employee_code: str) -> list[AttendanceVerificationDecisionRecord]:
    with db_cursor() as connection:
        rows = connection.execute(
            """
            SELECT id, employee_code, attendance_name, master_name, action, status,
                   remarks, actor, acted_at
            FROM attendance_verification_decisions
            WHERE lower(employee_code) = lower(?)
            ORDER BY acted_at DESC, created_at DESC
            """,
            (employee_code.strip(),),
        ).fetchall()
    return [_row_to_decision(row) for row in rows]


def approve_employee_match(
    payload: AttendanceVerificationApproveRequest,
) -> AttendanceVerificationStoreResponse:
    _insert_decision(
        employee_code=payload.employee_code,
        attendance_name=payload.attendance_name,
        master_name=payload.master_name,
        action="approved",
        status="manually_approved",
        remarks=payload.remarks,
        actor=payload.actor,
    )
    return load_verification_store()


def reject_employee_match(
    payload: AttendanceVerificationRejectRequest,
) -> AttendanceVerificationStoreResponse:
    _insert_decision(
        employee_code=payload.employee_code,
        attendance_name=payload.attendance_name,
        master_name=payload.master_name,
        action="rejected",
        status="rejected",
        remarks=payload.remarks,
        actor=payload.actor,
    )
    return load_verification_store()


def create_alias_mapping(
    payload: AttendanceVerificationAliasRequest,
) -> AttendanceVerificationStoreResponse:
    employee_code = payload.employee_code.strip()
    attendance_name = payload.attendance_name.strip()
    master_name = payload.master_name.strip()
    normalized_name = normalize_employee_name(attendance_name)
    actor = payload.actor.strip() or "HR Operator"
    now = _now_iso()

    with db_cursor() as connection:
        connection.execute(
            """
            DELETE FROM attendance_verification_aliases
            WHERE lower(employee_code) = lower(?) AND normalized_attendance_name = ?
            """,
            (employee_code, normalized_name),
        )
        connection.execute(
            """
            INSERT INTO attendance_verification_aliases (
                id, employee_code, attendance_name, master_name,
                normalized_attendance_name, created_at, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"alias_{uuid4().hex}",
                employee_code,
                attendance_name,
                master_name,
                normalized_name,
                now,
                actor,
            ),
        )

    _insert_decision(
        employee_code=employee_code,
        attendance_name=attendance_name,
        master_name=master_name,
        action="alias_created",
        status="manually_approved",
        remarks=payload.remarks.strip()
        or f'Alias created: "{attendance_name}" maps to master name "{master_name}".',
        actor=actor,
        acted_at=now,
    )

    if payload.remarks.strip():
        _insert_decision(
            employee_code=employee_code,
            attendance_name=attendance_name,
            master_name=master_name,
            action="approved",
            status="manually_approved",
            remarks=payload.remarks.strip(),
            actor=actor,
        )

    return load_verification_store()


def _insert_decision(
    *,
    employee_code: str,
    attendance_name: str,
    master_name: str,
    action: str,
    status: str,
    remarks: str,
    actor: str,
    acted_at: Optional[str] = None,
) -> None:
    with db_cursor() as connection:
        connection.execute(
            """
            INSERT INTO attendance_verification_decisions (
                id, employee_code, attendance_name, master_name, action,
                status, remarks, actor, acted_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"decision_{uuid4().hex}",
                employee_code.strip(),
                attendance_name.strip(),
                master_name.strip(),
                action,
                status,
                remarks.strip(),
                actor.strip() or "HR Operator",
                acted_at or _now_iso(),
                _now_iso(),
            ),
        )
