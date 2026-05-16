"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { AnalysisOverviewCard } from "@/components/analysis-overview-card";
import { AttendanceAnalysisCard } from "@/components/attendance-analysis-card";
import { FilePreviewCard } from "@/components/file-preview-card";
import { normalizeUploadResponse } from "@/lib/upload-response";
import { ValidationSummaryCard } from "@/components/validation-summary-card";
import { WorkbookIntelligenceSummary } from "@/components/workbook-intelligence-summary";
import type {
  AttendanceAdministrativeException,
  AttendanceHolidayMarker,
  AttendancePolicyRule,
  AttendanceReviewDecision,
  UploadResponse
} from "@/types/upload";

const acceptedExtensions = [".csv", ".xlsx"];
const analysisTypeOptions = [
  "Auto Detect",
  "Payroll & HR Analytics",
  "Attendance / Timesheet Analysis"
] as const;
type AnalysisType = (typeof analysisTypeOptions)[number];
type ResultTab = "overview" | "analysis" | "workbook";
const uploadTimeoutMs = 120000;
const uploadCancelledMessage = "Upload cancelled.";
const uploadTimedOutMessage = "Upload timed out. Please try again.";
const uploadFailedMessage = "Unable to upload the selected file.";
const sheetFailedMessage = "Unable to analyze the selected sheet.";

async function parseApiResponse(response: Response) {
  const responseText = await response.text();

  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as UploadResponse | { detail?: string };
  } catch {
    return { detail: responseText };
  }
}

function normalizeAnalysisType(value: string | null | undefined): AnalysisType {
  if (
    value &&
    analysisTypeOptions.includes(value as AnalysisType)
  ) {
    return value as AnalysisType;
  }

  return "Auto Detect";
}

function resolveApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return "http://127.0.0.1:8000";
}

