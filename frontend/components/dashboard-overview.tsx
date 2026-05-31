"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { loadAttendanceSnapshot } from "@/lib/attendance-snapshot";
import { buildAttendanceVerificationRegistry } from "@/lib/attendance-verification-registry";
import { loadEmployeesFromStorage } from "@/lib/employee-master-storage";
import { loadUploadWorkspace } from "@/lib/upload-workspace-storage";
import type { UploadResponse } from "@/types/upload";

export function DashboardOverview() {
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [attendanceMatchStats, setAttendanceMatchStats] = useState({
    verified: 0,
    warning: 0,
    pendingReview: 0,
    missing: 0,
    payrollReady: 0,
    payrollBlocked: 0,
  });

  useEffect(() => {
    const refresh = () => {
      const employees = loadEmployeesFromStorage();
      const attendanceRows = loadAttendanceSnapshot();
      const upload = loadUploadWorkspace();

      setUploadResult(upload);
      setEmployeeCount(employees.length);
      setActiveCount(employees.filter((item) => item.status === "Active").length);

      const registry = buildAttendanceVerificationRegistry(employees, attendanceRows);
      const { summary } = registry;
      setAttendanceMatchStats({
        verified: summary.verified,
        warning: summary.warning,
        pendingReview: summary.pendingReview,
        missing: summary.blocked,
        payrollReady: summary.payrollReady,
        payrollBlocked: summary.payrollBlocked,
      });
    };

    refresh();
    const intervalId = window.setInterval(refresh, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  const attendanceSummary = uploadResult?.attendance_validation_summary;
  const exceptionCount = useMemo(() => {
    if (!attendanceSummary) {
      return 0;
    }
    return (
      attendanceSummary.errors_count +
      attendanceSummary.warnings_count +
      attendanceSummary.exception_groups.length
    );
  }, [attendanceSummary]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        eyebrow="Executive Overview"
        title="HR payroll command center"
        description="High-level readiness across employee master, attendance intake, and exception queues."
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Employees in Master" value={String(employeeCount)} hint="Active directory" />
          <MetricCard label="Active Employees" value={String(activeCount)} hint="Payroll eligible headcount" />
          <MetricCard
            label="Attendance Verified"
            value={String(attendanceMatchStats.verified)}
            hint="ID matched to attendance"
          />
          <MetricCard
            label="Open Exceptions"
            value={String(exceptionCount)}
            hint="Warnings and errors in current upload"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
              Employee validation
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniStat label="Verified" value={attendanceMatchStats.verified} tone="emerald" />
              <MiniStat label="Warning" value={attendanceMatchStats.warning} tone="amber" />
              <MiniStat label="Pending review" value={attendanceMatchStats.pendingReview} tone="amber" />
              <MiniStat
                label="Payroll ready"
                value={attendanceMatchStats.payrollReady}
                tone="emerald"
              />
              <MiniStat
                label="Payroll blocked"
                value={attendanceMatchStats.payrollBlocked}
                tone="rose"
              />
              <MiniStat label="Missing attendance" value={attendanceMatchStats.missing} tone="slate" />
            </div>
            <Link
              href="/employees"
              className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:underline"
            >
              Open Employee Master
            </Link>
          </section>

          <section className="rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">
              Attendance session
            </p>
            {uploadResult ? (
              <div className="mt-4 space-y-2 text-sm text-slateText">
                <p>
                  <span className="font-semibold text-ink">Upload ID:</span> {uploadResult.upload_id}
                </p>
                <p>
                  <span className="font-semibold text-ink">Sheet:</span>{" "}
                  {uploadResult.selected_sheet || "-"}
                </p>
                <p>
                  <span className="font-semibold text-ink">Processed rows:</span>{" "}
                  {attendanceSummary?.processed_attendance_rows.length ?? 0}
                </p>
                <p>
                  <span className="font-semibold text-ink">Payable readiness:</span>{" "}
                  {attendanceSummary?.status ?? "pending"}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slateText">
                No workbook session in progress. Start with attendance upload.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/attendance/upload"
                className="inline-flex rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Attendance Upload
              </Link>
              <Link
                href="/attendance/working"
                className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
              >
                Attendance Working
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-white to-teal-50/40 p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slateText">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-xs text-slateText">{hint}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose" | "slate" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
