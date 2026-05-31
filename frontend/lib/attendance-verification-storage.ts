import { normalizeEmployeeName } from "@/lib/attendance-employee-validation";
import type {
  AttendanceNameAlias,
  AttendanceVerificationDecision,
  AttendanceVerificationStore,
} from "@/types/attendance-verification";

const STORAGE_KEY = "hr_analytics_attendance_verification_v1";
const REVIEWER_KEY = "hr_analytics_verification_reviewer_v1";

const EMPTY_STORE: AttendanceVerificationStore = {
  version: 1,
  aliases: [],
  decisions: [],
};

export function getVerificationActor(): string {
  if (typeof window === "undefined") {
    return "HR Operator";
  }
  return window.localStorage.getItem(REVIEWER_KEY)?.trim() || "HR Operator";
}

export function setVerificationActor(actor: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(REVIEWER_KEY, actor.trim());
}

export function loadAttendanceVerificationStore(): AttendanceVerificationStore {
  if (typeof window === "undefined") {
    return EMPTY_STORE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_STORE };
    }
    const parsed = JSON.parse(raw) as AttendanceVerificationStore;
    return {
      version: 1,
      aliases: Array.isArray(parsed.aliases) ? parsed.aliases : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

export function saveAttendanceVerificationStore(store: AttendanceVerificationStore) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function decisionKey(employeeCode: string, attendanceName: string): string {
  return `${employeeCode.trim().toLowerCase()}::${normalizeEmployeeName(attendanceName)}`;
}

export function findAliasForEmployeeAttendance(
  store: AttendanceVerificationStore,
  employeeCode: string,
  attendanceName: string
): AttendanceNameAlias | null {
  const code = employeeCode.trim().toLowerCase();
  const normalizedAttendance = normalizeEmployeeName(attendanceName);
  return (
    store.aliases.find(
      (alias) =>
        alias.employee_code.trim().toLowerCase() === code &&
        alias.normalized_attendance_name === normalizedAttendance
    ) ?? null
  );
}

export function getDecisionHistory(
  store: AttendanceVerificationStore,
  employeeCode: string
): AttendanceVerificationDecision[] {
  const code = employeeCode.trim().toLowerCase();
  return store.decisions
    .filter((item) => item.employee_code.trim().toLowerCase() === code)
    .sort((a, b) => b.acted_at.localeCompare(a.acted_at));
}

export function getActiveDecision(
  store: AttendanceVerificationStore,
  employeeCode: string,
  attendanceName: string
): AttendanceVerificationDecision | null {
  const key = decisionKey(employeeCode, attendanceName);
  const history = store.decisions.filter(
    (item) => decisionKey(item.employee_code, item.attendance_name) === key
  );
  if (history.length === 0) {
    return null;
  }
  return history.sort((a, b) => b.acted_at.localeCompare(a.acted_at))[0];
}

export function approveEmployeeMatch(
  store: AttendanceVerificationStore,
  payload: {
    employeeCode: string;
    attendanceName: string;
    masterName: string;
    remarks: string;
    actor?: string;
  }
): AttendanceVerificationStore {
  const actor = payload.actor?.trim() || getVerificationActor();
  const decision: AttendanceVerificationDecision = {
    id: `decision_${Date.now()}`,
    employee_code: payload.employeeCode.trim(),
    attendance_name: payload.attendanceName.trim(),
    master_name: payload.masterName.trim(),
    action: "approved",
    status: "manually_approved",
    remarks: payload.remarks.trim(),
    actor,
    acted_at: new Date().toISOString(),
  };

  return {
    ...store,
    decisions: [...store.decisions, decision],
  };
}

export function rejectEmployeeMatch(
  store: AttendanceVerificationStore,
  payload: {
    employeeCode: string;
    attendanceName: string;
    masterName: string;
    remarks: string;
    actor?: string;
  }
): AttendanceVerificationStore {
  const actor = payload.actor?.trim() || getVerificationActor();
  const decision: AttendanceVerificationDecision = {
    id: `decision_${Date.now()}`,
    employee_code: payload.employeeCode.trim(),
    attendance_name: payload.attendanceName.trim(),
    master_name: payload.masterName.trim(),
    action: "rejected",
    status: "rejected",
    remarks: payload.remarks.trim(),
    actor,
    acted_at: new Date().toISOString(),
  };

  return {
    ...store,
    decisions: [...store.decisions, decision],
  };
}

export function createAttendanceNameAlias(
  store: AttendanceVerificationStore,
  payload: {
    employeeCode: string;
    attendanceName: string;
    masterName: string;
    actor?: string;
  }
): AttendanceVerificationStore {
  const actor = payload.actor?.trim() || getVerificationActor();
  const attendanceName = payload.attendanceName.trim();
  const masterName = payload.masterName.trim();
  const normalized = normalizeEmployeeName(attendanceName);
  const code = payload.employeeCode.trim();

  const withoutDuplicate = store.aliases.filter(
    (alias) =>
      !(
        alias.employee_code.trim().toLowerCase() === code.toLowerCase() &&
        alias.normalized_attendance_name === normalized
      )
  );

  const alias: AttendanceNameAlias = {
    id: `alias_${Date.now()}`,
    employee_code: code,
    attendance_name: attendanceName,
    master_name: masterName,
    normalized_attendance_name: normalized,
    created_at: new Date().toISOString(),
    created_by: actor,
  };

  const aliasDecision: AttendanceVerificationDecision = {
    id: `decision_${Date.now()}_alias`,
    employee_code: code,
    attendance_name: attendanceName,
    master_name: masterName,
    action: "alias_created",
    status: "manually_approved",
    remarks: `Alias created: "${attendanceName}" maps to master name "${masterName}".`,
    actor,
    acted_at: new Date().toISOString(),
  };

  return {
    aliases: [...withoutDuplicate, alias],
    decisions: [...store.decisions, aliasDecision],
    version: 1,
  };
}

export function getAliasesForEmployee(
  store: AttendanceVerificationStore,
  employeeCode: string
): AttendanceNameAlias[] {
  const code = employeeCode.trim().toLowerCase();
  return store.aliases.filter((alias) => alias.employee_code.trim().toLowerCase() === code);
}
