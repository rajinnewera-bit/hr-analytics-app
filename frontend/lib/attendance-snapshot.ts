const STORAGE_KEY = "hr_analytics_attendance_snapshot_v1";

export type AttendanceSnapshotMeta = {
  savedAt: string;
  uploadId: string;
  selectedSheet: string;
  rowCount: number;
};

export type StorageWriteResult = {
  ok: boolean;
  message: string | null;
};

const storageFailureMessage =
  "This upload is active, but the browser could not save the session for refresh recovery. Keep this tab open to continue.";

function isBrowser() {
  return typeof window !== "undefined";
}

function safeRemoveLocalKey() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures so the app can continue working.
  }
}

export function saveAttendanceSnapshot(meta: AttendanceSnapshotMeta | null): StorageWriteResult {
  if (!isBrowser()) {
    return { ok: true, message: null };
  }

  if (!meta) {
    safeRemoveLocalKey();
    return { ok: true, message: null };
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: storageFailureMessage };
  }
}

export function loadAttendanceSnapshotMeta(): AttendanceSnapshotMeta | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as
      | AttendanceSnapshotMeta
      | { savedAt?: string; rows?: unknown[] };

    if ("uploadId" in parsed && typeof parsed.uploadId === "string") {
      return {
        savedAt:
          typeof parsed.savedAt === "string" && parsed.savedAt
            ? parsed.savedAt
            : new Date().toISOString(),
        uploadId: parsed.uploadId,
        selectedSheet: typeof parsed.selectedSheet === "string" ? parsed.selectedSheet : "",
        rowCount: typeof parsed.rowCount === "number" ? parsed.rowCount : 0,
      };
    }

    const legacyRows = "rows" in parsed && Array.isArray(parsed.rows) ? parsed.rows : null;
    if (legacyRows) {
      return {
        savedAt:
          typeof parsed.savedAt === "string" && parsed.savedAt
            ? parsed.savedAt
            : new Date().toISOString(),
        uploadId: "",
        selectedSheet: "",
        rowCount: legacyRows.length,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function clearAttendanceSnapshot() {
  safeRemoveLocalKey();
}
