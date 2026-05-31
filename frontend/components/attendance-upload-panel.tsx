"use client";

import Link from "next/link";
import { ChangeEvent } from "react";
import { FilePreviewCard } from "@/components/file-preview-card";
import { PageHeader } from "@/components/page-header";
import {
  analysisTypeOptions,
  useUploadWorkspace,
} from "@/context/upload-workspace-context";
import {
  loadUploadWorkspaceMeta,
  type UploadWorkspaceMeta,
} from "@/lib/upload-workspace-storage";
import { useEffect, useState } from "react";

const acceptedExtensions = [".csv", ".xlsx"];

export function AttendanceUploadPanel() {
  const {
    selectedFile,
    analysisType,
    isUploading,
    isProcessing,
    result,
    errorMessage,
    workspacePersistenceMessage,
    fileInputRef,
    handleFileChange,
    handleSubmit,
    handleCancelUpload,
    handleStartNewUpload,
    handleSheetSelect,
    isSwitchingSheet,
    setAnalysisType,
  } = useUploadWorkspace();

  const [uploadMeta, setUploadMeta] = useState<UploadWorkspaceMeta | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  useEffect(() => {
    setUploadMeta(loadUploadWorkspaceMeta());
  }, [result]);

  const onAnalysisChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (analysisTypeOptions.includes(value as (typeof analysisTypeOptions)[number])) {
      setAnalysisType(value as (typeof analysisTypeOptions)[number]);
    }
  };

  const hasExistingUploadState = Boolean(selectedFile || result || errorMessage || uploadMeta);
  const hasActiveWorkbook = Boolean(result || uploadMeta);

  useEffect(() => {
    if (!hasActiveWorkbook) {
      setShowReplaceConfirm(false);
    }
  }, [hasActiveWorkbook]);

  const handleUploadNewFileClick = () => {
    if (hasActiveWorkbook) {
      setShowReplaceConfirm(true);
      return;
    }

    if (hasExistingUploadState) {
      handleStartNewUpload();
      return;
    }

    fileInputRef.current?.click();
  };

  const confirmReplaceWorkbook = () => {
    handleStartNewUpload();
    setShowReplaceConfirm(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        eyebrow="Attendance Intake"
        title="Upload attendance workbook"
        description="Import the payroll workbook, preview detected sheets, and confirm analysis routing before moving into the working register."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUploadNewFileClick}
              disabled={isProcessing}
              className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upload New File
            </button>
            {result ? (
              <Link
                href="/attendance/working"
                className="inline-flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Open Attendance Working
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <section className="rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleUploadNewFileClick}
                className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Upload New File
              </button>
              {hasExistingUploadState ? (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleStartNewUpload}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear Current Selection
                </button>
              ) : null}
            </div>

            {showReplaceConfirm ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">
                  Replacing the workbook will overwrite the current upload session. Continue?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmReplaceWorkbook}
                    disabled={isProcessing}
                    className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReplaceConfirm(false)}
                    disabled={isProcessing}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <label
              htmlFor="file-upload"
              className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-teal-300 bg-teal-50/70 px-6 py-7 text-center transition ${
                isProcessing
                  ? "cursor-not-allowed opacity-70"
                  : "cursor-pointer hover:border-teal-500 hover:bg-teal-50"
              }`}
            >
              <span className="text-lg font-semibold text-ink">
                {selectedFile ? selectedFile.name : "Choose a spreadsheet file"}
              </span>
              <span className="mt-2 text-sm text-slateText">
                Accepted formats: {acceptedExtensions.join(", ")}
              </span>
            </label>

            <input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              disabled={isProcessing}
              onChange={handleFileChange}
            />

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slateText">
              {selectedFile ? `Selected file: ${selectedFile.name}` : "No file selected yet."}
            </div>

            <div className="space-y-2">
              <label htmlFor="analysis-type" className="text-sm font-semibold text-ink">
                Analysis Type
              </label>
              <select
                id="analysis-type"
                value={analysisType}
                disabled={isProcessing}
                onChange={onAnalysisChange}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {analysisTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={isProcessing || !selectedFile}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-ink px-5 py-3 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isUploading ? "Uploading..." : "Upload File"}
              </button>
              {isUploading ? (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-ink transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Cancel Upload
                </button>
              ) : null}
              {hasExistingUploadState ? (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleUploadNewFileClick}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-base font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Replace File
                </button>
              ) : null}
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}
            {workspacePersistenceMessage ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {workspacePersistenceMessage}
              </div>
            ) : null}
          </form>
        </section>

        {uploadMeta ? (
          <section className="rounded-[1.5rem] border border-slate-200 bg-white/92 p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink">Upload session status</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <StatusTile label="Upload ID" value={uploadMeta.uploadId} />
              <StatusTile
                label="Last saved"
                value={new Date(uploadMeta.savedAt).toLocaleString()}
              />
              <StatusTile label="Selected sheet" value={result?.selected_sheet ?? "-"} />
              <StatusTile
                label="Engine"
                value={result?.analysis_overview.engine ?? "pending"}
              />
            </div>
            <div className="mt-4">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleUploadNewFileClick}
                className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Upload New File
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slateText">
            No active upload session. Upload a workbook to begin attendance processing.
          </section>
        )}

        {result ? (
          <FilePreviewCard
            result={result}
            isSwitchingSheet={isSwitchingSheet}
            onSheetSelect={handleSheetSelect}
          />
        ) : null}
      </div>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slateText">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
