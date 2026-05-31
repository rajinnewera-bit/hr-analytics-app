import * as XLSX from "xlsx";
import type {
  EmployeeMasterRecord,
  EmployeeStatus,
  SalaryComponent,
  SalaryMode,
  UnitName,
} from "@/types/employee-master";

export const EMPLOYEE_STORAGE_KEY = "hr_analytics_employee_master_v1";
export const SALARY_SETTINGS_STORAGE_KEY = "hr_analytics_salary_components_v1";

export const SALARY_MODE_OPTIONS: SalaryMode[] = ["Cash", "Bank"];
export const UNIT_OPTIONS: UnitName[] = ["Bath & Sanitary", "Marble Centre", "Tiles Mart"];

export const DEFAULT_SALARY_COMPONENTS: SalaryComponent[] = [
  { id: "basic", component_name: "Basic", percentage: 50, active: true },
  { id: "hra", component_name: "HRA", percentage: 20, active: true },
  { id: "conveyance_allowance", component_name: "Conveyance Allowance", percentage: 10, active: true },
  { id: "medical_allowance", component_name: "Medical Allowance", percentage: 5, active: true },
  { id: "special_allowance", component_name: "Special Allowance", percentage: 15, active: true },
];

const HEADER_ALIASES: Record<keyof EmployeeMasterRecord, string[]> = {
  employee_code: ["employeecode", "empcode", "employeeid", "code"],
  employee_name: ["employeename", "empname", "name"],
  department: ["department", "dept"],
  designation: ["designation", "role", "title"],
  salary_mode: ["salarymode", "salarypaymentmode", "paymentmode", "mode"],
  unit: ["unit", "businessunit", "branch"],
  doj: ["doj", "dateofjoining", "joiningdate"],
  gross_monthly_salary: ["grossmonthlysalary", "grosssalary", "monthlysalary", "salary"],
  opening_leave_balance: ["openingleavebalance", "openingleave", "leaveopeningbalance"],
  leave_accrued: ["leaveaccrued", "accruedleave", "leaveearned"],
  leave_availed: ["leaveavailed", "availedleave", "leavetaken"],
  closing_leave_balance: ["closingleavebalance", "closingleave", "leaveclosingbalance"],
  comp_off_balance: ["compoffbalance", "compoff", "coffbalance", "coff"],
  status: ["status", "activeinactivestatus", "employmentstatus"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isValidDateText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const parsed = new Date(trimmed);
  return !Number.isNaN(parsed.getTime());
}

export function componentKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toSalaryMode(value: unknown): SalaryMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "cash" ? "Cash" : "Bank";
}

export function toUnit(value: unknown): UnitName {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "marble centre") {
    return "Marble Centre";
  }
  if (normalized === "tiles mart") {
    return "Tiles Mart";
  }
  return "Bath & Sanitary";
}

function excelDateToIso(value: unknown): string {
  if (!value && value !== 0) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }

  const asText = String(value).trim();
  if (!asText) {
    return "";
  }
  const parsedDate = new Date(asText);
  if (Number.isNaN(parsedDate.getTime())) {
    return asText;
  }
  return parsedDate.toISOString().slice(0, 10);
}

function toStatus(value: unknown): EmployeeStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "inactive" ? "Inactive" : "Active";
}

export function suggestNextEmployeeCode(employees: EmployeeMasterRecord[]): string {
  let index = Math.max(employees.length, 0) + 1;
  let candidate = `EMP-${String(index).padStart(3, "0")}`;
  const existing = new Set(employees.map((item) => item.employee_code.trim().toLowerCase()));

  while (existing.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `EMP-${String(index).padStart(3, "0")}`;
  }

  return candidate;
}

export function emptyEmployeeRecord(): EmployeeMasterRecord {
  return {
    employee_code: "",
    employee_name: "",
    department: "",
    designation: "",
    salary_mode: "Bank",
    unit: "Bath & Sanitary",
    doj: "",
    gross_monthly_salary: 0,
    opening_leave_balance: 0,
    leave_accrued: 0,
    leave_availed: 0,
    closing_leave_balance: 0,
    comp_off_balance: 0,
    status: "Active",
  };
}

export function normalizeEmployeeRecord(
  item: Partial<EmployeeMasterRecord>
): EmployeeMasterRecord {
  return {
    ...emptyEmployeeRecord(),
    ...item,
    salary_mode: toSalaryMode(item?.salary_mode),
    unit: toUnit(item?.unit),
    status: item?.status === "Inactive" ? "Inactive" : "Active",
  };
}