export function UploadPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("Auto Detect");
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitchingSheet, setIsSwitchingSheet] = useState(false);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("overview");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const sheetAbortControllerRef = useRef<AbortController | null>(null);
  const uploadAbortReasonRef = useRef<"cancelled" | "timeout" | "refresh" | null>(null);
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadRequestIdRef = useRef(0);
  const sheetRequestIdRef = useRef(0);
  const attendanceRequestIdRef = useRef(0);

  const isProcessing = isUploading || isSwitchingSheet || isUpdatingAttendance;
  const resultEngine = result?.analysis_overview.engine ?? "generic";
  const resultTabs = useMemo(
    () =>
      resultEngine === "attendance"
        ? ([
            ["overview", "Upload Review"],
            ["analysis", "HR Dashboard"]
          ] as const)
        : ([
            ["overview", "Overview"],
            ["analysis", "Analysis"],
            ["workbook", "Workbook"]
          ] as const),
    [resultEngine]
  );
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  useEffect(() => {
    isMountedRef.current = true;
    resetWorkspaceState();

    const handleBeforeUnload = () => {
      clearUploadTimeout();
      abortUpload("refresh");
      abortSheetSwitch();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearUploadTimeout();
      abortUpload("refresh");
      abortSheetSwitch();
    };
  }, []);

  useEffect(() => {
    if (!resultTabs.some(([tabId]) => tabId === activeResultTab)) {
      setActiveResultTab("analysis");
    }
  }, [activeResultTab, resultTabs]);

  const clearUploadTimeout = () => {
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
      uploadTimeoutRef.current = null;
    }
  };

  const abortUpload = (reason: "cancelled" | "timeout" | "refresh") => {
    uploadAbortReasonRef.current = reason;
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    clearUploadTimeout();
  };

  const abortSheetSwitch = () => {
    sheetAbortControllerRef.current?.abort();
    sheetAbortControllerRef.current = null;
  };

  const clearFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetWorkspaceState = () => {
    if (!isMountedRef.current) {
      return;
    }

    setSelectedFile(null);
    setAnalysisType("Auto Detect");
    setIsUploading(false);
    setIsSwitchingSheet(false);
    setIsUpdatingAttendance(false);
    setResult(null);
    setActiveResultTab("overview");
    setErrorMessage(null);
    clearFileInput();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
      return;
    }

    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setResult(null);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isProcessing) {
      return;
    }

    if (!selectedFile) {
      setErrorMessage("Please choose a CSV or Excel file before uploading.");
      return;
    }

    abortSheetSwitch();
    clearUploadTimeout();
    uploadAbortReasonRef.current = null;
    const controller = new AbortController();
    uploadAbortControllerRef.current = controller;
    const requestId = ++uploadRequestIdRef.current;

    setIsUploading(true);
    setIsSwitchingSheet(false);
    setResult(null);
    setErrorMessage(null);

    try {
      uploadTimeoutRef.current = setTimeout(() => {
        abortUpload("timeout");
      }, uploadTimeoutMs);

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("analysis_type", analysisType);

      const response = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail
            ? data.detail
            : "Something went wrong during upload."
        );
      }

      if (isMountedRef.current && uploadRequestIdRef.current === requestId) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
        setActiveResultTab(
          normalizedResponse.analysis_overview.engine === "generic"
            ? "overview"
            : "analysis"
        );
        setSelectedFile(null);
        clearFileInput();
      }
    } catch (error) {
      if (!isMountedRef.current || uploadRequestIdRef.current !== requestId) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        if (uploadAbortReasonRef.current === "cancelled") {
          setErrorMessage(uploadCancelledMessage);
        } else if (uploadAbortReasonRef.current === "timeout") {
          setErrorMessage(uploadTimedOutMessage);
        }
      } else {
        const message = error instanceof Error ? error.message : uploadFailedMessage;
        setErrorMessage(message);
      }
    } finally {
      if (uploadRequestIdRef.current === requestId && isMountedRef.current) {
        setIsUploading(false);
      }
      uploadAbortControllerRef.current = null;
      uploadAbortReasonRef.current = null;
      clearUploadTimeout();
    }
  };

  const handleCancelUpload = () => {
    if (!isUploading) {
      return;
    }

    abortUpload("cancelled");
    if (isMountedRef.current) {
      setIsUploading(false);
    }
  };

  const handleSheetSelect = async (sheetName: string) => {
    if (!result?.upload_id || result.selected_sheet === sheetName || isUploading) {
      return;
    }

    abortSheetSwitch();
    const controller = new AbortController();
    sheetAbortControllerRef.current = controller;
    const requestId = ++sheetRequestIdRef.current;

    setIsSwitchingSheet(true);
    setErrorMessage(null);

    try {
      const encodedSheetName = encodeURIComponent(sheetName);
      const response = await fetch(
        `${apiBaseUrl}/upload/${result.upload_id}/sheet/${encodedSheetName}`,
        {
          signal: controller.signal
        }
      );

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail
            ? data.detail
            : "Unable to analyze the selected sheet."
        );
      }

      if (isMountedRef.current && sheetRequestIdRef.current === requestId) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current || sheetRequestIdRef.current !== requestId) {
        return;
      }

      if (!(error instanceof DOMException && error.name === "AbortError")) {
        const message = error instanceof Error ? error.message : sheetFailedMessage;
        setErrorMessage(message);
      }
    } finally {
      if (sheetRequestIdRef.current === requestId && isMountedRef.current) {
        setIsSwitchingSheet(false);
      }
      sheetAbortControllerRef.current = null;
    }
  };

  const handleAttendanceReviewUpdate = async (payload: {
    sheetName: string;
    decisions: AttendanceReviewDecision[];
    policyRules: AttendancePolicyRule[];
    holidayMarkers: AttendanceHolidayMarker[];
    administrativeExceptions: AttendanceAdministrativeException[];
  }) => {
    if (!result?.upload_id) {
      return;
    }

    const requestId = ++attendanceRequestIdRef.current;
    setIsUpdatingAttendance(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/upload/${result.upload_id}/attendance-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sheet_name: payload.sheetName,
            decisions: payload.decisions,
            policy_rules: payload.policyRules,
            holiday_markers: payload.holidayMarkers,
            administrative_exceptions: payload.administrativeExceptions
          })
        }
      );

      const data = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail
            ? data.detail
            : "Unable to update attendance review."
        );
      }

      if (isMountedRef.current && attendanceRequestIdRef.current === requestId) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current || attendanceRequestIdRef.current !== requestId) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Unable to update attendance review.";
      setErrorMessage(message);
    } finally {
      if (isMountedRef.current && attendanceRequestIdRef.current === requestId) {
        setIsUpdatingAttendance(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Upload Center
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink">Upload a workbook</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slateText">
            Accepted formats: {acceptedExtensions.join(", ")}. The backend will keep the
            current upload flow, parse the workbook, and route only the selected analysis
            engine.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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
              Click here to browse your computer
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slateText shadow-sm">
            {selectedFile
              ? `Selected file: ${selectedFile.name}`
              : "No file selected yet."}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="analysis-type"
              className="text-sm font-semibold text-ink"
            >
              Analysis Type
            </label>
            <select
              id="analysis-type"
              value={analysisType}
              disabled={isProcessing}
              onChange={(event) =>
                setAnalysisType(normalizeAnalysisType(event.target.value))
              }
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
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}
        </form>
      </section>

      {result ? (
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

          {activeResultTab === "overview" ? (
            <FilePreviewCard
              result={result}
              isSwitchingSheet={isSwitchingSheet}
              onSheetSelect={handleSheetSelect}
            />
          ) : null}

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
              <AttendanceAnalysisCard
                selectedSheet={result.selected_sheet}
                summary={result.attendance_validation_summary}
                isUpdating={isUpdatingAttendance}
                onReviewUpdate={handleAttendanceReviewUpdate}
              />
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
        </div>
      ) : null}
    </div>
  );
}
