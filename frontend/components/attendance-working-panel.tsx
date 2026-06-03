"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
    isSavingAttendanceChanges,
    activeResultTab,
    setActiveResultTab,
    resultTabs,
    workspacePersistenceMessage,
    hasUnsavedAttendanceChanges,
    unsavedAttendanceChangeCount,
    handleAttendanceReviewUpdate,
    handleAttendanceMerge,
    handleSaveAttendanceChanges,
    handleStartNewUpload,
  } = useUploadWorkspace();
  const router = useRouter();
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  useEffect(() => {
    if (result?.analysis_overview.engine === "attendance") {
      setActiveResultTab("analysis");
    }
  }, [result, setActiveResultTab]);

  useEffect(() => {
    if (!result) {
      setShowReplaceConfirm(false);
    }
  }, [result]);

  const confirmReplaceWorkbook = () => {
    handleStartNewUpload();
    setShowReplaceConfirm(false);
    router.push("/attendance/upload");
  };

  const handleBackToUpload = () => {
    if (
      hasUnsavedAttendanceChanges &&
      typeof window !== "undefined" &&
      !window.confirm(
        `You have ${unsavedAttendanceChangeCount} unsaved attendance change(s). Leave this page without saving?`
      )
    ) {
      return;
    }
    router.push("/attendance/upload");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        eyebrow="Attendance Working"
        title="Payroll-ready attendance processing"
        description="Review punch exceptions, apply corrections, resolve merge candidates, and export the finalized working register."
        actions={
          <div className="flex flex-wrap gap-2">
            {result?.analysis_overview.engine === "attendance" ? (
              <button
                type="button"
                onClick={() => void handleSaveAttendanceChanges()}
                disabled={!hasUnsavedAttendanceChanges || isSavingAttendanceChanges}
                className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSavingAttendanceChanges ? "Saving..." : "Save All Changes"}
              </button>
            ) : null}
            {result ? (
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(true)}
                className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100"
              >
                Replace Workbook
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleBackToUpload}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              Back to Upload
            </button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {workspacePersistenceMessage ? (
          <section className="mb-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
            {workspacePersistenceMessage}
          </section>
        ) : null}
        {result?.analysis_overview.engine === "attendance" ? (
          <section
            className={`mb-4 rounded-[1.5rem] border p-4 text-sm shadow-sm ${
              hasUnsavedAttendanceChanges
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {hasUnsavedAttendanceChanges
              ? `Unsaved Changes (${unsavedAttendanceChangeCount})`
              : "All attendance changes are saved."}
          </section>
        ) : null}
        {showReplaceConfirm ? (
          <section className="mb-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-amber-900">
              {hasUnsavedAttendanceChanges
                ? `Replacing the workbook will discard ${unsavedAttendanceChangeCount} unsaved attendance change(s) and overwrite the current upload session. Continue?`
                : "Replacing the workbook will overwrite the current upload session. Continue?"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirmReplaceWorkbook}
                className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setShowReplaceConfirm(false)}
                className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

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
