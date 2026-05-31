"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AttendanceAnalysisCard } from "@/components/attendance-analysis-card";
import { AttendanceExportCard } from "@/components/attendance-export-card";
import { AttendanceMergeCard } from "@/components/attendance-merge-card";
import { AnalysisOverviewCard } from "@/components/analysis-overview-card";
import { PageHeader } from "@/components/page-header";
import { ValidationSummaryCard } from "@/components/validation-summary-card";
import { WorkbookIntelligenceSummary } from "@/components/workbook-intelligence-summary";
import { useUploadWorkspace } from "@/context/upload-workspace-context";

export function AttendanceWorkingPanel() {
  const {
    result,
    isProcessing,
    isUpdatingAttendance,
    activeResultTab,
    setActiveResultTab,
    resultTabs,
    handleAttendanceReviewUpdate,
    handleAttendanceMerge,
  } = useUploadWorkspace();

  useEffect(() => {
    if (result?.analysis_overview.engine === "attendance") {
      setActiveResultTab("analysis");
    }
  }, [result, setActiveResultTab]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        eyebrow="Attendance Working"
        title="Payroll-ready attendance processing"
        description="Review punch exceptions, apply corrections, resolve merge candidates, and export the finalized working register."
        actions={
          <Link
            href="/attendance/upload"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Back to Upload
          </Link>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!result ? (
          <section className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/90 p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-ink">No attendance session loaded</p>
            <p className="mt-2 text-sm text-slateText">
              Upload and preview a workbook first, then return here to complete HR review and merge
              workflows.
            </p>
            <Link
              href="/attendance/upload"
              className="mt-5 inline-flex items-center justify-center rounded-2xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Go to Attendance Upload
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {resultTabs.map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveResultTab(tabId)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                    activeResultTab === tabId
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-white text-slateText hover:border-teal-300 hover:text-teal-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeResultTab === "analysis" ? (
              <div className="space-y-4">
                {result.analysis_overview.engine !== "attendance" ? (
                  <AnalysisOverviewCard
                    analysisType={result.analysis_type}
                    overview={result.analysis_overview}
                  />
                ) : null}
                {result.analysis_overview.engine === "payroll" &&
                result.payroll_validation_summary ? (
                  <ValidationSummaryCard summary={result.payroll_validation_summary} />
                ) : null}
                {result.analysis_overview.engine === "attendance" &&
                result.attendance_validation_summary ? (
                  <div className="space-y-4">
                    <AttendanceAnalysisCard
                      selectedSheet={result.selected_sheet}
                      summary={result.attendance_validation_summary}
                      isUpdating={isUpdatingAttendance}
                      onReviewUpdate={handleAttendanceReviewUpdate}
                    />
                    <AttendanceMergeCard
                      summary={result.attendance_validation_summary}
                      onMerge={handleAttendanceMerge}
                      isProcessing={isProcessing}
                    />
                    <AttendanceExportCard summary={result.attendance_validation_summary} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeResultTab === "workbook" &&
            result.analysis_overview.engine !== "attendance" ? (
              <WorkbookIntelligenceSummary
                sheets={result.workbook_intelligence_summary}
                selectedSheet={result.selected_sheet}
              />
            ) : null}

            {activeResultTab === "overview" ? (
              <section className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-5 text-sm text-slateText">
                Upload review and sheet preview live on the{" "}
                <Link href="/attendance/upload" className="font-semibold text-teal-700 hover:underline">
                  Attendance Upload
                </Link>{" "}
                page. Switch to HR Dashboard here for working tools.
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
