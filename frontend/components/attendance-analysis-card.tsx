"use client";

import type { ReactNode } from "react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  buildDisplayState,
  buildPayrollReadySpreadsheet,
  type EmployeeAttendanceRegisterRow
} from "@/lib/attendance-visualization";
import { normalizeAttendanceValidationSummary } from "@/lib/upload-response";
import type {
  AttendanceAdministrativeException,
  AttendanceExceptionGroup,
  AttendanceHolidayMarker,
  AttendancePolicyRule,
  AttendanceProcessedRow,
  AttendanceReviewDecision,
  AttendanceValidationSummary
} from "@/types/upload";

type AttendanceAnalysisCardProps = {
  selectedSheet: string;
  summary: AttendanceValidationSummary;
  isUpdating: boolean;
  onReviewUpdate: (payload: {
    sheetName: string;
    decisions: AttendanceReviewDecision[];
    policyRules: AttendancePolicyRule[];
    holidayMarkers: AttendanceHolidayMarker[];
    administrativeExceptions: AttendanceAdministrativeException[];
  }) => Promise<void>;
};

type AnalysisTab = "dashboard" | "review" | "processed" | "policy";
type ReviewFilter =
  | "all"
  | "present"
  | "absent"
  | "half_day"
  | "late"
  | "early_logout"
  | "paid_weekoff"
  | "unpaid_weekoff"
  | "paid_holiday"
  | "unpaid_holiday"
  | "comp_off"
  | "comp_off_earned"
  | "comp_off_adjusted"
  | "comp_off_balance"
  | "pending_review"
  | "irregular_punch"
  | "gross_payable"
  | "late_deduction"
  | "final_payable"
  | "leave_adjusted"
  | "primary_total"
  | "duplicate_punches"
  | "invalid_duration"
  | "overnight"
  | "missing_out_time"
  | "impossible_timings";

type ReviewDrilldownContext = {
  employeeKey: string;
  employeeLabel: string;
  filter: ReviewFilter;
  filterLabel: string;
  scrollY: number;
};

