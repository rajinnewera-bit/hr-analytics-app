"use client";

import {
  ChangeEvent,
  FormEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { saveAttendanceSnapshot } from "@/lib/attendance-snapshot";
import { normalizeUploadResponse } from "@/lib/upload-response";
import {
  loadUploadWorkspace,
  saveUploadWorkspace,
} from "@/lib/upload-workspace-storage";
import type {
  AttendanceAdministrativeException,
  AttendanceHolidayMarker,
  AttendanceMergeInstruction,
  AttendancePolicyRule,
  AttendanceReviewDecision,
  UploadResponse,
} from "@/types/upload";

export const analysisTypeOptions = [
  "Auto Detect",
  "Payroll & HR Analytics",
  "Attendance / Timesheet Analysis",
] as const;

export type AnalysisType = (typeof analysisTypeOptions)[number];
export type ResultTab = "overview" | "analysis" | "workbook";

const uploadTimeoutMs = 120000;
const uploadCancelledMessage = "Upload cancelled.";
const uploadTimedOutMessage = "Upload timed out. Please try again.";
const uploadFailedMessage = "Unable to upload the selected file.";
const sheetFailedMessage = "Unable to analyze the selected sheet.";
const mergeFailedMessage = "Unable to merge attendance records.";

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

function syncAttendanceSnapshotForEmployeeMaster(response: UploadResponse) {
  const rows = response.attendance_validation_summary?.processed_attendance_rows ?? [];
  if (rows.length > 0) {
    saveAttendanceSnapshot(rows);
  }
}

function normalizeAnalysisType(value: string | null | undefined): AnalysisType {
  if (value && analysisTypeOptions.includes(value as AnalysisType)) {
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

type UploadWorkspaceContextValue = {
  selectedFile: File | null;
  analysisType: AnalysisType;
  isUploading: boolean;
  isSwitchingSheet: boolean;
  isUpdatingAttendance: boolean;
  isMergingAttendance: boolean;
  isProcessing: boolean;
  result: UploadResponse | null;
  activeResultTab: ResultTab;
  errorMessage: string | null;
  resultTabs: readonly (readonly [ResultTab, string])[];
  apiBaseUrl: string;
  setActiveResultTab: (tab: ResultTab) => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handleCancelUpload: () => void;
  handleSheetSelect: (sheetName: string) => Promise<void>;
  handleAttendanceReviewUpdate: (payload: {
    sheetName: string;
    decisions: AttendanceReviewDecision[];
    policyRules: AttendancePolicyRule[];
    holidayMarkers: AttendanceHolidayMarker[];
    administrativeExceptions: AttendanceAdministrativeException[];
  }) => Promise<void>;
  handleAttendanceMerge: (
    instructions: AttendanceMergeInstruction[],
    dryRun: boolean
  ) => Promise<void>;
  setAnalysisType: (value: AnalysisType) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

const UploadWorkspaceContext = createContext<UploadWorkspaceContextValue | null>(null);

export function UploadWorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("Auto Detect");
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitchingSheet, setIsSwitchingSheet] = useState(false);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);
  const [isMergingAttendance, setIsMergingAttendance] = useState(false);
  const [result, setResultState] = useState<UploadResponse | null>(null);
  const [hydrated, setHydrated] = useState(false);
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
  const mergeRequestIdRef = useRef(0);

  const setResult = useCallback((next: UploadResponse | null) => {
    setResultState(next);
    saveUploadWorkspace(next);
    if (next) {
      syncAttendanceSnapshotForEmployeeMaster(next);
    }
  }, []);

  const isProcessing =
    isUploading || isSwitchingSheet || isUpdatingAttendance || isMergingAttendance;
  const resultEngine = result?.analysis_overview.engine ?? "generic";
  const resultTabs = useMemo(
    () =>
      resultEngine === "attendance"
        ? ([
            ["overview", "Upload Review"],
            ["analysis", "HR Dashboard"],
          ] as const)
        : ([
            ["overview", "Overview"],
            ["analysis", "Analysis"],
            ["workbook", "Workbook"],
          ] as const),
    [resultEngine]
  );
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  useEffect(() => {
    const stored = loadUploadWorkspace();
    if (stored) {
      setResultState(stored);
      setAnalysisType(normalizeAnalysisType(stored.analysis_type));
      setActiveResultTab(
        stored.analysis_overview.engine === "generic" ? "overview" : "analysis"
      );
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    saveUploadWorkspace(result);
  }, [hydrated, result]);

  useEffect(() => {
    isMountedRef.current = true;

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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) {
      return;
    }
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isProcessing || !selectedFile) {
      if (!selectedFile) {
        setErrorMessage("Please choose a CSV or Excel file before uploading.");
      }
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
        signal: controller.signal,
      });

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail ? data.detail : "Something went wrong during upload."
        );
      }

      if (isMountedRef.current && uploadRequestIdRef.current === requestId) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
        setActiveResultTab(
          normalizedResponse.analysis_overview.engine === "generic" ? "overview" : "analysis"
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
        { signal: controller.signal }
      );
      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail ? data.detail : "Unable to analyze the selected sheet."
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_name: payload.sheetName,
            decisions: payload.decisions,
            policy_rules: payload.policyRules,
            holiday_markers: payload.holidayMarkers,
            administrative_exceptions: payload.administrativeExceptions,
          }),
        }
      );

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail ? data.detail : "Unable to update attendance review."
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

  const handleAttendanceMerge = async (
    instructions: AttendanceMergeInstruction[],
    dryRun: boolean
  ) => {
    if (!result?.upload_id) {
      return;
    }

    const requestId = ++mergeRequestIdRef.current;
    setIsMergingAttendance(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/upload/${result.upload_id}/attendance-merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_name: result.selected_sheet,
            merge_instructions: instructions,
            dry_run: dryRun,
          }),
        }
      );

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail ? data.detail : mergeFailedMessage
        );
      }

      if (isMountedRef.current && mergeRequestIdRef.current === requestId) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current || mergeRequestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : mergeFailedMessage;
      setErrorMessage(message);
    } finally {
      if (isMountedRef.current && mergeRequestIdRef.current === requestId) {
        setIsMergingAttendance(false);
      }
    }
  };

  const value: UploadWorkspaceContextValue = {
    selectedFile,
    analysisType,
    isUploading,
    isSwitchingSheet,
    isUpdatingAttendance,
    isMergingAttendance,
    isProcessing,
    result,
    activeResultTab,
    errorMessage,
    resultTabs,
    apiBaseUrl,
    setActiveResultTab,
    handleFileChange,
    handleSubmit,
    handleCancelUpload,
    handleSheetSelect,
    handleAttendanceReviewUpdate,
    handleAttendanceMerge,
    setAnalysisType,
    fileInputRef,
  };

  return (
    <UploadWorkspaceContext.Provider value={value}>{children}</UploadWorkspaceContext.Provider>
  );
}

export function useUploadWorkspace() {
  const context = useContext(UploadWorkspaceContext);
  if (!context) {
    throw new Error("useUploadWorkspace must be used within UploadWorkspaceProvider");
  }
  return context;
}
