"use client";

import { AttendanceUploadPanel } from "@/components/attendance-upload-panel";
import { AttendanceWorkingPanel } from "@/components/attendance-working-panel";

/** @deprecated Use dedicated route pages under /attendance instead. */
export function UploadPanel() {
  return (
    <div className="space-y-4">
      <AttendanceUploadPanel />
      <AttendanceWorkingPanel />
    </div>
  );
}