export function AttendanceAnalysisCard({
  selectedSheet,
  summary,
  isUpdating,
  onReviewUpdate
}: AttendanceAnalysisCardProps) {
  const safeSummary = useMemo(
    () => normalizeAttendanceValidationSummary(summary),
    [summary]
  );
  const [activeTab, setActiveTab] = useState<AnalysisTab>("dashboard");
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [unitFilter, setUnitFilter] = useState("All Units");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState("");
  const [expandedExceptionId, setExpandedExceptionId] = useState("");
  const [decisionMap, setDecisionMap] = useState<Record<string, string>>({});
  const [rowCommentMap, setRowCommentMap] = useState<Record<string, string>>({});
  const [policyRules, setPolicyRules] = useState<AttendancePolicyRule[]>(safeSummary.policy_rules);
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<ReviewFilter>("all");
  const [reviewDrilldownContext, setReviewDrilldownContext] =
    useState<ReviewDrilldownContext | null>(null);
  const [selectedExceptionIds, setSelectedExceptionIds] = useState<string[]>([]);
  const [reviewSearchTerm, setReviewSearchTerm] = useState("");
  const [employeeSummarySearchTerm, setEmployeeSummarySearchTerm] = useState("");
  const [employeeDetailSearchTerm, setEmployeeDetailSearchTerm] = useState("");
  const [processedAttendanceSearchTerm, setProcessedAttendanceSearchTerm] = useState("");
  const [bulkAction, setBulkAction] = useState("");
  const [bulkComment, setBulkComment] = useState("");
  const [holidayMarkers, setHolidayMarkers] = useState<AttendanceHolidayMarker[]>(
    safeSummary.marked_holidays
  );
  const [administrativeExceptions, setAdministrativeExceptions] = useState<
    AttendanceAdministrativeException[]
  >(safeSummary.administrative_exceptions);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayType, setHolidayType] = useState("Declared Holiday");
  const [holidayReason, setHolidayReason] = useState("");
  const [holidayRemarks, setHolidayRemarks] = useState("");
  const [adminExceptionDate, setAdminExceptionDate] = useState("");
  const [adminExceptionScope, setAdminExceptionScope] = useState("all_employees");
  const [adminExceptionTreatment, setAdminExceptionTreatment] = useState("Paid Present");
  const [adminExceptionUnit, setAdminExceptionUnit] = useState("");
  const [adminExceptionEmployeeIds, setAdminExceptionEmployeeIds] = useState<string[]>([]);
  const [adminExceptionReason, setAdminExceptionReason] = useState("");
  const [adminExceptionRemarks, setAdminExceptionRemarks] = useState("");
  const [adminExceptionCustomLabel, setAdminExceptionCustomLabel] = useState("");
  const selectAllVisibleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const nextDecisionMap: Record<string, string> = {};
    const nextCommentMap: Record<string, string> = {};
    safeSummary.exception_groups.forEach((group) => {
      nextDecisionMap[group.exception_id] = group.selected_action || "";
      const processedReason = group.candidate_rows
        .map((candidate) =>
          safeSummary.processed_attendance_rows.find((row) => row.record_id === candidate.record_id)
        )
        .find((row) => (row?.action_reason || row?.action_remarks || "").trim());
      nextCommentMap[group.exception_id] =
        processedReason?.action_reason ||
        processedReason?.action_remarks ||
        (group.selected_action ? "Previously approved regularization" : "");
    });
    setDecisionMap(nextDecisionMap);
    setRowCommentMap(nextCommentMap);
    setPolicyRules(safeSummary.policy_rules);
    setExpandedExceptionId(safeSummary.exception_groups[0]?.exception_id ?? "");
    setSelectedReviewFilter("all");
    setReviewDrilldownContext(null);
    setSelectedExceptionIds([]);
    setSelectedEmployeeKey("");
    setEmployeeFilter("All Employees");
    setUnitFilter("All Units");
    setDateFrom("");
    setDateTo("");
    setReviewSearchTerm("");
    setEmployeeSummarySearchTerm("");
    setEmployeeDetailSearchTerm("");
    setProcessedAttendanceSearchTerm("");
    setBulkAction("");
    setBulkComment("");
    setHolidayMarkers(safeSummary.marked_holidays);
    setAdministrativeExceptions(safeSummary.administrative_exceptions);
    setHolidayDate("");
    setHolidayType(safeSummary.marked_holidays[0]?.holiday_type || "Declared Holiday");
    setHolidayReason("");
    setHolidayRemarks("");
    setAdminExceptionDate("");
    setAdminExceptionScope("all_employees");
    setAdminExceptionTreatment("Paid Present");
    setAdminExceptionUnit("");
    setAdminExceptionEmployeeIds([]);
    setAdminExceptionReason("");
    setAdminExceptionRemarks("");
    setAdminExceptionCustomLabel("");
  }, [safeSummary]);

  const processedRows = safeSummary.processed_attendance_rows;

  const employeeOptions = useMemo(
    () => [
      "All Employees",
      ...(safeSummary.processing_summary.employee_options.length > 0
        ? safeSummary.processing_summary.employee_options
        : Array.from(
            new Set(
              processedRows
                .map((row) => row.employee_name || row.employee_code)
                .filter(Boolean)
            )
          ).sort())
    ],
    [processedRows, safeSummary.processing_summary.employee_options]
  );

  const unitOptions = useMemo(
    () => [
      "All Units",
      ...(safeSummary.processing_summary.unit_options.length > 0
        ? safeSummary.processing_summary.unit_options
        : Array.from(new Set(processedRows.map((row) => row.unit).filter(Boolean))).sort())
    ],
    [processedRows, safeSummary.processing_summary.unit_options]
  );

  const filteredRows = useMemo(
    () =>
      processedRows.filter((row) => {
        const employeeLabel = row.employee_name || row.employee_code || "Unknown Employee";
        const unitLabel = row.unit || "Unassigned Unit";

        if (employeeFilter !== "All Employees" && employeeLabel !== employeeFilter) {
          return false;
        }
        if (unitFilter !== "All Units" && unitLabel !== unitFilter) {
          return false;
        }
        if (dateFrom && row.date < dateFrom) {
          return false;
        }
        if (dateTo && row.date > dateTo) {
          return false;
        }

        return true;
      }),
    [processedRows, employeeFilter, unitFilter, dateFrom, dateTo]
  );

  const filteredExceptions = useMemo(
    () =>
      safeSummary.exception_groups.filter((group) => {
        if (employeeFilter !== "All Employees") {
          const label = group.employee_name || group.employee_code || "Unknown Employee";
          if (label !== employeeFilter) {
            return false;
          }
        }

        if (unitFilter !== "All Units" && (group.unit || "Unassigned Unit") !== unitFilter) {
          return false;
        }

        if (dateFrom && group.date && group.date < dateFrom) {
          return false;
        }
        if (dateTo && group.date && group.date > dateTo) {
          return false;
        }

        return true;
      }),
    [safeSummary.exception_groups, employeeFilter, unitFilter, dateFrom, dateTo]
  );

  const processedRowByRecordId = useMemo(() => {
    const recordMap = new Map<string, (typeof processedRows)[number]>();
    processedRows.forEach((row) => {
      recordMap.set(row.record_id, row);
    });
    return recordMap;
  }, [processedRows]);

  const reviewScopedRows = useMemo(() => {
    if (!reviewDrilldownContext) {
      return filteredRows;
    }

    return filteredRows.filter((row) => {
      const rowEmployeeKey = row.employee_code || row.employee_name || row.record_id;
      return rowEmployeeKey === reviewDrilldownContext.employeeKey;
    });
  }, [filteredRows, reviewDrilldownContext]);

  const reviewScopedExceptions = useMemo(() => {
    if (!reviewDrilldownContext) {
      return filteredExceptions;
    }

    return filteredExceptions.filter((group) => {
      const groupEmployeeKey = group.employee_code || group.employee_name || "Unknown Employee";
      return groupEmployeeKey === reviewDrilldownContext.employeeKey;
    });
  }, [filteredExceptions, reviewDrilldownContext]);

  const exceptionGroupByRecordId = useMemo(() => {
    const exceptionMap = new Map<string, AttendanceExceptionGroup>();
    reviewScopedExceptions.forEach((group) => {
      group.candidate_rows.forEach((candidate) => {
        if (candidate.record_id) {
          exceptionMap.set(candidate.record_id, group);
        }
      });
    });
    return exceptionMap;
  }, [reviewScopedExceptions]);

  const reviewExceptions = useMemo(
    () =>
      reviewScopedExceptions.filter((group) =>
        matchesReviewFilter(group, selectedReviewFilter)
      ),
    [reviewScopedExceptions, selectedReviewFilter]
  );

  const drilldownRows = useMemo(
    () => {
      const rowsForFilter = reviewScopedRows.filter((row) =>
        matchesProcessedRowFilter(row, selectedReviewFilter, exceptionGroupByRecordId.get(row.record_id))
      );

      return rowsForFilter.map((row) => ({
        processedRow: row,
        group: exceptionGroupByRecordId.get(row.record_id) ?? null
      }));
    },
    [exceptionGroupByRecordId, reviewScopedRows, selectedReviewFilter]
  );

  const filteredDrilldownRows = useMemo(() => {
    const normalizedSearch = reviewSearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return drilldownRows;
    }

    return drilldownRows.filter(({ processedRow }) => {
      const employeeName = (processedRow.employee_name || "").toLowerCase();
      const employeeCode = (processedRow.employee_code || "").toLowerCase();
      return employeeName.includes(normalizedSearch) || employeeCode.includes(normalizedSearch);
    });
  }, [drilldownRows, reviewSearchTerm]);

  const visibleExceptionIds = useMemo(
    () =>
      Array.from(
        new Set(
          filteredDrilldownRows
            .map((item) => item.group?.exception_id ?? "")
            .filter(Boolean)
        )
      ),
    [filteredDrilldownRows]
  );

  const allVisibleSelected =
    visibleExceptionIds.length > 0 &&
    visibleExceptionIds.every((exceptionId) => selectedExceptionIds.includes(exceptionId));
  const someVisibleSelected =
    visibleExceptionIds.some((exceptionId) => selectedExceptionIds.includes(exceptionId)) &&
    !allVisibleSelected;

  useEffect(() => {
    if (selectAllVisibleRef.current) {
      selectAllVisibleRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const display = buildDisplayState(safeSummary, filteredRows);
  const employeeRegister = useMemo(() => {
    const normalizedSearch = employeeSummarySearchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return display.employeeRegister;
    }

    return display.employeeRegister.filter((employee) => {
      const employeeName = (employee.employeeName || "").toLowerCase();
      const employeeCode = (employee.employeeCode || "").toLowerCase();
      return employeeName.includes(normalizedSearch) || employeeCode.includes(normalizedSearch);
    });
  }, [display.employeeRegister, employeeSummarySearchTerm]);
  const selectedEmployee =
    employeeRegister.find((item) => employeeKey(item) === selectedEmployeeKey) ?? employeeRegister[0] ?? null;

  useEffect(() => {
    if (employeeRegister.length === 0) {
      setSelectedEmployeeKey("");
      return;
    }

    if (!selectedEmployeeKey) {
      setSelectedEmployeeKey(employeeKey(employeeRegister[0]));
      return;
    }

    const stillVisible = employeeRegister.some((item) => employeeKey(item) === selectedEmployeeKey);
    if (!stillVisible) {
      setSelectedEmployeeKey(employeeKey(employeeRegister[0]));
    }
  }, [employeeRegister, selectedEmployeeKey]);

  const selectedEmployeeRows = useMemo(() => {
    const normalizedSearch = employeeDetailSearchTerm.trim().toLowerCase();

    if (normalizedSearch) {
      return filteredRows
        .filter((row) => {
          const employeeName = (row.employee_name || "").toLowerCase();
          const employeeCode = (row.employee_code || "").toLowerCase();
          const dateValue = (row.date || "").toLowerCase();
          const dayValue = (row.day_label || "").toLowerCase();

          return (
            employeeName.includes(normalizedSearch) ||
            employeeCode.includes(normalizedSearch) ||
            dateValue.includes(normalizedSearch) ||
            dayValue.includes(normalizedSearch)
          );
        })
        .sort((left, right) =>
          `${left.employee_name || left.employee_code || left.record_id}-${left.date}`.localeCompare(
            `${right.employee_name || right.employee_code || right.record_id}-${right.date}`
          )
        );
    }

    if (!selectedEmployee) {
      return [];
    }

    return filteredRows
      .filter(
        (row) =>
          row.employee_code === selectedEmployee.employeeCode ||
          (!selectedEmployee.employeeCode &&
            (row.employee_name || row.record_id) === selectedEmployee.employeeName)
      )
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [employeeDetailSearchTerm, filteredRows, selectedEmployee]);

  const detailViewMatchesMultipleEmployees = useMemo(() => {
    if (!employeeDetailSearchTerm.trim()) {
      return false;
    }

    return (
      new Set(
        selectedEmployeeRows.map(
          (row) => row.employee_code || row.employee_name || row.record_id
        )
      ).size > 1
    );
  }, [employeeDetailSearchTerm, selectedEmployeeRows]);

  const processedAttendanceRows = useMemo(() => {
    const normalizedSearch = processedAttendanceSearchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return filteredRows;
    }

    return filteredRows.filter((row) => {
      const employeeName = (row.employee_name || "").toLowerCase();
      const employeeCode = (row.employee_code || "").toLowerCase();
      const dateValue = (row.date || "").toLowerCase();
      const rawStatus = (row.raw_status || "").toLowerCase();
      const classification = (row.attendance_classification || "").toLowerCase();

      return (
        employeeName.includes(normalizedSearch) ||
        employeeCode.includes(normalizedSearch) ||
        dateValue.includes(normalizedSearch) ||
        rawStatus.includes(normalizedSearch) ||
        classification.includes(normalizedSearch)
      );
    });
  }, [filteredRows, processedAttendanceSearchTerm]);

  const activeReviewIndicator = useMemo(() => {
    if (!reviewDrilldownContext) {
      return selectedReviewFilter === "all"
        ? "Showing: All Exceptions"
        : `Showing: ${reviewFilterLabel(selectedReviewFilter)}`;
    }

    return `Showing: ${reviewDrilldownContext.employeeLabel} → ${reviewDrilldownContext.filterLabel}`;
  }, [reviewDrilldownContext, selectedReviewFilter]);

function renderMetricCell(
    value: number | string,
    employee: EmployeeAttendanceRegisterRow,
    reviewFilter: ReviewFilter
  ) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openEmployeeMetricReview(employee, reviewFilter);
        }}
        className="cursor-pointer rounded-lg px-2 py-1 text-left font-medium text-slateText underline-offset-4 transition hover:bg-teal-50 hover:text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-100"
      >
        {value}
      </button>
    );
  }

  async function handleDecisionChange(
    event: ChangeEvent<HTMLSelectElement>,
    group: AttendanceExceptionGroup
  ) {
    const nextAction = event.target.value;
    const nextDecisionMap = {
      ...decisionMap,
      [group.exception_id]: nextAction
    };
    setDecisionMap(nextDecisionMap);
  }

  function handleRowCommentChange(exceptionId: string, value: string) {
    setRowCommentMap((currentMap) => ({
      ...currentMap,
      [exceptionId]: value
    }));
  }

  function buildAttendanceReviewDecisions(
    nextDecisionMap: Record<string, string>,
    nextCommentMap: Record<string, string>
  ): AttendanceReviewDecision[] {
    return Object.entries(nextDecisionMap)
      .filter(([, actionKey]) => actionKey)
      .map(([exception_id, action_key]) => ({
        exception_id,
        action_key,
        action_by: "HR",
        reason: (nextCommentMap[exception_id] ?? "").trim(),
        remarks: ""
      }));
  }

  async function applyRowDecision(group: AttendanceExceptionGroup) {
    const selectedAction = decisionMap[group.exception_id] ?? "";
    const rowComment = (rowCommentMap[group.exception_id] ?? "").trim();

    if (!selectedAction || !rowComment) {
      return;
    }

    await onReviewUpdate({
      sheetName: selectedSheet,
      decisions: buildAttendanceReviewDecisions(decisionMap, rowCommentMap),
      policyRules,
      holidayMarkers,
      administrativeExceptions
    });
  }

  function openReviewFilter(nextFilter: ReviewFilter) {
    setActiveTab("review");
    setSelectedReviewFilter(nextFilter);
    setReviewDrilldownContext(null);
    setSelectedExceptionIds([]);
  }

  function openEmployeeMetricReview(
    employee: EmployeeAttendanceRegisterRow,
    reviewFilter: ReviewFilter
  ) {
    setSelectedEmployeeKey(employeeKey(employee));
    setReviewDrilldownContext({
      employeeKey: employee.employeeCode || employee.employeeName,
      employeeLabel: employee.employeeName || employee.employeeCode,
      filter: reviewFilter,
      filterLabel: reviewFilterLabel(reviewFilter),
      scrollY: typeof window !== "undefined" ? window.scrollY : 0
    });
    setActiveTab("review");
    setSelectedReviewFilter(reviewFilter);
    setSelectedExceptionIds([]);
  }

  function handleReviewBack() {
    const scrollY = reviewDrilldownContext?.scrollY ?? 0;
    setActiveTab("dashboard");
    setReviewDrilldownContext(null);
    setSelectedExceptionIds([]);

    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      });
    }
  }

  function toggleExceptionSelection(exceptionId: string) {
    setSelectedExceptionIds((currentIds) =>
      currentIds.includes(exceptionId)
        ? currentIds.filter((item) => item !== exceptionId)
        : [...currentIds, exceptionId]
    );
  }

  function toggleSelectAllVisibleExceptions() {
    setSelectedExceptionIds(allVisibleSelected ? [] : visibleExceptionIds);
  }

  async function applyBulkDecision(actionKey: string) {
    if (!bulkComment.trim() || !actionKey) {
      return;
    }
    const applicableGroups = reviewExceptions.filter(
      (group) =>
        selectedExceptionIds.includes(group.exception_id) &&
        group.action_options.some((option) => option.action_key === actionKey)
    );

    if (applicableGroups.length === 0) {
      return;
    }

    const nextDecisionMap = { ...decisionMap };
    const nextCommentMap = { ...rowCommentMap };
    applicableGroups.forEach((group) => {
      nextDecisionMap[group.exception_id] = actionKey;
      nextCommentMap[group.exception_id] = bulkComment.trim();
    });
    setDecisionMap(nextDecisionMap);
    setRowCommentMap(nextCommentMap);

    await onReviewUpdate({
      sheetName: selectedSheet,
      decisions: buildAttendanceReviewDecisions(nextDecisionMap, nextCommentMap),
      policyRules,
      holidayMarkers,
      administrativeExceptions
    });
  }

  function handleRuleValueChange(ruleId: string, value: string) {
    setPolicyRules((currentRules) =>
      currentRules.map((rule) =>
        rule.rule_id === ruleId ? { ...rule, value } : rule
      )
    );
  }

  function handleRuleToggle(ruleId: string) {
    setPolicyRules((currentRules) =>
      currentRules.map((rule) =>
        rule.rule_id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  }

  async function handleApplyRules() {
    await onReviewUpdate({
      sheetName: selectedSheet,
      decisions: buildAttendanceReviewDecisions(decisionMap, rowCommentMap),
      policyRules,
      holidayMarkers,
      administrativeExceptions
    });
  }

  function handleHolidayMarkerAdd() {
    if (!holidayDate || !hasReviewComment(holidayReason, holidayRemarks)) {
      return;
    }

    setHolidayMarkers((currentMarkers) => {
      const nextMarkers = currentMarkers.filter((item) => item.date !== holidayDate);
      nextMarkers.push({
        date: holidayDate,
        holiday_type: holidayType,
        reason: holidayReason.trim(),
        remarks: holidayRemarks.trim(),
        action_by: "HR",
        action_at: "",
        source: "Holiday Marker"
      });
      return nextMarkers.sort((left, right) => left.date.localeCompare(right.date));
    });
    setHolidayDate("");
    setHolidayReason("");
    setHolidayRemarks("");
  }

  function handleHolidayMarkerRemove(dateValue: string) {
    setHolidayMarkers((currentMarkers) =>
      currentMarkers.filter((item) => item.date !== dateValue)
    );
  }

  function handleAdministrativeExceptionEmployeeChange(
    event: ChangeEvent<HTMLSelectElement>
  ) {
    setAdminExceptionEmployeeIds(
      Array.from(event.target.selectedOptions).map((option) => option.value)
    );
  }

  function handleAdministrativeExceptionAdd() {
    if (!adminExceptionDate) {
      return;
    }

      const nextItem: AttendanceAdministrativeException = {
      date: adminExceptionDate,
      scope: adminExceptionScope,
      treatment_type: adminExceptionTreatment,
      unit_name: adminExceptionScope === "specific_unit" ? adminExceptionUnit : "",
      employee_ids:
        adminExceptionScope === "selected_employees" ? adminExceptionEmployeeIds : [],
      custom_status_label:
        adminExceptionTreatment === "Custom HR Approved Status"
          ? adminExceptionCustomLabel
          : "",
      custom_payable_value: adminExceptionTreatment === "Unpaid Off" ? 0 : 1,
      reason: adminExceptionReason,
      remarks: adminExceptionRemarks,
      action_by: "HR",
      action_at: "",
      source: "Administrative Attendance Exception"
    };

    setAdministrativeExceptions((currentItems) => {
      const nextItems = currentItems.filter(
        (item) =>
          !(
            item.date === nextItem.date &&
            item.scope === nextItem.scope &&
            item.treatment_type === nextItem.treatment_type &&
            item.unit_name === nextItem.unit_name &&
            item.employee_ids.join("|") === nextItem.employee_ids.join("|")
          )
      );
      nextItems.push(nextItem);
      return nextItems.sort((left, right) => left.date.localeCompare(right.date));
    });

    setAdminExceptionDate("");
    setAdminExceptionScope("all_employees");
    setAdminExceptionTreatment("Paid Present");
    setAdminExceptionUnit("");
    setAdminExceptionEmployeeIds([]);
    setAdminExceptionReason("");
    setAdminExceptionRemarks("");
    setAdminExceptionCustomLabel("");
  }

  function handleAdministrativeExceptionRemove(indexToRemove: number) {
    setAdministrativeExceptions((currentItems) =>
      currentItems.filter((_, index) => index !== indexToRemove)
    );
  }

  async function handleHolidayRecalculation() {
    await onReviewUpdate({
      sheetName: selectedSheet,
      decisions: buildAttendanceReviewDecisions(decisionMap, rowCommentMap),
      policyRules,
      holidayMarkers,
      administrativeExceptions
    });
  }

  function handleExportWorking() {
    buildPayrollReadySpreadsheet(
      processedAttendanceRows,
      `${selectedSheet || "attendance"}_processed_working`
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            HR Attendance Processing
          </p>
          <h3 className="mt-2 text-xl font-bold text-ink">Monthly Attendance Working</h3>
          <p className="mt-1 text-sm leading-6 text-slateText">
            Review the biometric dump, resolve punch issues, and finalize a payroll-ready
            attendance working for HR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={safeSummary.status} />
          {isUpdating ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
              Refreshing results...
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/85 p-3">
        <div className="flex flex-wrap gap-2">
          <TabButton
            label="Dashboard"
            active={activeTab === "dashboard"}
            onClick={() => setActiveTab("dashboard")}
          />
          <TabButton
            label={`HR Review (${filteredExceptions.length})`}
            active={activeTab === "review"}
            onClick={() => setActiveTab("review")}
          />
          <TabButton
            label="Processed Attendance"
            active={activeTab === "processed"}
            onClick={() => setActiveTab("processed")}
          />
          <TabButton
            label="Policy Rules"
            active={activeTab === "policy"}
            onClick={() => setActiveTab("policy")}
          />
        </div>
      </div>

      {activeTab === "dashboard" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <TopSummaryCard label="Total Employees" value={display.employeeCount.toString()} tone="slate" />
            <TopSummaryCard label="Present" value={display.statusSummary.present_count.toString()} tone="emerald" onClick={() => openReviewFilter("present")} />
            <TopSummaryCard label="Absent" value={display.statusSummary.absent_count.toString()} tone="rose" onClick={() => openReviewFilter("absent")} />
            <TopSummaryCard label="Half Day" value={display.statusSummary.half_day_count.toString()} tone="amber" onClick={() => openReviewFilter("half_day")} />
            <TopSummaryCard label="Late Flags" value={display.statusSummary.late_entry_count.toString()} tone="sky" onClick={() => openReviewFilter("late")} />
            <TopSummaryCard
              label="Irregular Punch"
              value={display.irregularPunchCount.toString()}
              tone="amber"
              onClick={() => openReviewFilter("irregular_punch")}
            />
            <TopSummaryCard label="Payable Sundays" value={display.payableSundays.toString()} tone="emerald" onClick={() => openReviewFilter("paid_weekoff")} />
            <TopSummaryCard label="Unpaid Sundays" value={display.unpaidSundays.toString()} tone="slate" onClick={() => openReviewFilter("unpaid_weekoff")} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
          <CompactInfoCard
            title="Employee Monthly Summary"
            subtitle="Use this as the HR attendance register for the current selection."
                action={
                  <button
                    type="button"
                    onClick={handleExportWorking}
                    className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100"
                  >
                    Download Excel
                  </button>
                }
              >
                <div className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <FilterInput
                      label="Search employee"
                      type="text"
                      value={employeeSummarySearchTerm}
                      placeholder="Search by employee name or ID"
                      onChange={setEmployeeSummarySearchTerm}
                    />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slateText">
                      Primary day buckets reconcile month days. Late, irregular punch, early
                      logout, overnight, comp off, and leave are indicators only.
                    </div>
                  </div>

                  <div className="max-h-[24rem] overflow-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-[1700px] divide-y divide-slate-200 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Employee ID</th>
                        <th className="px-3 py-2 font-semibold">Employee Name</th>
                        <th className="px-3 py-2 font-semibold">Gender</th>
                        <th className="px-3 py-2 font-semibold">Present Days</th>
                        <th className="px-3 py-2 font-semibold">Half Days</th>
                        <th className="px-3 py-2 font-semibold">Absent Days</th>
                        <th className="px-3 py-2 font-semibold">Paid WOs</th>
                        <th className="px-3 py-2 font-semibold">Unpaid WOs</th>
                        <th className="px-3 py-2 font-semibold">Paid Holidays</th>
                        <th className="px-3 py-2 font-semibold">Unpaid Holidays</th>
                        <th className="px-3 py-2 font-semibold">Pending Review</th>
                        <th className="px-3 py-2 font-semibold">Gross Payable</th>
                        <th className="px-3 py-2 font-semibold">Late Deduction</th>
                        <th className="px-3 py-2 font-semibold">Final Payable</th>
                        <th className="px-3 py-2 font-semibold">Late Flags</th>
                        <th className="px-3 py-2 font-semibold">Irregular Flags</th>
                        <th className="px-3 py-2 font-semibold">Early Logout</th>
                        <th className="px-3 py-2 font-semibold">Overnight</th>
                        <th className="px-3 py-2 font-semibold">Comp Off Earned</th>
                        <th className="px-3 py-2 font-semibold">Comp Off Adjusted</th>
                        <th className="px-3 py-2 font-semibold">Comp Off Balance</th>
                        <th className="px-3 py-2 font-semibold">Leave Adjusted</th>
                        <th className="px-3 py-2 font-semibold">Primary Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {employeeRegister.length > 0 ? (
                        employeeRegister.map((employee, index) => {
                          const isSelected = employeeKey(employee) === selectedEmployeeKey;
                          return (
                          <tr
                            key={`${employeeKey(employee)}-${index}`}
                            onClick={() => setSelectedEmployeeKey(employeeKey(employee))}
                            className={`cursor-pointer transition ${
                              isSelected ? "bg-teal-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="px-3 py-2 font-medium text-ink">{employee.employeeCode || "-"}</td>
                            <td className="px-3 py-2 text-ink">{employee.employeeName || "Unknown Employee"}</td>
                            <td className="px-3 py-2 text-slateText">{employee.gender || "-"}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.presentDays, employee, "present")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.halfDays, employee, "half_day")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.absentDays, employee, "absent")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.paidWeekOffs, employee, "paid_weekoff")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.unpaidWeekOffs, employee, "unpaid_weekoff")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.paidHolidays, employee, "paid_holiday")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.unpaidHolidays, employee, "unpaid_holiday")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.pendingReviewDays, employee, "pending_review")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.grossPayableDays, employee, "gross_payable")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.lateDeduction, employee, "late_deduction")}</td>
                            <td className="px-3 py-2 font-semibold text-ink">{renderMetricCell(employee.finalPayableDays, employee, "final_payable")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.lateFlags, employee, "late")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.irregularPunchFlags, employee, "irregular_punch")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.earlyLogoutFlags, employee, "early_logout")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.overnightFlags, employee, "overnight")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffEarned, employee, "comp_off_earned")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffAdjusted, employee, "comp_off_adjusted")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffBalance, employee, "comp_off_balance")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.leaveAdjusted, employee, "leave_adjusted")}</td>
                            <td className="px-3 py-2 font-medium text-ink">
                                {renderMetricCell(
                                  `${employee.primaryDayTotal}/${employee.calendarDays}`,
                                  employee,
                                  "primary_total"
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={22} className="px-3 py-6 text-center text-slateText">
                            No employees are available in the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </CompactInfoCard>

              <CompactInfoCard
                title="Employee Detail View"
                subtitle={
                  employeeDetailSearchTerm.trim()
                    ? detailViewMatchesMultipleEmployees
                      ? "Search is temporarily overriding the selected employee and showing matching detail rows across employees."
                      : "Search is temporarily overriding the selected employee and showing the matching detail rows."
                    : selectedEmployee
                      ? `${selectedEmployee.employeeName || selectedEmployee.employeeCode} • click another employee above to switch the monthly detail.`
                      : "Select an employee to inspect day-wise attendance and payroll impact."
                }
              >
                <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr] lg:items-end">
                  <FilterInput
                    label="Search detail view"
                    type="text"
                    value={employeeDetailSearchTerm}
                    placeholder="Search by employee, code, or date"
                    onChange={setEmployeeDetailSearchTerm}
                  />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slateText">
                    Search here can override the selected employee temporarily. Clear the search to return to the monthly-summary selection.
                  </div>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Day</th>
                        <th className="px-3 py-2 font-semibold">In Time</th>
                        <th className="px-3 py-2 font-semibold">Out Time</th>
                        <th className="px-3 py-2 font-semibold">Working Hours</th>
                        <th className="px-3 py-2 font-semibold">Attendance Result</th>
                        <th className="px-3 py-2 font-semibold">Rule Applied</th>
                        <th className="px-3 py-2 font-semibold">Payroll Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedEmployeeRows.length > 0 ? (
                        selectedEmployeeRows.map((row, index) => (
                          <tr key={`${row.record_id}-${index}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-ink">{formatDisplayDate(row.date)}</td>
                            <td className="px-3 py-2 text-slateText">{formatDayLabel(row.date)}</td>
                            <td className="px-3 py-2 text-slateText">{row.in_time || "-"}</td>
                            <td className="px-3 py-2 text-slateText">{row.out_time || "-"}</td>
                            <td className="px-3 py-2 text-slateText">{row.working_hours || "-"}</td>
                            <td className="px-3 py-2 text-ink">{row.attendance_classification}</td>
                            <td className="px-3 py-2 text-slateText" title={buildAttendanceAuditTitle(row)}>
                              {formatRuleId(row.detected_rule_id)}
                            </td>
                            <td className="px-3 py-2 font-medium text-ink">{row.payroll_impact_label}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-3 py-6 text-center text-slateText">
                            No employee detail rows are available in the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CompactInfoCard>
            </div>

            <div className="space-y-4">
              <CompactInfoCard
                title="Attendance Summary"
                subtitle="Monthly totals from the processed attendance working."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Present" value={display.statusSummary.present_count.toString()} onClick={() => openReviewFilter("present")} />
                  <MiniMetric label="Absent" value={display.statusSummary.absent_count.toString()} onClick={() => openReviewFilter("absent")} />
                  <MiniMetric label="Half Day" value={display.statusSummary.half_day_count.toString()} onClick={() => openReviewFilter("half_day")} />
                  <MiniMetric label="Paid WO" value={display.statusSummary.paid_week_off_count.toString()} onClick={() => openReviewFilter("paid_weekoff")} />
                  <MiniMetric label="Paid Holiday" value={display.statusSummary.paid_holiday_count.toString()} onClick={() => openReviewFilter("paid_holiday")} />
                  <MiniMetric label="Late Flags" value={display.statusSummary.late_entry_count.toString()} onClick={() => openReviewFilter("late")} />
                  <MiniMetric label="Pending Review" value={display.statusSummary.pending_review_count.toString()} onClick={() => openReviewFilter("pending_review")} />
                  <MiniMetric label="Comp Off" value={display.statusSummary.comp_off_earned_count.toString()} onClick={() => openReviewFilter("comp_off")} />
                </div>
              </CompactInfoCard>

              <CompactInfoCard
                title="Attendance Exceptions"
                subtitle="Focus these first before final payroll export."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Duplicate Punches" value={display.anomalySummary.duplicatePunches.toString()} onClick={() => openReviewFilter("duplicate_punches")} />
                  <MiniMetric label="Invalid Durations" value={display.anomalySummary.invalidDurations.toString()} onClick={() => openReviewFilter("invalid_duration")} />
                  <MiniMetric label="Overnight Anomalies" value={display.anomalySummary.overnightAnomalies.toString()} onClick={() => openReviewFilter("overnight")} />
                  <MiniMetric label="Missing Out-Time" value={display.anomalySummary.missingOutTime.toString()} onClick={() => openReviewFilter("missing_out_time")} />
                  <MiniMetric label="Impossible Timings" value={display.anomalySummary.impossibleTimings.toString()} onClick={() => openReviewFilter("impossible_timings")} />
                  <MiniMetric label="Pending Review" value={safeSummary.processing_summary.pending_review_groups.toString()} onClick={() => openReviewFilter("all")} />
                </div>
              </CompactInfoCard>

              <CompactInfoCard
                title="Unit-Wise Summary"
                subtitle="Business view of attendance by unit or location."
              >
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Unit</th>
                        <th className="px-3 py-2 font-semibold">Present</th>
                        <th className="px-3 py-2 font-semibold">Late Flags</th>
                        <th className="px-3 py-2 font-semibold">Half Day</th>
                        <th className="px-3 py-2 font-semibold">Absent</th>
                        <th className="px-3 py-2 font-semibold">Payable Days</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {display.unitSummary.length > 0 ? (
                        display.unitSummary.map((item, index) => (
                          <tr key={`${item.unit_name}-${index}`}>
                            <td className="px-3 py-2 font-medium text-ink">{item.unit_name}</td>
                            <td className="px-3 py-2 text-slateText">{item.present_count}</td>
                            <td className="px-3 py-2 text-slateText">{item.late_entry_count}</td>
                            <td className="px-3 py-2 text-slateText">{item.half_day_count}</td>
                            <td className="px-3 py-2 text-slateText">{item.absent_count}</td>
                            <td className="px-3 py-2 font-semibold text-ink">{item.payable_days}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-slateText">
                            Unit-level summary is not available for the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CompactInfoCard>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "review" ? (
        <div className="mt-4 space-y-4">
          <CompactInfoCard
            title="Attendance Exceptions"
            subtitle="Review anomalies, choose the correct HR action, and refresh the working automatically."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MiniMetric label="Duplicate Punches" value={display.anomalySummary.duplicatePunches.toString()} onClick={() => setSelectedReviewFilter("duplicate_punches")} />
              <MiniMetric label="Invalid Durations" value={display.anomalySummary.invalidDurations.toString()} onClick={() => setSelectedReviewFilter("invalid_duration")} />
              <MiniMetric label="Overnight" value={display.anomalySummary.overnightAnomalies.toString()} onClick={() => setSelectedReviewFilter("overnight")} />
              <MiniMetric label="Missing Out-Time" value={display.anomalySummary.missingOutTime.toString()} onClick={() => setSelectedReviewFilter("missing_out_time")} />
              <MiniMetric label="Impossible Timings" value={display.anomalySummary.impossibleTimings.toString()} onClick={() => setSelectedReviewFilter("impossible_timings")} />
            </div>
          </CompactInfoCard>

          <CompactInfoCard
            title="Holiday Marking"
            subtitle="Mark a payroll holiday once for the selected date, then recalculate attendance for all employees."
            action={
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleHolidayRecalculation}
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Recalculate Attendance
              </button>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <FilterInput
                label="Holiday date"
                type="date"
                value={holidayDate}
                onChange={setHolidayDate}
              />
              <FilterSelect
                label="Holiday type"
                value={holidayType}
                options={["Declared Holiday", "National Holiday", "Paid Holiday"]}
                onChange={setHolidayType}
              />
              <FilterInput
                label="Reason"
                type="text"
                value={holidayReason}
                placeholder="Bohag Bihu Holiday"
                onChange={setHolidayReason}
              />
              <FilterInput
                label="Remarks"
                type="text"
                value={holidayRemarks}
                placeholder="Comment required for holiday application"
                onChange={setHolidayRemarks}
              />
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleHolidayMarkerAdd}
                disabled={!holidayDate || !hasReviewComment(holidayReason, holidayRemarks)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add / Apply Holiday
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slateText">
                Selected Holidays
              </p>
              {holidayMarkers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {holidayMarkers.map((marker, index) => (
                    <button
                      key={`${marker.date}-${marker.holiday_type}-${index}`}
                      type="button"
                      onClick={() => handleHolidayMarkerRemove(marker.date)}
                      className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-100"
                      title={[marker.reason, marker.remarks].filter(Boolean).join(" • ") || "Holiday comment"}
                    >
                      {formatDisplayDate(marker.date)} • {marker.holiday_type} • {marker.reason || "Comment added"} • Remove
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slateText">
                  No date-level holidays have been marked yet.
                </p>
              )}
            </div>
          </CompactInfoCard>

          <CompactInfoCard
            title="Administrative Attendance Exception"
            subtitle="Apply an organization-level override for machine failure, emergency closure, or management-approved paid or unpaid exception days."
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <FilterInput
                label="Exception date"
                type="date"
                value={adminExceptionDate}
                onChange={setAdminExceptionDate}
              />
              <FilterSelect
                label="Scope"
                value={adminExceptionScope}
                options={[
                  "all_employees",
                  "specific_unit",
                  "selected_employees"
                ]}
                onChange={setAdminExceptionScope}
              />
              <FilterSelect
                label="Treatment"
                value={adminExceptionTreatment}
                options={[
                  "Paid Present",
                  "Paid Holiday",
                  "Special Paid Off",
                  "Unpaid Off",
                  "Custom HR Approved Status"
                ]}
                onChange={setAdminExceptionTreatment}
              />
              {adminExceptionScope === "specific_unit" ? (
                <FilterSelect
                  label="Unit"
                  value={adminExceptionUnit}
                  options={unitOptions.filter((item) => item !== "All Units")}
                  onChange={setAdminExceptionUnit}
                />
              ) : null}
            </div>

            {adminExceptionScope === "selected_employees" ? (
              <div className="mt-3">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
                  Selected employees
                </label>
                <select
                  multiple
                  value={adminExceptionEmployeeIds}
                  onChange={handleAdministrativeExceptionEmployeeChange}
                  className="mt-1 h-32 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {employeeOptions
                    .filter((item) => item !== "All Employees")
                    .map((item, index) => (
                      <option key={`${item}-${index}`} value={item}>
                        {item}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}

            {adminExceptionTreatment === "Custom HR Approved Status" ? (
              <div className="mt-3">
                <FilterInput
                  label="Custom status label"
                  type="text"
                  value={adminExceptionCustomLabel}
                  placeholder="Management Approved Paid Day"
                  onChange={setAdminExceptionCustomLabel}
                />
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
              <FilterInput
                label="Reason"
                type="text"
                value={adminExceptionReason}
                placeholder="Reason for exception"
                onChange={setAdminExceptionReason}
              />
              <FilterInput
                label="Remarks"
                type="text"
                value={adminExceptionRemarks}
                placeholder="Optional remarks"
                onChange={setAdminExceptionRemarks}
              />
              <button
                type="button"
                onClick={handleAdministrativeExceptionAdd}
                disabled={
                  !adminExceptionDate ||
                  (adminExceptionScope === "specific_unit" && !adminExceptionUnit) ||
              (adminExceptionScope === "selected_employees" &&
                    adminExceptionEmployeeIds.length === 0) ||
                  !hasReviewComment(adminExceptionReason, adminExceptionRemarks)
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add Exception
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slateText">
                Administrative Exceptions
              </p>
              {administrativeExceptions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {administrativeExceptions.map((item, index) => (
                    <button
                      key={`${item.date}-${item.scope}-${item.treatment_type}-${index}`}
                      type="button"
                      onClick={() => handleAdministrativeExceptionRemove(index)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 transition hover:bg-violet-100"
                    >
                      {formatDisplayDate(item.date)} • {item.treatment_type} • {formatAdministrativeScope(item)} • Remove
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slateText">
                  No administrative attendance exceptions have been added yet.
                </p>
              )}
            </div>
          </CompactInfoCard>

          <CompactInfoCard
            title="Anomaly Drilldown"
            subtitle="Click a metric to focus the review queue, then bulk-apply an HR regularization action."
          >
            <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slateText">
                  Active Drilldown
                </p>
                <p className="text-sm font-semibold text-ink">{activeReviewIndicator}</p>
              </div>
              {reviewDrilldownContext ? (
                <button
                  type="button"
                  onClick={handleReviewBack}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Back to Monthly Summary
                </button>
              ) : null}
            </div>

            <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,1.25fr)_auto] lg:items-end">
              <FilterSelect
                label="Bulk action"
                value={bulkAction}
                options={[
                  "",
                  "mark_present",
                  "mark_present_but_late",
                  "mark_half_day",
                  "mark_absent",
                  "mark_paid_holiday",
                  "mark_comp_off",
                  "manual_override",
                  "ignore_anomaly"
                ]}
                onChange={setBulkAction}
              />
              <FilterInput
                label="Bulk comment"
                type="text"
                value={bulkComment}
                placeholder="Comment required for bulk approval"
                onChange={setBulkComment}
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slateText">
                Bulk regularization updates all currently selected visible rows and immediately recalculates summaries, deductions, payable days, comp off balances, and pending counts.
              </div>
              <button
                type="button"
                disabled={
                  selectedExceptionIds.length === 0 ||
                  isUpdating ||
                  !bulkAction ||
                  !bulkComment.trim()
                }
                onClick={() => applyBulkDecision(bulkAction)}
                className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Apply Bulk Action
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {reviewFilterOptions.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  type="button"
                  onClick={() => setSelectedReviewFilter(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedReviewFilter === option.value
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-white text-slateText hover:border-teal-300 hover:text-teal-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mb-3">
              <input
                type="text"
                value={reviewSearchTerm}
                onChange={(event) => setReviewSearchTerm(event.target.value)}
                placeholder="Search by Employee Name or Employee ID"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 font-semibold">
                      <div className="flex items-center gap-2">
                        <input
                          ref={selectAllVisibleRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisibleExceptions}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-200"
                        />
                        <span>Select All</span>
                      </div>
                    </th>
                    <th className="px-3 py-2 font-semibold">Employee ID</th>
                    <th className="px-3 py-2 font-semibold">Employee Name</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Day</th>
                    <th className="px-3 py-2 font-semibold">In Time</th>
                    <th className="px-3 py-2 font-semibold">Out Time</th>
                    <th className="px-3 py-2 font-semibold">Working Hours</th>
                    <th className="px-3 py-2 font-semibold">Detected Issue</th>
                    <th className="px-3 py-2 font-semibold">Suggested Rule</th>
                    <th className="px-3 py-2 font-semibold">Current Payroll Impact</th>
                    <th className="px-3 py-2 font-semibold">HR Action</th>
                    <th className="px-3 py-2 font-semibold">HR Comment</th>
                    <th className="px-3 py-2 font-semibold">Apply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDrilldownRows.length > 0 ? (
                    filteredDrilldownRows.map(({ group, processedRow }, index) => (
                      <tr key={`${processedRow.record_id}-${group?.exception_id ?? "row"}-${index}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          {group ? (
                            <input
                              type="checkbox"
                              checked={selectedExceptionIds.includes(group.exception_id)}
                              onChange={() => toggleExceptionSelection(group.exception_id)}
                              className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-200"
                            />
                          ) : (
                            <span className="text-xs text-slateText">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">{processedRow.employee_code || "-"}</td>
                        <td className="px-3 py-2 text-ink">{processedRow.employee_name || "Unknown Employee"}</td>
                        <td className="px-3 py-2 text-slateText">{processedRow.date || "-"}</td>
                        <td className="px-3 py-2 text-slateText">{formatDayLabel(processedRow.date)}</td>
                        <td className="px-3 py-2 text-slateText">{processedRow.in_time || "Missing"}</td>
                        <td className="px-3 py-2 text-slateText">{processedRow.out_time || "Missing"}</td>
                        <td className="px-3 py-2 text-slateText">{processedRow.working_hours || "Not computed"}</td>
                        <td className="px-3 py-2 text-slateText">{group?.summary || buildProcessedRowIssueSummary(processedRow)}</td>
                        <td className="px-3 py-2 text-slateText">{group ? formatAction(group.suggested_action) : formatRuleId(processedRow.detected_rule_id)}</td>
                        <td className="px-3 py-2 font-medium text-ink">
                          {processedRow.payroll_impact_label || "Pending calculation"}
                        </td>
                        <td className="px-3 py-2">
                          {group ? (
                            <select
                              value={decisionMap[group.exception_id] ?? ""}
                              disabled={isUpdating}
                              onChange={(event) => handleDecisionChange(event, group)}
                              className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed"
                            >
                              <option value="">Select action</option>
                              {group.action_options.map((option, optionIndex) => (
                                <option key={`${group.exception_id}-${option.action_key}-${optionIndex}-row`} value={option.action_key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-slateText">No action</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {group ? (
                            <input
                              type="text"
                              value={rowCommentMap[group.exception_id] ?? ""}
                              onChange={(event) =>
                                handleRowCommentChange(group.exception_id, event.target.value)
                              }
                              placeholder="Comment required"
                              className="w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                            />
                          ) : (
                            <span className="text-xs text-slateText">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {group ? (
                            <button
                              type="button"
                              disabled={
                                isUpdating ||
                                !(decisionMap[group.exception_id] ?? "") ||
                                !(rowCommentMap[group.exception_id] ?? "").trim()
                              }
                              onClick={() => applyRowDecision(group)}
                              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Apply
                            </button>
                          ) : (
                            <span className="text-xs text-slateText">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={14} className="px-3 py-6 text-center text-slateText">
                        No anomaly rows match the current drilldown filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CompactInfoCard>

          {reviewExceptions.length > 0 ? (
            <div className="space-y-3">
              {reviewExceptions.map((group, groupIndex) => {
                const isExpanded = expandedExceptionId === group.exception_id;
                const selectedAction = decisionMap[group.exception_id] ?? group.selected_action ?? "";

                return (
                  <article
                    key={`${group.exception_id}-${groupIndex}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedExceptionId(isExpanded ? "" : group.exception_id)}
                      className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-ink">{group.summary}</h4>
                          <SeverityBadge severity={group.severity} />
                          {group.requires_review ? (
                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">
                              Review Needed
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                              Action Saved
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slateText">
                          {(group.employee_name || group.employee_code || "Unknown Employee")} • {group.date || "No date"} • {group.unit || "Unassigned Unit"}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-teal-700">
                        {isExpanded ? "Hide" : "Review"}
                      </span>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-200 px-4 py-4">
                        <p className="text-sm text-slateText">{group.details}</p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.anomaly_flags.map((flag, flagIndex) => (
                            <span
                              key={`${group.exception_id}-${flag}-${flagIndex}`}
                              className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                            >
                              {formatFlag(flag)}
                            </span>
                          ))}
                        </div>

                        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                            <thead className="bg-slate-100 text-slate-700">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Row</th>
                                <th className="px-3 py-2 font-semibold">Employee</th>
                                <th className="px-3 py-2 font-semibold">Date</th>
                                <th className="px-3 py-2 font-semibold">In Time</th>
                                <th className="px-3 py-2 font-semibold">Out Time</th>
                                <th className="px-3 py-2 font-semibold">Working Hours</th>
                                <th className="px-3 py-2 font-semibold">Raw Status</th>
                                <th className="px-3 py-2 font-semibold">Current Payroll Impact</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.candidate_rows.map((candidate, candidateIndex) => {
                                const processedRow = processedRowByRecordId.get(candidate.record_id);
                                return (
                                <tr key={`${group.exception_id}-${candidate.record_id || candidate.source_row_number}-${candidateIndex}`}>
                                  <td className="px-3 py-2 font-medium text-ink">{candidate.source_row_number}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.employee_name || candidate.employee_code || "Unknown Employee"}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.date || "-"}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.in_time || "Missing"}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.out_time || "Missing"}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.work_duration || "Not computed"}</td>
                                  <td className="px-3 py-2 text-slateText">{candidate.attendance_status || "Not provided"}</td>
                                  <td className="px-3 py-2 font-medium text-ink">{processedRow?.payroll_impact_label || "Pending calculation"}</td>
                                </tr>
                              )})}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
                              HR Action
                            </label>
                            <select
                              value={selectedAction}
                              disabled={isUpdating}
                              onChange={(event) => handleDecisionChange(event, group)}
                              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed"
                            >
                              <option value="">Use suggested action: {formatAction(group.suggested_action)}</option>
                              {group.action_options.map((option, optionIndex) => (
                                <option key={`${group.exception_id}-${option.action_key}-${optionIndex}`} value={option.action_key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slateText">
                            Suggested action:
                            <div className="mt-1 font-semibold text-ink">{formatAction(group.suggested_action)}</div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <CompactEmptyState
              title="No exceptions in the current filter"
              description="The selected employee, unit, or date range does not have any pending attendance anomalies."
            />
          )}
        </div>
      ) : null}

      {activeTab === "processed" ? (
        <div className="mt-4">
          <CompactInfoCard
            title="Processed Attendance"
            subtitle="Final daily attendance working for payroll review, audit checks, and export."
            action={
              <button
                type="button"
                onClick={handleExportWorking}
                className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100"
              >
                Download Excel
              </button>
            }
          >
            <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
              <FilterInput
                label="Search processed attendance"
                type="text"
                value={processedAttendanceSearchTerm}
                placeholder="Search by employee, ID, date, or status"
                onChange={setProcessedAttendanceSearchTerm}
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slateText">
                This keeps the full processed working separate from the main dashboard so HR can inspect the payroll-ready register without stretching the summary page.
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 shadow-sm">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Day</th>
                    <th className="px-3 py-2 font-semibold">Employee Code</th>
                    <th className="px-3 py-2 font-semibold">Employee Name</th>
                    <th className="px-3 py-2 font-semibold">Gender</th>
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">In Time</th>
                    <th className="px-3 py-2 font-semibold">Out Time</th>
                    <th className="px-3 py-2 font-semibold">Working Hours</th>
                    <th className="px-3 py-2 font-semibold">Final Attendance Classification</th>
                    <th className="px-3 py-2 font-semibold">Rule Applied</th>
                    <th className="px-3 py-2 font-semibold">Payroll Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedAttendanceRows.length > 0 ? (
                    processedAttendanceRows.map((row, index) => (
                      <tr key={`${row.record_id}-${index}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slateText">{formatDayLabel(row.date)}</td>
                        <td className="px-3 py-2 font-medium text-ink">{row.employee_code || "-"}</td>
                        <td className="px-3 py-2 text-ink">{row.employee_name || "Unknown Employee"}</td>
                        <td className="px-3 py-2 text-slateText">{row.gender || "-"}</td>
                        <td className="px-3 py-2 text-slateText">{formatDisplayDate(row.date)}</td>
                        <td className="px-3 py-2 text-slateText">{row.raw_status || "-"}</td>
                        <td className="px-3 py-2 text-slateText">{row.in_time || "-"}</td>
                        <td className="px-3 py-2 text-slateText">{row.out_time || "-"}</td>
                        <td className="px-3 py-2 text-slateText">{row.working_hours || "-"}</td>
                        <td className="px-3 py-2 text-ink">{row.attendance_classification}</td>
                        <td className="px-3 py-2 text-slateText" title={buildAttendanceAuditTitle(row)}>
                          {formatRuleId(row.detected_rule_id)}
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">{row.payroll_impact_label}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-center text-slateText">
                        No processed attendance rows are available for the current search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CompactInfoCard>
        </div>
      ) : null}

      {activeTab === "policy" ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <CompactInfoCard
            title="Attendance Policy Rules"
            subtitle="These thresholds are applied to classify the processed attendance working."
            action={
              <button
                type="button"
                onClick={handleApplyRules}
                disabled={isUpdating}
                className="rounded-xl border border-ink bg-ink px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isUpdating ? "Applying..." : "Apply Rules"}
              </button>
            }
          >
            <div className="space-y-3">
              {policyRules.map((rule, ruleIndex) => (
                <div
                  key={`${rule.rule_id}-${ruleIndex}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{rule.label}</p>
                        <button
                          type="button"
                          onClick={() => handleRuleToggle(rule.rule_id)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            rule.enabled
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-slateText">{rule.description}</p>
                    </div>

                    <div className="w-full max-w-[220px]">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
                        Rule Value
                      </label>
                      <input
                        type="text"
                        value={rule.value}
                        disabled={!rule.enabled}
                        onChange={(event) => handleRuleValueChange(rule.rule_id, event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CompactInfoCard>

          <div className="space-y-4">
            <CompactInfoCard
              title="Classification Guide"
              subtitle="How HR should interpret the generated attendance results."
            >
              <div className="space-y-2 text-sm text-slateText">
                <InfoLine label="Present" value="Employee met full-shift policy for the day." />
                <InfoLine label="Half Day" value="Late arrival after noon or working hours below the half-day threshold." />
                <InfoLine label="Late Entry" value="In-time was later than the allowed last entry window." />
                <InfoLine label="Early Logout" value="Employee exited before completing the minimum expected hours." />
                <InfoLine label="Irregular Punch" value="A punch is missing or needs HR review before final payroll approval." />
                <InfoLine label="WO / Holiday" value="Paid only when the weekly eligibility rule is satisfied." />
              </div>
            </CompactInfoCard>

            <CompactInfoCard
              title="Processing Notes"
              subtitle="Operational context for the current attendance run."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric label="Records Processed" value={filteredRows.length.toString()} />
                <MiniMetric label="Unique Employees" value={display.employeeCount.toString()} />
                <MiniMetric label="Future Dates" value={safeSummary.processing_summary.future_date_count.toString()} />
                <MiniMetric label="Suspicious Entries" value={safeSummary.processing_summary.suspicious_entry_count.toString()} />
              </div>
            </CompactInfoCard>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type TopSummaryCardProps = {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "amber" | "sky" | "slate";
  onClick?: () => void;
};

function TopSummaryCard({ label, value, tone, onClick }: TopSummaryCardProps) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900"
  };

  const content = (
    <div className={`rounded-2xl border p-4 shadow-soft transition-shadow ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button type="button" onClick={onClick} className="text-left transition hover:-translate-y-0.5">
      {content}
    </button>
  );
}

type StatusBadgeProps = {
  status: "valid" | "warning" | "error";
};

function StatusBadge({ status }: StatusBadgeProps) {
  const badgeCopy = {
    valid: {
      label: "Attendance Ready",
      classes: "border-emerald-200 bg-emerald-50 text-emerald-800"
    },
    warning: {
      label: "Needs HR Review",
      classes: "border-amber-200 bg-amber-50 text-amber-800"
    },
    error: {
      label: "Critical Issues",
      classes: "border-rose-200 bg-rose-50 text-rose-700"
    }
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeCopy[status].classes}`}
    >
      {badgeCopy[status].label}
    </span>
  );
}

type TabButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-slate-200 bg-white/95 text-slateText hover:border-teal-300 hover:text-teal-800"
      }`}
    >
      {label}
    </button>
  );
}

type FilterSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      >
        {options.map((option, index) => (
          <option key={`${option}-${index}`} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type FilterInputProps = {
  label: string;
  type: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

function FilterInput({ label, type, value, placeholder, onChange }: FilterInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      />
    </label>
  );
}

type CompactInfoCardProps = {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
};

function CompactInfoCard({ title, subtitle, action, children }: CompactInfoCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-soft">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[15px] font-bold text-ink sm:text-base">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-slateText">{subtitle}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

type MiniMetricProps = {
  label: string;
  value: string;
  onClick?: () => void;
};

function MiniMetric({ label, value, onClick }: MiniMetricProps) {
  const content = (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold text-ink">{value}</p>
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button type="button" onClick={onClick} className="text-left transition hover:-translate-y-0.5">
      {content}
    </button>
  );
}

type CompactEmptyStateProps = {
  title: string;
  description: string;
};

function CompactEmptyState({ title, description }: CompactEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-2 text-sm text-slateText">{description}</p>
    </div>
  );
}

type SeverityBadgeProps = {
  severity: "warning" | "error";
};

function SeverityBadge({ severity }: SeverityBadgeProps) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
        severity === "error"
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-800"
      }`}
    >
      {severity === "error" ? "High Priority" : "Review"}
    </span>
  );
}

type InfoLineProps = {
  label: string;
  value: string;
};

function InfoLine({ label, value }: InfoLineProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="font-semibold text-ink">{label}</p>
      <p className="mt-1 text-sm text-slateText">{value}</p>
    </div>
  );
}

function employeeKey(employee: EmployeeAttendanceRegisterRow) {
  return employee.employeeCode || employee.employeeName;
}

function formatRuleId(ruleId: string) {
  return ruleId ? ruleId.replace(/_/g, " ") : "Not specified";
}

function formatFlag(flag: string) {
  return flag
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatAction(actionKey: string) {
  return actionKey
    ? actionKey
        .replaceAll("_", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
    : "No action selected";
}

function formatAdministrativeScope(item: AttendanceAdministrativeException) {
  if (item.scope === "specific_unit") {
    return item.unit_name || "Specific Unit";
  }
  if (item.scope === "selected_employees") {
    return `${item.employee_ids.length} Selected Employees`;
  }
  return "All Employees";
}

function hasReviewComment(reason: string, remarks: string) {
  return Boolean(reason.trim() || remarks.trim());
}

function buildAttendanceAuditTitle(row: AttendanceProcessedRow) {
  return [
    row.rule_explanation || "No rule explanation available",
    row.action_source ? `Source: ${row.action_source}` : "",
    row.action_reason ? `Reason: ${row.action_reason}` : "",
    row.action_remarks ? `Remarks: ${row.action_remarks}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDisplayDate(dateValue: string) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatDayLabel(dateValue: string) {
  if (!dateValue) {
    return "-";
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date);
}

const reviewFilterOptions: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "All Exceptions" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half Day" },
  { value: "late", label: "Late" },
  { value: "early_logout", label: "Early Logout" },
  { value: "paid_weekoff", label: "Paid Weekoffs" },
  { value: "unpaid_weekoff", label: "Unpaid Weekoffs" },
  { value: "paid_holiday", label: "Paid Holidays" },
  { value: "comp_off", label: "Comp Off" },
  { value: "pending_review", label: "Pending Review" },
  { value: "irregular_punch", label: "Irregular Punch" },
  { value: "duplicate_punches", label: "Duplicate Punches" },
  { value: "invalid_duration", label: "Invalid Durations" },
  { value: "overnight", label: "Overnight" },
  { value: "missing_out_time", label: "Missing Out-Time" },
  { value: "impossible_timings", label: "Impossible Timings" }
];

function reviewFilterLabel(value: ReviewFilter) {
  const staticLabels: Record<ReviewFilter, string> = {
    all: "All Exceptions",
    present: "Present",
    absent: "Absent",
    half_day: "Half Day",
    late: "Late Flags",
    early_logout: "Early Logout",
    paid_weekoff: "Paid Weekoffs",
    unpaid_weekoff: "Unpaid Weekoffs",
    paid_holiday: "Paid Holidays",
    unpaid_holiday: "Unpaid Holidays",
    comp_off: "Comp Off",
    comp_off_earned: "Comp Off Earned",
    comp_off_adjusted: "Comp Off Adjusted",
    comp_off_balance: "Comp Off Balance",
    pending_review: "Pending Review",
    irregular_punch: "Irregular Punch",
    gross_payable: "Gross Payable",
    late_deduction: "Late Deduction",
    final_payable: "Final Payable",
    leave_adjusted: "Leave Adjusted",
    primary_total: "Primary Total",
    duplicate_punches: "Duplicate Punches",
    invalid_duration: "Invalid Durations",
    overnight: "Overnight",
    missing_out_time: "Missing Out-Time",
    impossible_timings: "Impossible Timings"
  };

  return staticLabels[value];
}

function matchesReviewFilter(
  group: AttendanceExceptionGroup,
  reviewFilter: ReviewFilter
) {
  if (reviewFilter === "all") {
    return true;
  }

  if (reviewFilter === "pending_review") {
    return group.requires_review;
  }

  if (reviewFilter === "absent") {
    return group.category === "absent_review";
  }

  if (reviewFilter === "late") {
    return group.category === "late_review";
  }

  if (["present", "half_day", "early_logout", "paid_weekoff", "unpaid_weekoff", "paid_holiday", "comp_off"].includes(reviewFilter)) {
    return false;
  }

  if (reviewFilter === "irregular_punch") {
    return group.category === "missing_punch";
  }

  if (reviewFilter === "duplicate_punches") {
    return ["duplicate_punches", "multiple_entries"].includes(group.category);
  }

  if (reviewFilter === "invalid_duration") {
    return group.category === "invalid_duration";
  }

  if (reviewFilter === "overnight") {
    return group.anomaly_flags.includes("overnight_punch");
  }

  if (reviewFilter === "missing_out_time") {
    return group.anomaly_flags.includes("missing_out_time");
  }

  return group.anomaly_flags.some((flag) =>
    ["impossible_overnight_shift", "negative_duration", "future_date"].includes(flag)
  );
}

function matchesProcessedRowFilter(
  row: AttendanceProcessedRow,
  reviewFilter: ReviewFilter,
  group?: AttendanceExceptionGroup | null
) {
  if (reviewFilter === "all") {
    return Boolean(group);
  }
  if (reviewFilter === "present") {
    return ["present", "present_late"].includes(row.final_status_code);
  }
  if (reviewFilter === "absent") {
    return row.final_status_code === "absent";
  }
  if (reviewFilter === "half_day") {
    return row.final_status_code === "half_day";
  }
  if (reviewFilter === "late") {
    return row.derived_flags.includes("late_entry");
  }
  if (reviewFilter === "early_logout") {
    return row.derived_flags.includes("early_logout");
  }
  if (reviewFilter === "paid_weekoff") {
    return row.final_status_code === "paid_wo";
  }
  if (reviewFilter === "unpaid_weekoff") {
    return row.final_status_code === "unpaid_wo";
  }
  if (reviewFilter === "paid_holiday") {
    return row.final_status_code === "paid_holiday";
  }
  if (reviewFilter === "unpaid_holiday") {
    return row.final_status_code === "unpaid_holiday";
  }
  if (reviewFilter === "comp_off") {
    return row.comp_off_earned > 0 || row.comp_off_adjusted > 0;
  }
  if (reviewFilter === "comp_off_earned") {
    return row.comp_off_earned > 0;
  }
  if (reviewFilter === "comp_off_adjusted") {
    return row.comp_off_adjusted > 0;
  }
  if (reviewFilter === "comp_off_balance") {
    return row.comp_off_earned > 0 || row.comp_off_adjusted > 0;
  }
  if (reviewFilter === "pending_review" || reviewFilter === "irregular_punch") {
    if (reviewFilter === "pending_review") {
      return row.final_status_code === "irregular_review";
    }
    return (
      row.final_status_code === "irregular_review" ||
      row.derived_flags.includes("missing_in_time") ||
      row.derived_flags.includes("missing_out_time")
    );
  }
  if (reviewFilter === "duplicate_punches") {
    return Boolean(group && ["duplicate_punches", "multiple_entries"].includes(group.category));
  }
  if (reviewFilter === "invalid_duration") {
    return row.anomaly_flags.some((flag) => ["invalid_duration", "negative_duration"].includes(flag));
  }
  if (reviewFilter === "overnight") {
    return row.derived_flags.includes("overnight_exit") || row.anomaly_flags.includes("overnight_punch");
  }
  if (reviewFilter === "missing_out_time") {
    return row.derived_flags.includes("missing_out_time");
  }
  if (reviewFilter === "gross_payable") {
    return row.payable_day_impact > 0;
  }
  if (reviewFilter === "late_deduction") {
    return row.derived_flags.includes("late_entry") || row.late_deduction_adjusted > 0;
  }
  if (reviewFilter === "final_payable") {
    return row.payable_day_impact > 0 || row.comp_off_adjusted > 0 || row.late_deduction_adjusted > 0;
  }
  if (reviewFilter === "leave_adjusted") {
    return (row.hr_override_status || "").trim().toLowerCase() === "leave adjusted";
  }
  if (reviewFilter === "primary_total") {
    return [
      "present",
      "present_late",
      "half_day",
      "absent",
      "paid_wo",
      "unpaid_wo",
      "paid_holiday",
      "unpaid_holiday",
      "irregular_review"
    ].includes(row.final_status_code);
  }
  return row.anomaly_flags.some((flag) =>
    ["impossible_overnight_shift", "negative_duration", "future_date"].includes(flag)
  );
}

function buildProcessedRowIssueSummary(row: AttendanceProcessedRow) {
  if (row.final_status_code === "irregular_review") {
    return "Pending HR review";
  }
  if (row.comp_off_earned > 0) {
    return "Comp off candidate";
  }
  if (row.derived_flags.length > 0) {
    return row.derived_flags.map(formatFlag).join(", ");
  }
  return row.attendance_classification;
}
