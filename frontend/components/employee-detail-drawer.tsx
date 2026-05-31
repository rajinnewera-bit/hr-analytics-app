"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttendanceProcessedRow } from "@/types/upload";
import type {
  EmployeeMasterRecord,
  SalaryComponent,
} from "@/types/employee-master";
import {
  attendanceBadgeClassName,
  validateEmployeeAttendance,
} from "@/lib/attendance-employee-validation";
import { loadAttendanceVerificationStore } from "@/lib/attendance-verification-storage";
import {
  buildEmployeeAttendanceSummary,
  filterAttendanceRowsByEmployeeCode,
} from "@/lib/attendance-employee-summary";
import {
  isValidDateText,
  SALARY_MODE_OPTIONS,
  toNumber,
  toSalaryMode,
  toUnit,
  UNIT_OPTIONS,
} from "@/lib/employee-master-storage";

type DrawerMode = "view" | "edit";
type DrawerTab = "master" | "attendance";

type EmployeeDetailDrawerProps = {
  open: boolean;
  employee: EmployeeMasterRecord | null;
  initialMode: DrawerMode;
  initialTab: DrawerTab;
  salaryComponents: SalaryComponent[];
  attendanceRows: AttendanceProcessedRow[];
  onClose: () => void;
  onSave: (employee: EmployeeMasterRecord) => void;
  onDelete: (employeeCode: string) => void;
  onSalaryComponentsChange: (components: SalaryComponent[]) => void;
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "-"}</p>
    </div>
  );
}

