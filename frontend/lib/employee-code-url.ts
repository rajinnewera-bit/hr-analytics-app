const RESERVED_EMPLOYEE_ROUTE_SEGMENTS = new Set(["new", "create"]);

export function employeeCodeToParam(code: string): string {
  return encodeURIComponent(code.trim());
}

export function employeeCodeFromParam(param: string): string {
  try {
    return decodeURIComponent(param).trim();
  } catch {
    return param.trim();
  }
}

export function isReservedEmployeeRoute(param: string): boolean {
  const normalized = employeeCodeFromParam(param).toLowerCase();
  return RESERVED_EMPLOYEE_ROUTE_SEGMENTS.has(normalized);
}
