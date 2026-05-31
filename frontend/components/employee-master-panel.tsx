"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { AttendanceVerificationDrillDownDialog } from "@/components/attendance-verification-drilldown-dialog";
import { AttendanceVerificationReviewDialog } from "@/components/attendance-verification-review-dialog";
import { AttendanceVerificationSummarySection } from "@/components/attendance-verification-summary-section";
import { EmployeeMasterResetDialog } from "@/components/employee-master-reset-dialog";
import { PageHeader } from "@/components/page-header";
import { employeeCodeToParam } from "@/lib/employee-code-url";
import { loadAttendanceSnapshot } from "@/lib/attendance-snapshot";
import {
  buildAttendanceVerificationRegistry,
  displayCategoryBadgeClassName,
  filterRegistryForDrillDown,
} from "@/lib/attendance-verification-registry";
import { DRILL_DOWN_TITLES } from "@/lib/attendance-verification-registry-constants";
import {
  getVerificationActor,
} from "@/lib/attendance-verification-storage";
import type {
  AttendanceVerificationStore,
  EmployeeVerificationRecord,
  VerificationDrillDownFilter,
} from "@/types/attendance-verification";
import {
  clearEmployeeMasterStorage,
  DEFAULT_SALARY_COMPONENTS,
  mergeByEmployeeCode,
  parseRowsFromWorkbook,
  toNumber,
} from "@/lib/employee-master-storage";
import type {
  EmployeeMasterRecord,
  EmployeeStatus,
  SalaryComponent,
} from "@/types/employee-master";
import type { AttendanceProcessedRow } from "@/types/upload";
import {
  approveEmployeeMatchApi,
  createAttendanceNameAliasApi,
  fetchAttendanceVerificationStoreApi,
  rejectEmployeeMatchApi,
} from "@/lib/attendance-verification-api";
import {
  bulkUpsertEmployeesApi,
  clearEmployeesApi,
  fetchEmployees,
  fetchSalaryComponentsApi,
  saveSalaryComponentsApi,
} from "@/lib/employee-master-api";