export function EmployeeDetailDrawer({
  open,
  employee,
  initialMode,
  initialTab,
  salaryComponents,
  attendanceRows,
  onClose,
  onSave,
  onDelete,
  onSalaryComponentsChange,
}: EmployeeDetailDrawerProps) {
  const [draft, setDraft] = useState<EmployeeMasterRecord | null>(employee);
  const [mode, setMode] = useState<DrawerMode>(initialMode);
  const [tab, setTab] = useState<DrawerTab>(initialTab);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft(employee);
    setMode(initialMode);
    setTab(initialTab);
  }, [employee, initialMode, initialTab, open]);

  const activeComponents = useMemo(
    () => salaryComponents.filter((item) => item.active && item.component_name.trim()),
    [salaryComponents]
  );

  const matchResult = useMemo(() => {
    if (!draft) {
      return null;
    }
    return validateEmployeeAttendance(draft, attendanceRows, loadAttendanceVerificationStore());
  }, [draft, attendanceRows]);

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

  if (!open || !draft || !matchResult) {
    return null;
  }

  const isEditable = mode === "edit";

  const handleSave = () => {
    if (!draft.employee_code.trim() || !draft.employee_name.trim() || !isValidDateText(draft.doj)) {
      return;
    }
    onSave(draft);
    onClose();
  };

  const handleDelete = () => {
    const confirmed = window.confirm("Are you sure you want to remove this employee record?");
    if (!confirmed) {
      return;
    }
    onDelete(draft.employee_code);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-slate-900/40 backdrop-blur-sm">
      <button type="button" className="flex-1 self-stretch" aria-label="Close drawer" onClick={onClose} />
      <aside className="flex w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl max-h-[100dvh]">
        <div className="shrink-0 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                Employee Profile
              </p>
              <h3 className="mt-1 text-xl font-bold text-ink">{draft.employee_name || "Unnamed Employee"}</h3>
              <p className="text-sm text-slateText">{draft.employee_code}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slateText hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${attendanceBadgeClassName(
                matchResult.status
              )}`}
            >
              {matchResult.badgeLabel}
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

        <div className="shrink-0 border-b border-slate-200 px-5">
          <div className="flex gap-2 py-3">
            <button
              type="button"
              onClick={() => setTab("master")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "master" ? "bg-teal-700 text-white" : "bg-slate-100 text-slateText"
              }`}
            >
              Employee Master
            </button>
            <button
              type="button"
              onClick={() => setTab("attendance")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                tab === "attendance" ? "bg-teal-700 text-white" : "bg-slate-100 text-slateText"
              }`}
            >
              Attendance Details
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth px-5 py-4">
          {tab === "master" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Section A — Employee Master</p>
                {!isEditable ? (
                  <button
                    type="button"
                    onClick={() => setMode("edit")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50"
                  >
                    Switch to Edit
                  </button>
                ) : null}
              </div>

              {isEditable ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Employee ID</span>
                    <input
                      value={draft.employee_code}
                      onChange={(e) => setDraft({ ...draft, employee_code: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Employee Name</span>
                    <input
                      value={draft.employee_name}
                      onChange={(e) => setDraft({ ...draft, employee_name: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">DOJ</span>
                    <input
                      type="date"
                      value={draft.doj}
                      onChange={(e) => setDraft({ ...draft, doj: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Department</span>
                    <input
                      value={draft.department}
                      onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Designation</span>
                    <input
                      value={draft.designation}
                      onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Unit</span>
                    <select
                      value={draft.unit}
                      onChange={(e) => setDraft({ ...draft, unit: toUnit(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Salary Mode</span>
                    <select
                      value={draft.salary_mode}
                      onChange={(e) =>
                        setDraft({ ...draft, salary_mode: toSalaryMode(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    >
                      {SALARY_MODE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Gross Salary</span>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.gross_monthly_salary}
                      onChange={(e) =>
                        setDraft({ ...draft, gross_monthly_salary: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Status</span>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          status: e.target.value === "Inactive" ? "Inactive" : "Active",
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Opening Leave Balance</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.opening_leave_balance}
                      onChange={(e) =>
                        setDraft({ ...draft, opening_leave_balance: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Leave Accrued</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.leave_accrued}
                      onChange={(e) =>
                        setDraft({ ...draft, leave_accrued: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Leave Availed</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.leave_availed}
                      onChange={(e) =>
                        setDraft({ ...draft, leave_availed: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Closing Leave Balance</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.closing_leave_balance}
                      onChange={(e) =>
                        setDraft({ ...draft, closing_leave_balance: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slateText">Comp Off</span>
                    <input
                      type="number"
                      step="0.5"
                      value={draft.comp_off_balance}
                      onChange={(e) =>
                        setDraft({ ...draft, comp_off_balance: toNumber(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
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
                  <ReadOnlyField label="Opening Leave" value={String(draft.opening_leave_balance)} />
                  <ReadOnlyField label="Leave Accrued" value={String(draft.leave_accrued)} />
                  <ReadOnlyField label="Leave Availed" value={String(draft.leave_availed)} />
                  <ReadOnlyField label="Closing Leave" value={String(draft.closing_leave_balance)} />
                  <ReadOnlyField label="Comp Off" value={String(draft.comp_off_balance)} />
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-ink">Salary Structure Components</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {activeComponents.map((component) => (
                    <div
                      key={component.id}
                      className="rounded-xl border border-white bg-white px-3 py-2 shadow-sm"
                    >
                      <p className="text-xs text-slateText">{component.component_name}</p>
                      <p className="text-sm font-semibold text-ink">
                        {((draft.gross_monthly_salary * component.percentage) / 100).toLocaleString(
                          "en-IN",
                          { maximumFractionDigits: 2 }
                        )}
                      </p>
                      <p className="text-xs text-slateText">{component.percentage}%</p>
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
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-ink">Section B — Attendance Details</p>
              <p className="text-xs text-slateText">System generated only. These fields are read-only.</p>

              {!matchResult.showAttendanceDetails ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
                  {matchResult.status === "missing"
                    ? "Attendance record not found for this Employee ID."
                    : matchResult.message}
                </div>
              ) : (
                <>
                  {matchResult.status === "warning" || matchResult.status === "pending_review" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {matchResult.message}
                      {matchResult.attendanceEmployeeName ? (
                        <span className="mt-1 block text-xs">
                          Attendance name: {matchResult.attendanceEmployeeName}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {attendanceSummary ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ReadOnlyField label="Total Days" value={String(attendanceSummary.total_days)} />
                      <ReadOnlyField label="Present Days" value={String(attendanceSummary.present_days)} />
                      <ReadOnlyField label="Weekly Offs" value={String(attendanceSummary.weekly_offs)} />
                      <ReadOnlyField label="Holidays" value={String(attendanceSummary.holidays)} />
                      <ReadOnlyField label="Paid Leave" value={String(attendanceSummary.paid_leave)} />
                      <ReadOnlyField label="LOP Days" value={String(attendanceSummary.lop_days)} />
                      <ReadOnlyField
                        label="Payable Days"
                        value={String(attendanceSummary.payable_days)}
                      />
                      <ReadOnlyField label="OT Hours" value={String(attendanceSummary.ot_hours)} />
                      <ReadOnlyField label="Late Marks" value={String(attendanceSummary.late_marks)} />
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 px-5 py-4">
          {tab === "master" && isEditable ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Save Employee
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                Delete Employee
              </button>
            </div>
          ) : (
            <p className="text-xs text-slateText">
              Open in Edit mode to update employee master details.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
