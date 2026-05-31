"""
Attendance merge workflow for consolidating multiple employee identities into one.

This module provides safe merging of attendance records where the same employee
may have punched in under different names or biometric IDs. The merge operation:

1. Maps multiple source names/codes to a single final employee identity.
2. Preserves original identities in the output (original_employee_names, original_employee_codes).
3. For records on the same date with the same final employee:
   - Uses earliest IN time and latest OUT time.
   - Recomputes work duration.
   - Merges remarks, anomaly flags, and source row numbers.
4. Leaves the rest of the attendance processing pipeline unchanged (anomalies, classification, payroll).
"""

from dataclasses import replace
from typing import Optional

from app.schemas.upload import (
    AttendanceMergeInstruction,
    AttendanceEmployeeMergeSource,
)
from app.services.attendance_ingestion import AttendanceNormalizedRecord


def _get_record_list_attr(record: AttendanceNormalizedRecord, attribute: str) -> list[str]:
    value = getattr(record, attribute, None)
    if not value:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return []


def _set_record_list_attr(record: AttendanceNormalizedRecord, attribute: str, value: list[str]) -> None:
    # AttendanceNormalizedRecord may not define merge-tracking fields in older paths.
    # Assigning dynamically keeps merge compatible without altering ingestion contracts.
    setattr(record, attribute, value)


def apply_employee_merges(
    records: list[AttendanceNormalizedRecord],
    merge_instructions: list[AttendanceMergeInstruction],
) -> list[AttendanceNormalizedRecord]:
    """
    Apply employee merge instructions to normalized attendance records.

    For each merge instruction:
    - Identify all records matching source employee names/codes.
    - Remap them to the final employee name/code.
    - For records on the same date, merge them into a single record.
    - Preserve original identities in the output.

    Args:
        records: List of AttendanceNormalizedRecord from ingestion.
        merge_instructions: List of merge instructions specifying source->final mappings.

    Returns:
        List of records with merges applied. Order may change due to grouping/merging.
    """
    if not merge_instructions:
        return records

    # Build a mapping from source (normalized) identities to final identities.
    identity_map: dict[tuple[str, str], tuple[str, Optional[str]]] = {}

    for instruction in merge_instructions:
        final_name = (instruction.final_employee_name or "").strip()
        final_code = (instruction.final_employee_code or "").strip() if instruction.final_employee_code else None

        if not final_name:
            continue

        sources = instruction.sources or AttendanceEmployeeMergeSource()
        source_names = [name.strip() for name in (sources.source_names or []) if name.strip()]
        source_codes = [code.strip() for code in (sources.source_codes or []) if code.strip()]

        # Normalize source identities: lowercase and trimmed.
        for source_name in source_names:
            normalized_source = (source_name.lower(), "")
            identity_map[normalized_source] = (final_name, final_code)

        for source_code in source_codes:
            normalized_source = ("", source_code.lower())
            identity_map[normalized_source] = (final_name, final_code)

    if not identity_map:
        return records

    # Remap records and collect originals.
    remapped_records: list[AttendanceNormalizedRecord] = []

    for record in records:
        # Check if this record matches a merge source.
        record_name_lower = (record.employee_name or "").strip().lower() if record.employee_name else ""
        record_code_lower = (record.employee_code or "").strip().lower() if record.employee_code else ""

        final_name, final_code = None, None

        # Try code-based match first (higher priority).
        if record_code_lower:
            key = ("", record_code_lower)
            if key in identity_map:
                final_name, final_code = identity_map[key]

        # If no code match, try name-based match.
        if final_name is None and record_name_lower:
            key = (record_name_lower, "")
            if key in identity_map:
                final_name, final_code = identity_map[key]

        # If a merge is found, remap the record and track original identities.
        if final_name is not None:
            remapped_record = replace(record)

            # Track original identities.
            original_names = []
            if record.employee_name and record.employee_name != final_name:
                original_names.append(record.employee_name)
            original_names.extend(_get_record_list_attr(remapped_record, "original_employee_names"))
            original_names = list(dict.fromkeys(original_names))  # Deduplicate.

            original_codes = []
            if record.employee_code and record.employee_code != final_code:
                original_codes.append(record.employee_code)
            original_codes.extend(_get_record_list_attr(remapped_record, "original_employee_codes"))
            original_codes = list(dict.fromkeys(original_codes))

            remapped_record.employee_name = final_name
            remapped_record.employee_code = final_code or ""
            _set_record_list_attr(remapped_record, "original_employee_names", original_names)
            _set_record_list_attr(remapped_record, "original_employee_codes", original_codes)
            remapped_records.append(remapped_record)
        else:
            remapped_records.append(record)

    # Group records by (employee_key, date) and merge same-day entries.
    merged_records = _merge_same_day_records(remapped_records)
    return merged_records


