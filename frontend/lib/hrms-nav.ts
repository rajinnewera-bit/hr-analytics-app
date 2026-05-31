export type HrmsNavItem = {
  href: string;
  label: string;
  description: string;
  section?: "core" | "attendance" | "people";
};

export const HRMS_NAV_ITEMS: HrmsNavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Payroll-ready overview and exceptions",
    section: "core",
  },
  {
    href: "/attendance/upload",
    label: "Attendance Upload",
    description: "Workbook intake, preview, and status",
    section: "attendance",
  },
  {
    href: "/attendance/working",
    label: "Attendance Working",
    description: "Review, merge, and payroll processing",
    section: "attendance",
  },
  {
    href: "/employees",
    label: "Employee Master",
    description: "Directory, filters, and validation",
    section: "people",
  },
];

export function navItemMatchesPath(href: string, pathname: string): boolean {
  if (href === "/employees") {
    return pathname === "/employees" || pathname.startsWith("/employees/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
