import type { UploadResponse } from "@/types/upload";

const SESSION_KEY = "hr_analytics_upload_workspace_v1";

type UploadWorkspacePayload = {
  savedAt: string;
  result: UploadResponse;
};

export function saveUploadWorkspace(result: UploadResponse | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!result) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }

  const payload: UploadWorkspacePayload = {
    savedAt: new Date().toISOString(),
    result,
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function loadUploadWorkspace(): UploadResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as UploadWorkspacePayload;
    return parsed.result ?? null;
  } catch {
    return null;
  }
}

export function loadUploadWorkspaceMeta(): { savedAt: string; uploadId: string } | null {
  const result = loadUploadWorkspace();
  if (!result?.upload_id) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as UploadWorkspacePayload;
    return {
      savedAt: parsed.savedAt,
      uploadId: result.upload_id,
    };
  } catch {
    return null;
  }
}
