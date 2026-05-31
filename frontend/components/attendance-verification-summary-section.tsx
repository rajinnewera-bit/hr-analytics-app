"use client";

import type { AttendanceVerificationRegistrySummary } from "@/types/attendance-verification";

type AttendanceVerificationSummarySectionProps = {
  summary: AttendanceVerificationRegistrySummary;
};

export function AttendanceVerificationSummarySection({
  summary,
}: AttendanceVerificationSummarySectionProps) {
  const rows = [
    { label: "Verified", value: summary.verified, tone: "text-emerald-700" },
    { label: "Warning", value: summary.warning, tone: "text-amber-700" },
    { label: "Pending Review", value: summary.pendingReview, tone: "text-orange-700" },
    { label: "Blocked", value: summary.blocked, tone: "text-rose-700" },
  ];

  return (
    <section className="rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
        Attendance Verification Summary
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">
              {row.label}
            </p>
            <p className={`mt-1 text-2xl font-extrabold ${row.tone}`}>{row.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">Total Employees Considered</p>
          <p className="text-2xl font-extrabold text-ink">{summary.totalConsidered}</p>
        </div>
        <div className="text-sm text-slateText">
          <span className="font-semibold text-ink">Category sum:</span> {summary.categorySum}
          <span className="mx-2">·</span>
          <span className="font-semibold text-ink">Expected:</span> {summary.totalConsidered}
        </div>
      </div>
      {!summary.categorySumValid ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          Validation warning: Verified + Warning + Pending Review + Blocked does not equal Total
          Employees Considered. Counts may be out of sync — refresh the page or re-save Employee Master.
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">
          Category totals reconcile with employees considered ({summary.categorySum} ={" "}
          {summary.totalConsidered}).
        </p>
      )}
    </section>
  );
}