def _merge_same_day_records(
    records: list[AttendanceNormalizedRecord],
) -> list[AttendanceNormalizedRecord]:
    """
    Merge records for the same (final_employee, date) into a single record.

    For each group:
    - Use earliest IN time and latest OUT time.
    - Recompute work duration.
    - Merge remarks, anomaly flags, and source row numbers.
    """
    from collections import defaultdict

    # Group by (employee_key, date).
    groups: dict[tuple[str, str], list[AttendanceNormalizedRecord]] = defaultdict(list)

    for record in records:
        if record.date_value is None:
            # Records without a date are not merged.
            groups[(None, None)].append(record)
            continue

        employee_key = record.employee_code or record.employee_name or record.record_id
        date_key = record.date_value.strftime("%Y-%m-%d")
        groups[(employee_key, date_key)].append(record)

    # Process each group.
    result: list[AttendanceNormalizedRecord] = []

    for (employee_key, date_key), group_records in groups.items():
        if employee_key is None or date_key is None or len(group_records) == 1:
            # No merge needed; add as-is.
            result.extend(group_records)
            continue

        # Merge multiple records for same employee on same date.
        merged = _merge_record_group(group_records)
        result.append(merged)

    return result


def _merge_record_group(records: list[AttendanceNormalizedRecord]) -> AttendanceNormalizedRecord:
    """Merge a group of records into a single record."""
    if not records:
        raise ValueError("Cannot merge an empty group.")

    if len(records) == 1:
        return records[0]

    # Start with the first record as the base.
    base_record = replace(records[0])

    # Collect IN and OUT times.
    in_times = [r.in_time for r in records if r.in_time is not None]
    out_times = [r.out_time for r in records if r.out_time is not None]
    source_row_numbers = []
    anomaly_flags_set = set()
    remarks_list = []
    merged_record_ids = []

    # Update times: earliest IN, latest OUT.
    if in_times:
        base_record.in_time = min(in_times)
    if out_times:
        base_record.out_time = max(out_times)

    # Recompute duration.
    if base_record.in_time is not None and base_record.out_time is not None:
        duration = (base_record.out_time - base_record.in_time).total_seconds() / 3600
        if duration < 0:
            duration += 24  # Handle overnight.
        base_record.work_duration_hours = round(duration, 2)

    # Collect metadata from all records in the group.
    for record in records:
        source_row_numbers.append(record.source_row_number)
        for flag in record.anomaly_flags:
            anomaly_flags_set.add(flag)
        if record.remarks:
            remarks_list.append(record.remarks)
        merged_record_ids.append(record.record_id)

    # Merge anomaly flags.
    base_record.anomaly_flags = sorted(list(anomaly_flags_set))

    # Merge remarks with separator.
    if remarks_list:
        base_record.remarks = " | ".join(dict.fromkeys(remarks_list))

    # Update source tracking.
    base_record.source_row_number = min(source_row_numbers)
    setattr(base_record, "source_row_numbers", source_row_numbers)
    setattr(base_record, "merged_from_record_ids", merged_record_ids)

    # Consolidate original identities from all records.
    all_original_names: list[str] = []
    all_original_codes: list[str] = []

    for record in records:
        all_original_names.extend(_get_record_list_attr(record, "original_employee_names"))
        all_original_codes.extend(_get_record_list_attr(record, "original_employee_codes"))

    # Deduplicate while preserving order.
    _set_record_list_attr(
        base_record,
        "original_employee_names",
        list(dict.fromkeys(all_original_names)),
    )
    _set_record_list_attr(
        base_record,
        "original_employee_codes",
        list(dict.fromkeys(all_original_codes)),
    )

    # Add a marker to anomaly flags to indicate this record was merged.
    if "employee_merge_consolidation" not in base_record.anomaly_flags:
        base_record.anomaly_flags.append("employee_merge_consolidation")

    return base_record
