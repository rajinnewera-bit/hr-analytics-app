"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AttendanceProcessedRow } from "@/types/upload";
import type { EmployeeMasterRecord, SalaryComponent } from "@/types/employee-master";
import type { AttendanceVerificationStore } from "@/types/attendance-verification";
import {
  buildAttendanceVerificationRegistry,
  displayCategoryBadgeClassName,
  getRegistryRecordForEmployee,
} from "@/lib/attendance-verification-registry";
import {
  buildEmployeeAttendanceSummary,
  filterAttendanceRowsByEmployeeCode,
} from "@/lib/attendance-employee-summary";
import { HrmsBranding } from "@/components/hrms-branding";
import { employeeCodeToParam } from "@/lib/employee-code-url";
import { loadAttendanceSnapshot } from "@/lib/attendance-snapshot";
import {
  isValidDateText,
  SALARY_MODE_OPTIONS,
  toNumber,
  toSalaryMode,
  toUnit,
  UNIT_OPTIONS,
} from "@/lib/employee-master-storage";
import {
  getAliasesForEmployee,
} from "@/lib/attendance-verification-storage";
import {
  fetchAttendanceVerificationStoreApi,
} from "@/lib/attendance-verification-api";
import {
  deleteEmployeeApi,
  fetchEmployees,
  fetchSalaryComponentsApi,
  saveSalaryComponentsApi,
  updateEmployeeApi,
} from "@/lib/employee-master-api";

type ProfileMode = "view" | "edit";
type ProfileTab = "master" | "attendance" | "payroll" | "leave";

