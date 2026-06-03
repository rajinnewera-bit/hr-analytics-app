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
import {
  clearAttendanceSnapshot,
  saveAttendanceSnapshot,
} from "@/lib/attendance-snapshot";
import {
  buildApiUrl,
  getApiBaseUrlConfigurationMessage,
  resolveApiBaseUrl,
} from "@/lib/api-client";
import { normalizeUploadResponse } from "@/lib/upload-response";
import {
  clearUploadWorkspaceStorage,
  loadUploadWorkspaceMeta,
  saveUploadWorkspace,
} from "@/lib/upload-workspace-storage";
import type {
  AttendanceAdministrativeException,
  AttendanceHolidayMarker,
  AttendanceMergeInstruction,
  AttendancePolicyRule,
  AttendanceReviewDecision,
  AttendanceWorkingRuleState,
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
const attendanceSaveFailedMessage = "Unable to save attendance changes.";

function emptyAttendanceRuleState(sheetName = ""): AttendanceWorkingRuleState {
  return {
    dataset_key: "",
    sheet_name: sheetName,
    merge_instructions: [],
    review_decisions: [],
    policy_rules: [],
    holiday_markers: [],
    administrative_exceptions: [],
    saved_at: "",
    saved_by: "",
  };
}

function cloneAttendanceRuleState(
  state: AttendanceWorkingRuleState | null | undefined,
  fallbackSheetName = ""
): AttendanceWorkingRuleState {
  if (!state) {
    return emptyAttendanceRuleState(fallbackSheetName);
  }
  return {
    dataset_key: state.dataset_key,
    sheet_name: state.sheet_name || fallbackSheetName,
    merge_instructions: state.merge_instructions.map((item) => ({
      final_employee_name: item.final_employee_name,
      final_employee_code: item.final_employee_code,
      sources: {
        source_names: [...(item.sources.source_names ?? [])],
        source_codes: [...(item.sources.source_codes ?? [])],
      },
      adjustments: item.adjustments
        ? {
            ...item.adjustments,
          }
        : undefined,
    })),
    review_decisions: state.review_decisions.map((item) => ({ ...item })),
    policy_rules: state.policy_rules.map((item) => ({ ...item })),
    holiday_markers: state.holiday_markers.map((item) => ({ ...item })),
    administrative_exceptions: state.administrative_exceptions.map((item) => ({
      ...item,
      employee_ids: [...item.employee_ids],
    })),
    saved_at: state.saved_at,
    saved_by: state.saved_by,
  };
}

function serializeAttendanceRuleState(state: AttendanceWorkingRuleState | null | undefined) {
  return JSON.stringify(state ?? emptyAttendanceRuleState());
}

function deriveAttendanceRuleState(
  response: UploadResponse | null
): AttendanceWorkingRuleState {
  return cloneAttendanceRuleState(
    response?.attendance_validation_summary?.applied_rule_state,
    response?.selected_sheet ?? ""
  );
}

function countUnsavedRuleChanges(
  savedState: AttendanceWorkingRuleState | null,
  draftState: AttendanceWorkingRuleState | null
) {
  if (!savedState || !draftState) {
    return 0;
  }

  const sectionDelta = (left: unknown[], right: unknown[]) =>
    Math.abs(left.length - right.length) +
    right.filter((item, index) => JSON.stringify(item) !== JSON.stringify(left[index])).length;

  return (
    sectionDelta(savedState.merge_instructions, draftState.merge_instructions) +
    sectionDelta(savedState.review_decisions, draftState.review_decisions) +
    sectionDelta(savedState.policy_rules, draftState.policy_rules) +
    sectionDelta(savedState.holiday_markers, draftState.holiday_markers) +
    sectionDelta(
      savedState.administrative_exceptions,
      draftState.administrative_exceptions
    )
  );
}

function mergeAttendanceInstructions(
  existing: AttendanceMergeInstruction[],
  incoming: AttendanceMergeInstruction[]
) {
  const nextInstructions = [...existing];

  incoming.forEach((newInstruction) => {
    const sourceNames = new Set(
      (newInstruction.sources.source_names ?? []).map((item) => item.trim().toLowerCase())
    );
    const sourceCodes = new Set(
      (newInstruction.sources.source_codes ?? []).map((item) => item.trim().toLowerCase())
    );
    const finalName = newInstruction.final_employee_name.trim().toLowerCase();
    const finalCode = (newInstruction.final_employee_code ?? "").trim().toLowerCase();

    const filteredInstructions = nextInstructions.filter((existingInstruction) => {
      const existingSourceNames = new Set(
        (existingInstruction.sources.source_names ?? []).map((item) =>
          item.trim().toLowerCase()
        )
      );
      const existingSourceCodes = new Set(
        (existingInstruction.sources.source_codes ?? []).map((item) =>
          item.trim().toLowerCase()
        )
      );
      const existingFinalName = existingInstruction.final_employee_name.trim().toLowerCase();
      const existingFinalCode = (existingInstruction.final_employee_code ?? "")
        .trim()
        .toLowerCase();

      const overlapsName = [...sourceNames].some((item) => existingSourceNames.has(item));
      const overlapsCode = [...sourceCodes].some((item) => existingSourceCodes.has(item));
      const sameTarget =
        existingFinalName === finalName && existingFinalCode === finalCode;

      return !(overlapsName || overlapsCode || sameTarget);
    });

    nextInstructions.length = 0;
    nextInstructions.push(...filteredInstructions, newInstruction);
  });

  return nextInstructions;
}

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
  return saveAttendanceSnapshot({
    savedAt: new Date().toISOString(),
    uploadId: response.upload_id,
    selectedSheet: response.selected_sheet ?? "",
    rowCount: rows.length,
  });
}

