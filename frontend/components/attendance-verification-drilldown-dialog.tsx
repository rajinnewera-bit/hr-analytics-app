"use client";

import Link from "next/link";
import type { EmployeeVerificationRecord } from "@/types/attendance-verification";
import { BLOCK_REASON_LABELS } from "@/lib/attendance-verification-registry-constants";
import type { PayrollBlockReason } from "@/types/attendance-verification";

type AttendanceVerificationDrillDownDialogProps = {
  open: boolean;
  title: string;
  items: EmployeeVerificationRecord[];
  variant: "standard" | "warning" | "payroll_blocked";
  onClose: () => void;
};

function EmployeeAuditRows({ record }: { record: EmployeeVerificationRecord }) {
  return (
    <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slateText sm:grid-cols-3">
      <div>
        <span className="font-semibold text-ink">Verification State:</span> {record.audit.verificationState}
      </div>
      <div>
        <span className="font-semibold text-ink">Payroll Eligible:</span> {record.audit.payrollEligible}
      </div>
      <div className="sm:col-span-1">
        <Link
          href={`/employees/${encodeURIComponent(record.employeeCode)}?tab=attendance`}
          className="font-semibold text-teal-700 hover:underline"
        >
          Open profile
        </Link>
      </div>
    </div>
  );
}

function StandardCard({ record }: { record: EmployeeVerificationRecord }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee ID" value={record.employeeCode} />
        <Field label="Master Name" value={record.employeeName || "-"} />
        <Field label="Attendance Name" value={record.match.attendanceEmployeeName || "-"} />
        <Field label="Verification Reason" value={record.audit.verificationReason} wide />
      </div>
      <EmployeeAuditRows record={record} />
    </article>
  );
}

function WarningCard({ record }: { record: EmployeeVerificationRecord }) {
  return (
    <article className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee ID" value={record.employeeCode} />
        <Field label="Master Name" value={record.employeeName || "-"} />
        <Field label="Attendance Name" value={record.match.attendanceEmployeeName || "-"} />
        <Field
          label="Warning Reason"
          value={record.warningReasonLabel ?? record.audit.verificationReason}
          wide
        />
      </div>
      <EmployeeAuditRows record={record} />
    </article>
  );
}

function BlockedCard({ record }: { record: EmployeeVerificationRecord }) {
  return (
    <article className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Employee ID" value={record.employeeCode} />
        <Field label="Master Name" value={record.employeeName || "-"} />
        <Field label="Attendance Name" value={record.match.attendanceEmployeeName || "-"} />
        <Field label="Reason" value={record.blockReasonLabel ?? record.audit.verificationReason} />
        <Field label="Payroll Status" value="Blocked" />
      </div>
      <EmployeeAuditRows record={record} />
    </article>
  );
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function groupBlockedByReason(items: EmployeeVerificationRecord[]) {
  const groups = new Map<PayrollBlockReason, EmployeeVerificationRecord[]>();
  items.forEach((item) => {
    const key = item.blockReason ?? "verification_failed";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  });
  return [...groups.entries()].sort((a, b) =>
    BLOCK_REASON_LABELS[a[0]].localeCompare(BLOCK_REASON_LABELS[b[0]])
  );
}

export function AttendanceVerificationDrillDownDialog({
  open,
  title,
  items,
  variant,
  onClose,
}: AttendanceVerificationDrillDownDialogProps) {
  if (!open) {
    return null;
  }

  const blockedGroups = variant === "payroll_blocked" ? groupBlockedByReason(items) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-lg font-bold text-ink">{title}</p>
            <p className="mt-1 text-sm text-slateText">
              Showing {items.length} employee{items.length === 1 ? "" : "s"} (traceable drill-down)
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
            <p className="text-sm text-slateText">No employees in this category.</p>
          ) : variant === "payroll_blocked" ? (
            <div className="space-y-6">
              {blockedGroups.map(([reason, groupItems]) => (
                <section key={reason}>
                  <h3 className="text-sm font-bold text-ink">
                    {BLOCK_REASON_LABELS[reason]} ({groupItems.length})
                  </h3>
                  <div className="mt-3 space-y-3">
                    {groupItems.map((record) => (
                      <BlockedCard key={record.employeeCode} record={record} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((record) =>
                variant === "warning" ? (
                  <WarningCard key={record.employeeCode} record={record} />
                ) : (
                  <StandardCard key={record.employeeCode} record={record} />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