type EmployeeProfileViewProps = {
  employeeCode: string;
  initialMode?: ProfileMode;
  initialTab?: ProfileTab;
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

export function EmployeeProfileView({
  employeeCode,
  initialMode = "view",
  initialTab = "master",
}: EmployeeProfileViewProps) {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeMasterRecord[]>([]);
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<AttendanceProcessedRow[]>([]);
  const [mode, setMode] = useState<ProfileMode>(initialMode);
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [draft, setDraft] = useState<EmployeeMasterRecord | null>(null);
  const [verificationStore, setVerificationStore] = useState<AttendanceVerificationStore>({
    version: 1,
    aliases: [],
    decisions: [],
  });

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
        setSalaryComponents(salaryRows);
        setAttendanceRows(loadAttendanceSnapshot());
        setVerificationStore(verificationRows);
        setMode(initialMode);
        setTab(initialTab);
      } catch {
        if (!active) {
          return;
        }
        setEmployees([]);
        setSalaryComponents([]);
        setAttendanceRows(loadAttendanceSnapshot());
      }
    };
    void loadState();
    return () => {
      active = false;
    };
  }, [employeeCode, initialMode, initialTab]);

  const employee = useMemo(
    () => employees.find((item) => item.employee_code === employeeCode) ?? null,
    [employees, employeeCode]
  );

  useEffect(() => {
    setDraft(employee);
  }, [employee]);

  const activeComponents = useMemo(
    () => salaryComponents.filter((item) => item.active && item.component_name.trim()),
    [salaryComponents]
  );

  const verificationRegistry = useMemo(
    () => buildAttendanceVerificationRegistry(employees, attendanceRows, verificationStore),
    [employees, attendanceRows, verificationStore]
  );

  const verificationRecord = useMemo(() => {
    if (!draft) {
      return null;
    }
    return getRegistryRecordForEmployee(verificationRegistry, draft.employee_code);
  }, [draft, verificationRegistry]);

  const matchResult = verificationRecord?.match ?? null;

  const employeeAliases = useMemo(
    () => getAliasesForEmployee(verificationStore, employeeCode),
    [verificationStore, employeeCode]
  );

  const employeeAttendanceRows = useMemo(() => {
    if (!draft || !matchResult?.showAttendanceDetails) {
      return [];
    }
    return filterAttendanceRowsByEmployeeCode(draft.employee_code, attendanceRows);
  }, [attendanceRows, draft, matchResult?.showAttendanceDetails]);

  const attendanceSummary = useMemo(() => {
    if (employeeAttendanceRows.length === 0) {
      return null;
    }
    return buildEmployeeAttendanceSummary(employeeAttendanceRows);
  }, [employeeAttendanceRows]);

  const estimatedPay = useMemo(() => {
    if (!draft || !attendanceSummary) {
      return null;
    }
    const dailyRate = draft.gross_monthly_salary / Math.max(attendanceSummary.total_days, 1);
    return dailyRate * attendanceSummary.payable_days;
  }, [attendanceSummary, draft]);

  if (!employee) {
    return <EmployeeNotFound employeeCode={employeeCode} />;
  }

  if (!draft || !matchResult || !verificationRecord) {
    return null;
  }

  const isEditable = mode === "edit";

  const persistEmployee = (record: EmployeeMasterRecord) => {
    const next = employees
      .filter((item) => item.employee_code !== employeeCode && item.employee_code !== record.employee_code)
      .concat(record)
      .sort((a, b) => a.employee_code.localeCompare(b.employee_code));
    setEmployees(next);
  };

  const handleSave = async () => {
    if (!draft.employee_code.trim() || !draft.employee_name.trim() || !isValidDateText(draft.doj)) {
      return;
    }
    try {
      const [savedEmployee, savedSalaryComponents] = await Promise.all([
        updateEmployeeApi(employeeCode, draft),
        saveSalaryComponentsApi(salaryComponents),
      ]);
      persistEmployee(savedEmployee);
      setSalaryComponents(savedSalaryComponents);
      if (savedEmployee.employee_code !== employeeCode) {
        router.replace(`/employees/${employeeCodeToParam(savedEmployee.employee_code)}?mode=view`);
      } else {
        setMode("view");
      }
    } catch {
      return;
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm("Are you sure you want to remove this employee record?");
    if (!confirmed) {
      return;
    }
    try {
      await deleteEmployeeApi(employeeCode);
      const next = employees.filter((item) => item.employee_code !== employeeCode);
      setEmployees(next);
      router.push("/employees");
    } catch {
      return;
    }
  };

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "master", label: "Employee Master" },
    { id: "attendance", label: "Attendance Details" },
    { id: "payroll", label: "Payroll Summary" },
    { id: "leave", label: "Leave Summary" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="shrink-0 rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
        <HrmsBranding variant="page" withDivider={false} className="mb-0 pb-0" />
        <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/employees" className="text-sm font-semibold text-teal-700 hover:underline">
              ← Employee Master
            </Link>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              Employee Profile
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{draft.employee_name}</h1>
            <p className="text-sm text-slateText">{draft.employee_code}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${displayCategoryBadgeClassName(
                verificationRecord.displayCategory
              )}`}
            >
              {verificationRecord.displayCategoryLabel}
            </span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  draft.status === "Active"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                }`}
              >
                {draft.status}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isEditable ? (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Edit Profile
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Save Employee
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(employee);
                    setMode("view");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === item.id ? "bg-teal-700 text-white" : "bg-slate-100 text-slateText"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft">
        {tab === "master" ? (
          <EmployeeMasterForm
            draft={draft}
            isEditable={isEditable}
            setDraft={setDraft}
            activeComponents={activeComponents}
            salaryComponents={salaryComponents}
            onSalaryComponentsChange={setSalaryComponents}
          />
        ) : null}

        {tab === "attendance" ? (
          <AttendanceTab
            verificationRecord={verificationRecord}
            attendanceSummary={attendanceSummary}
            aliases={employeeAliases}
          />
        ) : null}

        {tab === "payroll" ? (
          <PayrollTab
            draft={draft}
            activeComponents={activeComponents}
            attendanceSummary={attendanceSummary}
            estimatedPay={estimatedPay}
            verificationRecord={verificationRecord}
          />
        ) : null}

        {tab === "leave" ? <LeaveTab draft={draft} /> : null}
      </div>
    </div>
  );
}

