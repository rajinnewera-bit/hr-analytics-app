from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any
from uuid import uuid4

from app.db import db_cursor
from app.schemas.upload import (
    AttendanceAdministrativeException,
    AttendanceAuditLogItem,
    AttendanceHolidayMarker,
    AttendanceMergeInstruction,
    AttendancePolicyRule,
    AttendanceReviewDecision,
    AttendanceWorkingRuleState,
)


DEFAULT_ACTOR = "HR Operator"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_dataset_key(file_hash: str, original_file_name: str) -> str:
    normalized_hash = (file_hash or "").strip()
    normalized_name = (original_file_name or "").strip()
    return f"{normalized_hash}:{normalized_name}" if normalized_hash else normalized_name


def load_saved_rule_state(dataset_key: str, sheet_name: str) -> AttendanceWorkingRuleState:
    normalized_dataset_key = dataset_key.strip()
    normalized_sheet_name = sheet_name.strip()
    if not normalized_dataset_key or not normalized_sheet_name:
      return AttendanceWorkingRuleState(
          dataset_key=normalized_dataset_key,
          sheet_name=normalized_sheet_name,
      )

    with db_cursor() as connection:
        merge_row = connection.execute(
            """
            SELECT merge_instructions_json, updated_at, updated_by
            FROM attendance_saved_merge_rules
            WHERE dataset_key = ? AND sheet_name = ?
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchone()
        decision_row = connection.execute(
            """
            SELECT review_decisions_json, updated_at, updated_by
            FROM attendance_saved_review_decisions
            WHERE dataset_key = ? AND sheet_name = ?
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchone()
        policy_row = connection.execute(
            """
            SELECT policy_rules_json, updated_at, updated_by
            FROM attendance_saved_policy_rules
            WHERE dataset_key = ? AND sheet_name = ?
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchone()
        holiday_row = connection.execute(
            """
            SELECT holiday_markers_json, updated_at, updated_by
            FROM attendance_saved_holiday_markers
            WHERE dataset_key = ? AND sheet_name = ?
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchone()
        administrative_row = connection.execute(
            """
            SELECT administrative_exceptions_json, updated_at, updated_by
            FROM attendance_saved_administrative_exceptions
            WHERE dataset_key = ? AND sheet_name = ?
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchone()

    saved_at = ""
    saved_by = ""
    candidate_rows = [merge_row, decision_row, policy_row, holiday_row, administrative_row]
    for row in candidate_rows:
        if row is None:
            continue
        saved_at = row["updated_at"] or saved_at
        saved_by = row["updated_by"] or saved_by

    return AttendanceWorkingRuleState(
        dataset_key=normalized_dataset_key,
        sheet_name=normalized_sheet_name,
        merge_instructions=_parse_model_list(
            merge_row["merge_instructions_json"] if merge_row else "[]",
            AttendanceMergeInstruction,
        ),
        review_decisions=_parse_model_list(
            decision_row["review_decisions_json"] if decision_row else "[]",
            AttendanceReviewDecision,
        ),
        policy_rules=_parse_model_list(
            policy_row["policy_rules_json"] if policy_row else "[]",
            AttendancePolicyRule,
        ),
        holiday_markers=_parse_model_list(
            holiday_row["holiday_markers_json"] if holiday_row else "[]",
            AttendanceHolidayMarker,
        ),
        administrative_exceptions=_parse_model_list(
            administrative_row["administrative_exceptions_json"] if administrative_row else "[]",
            AttendanceAdministrativeException,
        ),
        saved_at=saved_at,
        saved_by=saved_by,
    )


def list_audit_log(dataset_key: str, sheet_name: str) -> list[AttendanceAuditLogItem]:
    normalized_dataset_key = dataset_key.strip()
    normalized_sheet_name = sheet_name.strip()
    if not normalized_dataset_key or not normalized_sheet_name:
        return []

    with db_cursor() as connection:
        rows = connection.execute(
            """
            SELECT id, action_type, employee, previous_value, new_value, details, actor, created_at
            FROM attendance_saved_audit_log
            WHERE dataset_key = ? AND sheet_name = ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (normalized_dataset_key, normalized_sheet_name),
        ).fetchall()

    return [
        AttendanceAuditLogItem(
            id=row["id"],
            timestamp=row["created_at"],
            action_type=row["action_type"],
            employee=row["employee"],
            previous_value=row["previous_value"],
            new_value=row["new_value"],
            details=row["details"],
            actor=row["actor"],
        )
        for row in rows
    ]


def save_rule_state(
    dataset_key: str,
    sheet_name: str,
    state: AttendanceWorkingRuleState,
    actor: str,
) -> AttendanceWorkingRuleState:
    normalized_dataset_key = dataset_key.strip()
    normalized_sheet_name = sheet_name.strip()
    effective_actor = actor.strip() or DEFAULT_ACTOR
    now = _now_iso()
    existing_state = load_saved_rule_state(normalized_dataset_key, normalized_sheet_name)

    with db_cursor() as connection:
        connection.execute(
            """
            INSERT INTO attendance_saved_merge_rules (
                dataset_key, sheet_name, merge_instructions_json, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dataset_key, sheet_name) DO UPDATE SET
                merge_instructions_json = excluded.merge_instructions_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (
                normalized_dataset_key,
                normalized_sheet_name,
                _dump_models(state.merge_instructions),
                now,
                effective_actor,
            ),
        )
        connection.execute(
            """
            INSERT INTO attendance_saved_review_decisions (
                dataset_key, sheet_name, review_decisions_json, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dataset_key, sheet_name) DO UPDATE SET
                review_decisions_json = excluded.review_decisions_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (
                normalized_dataset_key,
                normalized_sheet_name,
                _dump_models(state.review_decisions),
                now,
                effective_actor,
            ),
        )
        connection.execute(
            """
            INSERT INTO attendance_saved_policy_rules (
                dataset_key, sheet_name, policy_rules_json, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dataset_key, sheet_name) DO UPDATE SET
                policy_rules_json = excluded.policy_rules_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (
                normalized_dataset_key,
                normalized_sheet_name,
                _dump_models(state.policy_rules),
                now,
                effective_actor,
            ),
        )
        connection.execute(
            """
            INSERT INTO attendance_saved_holiday_markers (
                dataset_key, sheet_name, holiday_markers_json, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dataset_key, sheet_name) DO UPDATE SET
                holiday_markers_json = excluded.holiday_markers_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (
                normalized_dataset_key,
                normalized_sheet_name,
                _dump_models(state.holiday_markers),
                now,
                effective_actor,
            ),
        )
        connection.execute(
            """
            INSERT INTO attendance_saved_administrative_exceptions (
                dataset_key, sheet_name, administrative_exceptions_json, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dataset_key, sheet_name) DO UPDATE SET
                administrative_exceptions_json = excluded.administrative_exceptions_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """,
            (
                normalized_dataset_key,
                normalized_sheet_name,
                _dump_models(state.administrative_exceptions),
                now,
                effective_actor,
            ),
        )
        for audit_entry in _build_audit_entries(
            existing_state=existing_state,
            next_state=state,
            actor=effective_actor,
            created_at=now,
        ):
            connection.execute(
                """
                INSERT INTO attendance_saved_audit_log (
                    id, dataset_key, sheet_name, action_type, employee,
                    previous_value, new_value, details, actor, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    audit_entry.id,
                    normalized_dataset_key,
                    normalized_sheet_name,
                    audit_entry.action_type,
                    audit_entry.employee,
                    audit_entry.previous_value,
                    audit_entry.new_value,
                    audit_entry.details,
                    audit_entry.actor,
                    audit_entry.timestamp,
                ),
            )

    return AttendanceWorkingRuleState(
        dataset_key=normalized_dataset_key,
        sheet_name=normalized_sheet_name,
        merge_instructions=state.merge_instructions,
        review_decisions=state.review_decisions,
        policy_rules=state.policy_rules,
        holiday_markers=state.holiday_markers,
        administrative_exceptions=state.administrative_exceptions,
        saved_at=now,
        saved_by=effective_actor,
    )


def resolve_rule_state(
    *,
    dataset_key: str,
    sheet_name: str,
    merge_instructions: list[AttendanceMergeInstruction] | None = None,
    review_decisions: list[AttendanceReviewDecision] | None = None,
    policy_rules: list[AttendancePolicyRule] | None = None,
    holiday_markers: list[AttendanceHolidayMarker] | None = None,
    administrative_exceptions: list[AttendanceAdministrativeException] | None = None,
) -> AttendanceWorkingRuleState:
    saved_state = load_saved_rule_state(dataset_key, sheet_name)
    return AttendanceWorkingRuleState(
        dataset_key=dataset_key,
        sheet_name=sheet_name,
        merge_instructions=merge_instructions if merge_instructions is not None else saved_state.merge_instructions,
        review_decisions=review_decisions if review_decisions is not None else saved_state.review_decisions,
        policy_rules=policy_rules if policy_rules is not None else saved_state.policy_rules,
        holiday_markers=holiday_markers if holiday_markers is not None else saved_state.holiday_markers,
        administrative_exceptions=(
            administrative_exceptions
            if administrative_exceptions is not None
            else saved_state.administrative_exceptions
        ),
        saved_at=saved_state.saved_at,
        saved_by=saved_state.saved_by,
    )


def _parse_model_list(raw_json: str, model_type):
    try:
        payload = json.loads(raw_json or "[]")
    except json.JSONDecodeError:
        payload = []
    if not isinstance(payload, list):
        payload = []
    return [model_type(**item) if isinstance(item, dict) else item for item in payload]


def _dump_models(items: list[Any]) -> str:
    return json.dumps(
        [
            item.model_dump() if hasattr(item, "model_dump") else item
            for item in items
        ],
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _build_audit_entries(
    *,
    existing_state: AttendanceWorkingRuleState,
    next_state: AttendanceWorkingRuleState,
    actor: str,
    created_at: str,
) -> list[AttendanceAuditLogItem]:
    entries: list[AttendanceAuditLogItem] = []
    sections = [
        (
            "merge",
            existing_state.merge_instructions,
            next_state.merge_instructions,
            _merge_audit_identity,
            _merge_audit_log_item,
        ),
        (
            "review",
            existing_state.review_decisions,
            next_state.review_decisions,
            lambda item: item.exception_id,
            _review_audit_log_item,
        ),
        (
            "holiday",
            existing_state.holiday_markers,
            next_state.holiday_markers,
            lambda item: f"{item.date}:{item.holiday_type}",
            _holiday_audit_log_item,
        ),
        (
            "administrative_exception",
            existing_state.administrative_exceptions,
            next_state.administrative_exceptions,
            _administrative_exception_identity,
            _administrative_exception_audit_log_item,
        ),
        (
            "policy_rule",
            existing_state.policy_rules,
            next_state.policy_rules,
            lambda item: item.rule_id,
            _policy_rule_audit_log_item,
        ),
    ]
    for action_type, previous_items, new_items, identity_fn, item_builder in sections:
        previous_map = {identity_fn(item): item for item in previous_items}
        new_map = {identity_fn(item): item for item in new_items}
        for identity in sorted(set(previous_map) | set(new_map)):
            previous_item = previous_map.get(identity)
            new_item = new_map.get(identity)
            if previous_item is not None and new_item is not None and _dump_models([previous_item]) == _dump_models([new_item]):
                continue
            entries.append(
                item_builder(
                    previous_item=previous_item,
                    new_item=new_item,
                    actor=actor,
                    created_at=created_at,
                    action_type=action_type,
                )
            )
    return entries


def _merge_audit_identity(item: AttendanceMergeInstruction) -> str:
    return "|".join(
        [
            item.final_employee_name.strip().lower(),
            (item.final_employee_code or "").strip().lower(),
            ",".join(sorted(name.strip().lower() for name in (item.sources.source_names or []))),
            ",".join(sorted(code.strip().lower() for code in (item.sources.source_codes or []))),
        ]
    )


def _administrative_exception_identity(item: AttendanceAdministrativeException) -> str:
    return "|".join(
        [
            item.date,
            item.scope,
            item.treatment_type,
            item.unit_name,
            ",".join(item.employee_ids),
            item.custom_status_label,
        ]
    )


def _merge_audit_log_item(*, previous_item, new_item, actor: str, created_at: str, action_type: str):
    previous_label = _merge_label(previous_item) if previous_item else ""
    new_label = _merge_label(new_item) if new_item else ""
    employee = ""
    if new_item is not None:
        employee = new_item.final_employee_name
    elif previous_item is not None:
        employee = previous_item.final_employee_name
    details = (
        f"Merge Created: {new_label}"
        if previous_item is None
        else f"Merge Removed: {previous_label}"
        if new_item is None
        else f"Merge Updated: {previous_label} -> {new_label}"
    )
    return AttendanceAuditLogItem(
        id=f"audit_{uuid4().hex}",
        timestamp=created_at,
        action_type=action_type,
        employee=employee,
        previous_value=previous_label,
        new_value=new_label,
        details=details,
        actor=actor,
    )


def _review_audit_log_item(*, previous_item, new_item, actor: str, created_at: str, action_type: str):
    previous_label = _review_label(previous_item) if previous_item else ""
    new_label = _review_label(new_item) if new_item else ""
    details = (
        f"Regularization Saved: {new_label}"
        if previous_item is None
        else f"Regularization Removed: {previous_label}"
        if new_item is None
        else f"Regularization Updated: {previous_label} -> {new_label}"
    )
    return AttendanceAuditLogItem(
        id=f"audit_{uuid4().hex}",
        timestamp=created_at,
        action_type=action_type,
        employee=(new_item or previous_item).exception_id if (new_item or previous_item) else "",
        previous_value=previous_label,
        new_value=new_label,
        details=details,
        actor=actor,
    )


def _holiday_audit_log_item(*, previous_item, new_item, actor: str, created_at: str, action_type: str):
    previous_label = _holiday_label(previous_item) if previous_item else ""
    new_label = _holiday_label(new_item) if new_item else ""
    details = (
        f"Holiday Adjustment Saved: {new_label}"
        if previous_item is None
        else f"Holiday Adjustment Removed: {previous_label}"
        if new_item is None
        else f"Holiday Adjustment Updated: {previous_label} -> {new_label}"
    )
    return AttendanceAuditLogItem(
        id=f"audit_{uuid4().hex}",
        timestamp=created_at,
        action_type=action_type,
        employee=(new_item or previous_item).date if (new_item or previous_item) else "",
        previous_value=previous_label,
        new_value=new_label,
        details=details,
        actor=actor,
    )


def _administrative_exception_audit_log_item(
    *,
    previous_item,
    new_item,
    actor: str,
    created_at: str,
    action_type: str,
):
    previous_label = _administrative_exception_label(previous_item) if previous_item else ""
    new_label = _administrative_exception_label(new_item) if new_item else ""
    details = (
        f"Payroll Correction Saved: {new_label}"
        if previous_item is None
        else f"Payroll Correction Removed: {previous_label}"
        if new_item is None
        else f"Payroll Correction Updated: {previous_label} -> {new_label}"
    )
    return AttendanceAuditLogItem(
        id=f"audit_{uuid4().hex}",
        timestamp=created_at,
        action_type=action_type,
        employee=(new_item or previous_item).date if (new_item or previous_item) else "",
        previous_value=previous_label,
        new_value=new_label,
        details=details,
        actor=actor,
    )


def _policy_rule_audit_log_item(*, previous_item, new_item, actor: str, created_at: str, action_type: str):
    previous_label = _policy_rule_label(previous_item) if previous_item else ""
    new_label = _policy_rule_label(new_item) if new_item else ""
    details = (
        f"Policy Rule Saved: {new_label}"
        if previous_item is None
        else f"Policy Rule Removed: {previous_label}"
        if new_item is None
        else f"Policy Rule Updated: {previous_label} -> {new_label}"
    )
    return AttendanceAuditLogItem(
        id=f"audit_{uuid4().hex}",
        timestamp=created_at,
        action_type=action_type,
        employee=(new_item or previous_item).label if (new_item or previous_item) else "",
        previous_value=previous_label,
        new_value=new_label,
        details=details,
        actor=actor,
    )


def _merge_label(item: AttendanceMergeInstruction) -> str:
    sources = list(item.sources.source_names or []) + list(item.sources.source_codes or [])
    source_text = ", ".join(sorted(source for source in sources if source))
    final_label = item.final_employee_name
    if item.final_employee_code:
        final_label = f"{final_label} ({item.final_employee_code})"
    return f"{source_text} -> {final_label}"


def _review_label(item: AttendanceReviewDecision) -> str:
    comment = (item.reason or item.remarks or "").strip()
    return f"{item.exception_id}: {item.action_key}" + (f" [{comment}]" if comment else "")


def _holiday_label(item: AttendanceHolidayMarker) -> str:
    return f"{item.date}: {item.holiday_type}"


def _administrative_exception_label(item: AttendanceAdministrativeException) -> str:
    scope_label = item.scope
    if item.scope == "selected_employees" and item.employee_ids:
        scope_label = f"{scope_label} ({', '.join(item.employee_ids)})"
    elif item.scope == "specific_unit" and item.unit_name:
        scope_label = f"{scope_label} ({item.unit_name})"
    return f"{item.date}: {item.treatment_type} - {scope_label}"


def _policy_rule_label(item: AttendancePolicyRule) -> str:
    status_label = "enabled" if item.enabled else "disabled"
    return f"{item.label}: {item.value} ({status_label})"
