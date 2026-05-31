"use client";

import { EmployeeProfileView } from "@/components/employee-profile-view";
import { employeeCodeFromParam } from "@/lib/employee-code-url";

type EmployeeProfileRouteProps = {
  code: string;
  mode?: string;
  tab?: string;
};

export function EmployeeProfileRoute({ code, mode, tab }: EmployeeProfileRouteProps) {
  const employeeCode = employeeCodeFromParam(code);
  const initialMode = mode === "edit" ? "edit" : "view";
  const initialTab =
    tab === "attendance" || tab === "payroll" || tab === "leave" || tab === "master"
      ? tab
      : "master";

  return (
    <EmployeeProfileView
      employeeCode={employeeCode}
      initialMode={initialMode}
      initialTab={initialTab}
    />
  );
}