export function EmployeeNotFound({ employeeCode }: { employeeCode: string }) {
  return (
    <section className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/90 p-8 text-center shadow-soft">
      <p className="text-lg font-semibold text-ink">Employee not found</p>
      <p className="mt-2 text-sm text-slateText">
        No record exists for <span className="font-semibold">{employeeCode}</span> in Employee
        Master.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/employees"
          className="inline-flex rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Back to Employee Master
        </Link>
        <Link
          href="/employees/new"
          className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          Add Employee
        </Link>
      </div>
    </section>
  );
}

export function EmployeeMasterForm({
  draft,
  isEditable,
  setDraft,
  activeComponents,
  salaryComponents,
  onSalaryComponentsChange,
  suggestedEmployeeCode,
}: {
  draft: EmployeeMasterRecord;
  isEditable: boolean;
  setDraft: (value: EmployeeMasterRecord) => void;
  activeComponents: SalaryComponent[];
  salaryComponents: SalaryComponent[];
  onSalaryComponentsChange: (value: SalaryComponent[]) => void;
  suggestedEmployeeCode?: string;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">Employee Master</p>
      {isEditable ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Employee ID">
            <input
              value={draft.employee_code}
              onChange={(e) => setDraft({ ...draft, employee_code: e.target.value })}
              placeholder="Enter employee ID"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
            />
            {suggestedEmployeeCode ? (
              <p className="mt-1.5 text-xs text-slateText">
                Suggested next ID:{" "}
                <span className="font-medium text-ink">{suggestedEmployeeCode}</span>
              </p>
            ) : null}
          </Field>
          <Field label="Employee Name">
            <input
              value={draft.employee_name}
              onChange={(e) => setDraft({ ...draft, employee_name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
            />
          </Field>
          <Field label="DOJ">
            <input
              type="date"
              value={draft.doj}
              onChange={(e) => setDraft({ ...draft, doj: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
            />
          </Field>
          <Field label="Department">
            <input
              value={draft.department}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
            />
          </Field>
          <Field label="Designation">
            <input
              value={draft.designation}
              onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
            />
          </Field>
          <Field label="Unit">
            <select
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: toUnit(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {UNIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Salary Mode">
            <select
              value={draft.salary_mode}
              onChange={(e) => setDraft({ ...draft, salary_mode: toSalaryMode(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {SALARY_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gross Salary">
            <input
              type="number"
              step="0.01"
              value={draft.gross_monthly_salary}
              onChange={(e) =>
                setDraft({ ...draft, gross_monthly_salary: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value === "Inactive" ? "Inactive" : "Active",
                })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Opening Leave Balance">
            <input
              type="number"
              step="0.5"
              value={draft.opening_leave_balance}
              onChange={(e) =>
                setDraft({ ...draft, opening_leave_balance: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Leave Accrued">
            <input
              type="number"
              step="0.5"
              value={draft.leave_accrued}
              onChange={(e) =>
                setDraft({ ...draft, leave_accrued: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Leave Availed">
            <input
              type="number"
              step="0.5"
              value={draft.leave_availed}
              onChange={(e) =>
                setDraft({ ...draft, leave_availed: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Closing Leave Balance">
            <input
              type="number"
              step="0.5"
              value={draft.closing_leave_balance}
              onChange={(e) =>
                setDraft({ ...draft, closing_leave_balance: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Comp Off">
            <input
              type="number"
              step="0.5"
              value={draft.comp_off_balance}
              onChange={(e) =>
                setDraft({ ...draft, comp_off_balance: toNumber(e.target.value) })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ReadOnlyField label="Employee ID" value={draft.employee_code} />
          <ReadOnlyField label="Employee Name" value={draft.employee_name} />
          <ReadOnlyField label="DOJ" value={draft.doj} />
          <ReadOnlyField label="Department" value={draft.department} />
          <ReadOnlyField label="Designation" value={draft.designation} />
          <ReadOnlyField label="Unit" value={draft.unit} />
          <ReadOnlyField label="Salary Mode" value={draft.salary_mode} />
          <ReadOnlyField
            label="Gross Salary"
            value={draft.gross_monthly_salary.toLocaleString("en-IN")}
          />
          <ReadOnlyField label="Status" value={draft.status} />
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-ink">Salary structure</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {activeComponents.map((component) => (
            <div key={component.id} className="rounded-xl border border-white bg-white px-3 py-2">
              <p className="text-xs text-slateText">{component.component_name}</p>
              <p className="text-sm font-semibold text-ink">
                {((draft.gross_monthly_salary * component.percentage) / 100).toLocaleString(
                  "en-IN",
                  { maximumFractionDigits: 2 }
                )}
              </p>
            </div>
          ))}
        </div>
        {isEditable ? (
          <div className="mt-3 space-y-2">
            {salaryComponents.map((component) => (
              <div
                key={component.id}
                className="grid grid-cols-12 gap-2 rounded-lg border border-slate-200 bg-white p-2"
              >
                <input
                  value={component.component_name}
                  onChange={(e) =>
                    onSalaryComponentsChange(
                      salaryComponents.map((item) =>
                        item.id === component.id
                          ? { ...item, component_name: e.target.value }
                          : item
                      )
                    )
                  }
                  className="col-span-5 rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  value={component.percentage}
                  onChange={(e) =>
                    onSalaryComponentsChange(
                      salaryComponents.map((item) =>
                        item.id === component.id
                          ? { ...item, percentage: toNumber(e.target.value) }
                          : item
                      )
                    )
                  }
                  className="col-span-3 rounded border border-slate-200 px-2 py-1 text-xs"
                />
                <label className="col-span-2 flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={component.active}
                    onChange={(e) =>
                      onSalaryComponentsChange(
                        salaryComponents.map((item) =>
                          item.id === component.id
                            ? { ...item, active: e.target.checked }
                            : item
                        )
                      )
                    }
                  />
                  Active
                </label>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttendanceTab({
  verificationRecord,
  attendanceSummary,
  aliases,
}: {
  verificationRecord: import("@/types/attendance-verification").EmployeeVerificationRecord;
  attendanceSummary: ReturnType<typeof buildEmployeeAttendanceSummary> | null;
  aliases: ReturnType<typeof getAliasesForEmployee>;
}) {
  const matchResult = verificationRecord.match;
  const verificationToneClass = displayCategoryBadgeClassName(
    verificationRecord.displayCategory
  );

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">Attendance Details</p>
      <p className="text-xs text-slateText">System generated. Read-only.</p>

      <div className={`rounded-2xl border px-4 py-3 text-sm ${verificationToneClass}`}>
        <p className="font-semibold">Verification State: {verificationRecord.audit.verificationState}</p>
        <p className="mt-1">Verification Reason: {verificationRecord.audit.verificationReason}</p>
        <p className="mt-2 text-xs opacity-90">
          Payroll Eligible: {verificationRecord.audit.payrollEligible}
          {matchResult.attendanceEmployeeName
            ? ` · Attendance name: ${matchResult.attendanceEmployeeName}`
            : ""}
        </p>
        {verificationRecord.warningReasonLabel ? (
          <p className="mt-1 text-xs opacity-90">
            Warning detail: {verificationRecord.warningReasonLabel}
          </p>
        ) : null}
        {verificationRecord.blockReasonLabel ? (
          <p className="mt-1 text-xs opacity-90">
            Block reason: {verificationRecord.blockReasonLabel}
          </p>
        ) : null}
        {matchResult.activeDecision ? (
          <p className="mt-2 text-xs opacity-90">
            Last action by {matchResult.activeDecision.actor} on{" "}
            {new Date(matchResult.activeDecision.acted_at).toLocaleString()}
          </p>
        ) : null}
      </div>

      {aliases.length > 0 ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
          <p className="text-sm font-semibold text-ink">Approved name aliases</p>
          <ul className="mt-2 space-y-2 text-sm text-slateText">
            {aliases.map((alias) => (
              <li key={alias.id}>
                <span className="font-medium text-ink">{alias.attendance_name}</span> →{" "}
                <span className="font-medium text-ink">{alias.master_name}</span>
                <span className="block text-xs">
                  Created by {alias.created_by} on {new Date(alias.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {matchResult.approvalHistory.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-ink">Approval history</p>
          <ul className="mt-2 space-y-3">
            {matchResult.approvalHistory.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-white bg-white px-3 py-2 text-sm">
                <p className="font-semibold text-ink">
                  {entry.status === "manually_approved" ? "Approved" : entry.status === "rejected" ? "Rejected" : "Alias"}
                  {" · "}
                  {entry.actor}
                </p>
                <p className="text-xs text-slateText">
                  {new Date(entry.acted_at).toLocaleString()}
                </p>
                {entry.remarks ? <p className="mt-1 text-slateText">{entry.remarks}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!matchResult.showAttendanceDetails ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          {matchResult.status === "missing"
            ? "Attendance record not found for this Employee ID."
            : matchResult.message}
        </div>
      ) : (
        <>
          {attendanceSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnlyField label="Total Days" value={String(attendanceSummary.total_days)} />
              <ReadOnlyField label="Present Days" value={String(attendanceSummary.present_days)} />
              <ReadOnlyField label="Weekly Offs" value={String(attendanceSummary.weekly_offs)} />
              <ReadOnlyField label="Holidays" value={String(attendanceSummary.holidays)} />
              <ReadOnlyField label="Paid Leave" value={String(attendanceSummary.paid_leave)} />
              <ReadOnlyField label="LOP Days" value={String(attendanceSummary.lop_days)} />
              <ReadOnlyField label="Payable Days" value={String(attendanceSummary.payable_days)} />
              <ReadOnlyField label="OT Hours" value={String(attendanceSummary.ot_hours)} />
              <ReadOnlyField label="Late Marks" value={String(attendanceSummary.late_marks)} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PayrollTab({
  draft,
  activeComponents,
  attendanceSummary,
  estimatedPay,
  verificationRecord,
}: {
  draft: EmployeeMasterRecord;
  activeComponents: SalaryComponent[];
  attendanceSummary: ReturnType<typeof buildEmployeeAttendanceSummary> | null;
  estimatedPay: number | null;
  verificationRecord: import("@/types/attendance-verification").EmployeeVerificationRecord;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">Payroll Summary</p>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slateText">
        <p>
          <span className="font-semibold text-ink">Payroll Eligible:</span>{" "}
          {verificationRecord.audit.payrollEligible}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-ink">Verification State:</span>{" "}
          {verificationRecord.audit.verificationState}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ReadOnlyField
          label="Gross Monthly Salary"
          value={draft.gross_monthly_salary.toLocaleString("en-IN")}
        />
        <ReadOnlyField label="Salary Mode" value={draft.salary_mode} />
        <ReadOnlyField label="Unit" value={draft.unit} />
        <ReadOnlyField
          label="Payable Days"
          value={attendanceSummary ? String(attendanceSummary.payable_days) : "—"}
        />
        <ReadOnlyField
          label="Estimated Payout"
          value={
            estimatedPay !== null
              ? estimatedPay.toLocaleString("en-IN", { maximumFractionDigits: 2 })
              : "Upload attendance to calculate"
          }
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {activeComponents.map((component) => (
          <ReadOnlyField
            key={component.id}
            label={component.component_name}
            value={((draft.gross_monthly_salary * component.percentage) / 100).toLocaleString(
              "en-IN",
              { maximumFractionDigits: 2 }
            )}
          />
        ))}
      </div>
    </div>
  );
}

function LeaveTab({ draft }: { draft: EmployeeMasterRecord }) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-ink">Leave Summary</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ReadOnlyField label="Opening Leave" value={String(draft.opening_leave_balance)} />
        <ReadOnlyField label="Leave Accrued" value={String(draft.leave_accrued)} />
        <ReadOnlyField label="Leave Availed" value={String(draft.leave_availed)} />
        <ReadOnlyField label="Closing Leave" value={String(draft.closing_leave_balance)} />
        <ReadOnlyField label="Comp Off" value={String(draft.comp_off_balance)} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slateText">{label}</span>
      {children}
    </label>
  );
}
