import { apiRequest } from "@/lib/api-client";
import { saveAttendanceVerificationStore } from "@/lib/attendance-verification-storage";
import type {
  AttendanceVerificationDecision,
  AttendanceVerificationStore,
} from "@/types/attendance-verification";

type VerificationPayload = {
  employeeCode: string;
  attendanceName: string;
  masterName: string;
  remarks: string;
  actor?: string;
};

function toStoreResponse(store: AttendanceVerificationStore): AttendanceVerificationStore {
  return {
    version: 1,
    aliases: Array.isArray(store.aliases) ? store.aliases : [],
    decisions: Array.isArray(store.decisions) ? store.decisions : [],
  };
}

export async function fetchAttendanceVerificationStoreApi(): Promise<AttendanceVerificationStore> {
  const response = await apiRequest<AttendanceVerificationStore>("/attendance-verification/store");
  const store = toStoreResponse(response);
  if (typeof window !== "undefined") {
    saveAttendanceVerificationStore(store);
  }
  return store;
}

export async function approveEmployeeMatchApi(
  payload: VerificationPayload,
): Promise<AttendanceVerificationStore> {
  const response = await apiRequest<AttendanceVerificationStore>("/attendance-verification/approve", {
    method: "POST",
    body: JSON.stringify({
      employee_code: payload.employeeCode,
      attendance_name: payload.attendanceName,
      master_name: payload.masterName,
      remarks: payload.remarks,
      actor: payload.actor,
    }),
  });
  const store = toStoreResponse(response);
  if (typeof window !== "undefined") {
    saveAttendanceVerificationStore(store);
  }
  return store;
}

export async function rejectEmployeeMatchApi(
  payload: VerificationPayload,
): Promise<AttendanceVerificationStore> {
  const response = await apiRequest<AttendanceVerificationStore>("/attendance-verification/reject", {
    method: "POST",
    body: JSON.stringify({
      employee_code: payload.employeeCode,
      attendance_name: payload.attendanceName,
      master_name: payload.masterName,
      remarks: payload.remarks,
      actor: payload.actor,
    }),
  });
  const store = toStoreResponse(response);
  if (typeof window !== "undefined") {
    saveAttendanceVerificationStore(store);
  }
  return store;
}

export async function createAttendanceNameAliasApi(
  payload: VerificationPayload,
): Promise<AttendanceVerificationStore> {
  const response = await apiRequest<AttendanceVerificationStore>("/attendance-verification/alias", {
    method: "POST",
    body: JSON.stringify({
      employee_code: payload.employeeCode,
      attendance_name: payload.attendanceName,
      master_name: payload.masterName,
      remarks: payload.remarks,
      actor: payload.actor,
    }),
  });
  const store = toStoreResponse(response);
  if (typeof window !== "undefined") {
    saveAttendanceVerificationStore(store);
  }
  return store;
}

export async function fetchAttendanceVerificationHistoryApi(
  employeeCode: string,
): Promise<AttendanceVerificationDecision[]> {
  return apiRequest<AttendanceVerificationDecision[]>(
    `/attendance-verification/history/${encodeURIComponent(employeeCode)}`,
  );
}
