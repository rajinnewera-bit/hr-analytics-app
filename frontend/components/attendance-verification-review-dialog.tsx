"use client";

import { useState } from "react";
import Link from "next/link";
import type { EmployeeVerificationRecord } from "@/types/attendance-verification";
import type { EmployeeAttendanceSummary } from "@/types/employee-master";

type AttendanceVerificationReviewDialogProps = {
  open: boolean;
  items: EmployeeVerificationRecord[];
  onClose: () => void;
  onApprove: (item: EmployeeVerificationRecord, remarks: string) => void;
  onReject: (item: EmployeeVerificationRecord, remarks: string) => void;
  onCreateAlias: (item: EmployeeVerificationRecord, remarks: string) => void;
};

function SummaryGrid({ summary }: { summary: EmployeeAttendanceSummary }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {[
        { label: "Total Days", value: summary.total_days },
        { label: "Present", value: summary.present_days },
        { label: "Payable", value: summary.payable_days },
        { label: "LOP", value: summary.lop_days },
        { label: "OT Hours", value: summary.ot_hours },
        { label: "Late Marks", value: summary.late_marks },
      ].map((metric) => (
        <div key={metric.label} className="rounded-lg border border-white bg-white px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slateText">
            {metric.label}
          </p>
          <p className="text-sm font-semibold text-ink">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

export function AttendanceVerificationReviewDialog({
  open,
  items,
  onClose,
  onApprove,
  onReject,
  onCreateAlias,
}: AttendanceVerificationReviewDialogProps) {
  const [remarksByCode, setRemarksByCode] = useState<Record<string, string>>({});

  if (!open) {
    return null;
  }

  const updateRemarks = (employeeCode: string, value: string) => {
    setRemarksByCode((prev) => ({ ...prev, [employeeCode]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-ink">HR Exception Review</p>
            <p className="mt-1 text-sm text-slateText">
              Resolve pending attendance name exceptions. Manual approval requires an exact Employee
              ID match.
            </p>
            <p className="mt-2 text-base font-bold text-ink">
              {items.length} employee{items.length === 1 ? "" : "s"} pending review
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slateText hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="text-sm text-slateText">No employees are pending HR review.</p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const remarks = remarksByCode[item.employeeCode] ?? "";
                const canAct = item.match.canManuallyApprove && item.match.employeeIdMatched;

                return (
                  <article
                    key={item.employeeCode}
                    className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-800">
                          Pending Review
                        </p>
                        <p className="mt-1 text-base font-bold text-ink">{item.employeeName}</p>
                        <p className="text-sm text-slateText">ID: {item.employeeCode}</p>
                      </div>
                      <Link
                        href={`/employees/${encodeURIComponent(item.employeeCode)}?tab=attendance`}
                        className="text-sm font-semibold text-teal-700 hover:underline"
                      >
                        Open profile
                      </Link>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">
                          Master Name
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-ink">{item.employeeName}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">
                          Attendance Name
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-ink">
                          {item.match.attendanceEmployeeName || "-"}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">
                          Reason
                        </p>
                        <p className="mt-0.5 text-sm text-ink">{item.match.reason}</p>
                      </div>
                    </div>

                    {item.attendanceSummary ? (
                      <div className="mt-3 rounded-xl border border-orange-100 bg-white/80 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slateText">
                          Attendance Summary
                        </p>
                        <SummaryGrid summary={item.attendanceSummary} />
                      </div>
                    ) : null}

                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-medium text-slateText">Remarks</span>
                      <textarea
                        value={remarks}
                        onChange={(event) => updateRemarks(item.employeeCode, event.target.value)}
                        rows={2}
                        placeholder="Optional remarks for audit trail"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-100"
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canAct}
                        onClick={() => onApprove(item, remarks)}
                        className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Approve Match
                      </button>
                      <button
                        type="button"
                        disabled={!canAct}
                        onClick={() => onReject(item, remarks)}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reject Match
                      </button>
                      <button
                        type="button"
                        disabled={!canAct}
                        onClick={() => onCreateAlias(item, remarks)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Create Alias
                      </button>
                    </div>

                    {!item.match.employeeIdMatched ? (
                      <p className="mt-2 text-xs font-semibold text-rose-700">
                        Employee ID mismatch — manual approval is not permitted.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
