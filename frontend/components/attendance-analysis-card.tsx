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
  AttendanceEmployeeMonthlySummaryItem,
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

type AnalysisTab = "dashboard" | "review" | "processed" | "policy" | "breakdown";
type ReviewFilter =
  | "all"
  | "present"
  | "absent"
  | "half_day"
  | "late"
  | "early_login"
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

type ExplainabilityMetric =
  | "present"
  | "absent"
  | "half_day"
  | "late_flags"
  | "early_login"
  | "early_logout"
  | "overnight"
  | "irregular_punch"
  | "payable_sundays"
  | "unpaid_sundays"
  | "paid_holidays"
  | "unpaid_holidays"
  | "comp_off_earned"
  | "comp_off_adjusted"
  | "comp_off_balance"
  | "pending_review"
  | "gross_payable"
  | "final_payable"
  | "late_deduction"
  | "leave_adjusted";

type MetricExplainabilityState = {
  metric: ExplainabilityMetric;
  title: string;
  employeeLabel?: string;
  employeeKey?: string;
  sourceRows: AttendanceProcessedRow[];
  monthlySummaries: AttendanceEmployeeMonthlySummaryItem[];
};

type RowExplainabilityState = {
  row: AttendanceProcessedRow;
  group?: AttendanceExceptionGroup | null;
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
  const [metricExplainability, setMetricExplainability] =
    useState<MetricExplainabilityState | null>(null);
  const [rowExplainability, setRowExplainability] =
    useState<RowExplainabilityState | null>(null);
  const [calculationEmployeeKey, setCalculationEmployeeKey] = useState("");
  const selectAllVisibleRef = useRef<HTMLInputElement | null>(null);

  function scrollToEmployeeRow(targetEmployeeKey?: string | null) {
    const rowKey = targetEmployeeKey || selectedEmployeeKey;
    if (!rowKey || typeof document === "undefined") {
      return;
    }
    requestAnimationFrame(() => {
      const rowElement = document.querySelector<HTMLElement>(
        `[data-employee-row-key="${CSS.escape(rowKey)}"]`
      );
      rowElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function backToMonthlySummary(targetEmployeeKey?: string | null) {
    if (targetEmployeeKey) {
      setSelectedEmployeeKey(targetEmployeeKey);
    }
    setMetricExplainability(null);
    setRowExplainability(null);
    setActiveTab("dashboard");
    scrollToEmployeeRow(targetEmployeeKey);
  }

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
    setMetricExplainability(null);
    setRowExplainability(null);
    setCalculationEmployeeKey("");
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
  const employeeMonthlySummary = display.employeeMonthlySummary;
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
    if (!calculationEmployeeKey && employeeRegister[0]) {
      setCalculationEmployeeKey(employeeKey(employeeRegister[0]));
    }
  }, [calculationEmployeeKey, employeeRegister]);

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

  const calculationEmployee =
    employeeRegister.find((employee) => employeeKey(employee) === calculationEmployeeKey) ??
    selectedEmployee ??
    employeeRegister[0] ??
    null;

  const calculationEmployeeMonthlySummary = useMemo(() => {
    if (!calculationEmployee) {
      return [];
    }
    const targetKey = calculationEmployee.employeeCode || calculationEmployee.employeeName;
    return employeeMonthlySummary
      .filter((item) => (item.employee_id || item.employee_name) === targetKey)
      .sort((left, right) => left.month.localeCompare(right.month));
  }, [calculationEmployee, employeeMonthlySummary]);

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
    reviewFilter: ReviewFilter,
    metric?: ExplainabilityMetric
  ) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (metric) {
            openMetricExplainability(metric, {
              employee,
              title: `${employee.employeeName || employee.employeeCode} → ${metricCardLabel(metric)}`
            });
            return;
          }
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

  function openMetricExplainability(
    metric: ExplainabilityMetric,
    options?: {
      employee?: EmployeeAttendanceRegisterRow | null;
      title?: string;
    }
  ) {
    const scopedEmployee = options?.employee ?? null;
    const employeeScopedRows = scopedEmployee
      ? filteredRows.filter(
          (row) =>
            (row.employee_code || row.employee_name || row.record_id) ===
            (scopedEmployee.employeeCode || scopedEmployee.employeeName)
        )
      : filteredRows;
    const employeeScopedSummaries = scopedEmployee
      ? employeeMonthlySummary.filter(
          (item) =>
            (item.employee_id || item.employee_name) ===
            (scopedEmployee.employeeCode || scopedEmployee.employeeName)
        )
      : employeeMonthlySummary;

    setMetricExplainability({
      metric,
      title:
        options?.title ??
        `${scopedEmployee ? `${scopedEmployee.employeeName || scopedEmployee.employeeCode} → ` : ""}${metricCardLabel(metric)}`,
      employeeLabel: scopedEmployee?.employeeName || scopedEmployee?.employeeCode,
      employeeKey: scopedEmployee ? employeeKey(scopedEmployee) : undefined,
      sourceRows: employeeScopedRows,
      monthlySummaries: employeeScopedSummaries,
    });
  }

  function openCalculationBreakdown(
    employee?: EmployeeAttendanceRegisterRow | null
  ) {
    const employeeForBreakdown = employee ?? selectedEmployee ?? employeeRegister[0] ?? null;
    if (!employeeForBreakdown) {
      return;
    }
    setCalculationEmployeeKey(employeeKey(employeeForBreakdown));
    setActiveTab("breakdown");
  }

  function openRowExplainability(
    row: AttendanceProcessedRow,
    group?: AttendanceExceptionGroup | null
  ) {
    setRowExplainability({ row, group: group ?? null });
  }

  function openEmployeeMetricReview(
    employee: EmployeeAttendanceRegisterRow,
    reviewFilter: ReviewFilter
  ) {
    setReviewSearchTerm("");
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

  function openRowInReview(
    row: AttendanceProcessedRow,
    reviewFilter: ReviewFilter
  ) {
    const rowEmployeeKey = row.employee_code || row.employee_name || row.record_id;
    const matchingEmployee =
      employeeRegister.find((employee) => employeeKey(employee) === rowEmployeeKey) ?? null;
    if (matchingEmployee) {
      setSelectedEmployeeKey(employeeKey(matchingEmployee));
      setReviewDrilldownContext({
        employeeKey: matchingEmployee.employeeCode || matchingEmployee.employeeName,
        employeeLabel: matchingEmployee.employeeName || matchingEmployee.employeeCode,
        filter: reviewFilter,
        filterLabel: reviewFilterLabel(reviewFilter),
        scrollY: typeof window !== "undefined" ? window.scrollY : 0
      });
    } else {
      setReviewDrilldownContext(null);
    }
    setActiveTab("review");
    setSelectedReviewFilter(reviewFilter);
    setReviewSearchTerm(row.date || "");
    setSelectedExceptionIds([]);
    setMetricExplainability(null);
    setRowExplainability(null);
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
            label="Calculation Breakdown"
            active={activeTab === "breakdown"}
            onClick={() => openCalculationBreakdown()}
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
            <TopSummaryCard label="Present" value={display.statusSummary.present_count.toString()} tone="emerald" onClick={() => openMetricExplainability("present")} />
            <TopSummaryCard label="Absent" value={display.statusSummary.absent_count.toString()} tone="rose" onClick={() => openMetricExplainability("absent")} />
            <TopSummaryCard label="Half Day" value={display.statusSummary.half_day_count.toString()} tone="amber" onClick={() => openMetricExplainability("half_day")} />
            <TopSummaryCard label="Late Flags" value={display.statusSummary.late_entry_count.toString()} tone="sky" onClick={() => openMetricExplainability("late_flags")} />
            <TopSummaryCard label="Early Login" value={display.statusSummary.early_login_count.toString()} tone="sky" onClick={() => openMetricExplainability("early_login")} />
            <TopSummaryCard
              label="Irregular Punch"
              value={display.irregularPunchCount.toString()}
              tone="amber"
              onClick={() => openMetricExplainability("irregular_punch")}
            />
            <TopSummaryCard label="Payable Sundays" value={display.payableSundays.toString()} tone="emerald" onClick={() => openMetricExplainability("payable_sundays")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <TopSummaryCard label="Unpaid Sundays" value={display.unpaidSundays.toString()} tone="slate" onClick={() => openMetricExplainability("unpaid_sundays")} />
            <TopSummaryCard
              label="Comp Off Earned"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "comp_off_earned_count"))}
              tone="emerald"
              onClick={() => openMetricExplainability("comp_off_earned")}
            />
            <TopSummaryCard
              label="Comp Off Adjusted"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "comp_off_adjusted_days"))}
              tone="sky"
              onClick={() => openMetricExplainability("comp_off_adjusted")}
            />
            <TopSummaryCard
              label="Comp Off Balance"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "comp_off_balance"))}
              tone="slate"
              onClick={() => openMetricExplainability("comp_off_balance")}
            />
            <TopSummaryCard
              label="Pending Review"
              value={display.statusSummary.pending_review_count.toString()}
              tone="amber"
              onClick={() => openMetricExplainability("pending_review")}
            />
            <TopSummaryCard
              label="Gross Payable"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "gross_payable_days"))}
              tone="emerald"
              onClick={() => openMetricExplainability("gross_payable")}
            />
            <TopSummaryCard
              label="Late Deductions"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "late_penalty_after_comp_off"))}
              tone="rose"
              onClick={() => openMetricExplainability("late_deduction")}
            />
            <TopSummaryCard
              label="Final Payable"
              value={formatMetricValue(sumEmployeeMetric(employeeMonthlySummary, "payable_days"))}
              tone="emerald"
              onClick={() => openMetricExplainability("final_payable")}
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
          <CompactInfoCard
            title="Employee Monthly Summary"
            subtitle="Use this as the HR attendance register for the current selection."
                action={
                  <div className="flex flex-wrap gap-2">
                    {selectedEmployee ? (
                      <button
                        type="button"
                        onClick={() => openCalculationBreakdown(selectedEmployee)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                      >
                        View Calculation
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleExportWorking}
                      className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100"
                    >
                      Download Excel
                    </button>
                  </div>
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
                        <th className="px-3 py-2 font-semibold">Calculation</th>
                        <th className="px-3 py-2 font-semibold">Late Flags</th>
                        <th className="px-3 py-2 font-semibold">Early Login</th>
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
                            data-employee-row-key={employeeKey(employee)}
                            onClick={() => setSelectedEmployeeKey(employeeKey(employee))}
                            className={`cursor-pointer transition ${
                              isSelected ? "bg-teal-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="px-3 py-2 font-medium text-ink">{employee.employeeCode || "-"}</td>
                            <td className="px-3 py-2 text-ink">{employee.employeeName || "Unknown Employee"}</td>
                            <td className="px-3 py-2 text-slateText">{employee.gender || "-"}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.presentDays, employee, "present", "present")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.halfDays, employee, "half_day", "half_day")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.absentDays, employee, "absent", "absent")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.paidWeekOffs, employee, "paid_weekoff", "payable_sundays")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.unpaidWeekOffs, employee, "unpaid_weekoff", "unpaid_sundays")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.paidHolidays, employee, "paid_holiday", "paid_holidays")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.unpaidHolidays, employee, "unpaid_holiday", "unpaid_holidays")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.pendingReviewDays, employee, "pending_review", "pending_review")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.grossPayableDays, employee, "gross_payable", "gross_payable")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.lateDeduction, employee, "late_deduction", "late_deduction")}</td>
                            <td className="px-3 py-2 font-semibold text-ink">{renderMetricCell(employee.finalPayableDays, employee, "final_payable", "final_payable")}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCalculationBreakdown(employee);
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-slate-50"
                              >
                                View Calculation
                              </button>
                            </td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.lateFlags, employee, "late", "late_flags")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.earlyLoginFlags, employee, "early_login", "early_login")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.irregularPunchFlags, employee, "irregular_punch", "irregular_punch")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.earlyLogoutFlags, employee, "early_logout", "early_logout")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.overnightFlags, employee, "overnight", "overnight")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffEarned, employee, "comp_off_earned", "comp_off_earned")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffAdjusted, employee, "comp_off_adjusted", "comp_off_adjusted")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.compOffBalance, employee, "comp_off_balance", "comp_off_balance")}</td>
                            <td className="px-3 py-2 text-slateText">{renderMetricCell(employee.leaveAdjusted, employee, "leave_adjusted", "leave_adjusted")}</td>
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
                          <td colSpan={25} className="px-3 py-6 text-center text-slateText">
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
                  <MiniMetric label="Present" value={display.statusSummary.present_count.toString()} onClick={() => openMetricExplainability("present")} />
                  <MiniMetric label="Absent" value={display.statusSummary.absent_count.toString()} onClick={() => openMetricExplainability("absent")} />
                  <MiniMetric label="Half Day" value={display.statusSummary.half_day_count.toString()} onClick={() => openMetricExplainability("half_day")} />
                  <MiniMetric label="Paid WO" value={display.statusSummary.paid_week_off_count.toString()} onClick={() => openMetricExplainability("payable_sundays")} />
                  <MiniMetric label="Paid Holiday" value={display.statusSummary.paid_holiday_count.toString()} onClick={() => openMetricExplainability("paid_holidays")} />
                  <MiniMetric label="Late Flags" value={display.statusSummary.late_entry_count.toString()} onClick={() => openMetricExplainability("late_flags")} />
                  <MiniMetric label="Early Login" value={display.statusSummary.early_login_count.toString()} onClick={() => openMetricExplainability("early_login")} />
                  <MiniMetric label="Pending Review" value={display.statusSummary.pending_review_count.toString()} onClick={() => openMetricExplainability("pending_review")} />
                  <MiniMetric label="Comp Off" value={display.statusSummary.comp_off_earned_count.toString()} onClick={() => openMetricExplainability("comp_off_earned")} />
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
                    <th className="px-3 py-2 font-semibold">Explain</th>
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
                          <button
                            type="button"
                            onClick={() => openRowExplainability(processedRow, group)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-slate-50"
                          >
                            Explain
                          </button>
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
                      <td colSpan={15} className="px-3 py-6 text-center text-slateText">
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
                                <th className="px-3 py-2 font-semibold">Explain</th>
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
                                  <td className="px-3 py-2">
                                    {processedRow ? (
                                      <button
                                        type="button"
                                        onClick={() => openRowExplainability(processedRow, group)}
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-slate-50"
                                      >
                                        Explain
                                      </button>
                                    ) : (
                                      <span className="text-xs text-slateText">-</span>
                                    )}
                                  </td>
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

      {activeTab === "breakdown" ? (
        <div className="mt-4 space-y-4">
          <CompactInfoCard
            title="Calculation Breakdown"
            subtitle="Trace final payable from daily attendance results, comp off usage, and late deductions without doing the math manually."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
              <FilterSelect
                label="Employee"
                value={calculationEmployeeKey}
                options={employeeRegister.map((employee) => employeeKey(employee))}
                onChange={setCalculationEmployeeKey}
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slateText">
                This tab uses the exact monthly reconciliation outputs from the attendance engine. It does not recalculate payroll separately in the UI.
              </div>
            </div>

            {calculationEmployee ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
                      Employee Payroll Journey
                    </p>
                    <h5 className="mt-1 text-lg font-bold text-ink">
                      {calculationEmployee.employeeName || calculationEmployee.employeeCode}
                    </h5>
                    <p className="mt-1 text-sm text-slateText">
                      {calculationEmployee.employeeCode || "No employee code"} • {calculationEmployee.gender || "Gender not available"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => backToMonthlySummary(employeeKey(calculationEmployee))}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                    >
                      ← Back to Monthly Summary
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedEmployeeKey(employeeKey(calculationEmployee))}
                      className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
                    >
                      Sync with Monthly Summary
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {calculationEmployeeMonthlySummary.length > 0 ? (
                    calculationEmployeeMonthlySummary.map((item) => (
                      <CalculationBreakdownPanel
                        key={`${item.employee_id}-${item.month}`}
                        summaryItem={item}
                        rows={filteredRows.filter(
                          (row) =>
                            (row.employee_code || row.employee_name || row.record_id) ===
                              (calculationEmployee.employeeCode || calculationEmployee.employeeName) &&
                            row.date.startsWith(item.month)
                        )}
                        onExplainRow={openRowExplainability}
                        onOpenRowReview={openRowInReview}
                      />
                    ))
                  ) : (
                    <CompactEmptyState
                      title="No monthly breakdown available"
                      description="The current filter does not contain a complete employee-month summary to explain."
                    />
                  )}
                </div>
              </div>
            ) : (
              <CompactEmptyState
                title="Select an employee"
                description="Choose an employee from the monthly summary to open the payroll explanation journey."
              />
            )}
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

      {metricExplainability ? (
        <MetricExplainabilityDialog
          state={metricExplainability}
          policyRules={policyRules}
          onClose={() => setMetricExplainability(null)}
          onBackToMonthlySummary={backToMonthlySummary}
          onOpenReview={(filter, employeeKeyValue) => {
            setMetricExplainability(null);
            if (employeeKeyValue) {
              const employee =
                employeeRegister.find(
                  (item) => employeeKey(item) === employeeKeyValue
                ) ?? null;
              if (employee) {
                openEmployeeMetricReview(employee, filter);
                return;
              }
            }
            openReviewFilter(filter);
          }}
          onOpenRowReview={openRowInReview}
          onOpenRowExplain={openRowExplainability}
        />
      ) : null}

      {rowExplainability ? (
        <RowExplainabilityDialog
          state={rowExplainability}
          policyRules={policyRules}
          onClose={() => setRowExplainability(null)}
          onBackToMonthlySummary={backToMonthlySummary}
          onOpenRowReview={openRowInReview}
        />
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

type CalculationBreakdownPanelProps = {
  summaryItem: AttendanceEmployeeMonthlySummaryItem;
  rows: AttendanceProcessedRow[];
  onExplainRow: (row: AttendanceProcessedRow) => void;
  onOpenRowReview: (row: AttendanceProcessedRow, filter: ReviewFilter) => void;
};

function CalculationBreakdownPanel({
  summaryItem,
  rows,
  onExplainRow,
  onOpenRowReview,
}: CalculationBreakdownPanelProps) {
  const explainability = summaryItem.explainability;
  const breakdown = explainability?.calculation_breakdown;
  const lateExplanation = explainability?.late_deduction;
  const compOffLedger = explainability?.comp_off_ledger ?? [];
  const compOffUsageTrail = explainability?.comp_off_usage_trail ?? [];
  const presentPayableDays = roundMetric(summaryItem.present_count * 1);
  const halfDayPayableDays = roundMetric(summaryItem.half_day_count * 0.5);
  const absentPayableDays = 0;
  const paidWeekOffPayableDays = roundMetric(summaryItem.paid_week_off_count * 1);
  const unpaidWeekOffPayableDays = 0;
  const paidHolidayPayableDays = roundMetric(summaryItem.paid_holiday_count * 1);
  const unpaidHolidayPayableDays = 0;
  const leaveAdjustedDays = rows.filter(
    (row) => normalizeText(row.hr_override_status) === "leave adjusted"
  ).length;
  const leaveAdjustedPayableDays = roundMetric(
    rows
      .filter((row) => normalizeText(row.hr_override_status) === "leave adjusted")
      .reduce((sum, row) => sum + row.payable_day_impact, 0)
  );
  const compOffTotalAdded = roundMetric(
    (breakdown?.comp_off_adjusted_against_absent_days ?? 0) +
      (breakdown?.comp_off_adjusted_against_late_days ?? 0)
  );
  const lateDeductionBeforeCompOff =
    lateExplanation?.deductions_before_comp_off ?? summaryItem.late_penalty_deductions;

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
            Calculation Breakdown
          </p>
          <h6 className="mt-1 text-base font-bold text-ink">
            {formatMonthLabel(summaryItem.month)}
          </h6>
          <p className="mt-1 text-sm text-slateText">
            Gross payable, comp off usage, late deductions, and final payable all come from the reconciled monthly attendance output.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniMetric label="Gross Payable" value={formatMetricValue(summaryItem.gross_payable_days)} />
          <MiniMetric label="Late Deduction" value={formatMetricValue(summaryItem.late_penalty_after_comp_off)} />
          <MiniMetric label="Final Payable" value={formatMetricValue(summaryItem.payable_days)} />
        </div>
      </div>

      {breakdown ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Final Payable Story</p>
              <p className="mt-1 text-sm text-slateText">
                This is the full monthly trail from attendance buckets to the final payroll-ready day count.
              </p>
              <div className="mt-3 space-y-2 text-sm text-slateText">
                <FormulaLine label="Month Days" value={breakdown.calendar_days} positive />
                <FormulaLine
                  label={`Present Days: ${summaryItem.present_count} × 1.0`}
                  value={presentPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Half Days: ${summaryItem.half_day_count} × 0.5`}
                  value={halfDayPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Absent Days: ${summaryItem.absent_count} × 0`}
                  value={absentPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Payable Sundays / WOs: ${summaryItem.paid_week_off_count} × 1.0`}
                  value={paidWeekOffPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Unpaid Sundays / WOs: ${summaryItem.unpaid_week_off_count} × 0`}
                  value={unpaidWeekOffPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Paid Holidays: ${summaryItem.paid_holiday_count} × 1.0`}
                  value={paidHolidayPayableDays}
                  positive
                />
                <FormulaLine
                  label={`Unpaid Holidays: ${summaryItem.unpaid_holiday_count} × 0`}
                  value={unpaidHolidayPayableDays}
                  positive
                />
                <FormulaLine label="Gross Payable" value={breakdown.gross_payable_days} positive emphasize />
                <FormulaLine
                  label={`Late Deduction: ${formatMetricValue(lateDeductionBeforeCompOff)}`}
                  value={lateDeductionBeforeCompOff}
                />
                <FormulaLine
                  label="Comp Off Added Back"
                  value={compOffTotalAdded}
                  positive
                />
                <FormulaLine
                  label={`Leave Adjustment (${leaveAdjustedDays} day${leaveAdjustedDays === 1 ? "" : "s"})`}
                  value={leaveAdjustedPayableDays}
                  positive
                  muted
                />
                <FormulaLine label="Final Payable" value={breakdown.final_payable_days} positive emphasize />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Attendance Summary</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InfoLine label="Present Days" value={String(summaryItem.present_count)} />
                <InfoLine label="Half Days" value={String(summaryItem.half_day_count)} />
                <InfoLine label="Absent Days" value={String(summaryItem.absent_count)} />
                <InfoLine label="Paid Sundays" value={String(summaryItem.paid_week_off_count)} />
                <InfoLine label="Unpaid Sundays" value={String(summaryItem.unpaid_week_off_count)} />
                <InfoLine label="Paid Holidays" value={String(summaryItem.paid_holiday_count)} />
                <InfoLine label="Pending Review" value={String(summaryItem.pending_review_count)} />
                <InfoLine label="Early Login" value={String(summaryItem.early_login_count ?? 0)} />
                <InfoLine label="Late Flags" value={String(summaryItem.late_entry_count)} />
                <InfoLine label="Comp Off Balance" value={formatMetricValue(summaryItem.comp_off_balance)} />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Late Deduction Trail</p>
              {lateExplanation ? (
                <div className="mt-3 space-y-3">
                  <RuleExplanationCard
                    title={lateExplanation.late_rule_label}
                    condition={`Late cutoff: ${lateExplanation.late_cutoff_time}. Every three late flags reduce payable days by one.`}
                    result={lateExplanation.formula_text}
                    payrollImpact={`Payroll Impact: -${formatMetricValue(lateExplanation.deductions_after_comp_off)} day(s) after comp off adjustment.`}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    {buildLateDeductionGroups(lateExplanation.late_source_dates).map((group, index) => (
                      <TimelineCard
                        key={`late-group-${index}`}
                        title={`Group ${index + 1}`}
                        subtitle={group.qualifies ? "This group creates one late deduction." : "This group is below the 3-late threshold and does not create a deduction yet."}
                        body={group.dates.join(" • ")}
                        badges={[
                          `${group.dates.length} late date${group.dates.length === 1 ? "" : "s"}`,
                          group.qualifies ? "Deduction Created: 1 Day" : "Deduction Created: 0 Day"
                        ]}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lateExplanation.late_source_dates.length > 0 ? (
                      lateExplanation.late_source_dates.map((date, index) => (
                        <span
                          key={`${date}-${index}`}
                          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
                        >
                          {formatShortDate(date)}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slateText">No late dates were recorded for this month.</span>
                    )}
                  </div>
                  {lateExplanation.comp_off_adjusted_against_late_days > 0 ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                      <p className="font-semibold">
                        Comp off offset applied: +{formatMetricValue(lateExplanation.comp_off_adjusted_against_late_days)} payable day(s)
                      </p>
                      <p className="mt-1">
                        Available comp off credits reduced the late deduction, so the final payroll deduction is only{" "}
                        {formatMetricValue(lateExplanation.deductions_after_comp_off)} day(s).
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Comp Off Earned</p>
              <div className="mt-3 space-y-3">
                {compOffLedger.length > 0 ? (
                  compOffLedger.map((item) => (
                    <TimelineCard
                      key={`${item.source_record_id}-${item.source_date}`}
                      title={`${formatShortDate(item.source_date)} • ${describeCompOffDayType(item.source_date)}`}
                      subtitle={`${item.source_attendance_result} • ${item.source_reason}`}
                      body={`Payroll Impact: Comp Off Earned +${formatMetricValue(item.earned_value)}`}
                      badges={[
                        `Hours: ${item.source_working_hours || "-"}`,
                        `Earned: ${formatMetricValue(item.earned_value)}`,
                        `Used: ${formatMetricValue(item.used_value)}`,
                        `Balance: ${formatMetricValue(item.balance_value)}`
                      ]}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slateText">No comp off credits were earned in this month.</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Comp Off Used</p>
              <div className="mt-3 space-y-3">
                {compOffUsageTrail.length > 0 ? (
                  compOffUsageTrail.map((trailItem, index) => (
                    <TimelineCard
                      key={`${trailItem.source_record_id || trailItem.source_kind}-${trailItem.adjusted_record_id}-${index}`}
                      title={`Comp Off Earned On ${trailItem.source_date ? formatShortDate(trailItem.source_date) : "Opening Balance"}`}
                      subtitle={
                        trailItem.source_date
                          ? `${trailItem.source_attendance_result} • ${trailItem.source_reason}`
                          : "Opening comp off balance carried forward from the previous month."
                      }
                      body={`${describeCompOffAdjustedAgainstExplanation(trailItem)} • Payroll Impact: ${humanizePayrollImpact(trailItem.payroll_impact)}`}
                      badges={[
                        `Earned: ${formatMetricValue(trailItem.earned_value)}`,
                        `Used Now: ${formatMetricValue(trailItem.adjustment_value)}`,
                        `Adjusted Against: ${describeCompOffAdjustedAgainst(trailItem)}`,
                        trailItem.source_working_hours ? `Hours: ${trailItem.source_working_hours}` : "Carry Forward"
                      ]}
                    />
                  ))
                ) : (
                  <p className="text-sm text-slateText">No comp off credits were consumed in this month.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-ink">Payroll-Affecting Attendance Records</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Day</th>
                  <th className="px-3 py-2 font-semibold">Employee ID</th>
                  <th className="px-3 py-2 font-semibold">Employee Name</th>
                  <th className="px-3 py-2 font-semibold">In Time</th>
                  <th className="px-3 py-2 font-semibold">Out Time</th>
                  <th className="px-3 py-2 font-semibold">Working Hours</th>
                  <th className="px-3 py-2 font-semibold">Attendance Result</th>
                  <th className="px-3 py-2 font-semibold">Rule Applied</th>
                  <th className="px-3 py-2 font-semibold">Payroll Impact</th>
                  <th className="px-3 py-2 font-semibold">HR Action</th>
                  <th className="px-3 py-2 font-semibold">HR Comment</th>
                  <th className="px-3 py-2 font-semibold">Review</th>
                  <th className="px-3 py-2 font-semibold">Explain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.record_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-ink">{formatDisplayDate(row.date)}</td>
                    <td className="px-3 py-2 text-slateText">{formatDayLabel(row.date)}</td>
                    <td className="px-3 py-2 font-medium text-ink">{row.employee_code || "-"}</td>
                    <td className="px-3 py-2 text-ink">{row.employee_name || row.employee_code}</td>
                    <td className="px-3 py-2 text-slateText">{row.in_time || "-"}</td>
                    <td className="px-3 py-2 text-slateText">{row.out_time || "-"}</td>
                    <td className="px-3 py-2 text-slateText">{row.working_hours || "-"}</td>
                    <td className="px-3 py-2 text-ink">{row.attendance_classification}</td>
                    <td className="px-3 py-2 text-slateText">{formatRuleId(row.detected_rule_id)}</td>
                    <td className="px-3 py-2 font-medium text-ink">{row.payroll_impact_label}</td>
                    <td className="px-3 py-2 text-slateText">{formatHrAction(row)}</td>
                    <td className="px-3 py-2 text-slateText">{formatHrComment(row)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onOpenRowReview(row, inferReviewFilterForRow(row))}
                        className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                      >
                        Open in HR Review
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onExplainRow(row)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-slate-50"
                      >
                        Explain
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13} className="px-3 py-6 text-center text-slateText">
                    No payroll-impacting rows are available for this employee-month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

type MetricExplainabilityDialogProps = {
  state: MetricExplainabilityState;
  policyRules: AttendancePolicyRule[];
  onClose: () => void;
  onBackToMonthlySummary: (employeeKey?: string | null) => void;
  onOpenReview: (filter: ReviewFilter, employeeKey?: string | null) => void;
  onOpenRowReview: (row: AttendanceProcessedRow, filter: ReviewFilter) => void;
  onOpenRowExplain: (row: AttendanceProcessedRow) => void;
};

function MetricExplainabilityDialog({
  state,
  policyRules,
  onClose,
  onBackToMonthlySummary,
  onOpenReview,
  onOpenRowReview,
  onOpenRowExplain,
}: MetricExplainabilityDialogProps) {
  const relevantRows = filterRowsForMetric(state.metric, state.sourceRows);
  const explanation = buildMetricRuleExplanation(state.metric, policyRules, state.monthlySummaries);
  const compOffTrail = state.monthlySummaries.flatMap(
    (item) => item.explainability?.comp_off_usage_trail ?? []
  );
  const compOffLedger = state.monthlySummaries.flatMap(
    (item) => item.explainability?.comp_off_ledger ?? []
  );
  const lateExplanation = aggregateLateDeductionExplanation(state.monthlySummaries);
  const finalPayableStory = buildFinalPayableStory(state.monthlySummaries, relevantRows);
  const lateGroups = lateExplanation
    ? buildLateDeductionGroups(lateExplanation.late_source_dates)
    : [];

  return (
    <DialogShell title={state.title} subtitle="Every number here is traced back to the processed attendance working.">
      <div className="space-y-4">
        <RuleExplanationCard
          title={explanation.title}
          condition={explanation.condition}
          result={explanation.result}
          payrollImpact={explanation.payrollImpact}
        />

        {state.metric === "comp_off_adjusted" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Comp Off Adjustment Mapping</p>
            <div className="mt-3 space-y-3">
              {compOffTrail.length > 0 ? (
                compOffTrail.map((trailItem, index) => (
                  <TimelineCard
                    key={`${trailItem.source_record_id || trailItem.source_kind}-${trailItem.adjusted_record_id}-${index}`}
                    title={`Comp Off Earned On: ${trailItem.source_date ? formatShortDate(trailItem.source_date) : "Opening Balance"}`}
                    subtitle={trailItem.source_reason || "Comp off credit was available to use."}
                    body={`${describeCompOffAdjustedAgainstExplanation(trailItem)} • Payroll Impact: ${humanizePayrollImpact(trailItem.payroll_impact)}`}
                    badges={[
                      `Used: ${formatMetricValue(trailItem.adjustment_value)}`,
                      `Adjusted Against: ${describeCompOffAdjustedAgainst(trailItem)}`,
                      trailItem.source_working_hours ? `Hours: ${trailItem.source_working_hours}` : "Carry Forward"
                    ]}
                  />
                ))
              ) : (
                <p className="text-sm text-slateText">No comp off adjustments were applied in the current selection.</p>
              )}
            </div>
          </section>
        ) : null}

        {state.metric === "comp_off_balance" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Unused Comp Off Balance</p>
            <div className="mt-3 space-y-3">
              {compOffLedger.filter((item) => item.balance_value > 0).length > 0 ? (
                compOffLedger
                  .filter((item) => item.balance_value > 0)
                  .map((item) => (
                    <TimelineCard
                      key={`${item.source_record_id}-${item.source_date}`}
                      title={`${formatShortDate(item.source_date)} • ${item.source_attendance_result}`}
                      subtitle={item.source_reason}
                      badges={[
                        `Earned: ${formatMetricValue(item.earned_value)}`,
                        `Used: ${formatMetricValue(item.used_value)}`,
                        `Remaining: ${formatMetricValue(item.balance_value)}`
                      ]}
                    />
                  ))
              ) : (
                <p className="text-sm text-slateText">No unused comp off balance remains in the current selection.</p>
              )}
            </div>
          </section>
        ) : null}

        {state.metric === "comp_off_earned" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Comp Off Earned Trail</p>
            <div className="mt-3 space-y-3">
              {compOffLedger.length > 0 ? (
                compOffLedger.map((item) => (
                  <TimelineCard
                    key={`${item.source_record_id}-${item.source_date}`}
                    title={formatShortDate(item.source_date)}
                    subtitle={`${describeCompOffDayType(item.source_date)} • ${item.source_attendance_result}`}
                    body={`Reason: ${item.source_reason} • Payroll Impact: Comp Off Earned +${formatMetricValue(item.earned_value)}`}
                    badges={[
                      `Working Hours: ${item.source_working_hours || "-"}`,
                      `Comp Off Earned: +${formatMetricValue(item.earned_value)}`
                    ]}
                  />
                ))
              ) : (
                <p className="text-sm text-slateText">No comp off credits were earned in the current selection.</p>
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">
              Total Comp Off Earned = {formatMetricValue(compOffLedger.reduce((sum, item) => sum + item.earned_value, 0))}
            </p>
          </section>
        ) : null}

        {state.metric === "late_deduction" && lateExplanation ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">{lateExplanation.late_rule_label}</p>
            <p className="mt-2 text-sm text-slateText">{lateExplanation.formula_text}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {lateGroups.map((group, index) => (
                <TimelineCard
                  key={`late-dialog-group-${index}`}
                  title={`Group ${index + 1}`}
                  subtitle={group.qualifies ? "This group creates 1 deduction day." : "This group is waiting for more late flags before it creates a deduction."}
                  body={group.dates.join(" • ")}
                  badges={[
                    `${group.dates.length} late date${group.dates.length === 1 ? "" : "s"}`,
                    group.qualifies ? "Deduction Created: 1 Day" : "Deduction Created: 0 Day"
                  ]}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {lateExplanation.late_source_dates.map((date, index) => (
                <span
                  key={`${date}-${index}`}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
                >
                  {formatShortDate(date)}
                </span>
              ))}
            </div>
            {lateExplanation.comp_off_adjusted_against_late_days > 0 ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                <p className="font-semibold">
                  Comp Off Offset Applied = +{formatMetricValue(lateExplanation.comp_off_adjusted_against_late_days)}
                </p>
                <p className="mt-1">
                  Some late deductions were neutralized by available comp off, so the remaining payroll deduction is{" "}
                  {formatMetricValue(lateExplanation.deductions_after_comp_off)} day(s).
                </p>
              </div>
            ) : null}
            <p className="mt-3 text-sm font-semibold text-ink">
              Payroll Impact: -{formatMetricValue(lateExplanation.deductions_after_comp_off)} day(s)
            </p>
          </section>
        ) : null}

        {state.metric === "final_payable" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-ink">Final Payable Calculation</p>
            <p className="mt-2 text-sm text-slateText">
              This panel explains exactly how the payroll-ready day count was produced for the selected employee or filtered view.
            </p>
            <div className="mt-3 space-y-2 text-sm text-slateText">
              <FormulaLine label="Month Days" value={finalPayableStory.monthDays} positive />
              <FormulaLine label={`Present Days: ${finalPayableStory.presentDays} × 1.0`} value={finalPayableStory.presentValue} positive />
              <FormulaLine label={`Half Days: ${finalPayableStory.halfDays} × 0.5`} value={finalPayableStory.halfValue} positive />
              <FormulaLine label={`Absent Days: ${finalPayableStory.absentDays} × 0`} value={0} positive />
              <FormulaLine label={`Comp Off Added`} value={finalPayableStory.compOffAdded} positive />
              <FormulaLine label={`Late Deduction`} value={finalPayableStory.lateDeduction} />
              <FormulaLine label={`Leave Adjustment`} value={finalPayableStory.leaveAdjustedValue} positive muted />
              <FormulaLine label="Final Payable" value={finalPayableStory.finalPayable} positive emphasize />
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Source Records</p>
              <p className="mt-1 text-sm text-slateText">
                These are the records currently contributing to {metricCardLabel(state.metric).toLowerCase()}.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenReview(metricToReviewFilter(state.metric), state.employeeKey ?? null)
              }
              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
            >
              Open in HR Review
            </button>
          </div>

          <div className="mt-3 max-h-[22rem] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Day</th>
                  <th className="px-3 py-2 font-semibold">Employee ID</th>
                  <th className="px-3 py-2 font-semibold">Employee Name</th>
                  <th className="px-3 py-2 font-semibold">In Time</th>
                  <th className="px-3 py-2 font-semibold">Out Time</th>
                  <th className="px-3 py-2 font-semibold">Working Hours</th>
                  {state.metric === "early_login" ? (
                    <>
                      <th className="px-3 py-2 font-semibold">Scheduled Start</th>
                      <th className="px-3 py-2 font-semibold">Minutes Early</th>
                    </>
                  ) : null}
                  <th className="px-3 py-2 font-semibold">Result</th>
                  <th className="px-3 py-2 font-semibold">Rule Applied</th>
                  <th className="px-3 py-2 font-semibold">Payroll Impact</th>
                  <th className="px-3 py-2 font-semibold">HR Action</th>
                  <th className="px-3 py-2 font-semibold">HR Comment</th>
                  <th className="px-3 py-2 font-semibold">Review</th>
                  <th className="px-3 py-2 font-semibold">Explain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relevantRows.length > 0 ? (
                  relevantRows.map((row) => (
                    <tr key={row.record_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-ink">{formatDisplayDate(row.date)}</td>
                      <td className="px-3 py-2 text-slateText">{formatDayLabel(row.date)}</td>
                      <td className="px-3 py-2 font-medium text-ink">{row.employee_code || "-"}</td>
                      <td className="px-3 py-2 text-ink">{row.employee_name || row.employee_code}</td>
                      <td className="px-3 py-2 text-slateText">{row.in_time || "-"}</td>
                      <td className="px-3 py-2 text-slateText">{row.out_time || "-"}</td>
                      <td className="px-3 py-2 text-slateText">{row.working_hours || "-"}</td>
                      {state.metric === "early_login" ? (
                        <>
                          <td className="px-3 py-2 text-slateText">10:00 AM</td>
                          <td className="px-3 py-2 text-slateText">{formatMinutesEarly(row)}</td>
                        </>
                      ) : null}
                      <td className="px-3 py-2 text-ink">{row.attendance_classification}</td>
                      <td className="px-3 py-2 text-slateText">{formatRuleId(row.detected_rule_id)}</td>
                      <td className="px-3 py-2 font-medium text-ink">{row.payroll_impact_label}</td>
                      <td className="px-3 py-2 text-slateText">{formatHrAction(row)}</td>
                      <td className="px-3 py-2 text-slateText">{formatHrComment(row)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenRowReview(row, metricToReviewFilter(state.metric))}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                        >
                          Open in HR Review
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenRowExplain(row)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-slate-50"
                        >
                          Explain
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={state.metric === "early_login" ? 15 : 13} className="px-3 py-6 text-center text-slateText">
                      No source records are contributing to this metric in the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <DialogFooter
        onClose={onClose}
        secondaryActionLabel="← Back to Monthly Summary"
        onSecondaryAction={() => onBackToMonthlySummary(state.employeeKey ?? null)}
      />
    </DialogShell>
  );
}

type RowExplainabilityDialogProps = {
  state: RowExplainabilityState;
  policyRules: AttendancePolicyRule[];
  onClose: () => void;
  onBackToMonthlySummary: (employeeKey?: string | null) => void;
  onOpenRowReview: (row: AttendanceProcessedRow, filter: ReviewFilter) => void;
};

function RowExplainabilityDialog({
  state,
  policyRules,
  onClose,
  onBackToMonthlySummary,
  onOpenRowReview,
}: RowExplainabilityDialogProps) {
  const { row, group } = state;
  return (
    <DialogShell
      title={`Explain • ${row.employee_name || row.employee_code || "Attendance Row"}`}
      subtitle="This is the decision trail for the selected attendance record."
    >
      <div className="space-y-4">
        <RuleExplanationCard
          title={formatRuleId(row.detected_rule_id)}
          condition={buildRowTriggerCondition(row, policyRules)}
          result={`Result: ${row.attendance_classification}`}
          payrollImpact={`Payroll Impact: ${row.payroll_impact_label || "Pending calculation"}`}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink">Attendance Data</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoLine label="Date" value={formatDisplayDate(row.date)} />
            <InfoLine label="Day" value={formatDayLabel(row.date)} />
            <InfoLine label="In Time" value={row.in_time || "Missing"} />
            <InfoLine label="Out Time" value={row.out_time || "Missing"} />
            <InfoLine label="Working Hours" value={row.working_hours || "Not computed"} />
            <InfoLine label="Raw Status" value={row.raw_status || "Not provided"} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink">Threshold Used</p>
          <p className="mt-2 text-sm text-slateText">{describeThresholdsForRow(row, policyRules)}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink">HR Review Availability</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoLine label="Current HR Action" value={formatHrAction(row)} />
            <InfoLine label="Current HR Comment" value={formatHrComment(row)} />
            <InfoLine
              label="Can HR Change This?"
              value={
                canHrAdjustRow(row, group)
                  ? "Yes, through the existing HR Review flow."
                  : "No active HR review action is suggested for this row right now."
              }
            />
            <InfoLine
              label="Review Guidance"
              value={
                canHrAdjustRow(row, group)
                  ? "Use Open in HR Review to regularize this row without leaving context."
                  : "This row is informational or already finalized unless a broader exception review is needed."
              }
            />
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onOpenRowReview(row, inferReviewFilterForRow(row, group))}
              className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100"
            >
              Open in HR Review
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-ink">Decision Trail</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {row.derived_flags.map((flag, index) => (
              <span
                key={`${flag}-${index}`}
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
              >
                {formatFlag(flag)}
              </span>
            ))}
            {row.anomaly_flags.map((flag, index) => (
              <span
                key={`${flag}-${index}`}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900"
              >
                {formatFlag(flag)}
              </span>
            ))}
            {row.derived_flags.length === 0 && row.anomaly_flags.length === 0 ? (
              <span className="text-sm text-slateText">No extra flags were recorded for this row.</span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-slateText">{row.rule_explanation || "No additional explanation was recorded for this rule."}</p>
          {group ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slateText">
              <p className="font-semibold text-ink">{group.summary}</p>
              <p className="mt-1">{group.details}</p>
            </div>
          ) : null}
        </section>
      </div>

      <DialogFooter
        onClose={onClose}
        secondaryActionLabel="← Back to Employee Row"
        onSecondaryAction={() =>
          onBackToMonthlySummary(row.employee_code || row.employee_name || row.record_id)
        }
      />
    </DialogShell>
  );
}

type DialogShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

function DialogShell({ title, subtitle, children }: DialogShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <h4 className="text-xl font-bold text-ink">{title}</h4>
          <p className="mt-1 text-sm text-slateText">{subtitle}</p>
        </div>
        <div className="max-h-[calc(88vh-7rem)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DialogFooter({
  onClose,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  onClose: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-between gap-3">
      {secondaryActionLabel && onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
        >
          {secondaryActionLabel}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
      >
        Close
      </button>
    </div>
  );
}

type RuleExplanationCardProps = {
  title: string;
  condition: string;
  result: string;
  payrollImpact: string;
};

function RuleExplanationCard({
  title,
  condition,
  result,
  payrollImpact,
}: RuleExplanationCardProps) {
  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
      <p className="text-sm font-semibold text-teal-900">{title}</p>
      <p className="mt-2 text-sm text-teal-900/90">{condition}</p>
      <p className="mt-2 text-sm font-medium text-teal-950">{result}</p>
      <p className="mt-2 text-sm font-semibold text-teal-950">{payrollImpact}</p>
    </section>
  );
}

type TimelineCardProps = {
  title: string;
  subtitle: string;
  body?: string;
  badges?: string[];
};

function TimelineCard({ title, subtitle, body, badges = [] }: TimelineCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-slateText">{subtitle}</p>
      {body ? <p className="mt-2 text-sm text-ink">{body}</p> : null}
      {badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((badge, index) => (
            <span
              key={`${badge}-${index}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

type FormulaLineProps = {
  label: string;
  value: number;
  positive?: boolean;
  emphasize?: boolean;
  muted?: boolean;
};

function FormulaLine({
  label,
  value,
  positive = false,
  emphasize = false,
  muted = false,
}: FormulaLineProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <span className={`text-sm ${emphasize ? "font-semibold text-ink" : muted ? "text-slate-500" : "text-slateText"}`}>
        {label}
      </span>
      <span className={`text-sm ${emphasize ? "font-bold text-ink" : muted ? "font-medium text-slate-500" : "font-semibold text-ink"}`}>
        {positive ? "" : "-"}
        {formatMetricValue(value)}
      </span>
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

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase();
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
  { value: "early_login", label: "Early Login" },
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
    early_login: "Early Login",
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

function parseTimeToMinutes(value?: string | null) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return null;
  }

  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const meridiem = twelveHourMatch[3].toUpperCase();

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }

    if (meridiem === "AM" && hours === 12) {
      hours = 0;
    } else if (meridiem === "PM" && hours !== 12) {
      hours += 12;
    }

    return hours * 60 + minutes;
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  return null;
}

function isEarlyLoginExplainRow(row: AttendanceProcessedRow) {
  if (row.derived_flags.includes("early_login")) {
    return true;
  }

  const inTimeMinutes = parseTimeToMinutes(row.in_time);
  if (inTimeMinutes === null) {
    return false;
  }

  return inTimeMinutes < 10 * 60;
}

function formatMinutesEarly(row: AttendanceProcessedRow) {
  const inTimeMinutes = parseTimeToMinutes(row.in_time);
  if (inTimeMinutes === null) {
    return "-";
  }

  const minutesEarly = 10 * 60 - inTimeMinutes;
  if (minutesEarly <= 0) {
    return "0 min";
  }

  return `${minutesEarly} min early`;
}

function formatHrAction(row: AttendanceProcessedRow) {
  const normalizedOverride = (row.hr_override_status || "").trim();
  if (normalizedOverride) {
    return normalizedOverride;
  }

  const normalizedSource = normalizeText(row.action_source);
  if (normalizedSource.includes("holiday")) {
    return "Holiday Marked";
  }
  if (normalizedSource.includes("administrative")) {
    return "Administrative Override";
  }
  if (normalizedSource.includes("hr review")) {
    return "HR Reviewed";
  }

  return "No HR action";
}

function formatHrComment(row: AttendanceProcessedRow) {
  return (
    row.action_reason ||
    row.action_remarks ||
    row.remarks ||
    "No HR comment recorded"
  );
}

function canHrAdjustRow(
  row: AttendanceProcessedRow,
  group?: AttendanceExceptionGroup | null
) {
  if (group?.requires_review || (group?.action_options?.length ?? 0) > 0) {
    return true;
  }

  if (row.final_status_code === "irregular_review") {
    return true;
  }

  return (
    row.derived_flags.some((flag) =>
      ["late_entry", "missing_in_time", "missing_out_time", "early_logout"].includes(flag)
    ) ||
    row.anomaly_flags.some((flag) =>
      [
        "duplicate_punches",
        "multiple_entries_same_employee_date",
        "invalid_duration",
        "negative_duration",
        "overnight_punch",
        "impossible_overnight_shift",
      ].includes(flag)
    )
  );
}

function inferReviewFilterForRow(
  row: AttendanceProcessedRow,
  group?: AttendanceExceptionGroup | null
): ReviewFilter {
  if (group) {
    if (group.category === "late_review") {
      return "late";
    }
    if (group.category === "absent_review") {
      return "absent";
    }
    if (group.category === "missing_punch") {
      return "irregular_punch";
    }
    if (["duplicate_punches", "multiple_entries"].includes(group.category)) {
      return "duplicate_punches";
    }
    if (group.category === "invalid_duration") {
      return "invalid_duration";
    }
  }

  if (isEarlyLoginExplainRow(row)) {
    return "early_login";
  }
  if (row.derived_flags.includes("late_entry")) {
    return "late";
  }
  if (row.derived_flags.includes("early_logout")) {
    return "early_logout";
  }
  if (row.derived_flags.includes("missing_out_time")) {
    return "missing_out_time";
  }
  if (row.final_status_code === "irregular_review") {
    return "pending_review";
  }
  if (row.comp_off_earned > 0) {
    return "comp_off_earned";
  }
  if (row.comp_off_adjusted > 0 || row.late_deduction_adjusted > 0) {
    return "comp_off_adjusted";
  }
  if (
    row.derived_flags.includes("overnight_exit") ||
    row.anomaly_flags.includes("overnight_punch")
  ) {
    return "overnight";
  }
  if (row.final_status_code === "half_day") {
    return "half_day";
  }
  if (row.final_status_code === "absent") {
    return "absent";
  }
  if (row.final_status_code === "paid_wo") {
    return "paid_weekoff";
  }
  if (row.final_status_code === "unpaid_wo") {
    return "unpaid_weekoff";
  }
  if (row.final_status_code === "paid_holiday") {
    return "paid_holiday";
  }
  if (row.final_status_code === "unpaid_holiday") {
    return "unpaid_holiday";
  }

  return "present";
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

  if (
    [
      "present",
      "half_day",
      "early_login",
      "early_logout",
      "paid_weekoff",
      "unpaid_weekoff",
      "paid_holiday",
      "unpaid_holiday",
      "comp_off",
      "comp_off_earned",
      "comp_off_adjusted",
      "comp_off_balance",
      "gross_payable",
      "late_deduction",
      "final_payable",
      "leave_adjusted",
      "primary_total",
    ].includes(reviewFilter)
  ) {
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
  if (reviewFilter === "early_login") {
    return isEarlyLoginExplainRow(row);
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

function metricCardLabel(metric: ExplainabilityMetric) {
  const labels: Record<ExplainabilityMetric, string> = {
    present: "Present",
    absent: "Absent",
    half_day: "Half Day",
    late_flags: "Late Flags",
    early_login: "Early Login",
    early_logout: "Early Logout",
    overnight: "Overnight",
    irregular_punch: "Irregular Punch",
    payable_sundays: "Payable Sundays",
    unpaid_sundays: "Unpaid Sundays",
    paid_holidays: "Paid Holidays",
    unpaid_holidays: "Unpaid Holidays",
    comp_off_earned: "Comp Off Earned",
    comp_off_adjusted: "Comp Off Adjusted",
    comp_off_balance: "Comp Off Balance",
    pending_review: "Pending Review",
    gross_payable: "Gross Payable",
    final_payable: "Final Payable",
    late_deduction: "Late Deductions",
    leave_adjusted: "Leave Adjusted",
  };
  return labels[metric];
}

function metricToReviewFilter(metric: ExplainabilityMetric): ReviewFilter {
  const mapping: Record<ExplainabilityMetric, ReviewFilter> = {
    present: "present",
    absent: "absent",
    half_day: "half_day",
    late_flags: "late",
    early_login: "early_login",
    early_logout: "early_logout",
    overnight: "overnight",
    irregular_punch: "irregular_punch",
    payable_sundays: "paid_weekoff",
    unpaid_sundays: "unpaid_weekoff",
    paid_holidays: "paid_holiday",
    unpaid_holidays: "unpaid_holiday",
    comp_off_earned: "comp_off_earned",
    comp_off_adjusted: "comp_off_adjusted",
    comp_off_balance: "comp_off_balance",
    pending_review: "pending_review",
    gross_payable: "gross_payable",
    final_payable: "final_payable",
    late_deduction: "late_deduction",
    leave_adjusted: "leave_adjusted",
  };
  return mapping[metric];
}

function filterRowsForMetric(metric: ExplainabilityMetric, rows: AttendanceProcessedRow[]) {
  return rows.filter((row) => {
    if (metric === "present") {
      return isPresentExplainRow(row);
    }
    if (metric === "absent") {
      return isAbsentExplainRow(row);
    }
    if (metric === "half_day") {
      return isHalfDayExplainRow(row);
    }
    if (metric === "late_flags") {
      return row.derived_flags.includes("late_entry");
    }
    if (metric === "early_login") {
      return isEarlyLoginExplainRow(row);
    }
    if (metric === "early_logout") {
      return row.derived_flags.includes("early_logout");
    }
    if (metric === "overnight") {
      return row.derived_flags.includes("overnight_exit") || row.anomaly_flags.includes("overnight_punch");
    }
    if (metric === "irregular_punch") {
      return isIrregularExplainRow(row);
    }
    if (metric === "payable_sundays") {
      return isSundayExplainDate(row.date) && row.final_status_code !== "unpaid_wo";
    }
    if (metric === "unpaid_sundays") {
      return isSundayExplainDate(row.date) && row.final_status_code === "unpaid_wo";
    }
    if (metric === "paid_holidays") {
      return row.final_status_code === "paid_holiday";
    }
    if (metric === "unpaid_holidays") {
      return row.final_status_code === "unpaid_holiday";
    }
    if (metric === "comp_off_earned") {
      return row.comp_off_earned > 0;
    }
    if (metric === "comp_off_adjusted") {
      return row.comp_off_adjusted > 0 || row.late_deduction_adjusted > 0;
    }
    if (metric === "comp_off_balance") {
      return row.comp_off_earned > 0;
    }
    if (metric === "pending_review") {
      return row.final_status_code === "irregular_review";
    }
    if (metric === "gross_payable") {
      return row.payable_day_impact > 0;
    }
    if (metric === "leave_adjusted") {
      return normalizeText(row.hr_override_status) === "leave adjusted";
    }
    if (metric === "final_payable") {
      return row.payable_day_impact > 0 || row.comp_off_adjusted > 0 || row.late_deduction_adjusted > 0;
    }
    return row.derived_flags.includes("late_entry") || row.late_deduction_adjusted > 0;
  });
}

function isPresentExplainRow(row: AttendanceProcessedRow) {
  return row.final_status_code === "present" || row.final_status_code === "present_late";
}

function isAbsentExplainRow(row: AttendanceProcessedRow) {
  return row.final_status_code === "absent";
}

function isHalfDayExplainRow(row: AttendanceProcessedRow) {
  return row.final_status_code === "half_day";
}

function isIrregularExplainRow(row: AttendanceProcessedRow) {
  return (
    row.final_status_code === "irregular_review" ||
    row.derived_flags.includes("missing_in_time") ||
    row.derived_flags.includes("missing_out_time")
  );
}

function isSundayExplainDate(dateValue: string) {
  if (!dateValue) {
    return false;
  }
  return new Date(`${dateValue}T00:00:00`).getDay() === 0;
}

function sumEmployeeMetric(
  items: AttendanceEmployeeMonthlySummaryItem[],
  field:
    | "comp_off_earned_count"
    | "comp_off_adjusted_days"
    | "comp_off_balance"
    | "gross_payable_days"
    | "late_penalty_after_comp_off"
    | "payable_days"
) {
  return roundMetric(items.reduce((sum, item) => sum + Number(item[field] ?? 0), 0));
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMetricValue(value: number) {
  const rounded = roundMetric(value);
  return rounded.toFixed(Number.isInteger(rounded) ? 0 : 2);
}

function formatShortDate(dateValue: string) {
  if (!dateValue) {
    return "Not linked";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
}

function formatMonthLabel(monthValue: string) {
  if (!monthValue) {
    return "Month not available";
  }
  const date = new Date(`${monthValue}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return monthValue;
  }
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}

function policyRuleValue(policyRules: AttendancePolicyRule[], ruleId: string, fallback: string) {
  return policyRules.find((rule) => rule.rule_id === ruleId && rule.enabled)?.value || fallback;
}

function buildMetricRuleExplanation(
  metric: ExplainabilityMetric,
  policyRules: AttendancePolicyRule[],
  monthlySummaries: AttendanceEmployeeMonthlySummaryItem[]
) {
  const lateAfter = policyRuleValue(policyRules, "late_after_time", "10:11");
  const halfDayAfter = policyRuleValue(policyRules, "half_day_after_time", "12:00");
  const minimumPresentHours = policyRuleValue(policyRules, "minimum_present_hours_threshold", "5.00");
  const nonWorkingDayHours = policyRuleValue(policyRules, "non_working_day_full_present_hours_threshold", "5.00");
  const totalLateDeductions = formatMetricValue(sumEmployeeMetric(monthlySummaries, "late_penalty_after_comp_off"));

  const explanations: Record<ExplainabilityMetric, { title: string; condition: string; result: string; payrollImpact: string }> = {
    present: {
      title: "Present Rule",
      condition: `Working hours must reach at least ${minimumPresentHours}. If in time is at/after ${halfDayAfter}, the day becomes Half Day instead.`,
      result: "Rows shown here are currently treated as fully payable attendance days.",
      payrollImpact: "Payroll Impact: +1 payable day for each present record.",
    },
    absent: {
      title: "Absent Rule",
      condition: "Both punches missing, unresolved attendance, or working hours below the absent threshold can lead to an absent result.",
      result: "Rows shown here ended as absent after classification or HR override.",
      payrollImpact: "Payroll Impact: 0 payable day for each absent record.",
    },
    half_day: {
      title: "Half Day Rule",
      condition: `Working hours between 3.00 and below ${minimumPresentHours}, or an in time at/after ${halfDayAfter}, produce a Half Day.`,
      result: "Rows shown here were classified as Half Day.",
      payrollImpact: "Payroll Impact: +0.5 payable day for each half-day record.",
    },
    late_flags: {
      title: "Late Entry Rule",
      condition: `In time after ${lateAfter} triggers a late flag.`,
      result: "Late flags do not change attendance into absent, but they are counted for deduction.",
      payrollImpact: "Payroll Impact: every 3 late flags = 1 deduction day.",
    },
    early_login: {
      title: "Early Login Rule",
      condition: "In time before 10:00 AM triggers an early login flag.",
      result: "This flag is informational only and helps HR understand reporting discipline on the positive side.",
      payrollImpact: "Payroll Impact: none. Early login does not change payable days or deductions.",
    },
    early_logout: {
      title: "Early Logout Rule",
      condition: "Employees who exit before the expected full-shift hours receive an early logout flag when payroll still considers the day payable.",
      result: "Rows shown here are marked for HR visibility because the employee left early compared with the configured full-shift threshold.",
      payrollImpact: "Payroll Impact: informational only unless another attendance rule changes the day result.",
    },
    overnight: {
      title: "Overnight / Timing Exception Rule",
      condition: "Rows appear here when the attendance engine detected overnight punch behavior or a timing pattern that needs HR attention.",
      result: "These records are shown so HR can audit unusual timing before relying on the payroll-ready working.",
      payrollImpact: "Payroll Impact: depends on the final classified result and any HR review action.",
    },
    irregular_punch: {
      title: "Irregular Punch Rule",
      condition: "Missing punches or unresolved timing issues stay in review until HR regularizes them.",
      result: "Rows shown here are irregular punch or pending review records.",
      payrollImpact: "Payroll Impact: no final payroll credit is granted until the row is resolved.",
    },
    payable_sundays: {
      title: "Payable Sunday Rule",
      condition: `A Sunday or weekly off becomes payable when the weekly eligibility rule is satisfied. Worked Sundays with at least ${nonWorkingDayHours} hours are treated as full payable attendance.`,
      result: "Rows shown here are the Sundays currently contributing payable value.",
      payrollImpact: "Payroll Impact: these records add payable days and may also earn comp off.",
    },
    unpaid_sundays: {
      title: "Unpaid Sunday Rule",
      condition: "A Sunday without weekly eligibility remains unpaid.",
      result: "Rows shown here are Sundays that stayed unpaid.",
      payrollImpact: "Payroll Impact: 0 payable day for each unpaid Sunday.",
    },
    paid_holidays: {
      title: "Paid Holiday Rule",
      condition: "Marked or classified holidays remain payroll-payable when the holiday treatment is approved as paid.",
      result: "Rows shown here are holiday records that currently contribute full payable value.",
      payrollImpact: "Payroll Impact: +1 payable day for each paid holiday record.",
    },
    unpaid_holidays: {
      title: "Unpaid Holiday Rule",
      condition: "Holiday records stay unpaid when the holiday eligibility or override does not grant a paid holiday outcome.",
      result: "Rows shown here are holiday records that do not contribute payable value.",
      payrollImpact: "Payroll Impact: 0 payable day for each unpaid holiday record.",
    },
    comp_off_earned: {
      title: "Comp Off Earned Rule",
      condition: `Employee worked on Sunday or holiday. Full comp off credit is typically earned when working hours meet the ${nonWorkingDayHours} hour threshold.`,
      result: "Rows shown here earned comp off credit in monthly reconciliation.",
      payrollImpact: "Payroll Impact: adds comp off credit available for future adjustment.",
    },
    comp_off_adjusted: {
      title: "Comp Off Adjustment Rule",
      condition: "Available comp off credits are first applied against absent days and then against late deductions.",
      result: "The mapping below shows exactly which comp off credit was used and what it offset.",
      payrollImpact: "Payroll Impact: raises final payable by restoring absent days or reducing late deductions.",
    },
    comp_off_balance: {
      title: "Comp Off Balance Rule",
      condition: "Any earned comp off that is not consumed in the month stays as balance or carry-forward.",
      result: "The ledger below shows which credits are still unused.",
      payrollImpact: "Payroll Impact: no immediate change until the balance is consumed against a deduction.",
    },
    pending_review: {
      title: "Pending Review Rule",
      condition: "Rows stay pending when the attendance engine needs HR review before final payroll treatment.",
      result: "These records still need an HR decision.",
      payrollImpact: "Payroll Impact: payroll remains conservative until the exception is resolved.",
    },
    gross_payable: {
      title: "Gross Payable Rule",
      condition: "Gross payable is the sum of daily payable impacts before late deductions are applied.",
      result: "This includes present days, half days, paid Sundays, paid holidays, and other fully payable overrides.",
      payrollImpact: "Payroll Impact: starting point for final payable calculation.",
    },
    final_payable: {
      title: "Final Payable Rule",
      condition: "Final payable uses gross payable, adds comp off restored against absences, and then subtracts late deductions remaining after comp off.",
      result: "This is the final day-value sent forward for payroll interpretation.",
      payrollImpact: "Payroll Impact: final payable is the payroll-ready day count.",
    },
    late_deduction: {
      title: "Late Deduction Rule",
      condition: `Late cutoff is ${lateAfter}. Every 3 late flags become 1 deduction day, and comp off can offset part of that deduction.`,
      result: "The dates below are the source late flags currently contributing to deduction.",
      payrollImpact: `Payroll Impact: -${totalLateDeductions} day(s) in the current view after comp off offsets.`,
    },
    leave_adjusted: {
      title: "Leave Adjustment Rule",
      condition: "HR can convert a day into Leave Adjusted using the existing review workflow.",
      result: "Rows shown here were regularized through leave adjustment and remain visible for payroll audit.",
      payrollImpact: "Payroll Impact: the row contributes its adjusted payable value to final payroll.",
    },
  };
  return explanations[metric];
}

function aggregateLateDeductionExplanation(monthlySummaries: AttendanceEmployeeMonthlySummaryItem[]) {
  if (monthlySummaries.length === 0) {
    return null;
  }
  const lateSourceDates = monthlySummaries.flatMap((item) => item.explainability?.late_deduction.late_source_dates ?? []);
  const lateSourceRecordIds = monthlySummaries.flatMap((item) => item.explainability?.late_deduction.late_source_record_ids ?? []);
  const totalLateFlags = monthlySummaries.reduce((sum, item) => sum + (item.explainability?.late_deduction.total_late_flags ?? item.late_entry_count), 0);
  const deductionsBeforeCompOff = monthlySummaries.reduce((sum, item) => sum + (item.explainability?.late_deduction.deductions_before_comp_off ?? item.late_penalty_deductions), 0);
  const compOffAdjustedAgainstLateDays = monthlySummaries.reduce((sum, item) => sum + (item.explainability?.late_deduction.comp_off_adjusted_against_late_days ?? item.comp_off_adjusted_against_late_days), 0);
  const deductionsAfterCompOff = monthlySummaries.reduce((sum, item) => sum + (item.explainability?.late_deduction.deductions_after_comp_off ?? item.late_penalty_after_comp_off), 0);
  return {
    late_rule_label: "3 Late Flags = 1 Deduction",
    late_cutoff_time: monthlySummaries[0]?.explainability?.late_deduction.late_cutoff_time ?? "10:11 AM",
    total_late_flags: totalLateFlags,
    late_source_dates: lateSourceDates,
    late_source_record_ids: lateSourceRecordIds,
    deductions_before_comp_off: roundMetric(deductionsBeforeCompOff),
    comp_off_adjusted_against_late_days: roundMetric(compOffAdjustedAgainstLateDays),
    deductions_after_comp_off: roundMetric(deductionsAfterCompOff),
    formula_text: `${totalLateFlags} late flags ÷ 3 = ${formatMetricValue(deductionsBeforeCompOff)} deductions`,
  };
}

function buildLateDeductionGroups(lateSourceDates: string[]) {
  const groups: Array<{ dates: string[]; qualifies: boolean }> = [];
  for (let index = 0; index < lateSourceDates.length; index += 3) {
    const dates = lateSourceDates.slice(index, index + 3).map((date) => formatShortDate(date));
    groups.push({
      dates,
      qualifies: dates.length === 3,
    });
  }
  return groups;
}

function describeCompOffDayType(dateValue: string) {
  if (!dateValue) {
    return "Carry Forward";
  }
  return isSundayExplainDate(dateValue) ? "Sunday" : "Holiday / Weekly Off";
}

function humanizePayrollImpact(value: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return "Payroll effect recorded in monthly reconciliation.";
  }
  if (normalized.includes("final payable increased")) {
    return "+1 Payable Day";
  }
  if (normalized.includes("late deduction reduced")) {
    return "+1 Payable Day (late deduction offset)";
  }
  return value;
}

function hasTraceableCompOffTarget(trailItem: {
  source_record_id?: string;
  source_date?: string;
  adjusted_record_id?: string;
  adjusted_date?: string;
}) {
  const adjustedRecordId = (trailItem.adjusted_record_id || "").trim();
  const adjustedDate = (trailItem.adjusted_date || "").trim();
  if (!adjustedRecordId || !adjustedDate) {
    return false;
  }
  return !(
    adjustedRecordId === (trailItem.source_record_id || "").trim() &&
    adjustedDate === (trailItem.source_date || "").trim()
  );
}

function describeCompOffAdjustedAgainst(
  trailItem: {
    source_record_id?: string;
    source_date?: string;
    adjusted_record_id?: string;
    adjusted_date?: string;
    adjustment_reason?: string;
  }
) {
  if (!hasTraceableCompOffTarget(trailItem)) {
    return "Not available from current calculation data";
  }

  return `${formatShortDate(trailItem.adjusted_date || "")} • ${trailItem.adjustment_reason || "Payroll offset"}`;
}

function describeCompOffAdjustedAgainstExplanation(
  trailItem: {
    source_record_id?: string;
    source_date?: string;
    adjusted_record_id?: string;
    adjusted_date?: string;
    adjustment_reason?: string;
  }
) {
  if (!hasTraceableCompOffTarget(trailItem)) {
    return "The payroll engine applied comp off adjustment, but the exact offset date is not exposed in the current calculation data.";
  }

  return `Adjusted Against: ${formatShortDate(trailItem.adjusted_date || "")} • Reason: ${trailItem.adjustment_reason || "Payroll offset"}`;
}

function buildFinalPayableStory(
  monthlySummaries: AttendanceEmployeeMonthlySummaryItem[],
  rows: AttendanceProcessedRow[]
) {
  const presentDays = monthlySummaries.reduce((sum, item) => sum + item.present_count, 0);
  const halfDays = monthlySummaries.reduce((sum, item) => sum + item.half_day_count, 0);
  const absentDays = monthlySummaries.reduce((sum, item) => sum + item.absent_count, 0);
  const monthDays = monthlySummaries.reduce((sum, item) => {
    const calendarDays = item.explainability?.calculation_breakdown.calendar_days ?? 0;
    return sum + calendarDays;
  }, 0);
  const lateDeduction = monthlySummaries.reduce((sum, item) => {
    const deduction =
      item.explainability?.late_deduction.deductions_before_comp_off ??
      item.late_penalty_deductions;
    return sum + deduction;
  }, 0);
  const compOffAdded = monthlySummaries.reduce((sum, item) => {
    const absentOffset =
      item.explainability?.calculation_breakdown.comp_off_adjusted_against_absent_days ??
      item.comp_off_adjusted_against_absent_days;
    const lateOffset =
      item.explainability?.calculation_breakdown.comp_off_adjusted_against_late_days ??
      item.comp_off_adjusted_against_late_days;
    return sum + absentOffset + lateOffset;
  }, 0);
  const leaveAdjustedValue = rows
    .filter((row) => normalizeText(row.hr_override_status) === "leave adjusted")
    .reduce((sum, row) => sum + row.payable_day_impact, 0);
  const finalPayable = monthlySummaries.reduce((sum, item) => sum + item.payable_days, 0);

  return {
    monthDays: roundMetric(monthDays),
    presentDays,
    presentValue: roundMetric(presentDays * 1),
    halfDays,
    halfValue: roundMetric(halfDays * 0.5),
    absentDays,
    compOffAdded: roundMetric(compOffAdded),
    lateDeduction: roundMetric(lateDeduction),
    leaveAdjustedValue: roundMetric(leaveAdjustedValue),
    finalPayable: roundMetric(finalPayable),
  };
}

function buildRowTriggerCondition(row: AttendanceProcessedRow, policyRules: AttendancePolicyRule[]) {
  const lateAfter = policyRuleValue(policyRules, "late_after_time", "10:11");
  const halfDayAfter = policyRuleValue(policyRules, "half_day_after_time", "12:00");
  const minimumPresentHours = policyRuleValue(policyRules, "minimum_present_hours_threshold", "5.00");
  const fullShiftHours = policyRuleValue(
    policyRules,
    row.gender?.trim().toLowerCase() === "female" ? "female_full_shift_hours_threshold" : "full_shift_hours_threshold",
    row.gender?.trim().toLowerCase() === "female" ? "9.00" : "10.00"
  );
  return [
    `In Time: ${row.in_time || "Missing"}`,
    `Out Time: ${row.out_time || "Missing"}`,
    `Working Hours: ${row.working_hours || "Not computed"}`,
    `Late cutoff: ${lateAfter}`,
    `Half-day after: ${halfDayAfter}`,
    `Minimum present hours: ${minimumPresentHours}`,
    `Expected full-shift hours: ${fullShiftHours}`,
  ].join(" • ");
}

function describeThresholdsForRow(row: AttendanceProcessedRow, policyRules: AttendancePolicyRule[]) {
  const lateAfter = policyRuleValue(policyRules, "late_after_time", "10:11");
  const halfDayAfter = policyRuleValue(policyRules, "half_day_after_time", "12:00");
  const minimumPresentHours = policyRuleValue(policyRules, "minimum_present_hours_threshold", "5.00");
  const fullShiftHours = policyRuleValue(
    policyRules,
    row.gender?.trim().toLowerCase() === "female" ? "female_full_shift_hours_threshold" : "full_shift_hours_threshold",
    row.gender?.trim().toLowerCase() === "female" ? "9.00" : "10.00"
  );
  return `Late after ${lateAfter}, half day after ${halfDayAfter}, minimum present hours ${minimumPresentHours}, and expected full-shift hours ${fullShiftHours} for the current gender profile.`;
}
