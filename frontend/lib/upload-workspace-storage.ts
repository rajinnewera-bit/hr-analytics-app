import type { UploadResponse } from "@/types/upload";

const SESSION_KEY = "hr_analytics_upload_workspace_v1";

export type UploadWorkspaceMeta = {
  savedAt: string;
  uploadId: string;
  selectedSheet: string;
  analysisType: string;
  engine: UploadResponse["analysis_overview"]["engine"];
};

export type StorageWriteResult = {
  ok: boolean;
  message: string | null;
};

type UploadWorkspacePayload = UploadWorkspaceMeta;

const storageFailureMessage =
  "This upload is active, but the browser could not save the session for refresh recovery. Keep this tab open to continue.";

function isBrowser() {
  return typeof window !== "undefined";
}

function safeRemoveSessionKey() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage cleanup failures so the UI can keep working.
  }
}

function toWorkspaceMeta(result: UploadResponse): UploadWorkspaceMeta | null {
  if (!result.upload_id) {
    return null;
  }

  return {
    savedAt: new Date().toISOString(),
    uploadId: result.upload_id,
    selectedSheet: result.selected_sheet ?? "",
    analysisType: result.analysis_type ?? "Auto Detect",
    engine: result.analysis_overview.engine,
  };
}

function readPayload(): UploadWorkspacePayload | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as
      | UploadWorkspacePayload
      | { savedAt?: string; result?: UploadResponse };

    if ("uploadId" in parsed && typeof parsed.uploadId === "string") {
      return {
        savedAt:
          typeof parsed.savedAt === "string" && parsed.savedAt
            ? parsed.savedAt
            : new Date().toISOString(),
        uploadId: parsed.uploadId,
        selectedSheet: typeof parsed.selectedSheet === "string" ? parsed.selectedSheet : "",
        analysisType:
          typeof parsed.analysisType === "string" && parsed.analysisType
            ? parsed.analysisType
            : "Auto Detect",
        engine:
          parsed.engine === "attendance" ||
          parsed.engine === "payroll" ||
          parsed.engine === "generic"
            ? parsed.engine
            : "generic",
      };
    }

    const legacyResult = "result" in parsed ? parsed.result : null;
    if (!legacyResult?.upload_id) {
      return null;
    }

    return {
      savedAt:
        typeof parsed.savedAt === "string" && parsed.savedAt
          ? parsed.savedAt
          : new Date().toISOString(),
      uploadId: legacyResult.upload_id,
      selectedSheet: legacyResult.selected_sheet ?? "",
      analysisType: legacyResult.analysis_type ?? "Auto Detect",
      engine: legacyResult.analysis_overview.engine,
    };
  } catch {
    return null;
  }
}

export function saveUploadWorkspace(result: UploadResponse | null): StorageWriteResult {
  if (!isBrowser()) {
    return { ok: true, message: null };
  }

  if (!result) {
    safeRemoveSessionKey();
    return { ok: true, message: null };
  }

  const payload = toWorkspaceMeta(result);
  if (!payload) {
    safeRemoveSessionKey();
    return { ok: true, message: null };
  }

  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: storageFailureMessage };
  }
}

export function loadUploadWorkspaceMeta(): UploadWorkspaceMeta | null {
  return readPayload();
}

export function clearUploadWorkspaceStorage(): StorageWriteResult {
  safeRemoveSessionKey();
  return { ok: true, message: null };
}