function normalizeAnalysisType(value: string | null | undefined): AnalysisType {
  if (value && analysisTypeOptions.includes(value as AnalysisType)) {
    return value as AnalysisType;
  }
  return "Auto Detect";
}

function describeApiConnectivityError(apiBaseUrl: string | null, actionLabel: string) {
  if (!apiBaseUrl) {
    return getApiBaseUrlConfigurationMessage();
  }

  return `Unable to reach the upload service while trying to ${actionLabel}. Check that ${apiBaseUrl} is correct, the backend is deployed and awake, and CORS allows this frontend origin.`;
}

function logApiConnectivityError(
  actionLabel: string,
  apiBaseUrl: string | null,
  path: string,
  error: unknown
) {
  console.error(`Attendance upload API request failed while trying to ${actionLabel}.`, {
    apiBaseUrl,
    path,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    error,
  });
}

type UploadWorkspaceContextValue = {
  selectedFile: File | null;
  analysisType: AnalysisType;
  isUploading: boolean;
  isSwitchingSheet: boolean;
  isUpdatingAttendance: boolean;
  isMergingAttendance: boolean;
  isSavingAttendanceChanges: boolean;
  isProcessing: boolean;
  result: UploadResponse | null;
  activeResultTab: ResultTab;
  errorMessage: string | null;
  resultTabs: readonly (readonly [ResultTab, string])[];
  workspacePersistenceMessage: string | null;
  hasUnsavedAttendanceChanges: boolean;
  unsavedAttendanceChangeCount: number;
  apiBaseUrl: string | null;
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
  handleSaveAttendanceChanges: () => Promise<void>;
  handleStartNewUpload: () => void;
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
  const [isSavingAttendanceChanges, setIsSavingAttendanceChanges] = useState(false);
  const [result, setResultState] = useState<UploadResponse | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("overview");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workspacePersistenceMessage, setWorkspacePersistenceMessage] = useState<string | null>(
    null
  );
  const [savedAttendanceRuleState, setSavedAttendanceRuleState] =
    useState<AttendanceWorkingRuleState | null>(null);
  const [draftAttendanceRuleState, setDraftAttendanceRuleState] =
    useState<AttendanceWorkingRuleState | null>(null);
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

  const setResult = useCallback((
    next: UploadResponse | null,
    options?: { ruleStateMode?: "saved" | "draft" }
  ) => {
    setResultState(next);
    const workspaceSaveResult = saveUploadWorkspace(next);
    const snapshotSaveResult = next
      ? syncAttendanceSnapshotForEmployeeMaster(next)
      : saveAttendanceSnapshot(null);
    setWorkspacePersistenceMessage(
      workspaceSaveResult.message ?? snapshotSaveResult.message ?? null
    );
    if (next) {
      setActiveResultTab(
        next.analysis_overview.engine === "generic" ? "overview" : "analysis"
      );
    }
    const nextRuleState = deriveAttendanceRuleState(next);
    if ((options?.ruleStateMode ?? "saved") === "saved") {
      setSavedAttendanceRuleState(next ? nextRuleState : null);
      setDraftAttendanceRuleState(next ? nextRuleState : null);
    } else {
      setDraftAttendanceRuleState(next ? nextRuleState : null);
    }
  }, []);

  const hasUnsavedAttendanceChanges = useMemo(
    () =>
      serializeAttendanceRuleState(savedAttendanceRuleState) !==
      serializeAttendanceRuleState(draftAttendanceRuleState),
    [draftAttendanceRuleState, savedAttendanceRuleState]
  );

  const unsavedAttendanceChangeCount = useMemo(
    () => countUnsavedRuleChanges(savedAttendanceRuleState, draftAttendanceRuleState),
    [draftAttendanceRuleState, savedAttendanceRuleState]
  );

  const isProcessing =
    isUploading ||
    isSwitchingSheet ||
    isUpdatingAttendance ||
    isMergingAttendance ||
    isSavingAttendanceChanges;
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
    const storedMeta = loadUploadWorkspaceMeta();
    if (!storedMeta?.uploadId) {
      return;
    }

    const controller = new AbortController();
    const restoreWorkspace = async () => {
      setAnalysisType(normalizeAnalysisType(storedMeta.analysisType));
      setIsSwitchingSheet(true);
      setWorkspacePersistenceMessage(null);

      try {
        const targetSheet = storedMeta.selectedSheet || "CSV Data";
        const encodedSheetName = encodeURIComponent(targetSheet);
        const response = await fetch(
          buildApiUrl(`/upload/${storedMeta.uploadId}/sheet/${encodedSheetName}`),
          { signal: controller.signal }
        );
        const data = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(
            "detail" in data && data.detail
              ? data.detail
              : "Unable to restore the previous upload session."
          );
        }

        if (!isMountedRef.current) {
          return;
        }

        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse);
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        if (
          error instanceof TypeError ||
          (error instanceof Error &&
            error.message === getApiBaseUrlConfigurationMessage())
        ) {
          logApiConnectivityError(
            "restore the previous upload session",
            apiBaseUrl,
            `/upload/${storedMeta.uploadId}/sheet/${storedMeta.selectedSheet || "CSV Data"}`,
            error
          );
        }
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResultState(null);
          clearUploadWorkspaceStorage();
          clearAttendanceSnapshot();
          setWorkspacePersistenceMessage(
            error instanceof TypeError ||
            (error instanceof Error &&
              error.message === getApiBaseUrlConfigurationMessage())
              ? describeApiConnectivityError(
                  apiBaseUrl,
                  "restore the previous upload session"
                )
              : "The previous upload session could not be restored. Upload the workbook again to continue."
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsSwitchingSheet(false);
        }
      }
    };

    void restoreWorkspace();
    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, setResult]);

  useEffect(() => {
    isMountedRef.current = true;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedAttendanceChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
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
  }, [hasUnsavedAttendanceChanges]);

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

  const resetUploadWorkspace = useCallback(() => {
    abortUpload("refresh");
    abortSheetSwitch();
    uploadRequestIdRef.current += 1;
    sheetRequestIdRef.current += 1;
    attendanceRequestIdRef.current += 1;
    mergeRequestIdRef.current += 1;
    setSelectedFile(null);
    setResult(null);
    setErrorMessage(null);
    setActiveResultTab("overview");
    setAnalysisType("Auto Detect");
    setWorkspacePersistenceMessage(null);
    setIsUploading(false);
    setIsSwitchingSheet(false);
    setIsUpdatingAttendance(false);
    setIsMergingAttendance(false);
    clearFileInput();
    clearAttendanceSnapshot();
  }, [setResult]);

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

      const response = await fetch(buildApiUrl("/upload"), {
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
      } else if (error instanceof TypeError) {
        logApiConnectivityError("upload the selected workbook", apiBaseUrl, "/upload", error);
        setErrorMessage(
          describeApiConnectivityError(apiBaseUrl, "upload the selected workbook")
        );
      } else {
        if (
          error instanceof Error &&
          error.message === getApiBaseUrlConfigurationMessage()
        ) {
          logApiConnectivityError(
            "upload the selected workbook",
            apiBaseUrl,
            "/upload",
            error
          );
        }
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

  const handleStartNewUpload = () => {
    resetUploadWorkspace();
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
        buildApiUrl(`/upload/${result.upload_id}/sheet/${encodedSheetName}`),
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
      if (error instanceof TypeError) {
        logApiConnectivityError(
          "analyze the selected sheet",
          apiBaseUrl,
          `/upload/${result.upload_id}/sheet/${sheetName}`,
          error
        );
        setErrorMessage(describeApiConnectivityError(apiBaseUrl, "analyze the selected sheet"));
      } else if (!(error instanceof DOMException && error.name === "AbortError")) {
        if (
          error instanceof Error &&
          error.message === getApiBaseUrlConfigurationMessage()
        ) {
          logApiConnectivityError(
            "analyze the selected sheet",
            apiBaseUrl,
            `/upload/${result.upload_id}/sheet/${sheetName}`,
            error
          );
        }
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

    const baseState = cloneAttendanceRuleState(
      draftAttendanceRuleState ?? savedAttendanceRuleState,
      payload.sheetName
    );
    const nextRuleState: AttendanceWorkingRuleState = {
      ...baseState,
      sheet_name: payload.sheetName,
      review_decisions: payload.decisions,
      policy_rules: payload.policyRules,
      holiday_markers: payload.holidayMarkers,
      administrative_exceptions: payload.administrativeExceptions,
    };

    const requestId = ++attendanceRequestIdRef.current;
    setIsUpdatingAttendance(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        buildApiUrl(`/upload/${result.upload_id}/attendance-review`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_name: payload.sheetName,
            decisions: payload.decisions,
            policy_rules: payload.policyRules,
            holiday_markers: payload.holidayMarkers,
            administrative_exceptions: payload.administrativeExceptions,
            merge_instructions: nextRuleState.merge_instructions,
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
        setResult(normalizedResponse, { ruleStateMode: "draft" });
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current || attendanceRequestIdRef.current !== requestId) {
        return;
      }
      if (error instanceof TypeError) {
        logApiConnectivityError(
          "save attendance review updates",
          apiBaseUrl,
          `/upload/${result.upload_id}/attendance-review`,
          error
        );
        setErrorMessage(
          describeApiConnectivityError(apiBaseUrl, "save attendance review updates")
        );
      } else {
        if (
          error instanceof Error &&
          error.message === getApiBaseUrlConfigurationMessage()
        ) {
          logApiConnectivityError(
            "save attendance review updates",
            apiBaseUrl,
            `/upload/${result.upload_id}/attendance-review`,
            error
          );
        }
        const message =
          error instanceof Error ? error.message : "Unable to update attendance review.";
        setErrorMessage(message);
      }
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

    const baseState = cloneAttendanceRuleState(
      draftAttendanceRuleState ?? savedAttendanceRuleState,
      result.selected_sheet
    );
    const combinedMergeInstructions = mergeAttendanceInstructions(
      baseState.merge_instructions,
      instructions
    );
    const nextRuleState: AttendanceWorkingRuleState = {
      ...baseState,
      sheet_name: result.selected_sheet,
      merge_instructions: combinedMergeInstructions,
    };

    const requestId = ++mergeRequestIdRef.current;
    setIsMergingAttendance(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        buildApiUrl(`/upload/${result.upload_id}/attendance-merge`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_name: result.selected_sheet,
            merge_instructions: combinedMergeInstructions,
            decisions: nextRuleState.review_decisions,
            policy_rules: nextRuleState.policy_rules,
            holiday_markers: nextRuleState.holiday_markers,
            administrative_exceptions: nextRuleState.administrative_exceptions,
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
        setResult(normalizedResponse, { ruleStateMode: "draft" });
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current || mergeRequestIdRef.current !== requestId) {
        return;
      }
      if (error instanceof TypeError) {
        logApiConnectivityError(
          "merge attendance records",
          apiBaseUrl,
          `/upload/${result.upload_id}/attendance-merge`,
          error
        );
        setErrorMessage(describeApiConnectivityError(apiBaseUrl, "merge attendance records"));
      } else {
        if (
          error instanceof Error &&
          error.message === getApiBaseUrlConfigurationMessage()
        ) {
          logApiConnectivityError(
            "merge attendance records",
            apiBaseUrl,
            `/upload/${result.upload_id}/attendance-merge`,
            error
          );
        }
        const message = error instanceof Error ? error.message : mergeFailedMessage;
        setErrorMessage(message);
      }
    } finally {
      if (isMountedRef.current && mergeRequestIdRef.current === requestId) {
        setIsMergingAttendance(false);
      }
    }
  };

  const handleSaveAttendanceChanges = async () => {
    if (!result?.upload_id || !draftAttendanceRuleState) {
      return;
    }

    setIsSavingAttendanceChanges(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        buildApiUrl(`/upload/${result.upload_id}/attendance-save`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet_name: draftAttendanceRuleState.sheet_name || result.selected_sheet,
            merge_instructions: draftAttendanceRuleState.merge_instructions,
            decisions: draftAttendanceRuleState.review_decisions,
            policy_rules: draftAttendanceRuleState.policy_rules,
            holiday_markers: draftAttendanceRuleState.holiday_markers,
            administrative_exceptions:
              draftAttendanceRuleState.administrative_exceptions,
            actor: "HR Operator",
          }),
        }
      );

      const data = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(
          "detail" in data && data.detail ? data.detail : attendanceSaveFailedMessage
        );
      }

      if (isMountedRef.current) {
        const normalizedResponse = normalizeUploadResponse(data as Partial<UploadResponse>);
        setResult(normalizedResponse, { ruleStateMode: "saved" });
        setErrorMessage(null);
        setAnalysisType(normalizeAnalysisType(normalizedResponse.analysis_type));
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      if (error instanceof TypeError) {
        logApiConnectivityError(
          "save attendance changes",
          apiBaseUrl,
          `/upload/${result.upload_id}/attendance-save`,
          error
        );
        setErrorMessage(
          describeApiConnectivityError(apiBaseUrl, "save attendance changes")
        );
      } else {
        const message =
          error instanceof Error ? error.message : attendanceSaveFailedMessage;
        setErrorMessage(message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSavingAttendanceChanges(false);
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
    isSavingAttendanceChanges,
    isProcessing,
    result,
    activeResultTab,
    errorMessage,
    resultTabs,
    workspacePersistenceMessage,
    hasUnsavedAttendanceChanges,
    unsavedAttendanceChangeCount,
    apiBaseUrl,
    setActiveResultTab,
    handleFileChange,
    handleSubmit,
    handleCancelUpload,
    handleSheetSelect,
    handleAttendanceReviewUpdate,
    handleAttendanceMerge,
    handleSaveAttendanceChanges,
    handleStartNewUpload,
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