export function EmployeeMasterPanel() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeMasterRecord[]>([]);
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>(
    DEFAULT_SALARY_COMPONENTS
  );
  const [attendanceRows, setAttendanceRows] = useState<AttendanceProcessedRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | EmployeeStatus>("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [designationFilter, setDesignationFilter] = useState("All");
  const [showSalarySettings, setShowSalarySettings] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [verificationStore, setVerificationStore] = useState<AttendanceVerificationStore>({
    version: 1,
    aliases: [],
    decisions: [],
  });
  const [drillDownFilter, setDrillDownFilter] = useState<VerificationDrillDownFilter | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [verificationActionMessage, setVerificationActionMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshAttendanceSnapshot = useCallback(() => {
    setAttendanceRows(loadAttendanceSnapshot());
  }, []);

  useEffect(() => {
    let active = true;

    const loadState = async () => {
      try {
        const [employeeRows, salaryRows, verificationRows] = await Promise.all([
          fetchEmployees(),
          fetchSalaryComponentsApi(),
          fetchAttendanceVerificationStoreApi(),
        ]);
        if (!active) {
          return;
        }
        setEmployees(employeeRows);
        setSalaryComponents(
          salaryRows.length > 0 ? salaryRows : DEFAULT_SALARY_COMPONENTS,
        );
        setVerificationStore(verificationRows);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load Employee Master data.",
        );
      }
    };

    refreshAttendanceSnapshot();
    void loadState();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("attendance_snapshot")) {
        refreshAttendanceSnapshot();
      }
    };
    window.addEventListener("storage", onStorage);
    const intervalId = window.setInterval(refreshAttendanceSnapshot, 4000);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.clearInterval(intervalId);
    };
  }, [refreshAttendanceSnapshot]);

  const departmentOptions = useMemo(
    () =>
      Array.from(new Set(employees.map((item) => item.department.trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [employees]
  );
  const designationOptions = useMemo(
    () =>
      Array.from(new Set(employees.map((item) => item.designation.trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return employees.filter((item) => {
      if (statusFilter !== "All" && item.status !== statusFilter) return false;
      if (departmentFilter !== "All" && item.department !== departmentFilter) return false;
      if (designationFilter !== "All" && item.designation !== designationFilter) return false;
      if (!search) return true;
      return (
        item.employee_code.toLowerCase().includes(search) ||
        item.employee_name.toLowerCase().includes(search) ||
        item.department.toLowerCase().includes(search)
      );
    });
  }, [employees, searchQuery, statusFilter, departmentFilter, designationFilter]);

  const activeComponents = useMemo(
    () => salaryComponents.filter((item) => item.active && item.component_name.trim()),
    [salaryComponents]
  );
  const activePercentageTotal = useMemo(
    () => activeComponents.reduce((sum, item) => sum + item.percentage, 0),
    [activeComponents]
  );

  const verificationRegistry = useMemo(
    () => buildAttendanceVerificationRegistry(employees, attendanceRows, verificationStore),
    [employees, attendanceRows, verificationStore]
  );

  const recordByCode = useMemo(() => {
    const map = new Map<string, EmployeeVerificationRecord>();
    verificationRegistry.items.forEach((record) => {
      map.set(record.employeeCode, record);
    });
    return map;
  }, [verificationRegistry]);

  const { summary: verificationSummary } = verificationRegistry;

  const drillDownItems = useMemo(() => {
    if (!drillDownFilter) {
      return [];
    }
    return filterRegistryForDrillDown(verificationRegistry, drillDownFilter);
  }, [verificationRegistry, drillDownFilter]);

  const pendingReviewItems = verificationRegistry.byCategory.pending_review;

  const openDrillDown = (filter: VerificationDrillDownFilter) => {
    if (filter === "pending_review") {
      setReviewDialogOpen(true);
      return;
    }
    setDrillDownFilter(filter);
  };

  const handleApproveMatch = async (item: EmployeeVerificationRecord, remarks: string) => {
    if (!item.match.canManuallyApprove) {
      return;
    }
    const employee = employees.find((row) => row.employee_code === item.employeeCode);
    if (!employee) {
      return;
    }
    try {
      const nextStore = await approveEmployeeMatchApi({
        employeeCode: item.employeeCode,
        attendanceName: item.match.attendanceEmployeeName,
        masterName: employee.employee_name,
        remarks: remarks || "Manually approved by HR.",
        actor: getVerificationActor(),
      });
      setVerificationStore(nextStore);
      setVerificationActionMessage(`Approved match for ${item.employeeCode}.`);
      window.setTimeout(() => setVerificationActionMessage(null), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to approve verification match.",
      );
    }
  };

  const handleRejectMatch = async (item: EmployeeVerificationRecord, remarks: string) => {
    if (!item.match.canManuallyApprove) {
      return;
    }
    const employee = employees.find((row) => row.employee_code === item.employeeCode);
    if (!employee) {
      return;
    }
    try {
      const nextStore = await rejectEmployeeMatchApi({
        employeeCode: item.employeeCode,
        attendanceName: item.match.attendanceEmployeeName,
        masterName: employee.employee_name,
        remarks: remarks || "Rejected by HR.",
        actor: getVerificationActor(),
      });
      setVerificationStore(nextStore);
      setVerificationActionMessage(`Rejected match for ${item.employeeCode}.`);
      window.setTimeout(() => setVerificationActionMessage(null), 3000);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reject verification match.",
      );
    }
  };

  const handleCreateAlias = async (item: EmployeeVerificationRecord, remarks: string) => {
    if (!item.match.canManuallyApprove) {
      return;
    }
    const employee = employees.find((row) => row.employee_code === item.employeeCode);
    if (!employee) {
      return;
    }
    try {
      const nextStore = await createAttendanceNameAliasApi({
        employeeCode: item.employeeCode,
        attendanceName: item.match.attendanceEmployeeName,
        masterName: employee.employee_name,
        remarks,
        actor: getVerificationActor(),
      });
      setVerificationStore(nextStore);
      setVerificationActionMessage(
        `Alias saved for ${item.employeeCode}. Future imports will auto-recognize this name.`
      );
      window.setTimeout(() => setVerificationActionMessage(null), 3500);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save attendance alias.",
      );
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setMessage(null);
    try {
      const parsedRows = parseRowsFromWorkbook(await file.arrayBuffer());
      if (parsedRows.length === 0) {
        setErrorMessage("No valid employee rows found. Ensure Employee Code column exists.");
        return;
      }
      const nextEmployees = mergeByEmployeeCode(employees, parsedRows);
      const savedEmployees = await bulkUpsertEmployeesApi(nextEmployees);
      setEmployees(savedEmployees);
      setMessage(
        `Employee Master synced successfully. ${parsedRows.length} row(s) processed using Employee Code as unique key.`
      );
    } catch {
      setErrorMessage("Failed to parse file. Please upload a valid Excel file.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addBlankRow = () => {
    setErrorMessage(null);
    router.push("/employees/new");
  };

  const openResetDialog = () => {
    setResetStep(1);
    setResetConfirmText("");
    setResetDialogOpen(true);
  };

  const closeResetDialog = () => {
    setResetDialogOpen(false);
    setResetStep(1);
    setResetConfirmText("");
  };

  const handleResetContinue = () => {
    setResetStep(2);
    setResetConfirmText("");
  };

  const handleResetConfirm = () => {
    if (resetConfirmText !== "DELETE") {
      return;
    }

    void (async () => {
      try {
        await clearEmployeesApi();
        clearEmployeeMasterStorage();
        setEmployees([]);
        setErrorMessage(null);
        setMessage(null);
        setSaveMessage(null);
        setClearMessage("Employee Master successfully cleared.");
        closeResetDialog();
        window.setTimeout(() => setClearMessage(null), 3000);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to clear Employee Master.",
        );
      }
    })();
  };

  const saveEmployeeMaster = async () => {
    try {
      const [savedEmployees, savedSalaryComponents] = await Promise.all([
        bulkUpsertEmployeesApi(employees),
        saveSalaryComponentsApi(salaryComponents),
      ]);
      setEmployees(savedEmployees);
      setSalaryComponents(savedSalaryComponents);
      setSaveMessage("Employee Master saved successfully.");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save Employee Master.",
      );
    }
  };

  const exportEmployeeMaster = () => {
    const rowsToExport = filteredEmployees.map((row) => ({
      "Employee Code": row.employee_code,
      "Employee Name": row.employee_name,
      Department: row.department,
      Designation: row.designation,
      "Salary Mode": row.salary_mode,
      Unit: row.unit,
      DOJ: row.doj,
      "Gross Monthly Salary": row.gross_monthly_salary,
      "Opening Leave Balance": row.opening_leave_balance,
      "Leave Accrued": row.leave_accrued,
      "Leave Availed": row.leave_availed,
      "Closing Leave Balance": row.closing_leave_balance,
      "Comp Off Balance": row.comp_off_balance,
      Status: row.status,
      ...Object.fromEntries(
        activeComponents.map((component) => [
          component.component_name,
          Number(((row.gross_monthly_salary * component.percentage) / 100).toFixed(2)),
        ])
      ),
    }));
    const worksheet = XLSX.utils.json_to_sheet(rowsToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Master");
    XLSX.writeFile(workbook, `employee_master_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        "Employee Code": "EMP001",
        "Employee Name": "John Doe",
        Department: "Operations",
        Designation: "Supervisor",
        "Salary Mode": "Bank",
        Unit: "Bath & Sanitary",
        DOJ: "2024-01-10",
        "Gross Salary": 30000,
        "Opening Leave Balance": 12,
        "Leave Accrued": 2,
        "Leave Availed": 1,
        "Closing Leave Balance": 13,
        "Comp Off": 0,
        Status: "Active",
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Master Template");
    XLSX.writeFile(workbook, "employee_master_template.xlsx");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        eyebrow="People Operations"
        title="Employee Master"
        description="Directory with attendance validation badges, filters, and full-profile workflows."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <VerificationStatCard
          label="Total Employees"
          value={verificationSummary.totalConsidered}
          onClick={() => openDrillDown("total")}
        />
        <VerificationStatCard
          label="Verified"
          value={verificationSummary.verified}
          tone="emerald"
          onClick={() => openDrillDown("verified")}
        />
        <VerificationStatCard
          label="Warning"
          value={verificationSummary.warning}
          tone="amber"
          onClick={() => openDrillDown("warning")}
        />
        <VerificationStatCard
          label="Pending Review"
          value={verificationSummary.pendingReview}
          tone="orange"
          onClick={() => openDrillDown("pending_review")}
        />
        <VerificationStatCard
          label="Payroll Ready"
          value={verificationSummary.payrollReady}
          tone="teal"
          onClick={() => openDrillDown("payroll_ready")}
        />
        <VerificationStatCard
          label="Payroll Blocked"
          value={verificationSummary.payrollBlocked}
          tone="rose"
          onClick={() => openDrillDown("payroll_blocked")}
        />
      </div>

      <AttendanceVerificationSummarySection summary={verificationSummary} />

      <section className="flex min-h-0 flex-1 flex-col rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
          {isUploading ? "Uploading..." : "Upload Employee Master Excel"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={isUploading}
            onChange={onUpload}
          />
        </label>
        <button
          type="button"
          onClick={addBlankRow}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
        >
          Add Employee
        </button>
        <button
          type="button"
          onClick={saveEmployeeMaster}
          className="inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          Save Employee Master
        </button>
        <button
          type="button"
          onClick={openResetDialog}
          className="inline-flex items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Delete Entire Employee Master
        </button>
        <button
          type="button"
          onClick={exportEmployeeMaster}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
        >
          Export Employee Master (.xlsx)
        </button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
        >
          Download Employee Master Template
        </button>
        <button
          type="button"
          onClick={() => setShowSalarySettings((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
        >
          {showSalarySettings ? "Hide Salary Settings" : "Salary Structure Settings"}
        </button>
      </div>

      {verificationActionMessage ? (
        <div className="mb-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {verificationActionMessage}
        </div>
      ) : null}
      {clearMessage ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {clearMessage}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMessage}
        </div>
      ) : null}
      {message ? (
        <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by code, name, department..."
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "All" | EmployeeStatus)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        >
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        >
          <option value="All">All Departments</option>
          {departmentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={designationFilter}
          onChange={(event) => setDesignationFilter(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-ink shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        >
          <option value="All">All Designations</option>
          {designationOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      {showSalarySettings ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-ink">Configurable Salary Structure</p>
          <div className="mt-3 space-y-2">
            {salaryComponents.map((component) => (
              <div
                key={component.id}
                className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-12"
              >
                <input
                  value={component.component_name}
                  onChange={(e) =>
                    setSalaryComponents((prev) =>
                      prev.map((item) =>
                        item.id === component.id
                          ? { ...item, component_name: e.target.value }
                          : item
                      )
                    )
                  }
                  className="md:col-span-5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
                <input
                  type="number"
                  value={component.percentage}
                  onChange={(e) =>
                    setSalaryComponents((prev) =>
                      prev.map((item) =>
                        item.id === component.id
                          ? { ...item, percentage: toNumber(e.target.value) }
                          : item
                      )
                    )
                  }
                  className="md:col-span-3 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
                <label className="md:col-span-2 flex items-center gap-2 text-sm text-slateText">
                  <input
                    type="checkbox"
                    checked={component.active}
                    onChange={(e) =>
                      setSalaryComponents((prev) =>
                        prev.map((item) =>
                          item.id === component.id ? { ...item, active: e.target.checked } : item
                        )
                      )
                    }
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSalaryComponents((prev) => prev.filter((item) => item.id !== component.id))
                  }
                  className="md:col-span-2 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1.5 text-sm text-rose-700"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setSalaryComponents((prev) => [
                  ...prev,
                  {
                    id: `component_${Date.now()}`,
                    component_name: "New Component",
                    percentage: 0,
                    active: true,
                  },
                ])
              }
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
            >
              Add Component
            </button>
            <p className="text-sm">
              Active total:{" "}
              <span className={activePercentageTotal === 100 ? "text-emerald-700" : "text-rose-700"}>
                {activePercentageTotal.toFixed(2)}%
              </span>
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredEmployees.length === 0 ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slateText">
            No employee records match current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredEmployees.map((employee) => {
              const record = recordByCode.get(employee.employee_code);
              if (!record) return null;
              const profilePath = `/employees/${employeeCodeToParam(employee.employee_code)}`;

              return (
                <article
                  key={employee.employee_code}
                  className="flex h-full min-h-[15rem] flex-col rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-ink">{employee.employee_name}</h3>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${displayCategoryBadgeClassName(
                          record.displayCategory
                        )}`}
                      >
                        {record.displayCategoryLabel}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          employee.status === "Active"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slateText">
                      {employee.employee_code} · {employee.designation || "No designation"}
                    </p>
                    <div className="mt-3 grid gap-2 grid-cols-2">
                      <Metric label="Unit" value={employee.unit} />
                      <Metric label="Salary Mode" value={employee.salary_mode} />
                      <Metric
                        label="Gross Salary"
                        value={employee.gross_monthly_salary.toLocaleString("en-IN")}
                      />
                      <Metric label="Department" value={employee.department || "-"} />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Link
                      href={profilePath}
                      className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                    >
                      View Profile
                    </Link>
                    <Link
                      href={`${profilePath}?mode=edit`}
                      className="inline-flex flex-1 items-center justify-center rounded-2xl border border-teal-700 bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`${profilePath}?tab=attendance`}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                    >
                      Attendance
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      </section>

      <EmployeeMasterResetDialog
        open={resetDialogOpen}
        step={resetStep}
        confirmText={resetConfirmText}
        onConfirmTextChange={setResetConfirmText}
        onCancel={closeResetDialog}
        onContinue={handleResetContinue}
        onConfirmDelete={handleResetConfirm}
      />

      <AttendanceVerificationDrillDownDialog
        open={drillDownFilter !== null}
        title={drillDownFilter ? DRILL_DOWN_TITLES[drillDownFilter] : ""}
        items={drillDownItems}
        variant={
          drillDownFilter === "warning"
            ? "warning"
            : drillDownFilter === "payroll_blocked"
              ? "payroll_blocked"
              : "standard"
        }
        onClose={() => setDrillDownFilter(null)}
      />
      <AttendanceVerificationReviewDialog
        open={reviewDialogOpen}
        items={pendingReviewItems}
        onClose={() => setReviewDialogOpen(false)}
        onApprove={handleApproveMatch}
        onReject={handleRejectMatch}
        onCreateAlias={handleCreateAlias}
      />
    </div>
  );
}

function VerificationStatCard({
  label,
  value,
  tone = "slate",
  onClick,
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber" | "orange" | "rose" | "teal";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/60"
        : tone === "orange"
          ? "border-orange-200 bg-orange-50/60"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50/60"
          : tone === "teal"
            ? "border-teal-200 bg-teal-50/60"
            : "border-slate-200 bg-white/90";

  const content = (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slateText">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
      {onClick ? (
        <p className="mt-1 text-xs font-semibold text-teal-700">View list →</p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border px-4 py-3 text-left shadow-sm transition hover:shadow-md ${toneClass}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>{content}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slateText">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