export function parseRowsFromWorkbook(fileData: ArrayBuffer): EmployeeMasterRecord[] {
  const workbook = XLSX.read(fileData, { type: "array", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | Date)[]>(worksheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  if (rows.length < 2) {
    return [];
  }

  const headerRow = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerRow.forEach((header: string | number | Date, idx: number) => {
    headerIndex.set(normalizeHeader(header), idx);
  });

  const getColumnIndex = (field: keyof EmployeeMasterRecord): number => {
    const aliases = HEADER_ALIASES[field];
    for (const alias of aliases) {
      if (headerIndex.has(alias)) {
        return headerIndex.get(alias)!;
      }
    }
    return -1;
  };

  const idx = {
    employee_code: getColumnIndex("employee_code"),
    employee_name: getColumnIndex("employee_name"),
    department: getColumnIndex("department"),
    designation: getColumnIndex("designation"),
    salary_mode: getColumnIndex("salary_mode"),
    unit: getColumnIndex("unit"),
    doj: getColumnIndex("doj"),
    gross_monthly_salary: getColumnIndex("gross_monthly_salary"),
    opening_leave_balance: getColumnIndex("opening_leave_balance"),
    leave_accrued: getColumnIndex("leave_accrued"),
    leave_availed: getColumnIndex("leave_availed"),
    closing_leave_balance: getColumnIndex("closing_leave_balance"),
    comp_off_balance: getColumnIndex("comp_off_balance"),
    status: getColumnIndex("status"),
  };

  const output: EmployeeMasterRecord[] = [];
  rows.slice(1).forEach((row: (string | number | Date)[]) => {
    const employeeCode = String(row[idx.employee_code] ?? "").trim();
    if (!employeeCode) {
      return;
    }

    output.push({
      employee_code: employeeCode,
      employee_name: String(row[idx.employee_name] ?? "").trim(),
      department: String(row[idx.department] ?? "").trim(),
      designation: String(row[idx.designation] ?? "").trim(),
      salary_mode: toSalaryMode(row[idx.salary_mode]),
      unit: toUnit(row[idx.unit]),
      doj: excelDateToIso(row[idx.doj]),
      gross_monthly_salary: toNumber(row[idx.gross_monthly_salary]),
      opening_leave_balance: toNumber(row[idx.opening_leave_balance]),
      leave_accrued: toNumber(row[idx.leave_accrued]),
      leave_availed: toNumber(row[idx.leave_availed]),
      closing_leave_balance: toNumber(row[idx.closing_leave_balance]),
      comp_off_balance: toNumber(row[idx.comp_off_balance]),
      status: toStatus(row[idx.status]),
    });
  });

  return output;
}

export function mergeByEmployeeCode(
  existing: EmployeeMasterRecord[],
  incoming: EmployeeMasterRecord[]
): EmployeeMasterRecord[] {
  const map = new Map(existing.map((item) => [item.employee_code, item]));
  incoming.forEach((item) => {
    const previous = map.get(item.employee_code);
    map.set(item.employee_code, {
      ...(previous ?? emptyEmployeeRecord()),
      ...item,
      employee_code: item.employee_code,
    });
  });
  return Array.from(map.values()).sort((a, b) => a.employee_code.localeCompare(b.employee_code));
}

export function loadEmployeesFromStorage(): EmployeeMasterRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const persisted = window.localStorage.getItem(EMPLOYEE_STORAGE_KEY);
    if (!persisted) {
      return [];
    }
    const parsed = JSON.parse(persisted) as Partial<EmployeeMasterRecord>[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => normalizeEmployeeRecord(item));
  } catch {
    return [];
  }
}

export function saveEmployeesToStorage(employees: EmployeeMasterRecord[]) {
  window.localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employees));
}

/** Removes employee records only. Does not touch salary structure or attendance data. */
export function clearEmployeeMasterStorage() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
}

export function loadSalaryComponentsFromStorage(): SalaryComponent[] {
  if (typeof window === "undefined") {
    return DEFAULT_SALARY_COMPONENTS;
  }
  try {
    const persistedSettings = window.localStorage.getItem(SALARY_SETTINGS_STORAGE_KEY);
    if (!persistedSettings) {
      return DEFAULT_SALARY_COMPONENTS;
    }
    const parsedSettings = JSON.parse(persistedSettings) as SalaryComponent[];
    if (!Array.isArray(parsedSettings) || parsedSettings.length === 0) {
      return DEFAULT_SALARY_COMPONENTS;
    }
    return parsedSettings.map((item) => ({
      id: String(item.id || componentKey(String(item.component_name || "component"))),
      component_name: String(item.component_name || "").trim(),
      percentage: toNumber(item.percentage),
      active: Boolean(item.active),
    }));
  } catch {
    return DEFAULT_SALARY_COMPONENTS;
  }
}

export function saveSalaryComponentsToStorage(components: SalaryComponent[]) {
  window.localStorage.setItem(SALARY_SETTINGS_STORAGE_KEY, JSON.stringify(components));
}
