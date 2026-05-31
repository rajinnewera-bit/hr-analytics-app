import type { AttendanceProcessedRow } from "@/types/upload";

const STORAGE_KEY = "hr_analytics_attendance_snapshot_v1";

type AttendanceSnapshotPayload = {
  savedAt: string;
  rows: AttendanceProcessedRow[];
};

export function saveAttendanceSnapshot(rows: AttendanceProcessedRow[]) {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  const payload: AttendanceSnapshotPayload = {
    savedAt: new Date().toISOString(),
    rows,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadAttendanceSnapshot(): AttendanceProcessedRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AttendanceSnapshotPayload;
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  } catch {
    return [];
  }
}
