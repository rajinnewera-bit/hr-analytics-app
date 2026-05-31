"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmployeeMasterForm } from "@/components/employee-profile-view";
import { HrmsBranding } from "@/components/hrms-branding";
import { employeeCodeToParam } from "@/lib/employee-code-url";
import type { EmployeeMasterRecord, SalaryComponent } from "@/types/employee-master";
import {
  emptyEmployeeRecord,
  isValidDateText,
  loadEmployeesFromStorage,
  loadSalaryComponentsFromStorage,
  saveEmployeesToStorage,
  saveSalaryComponentsToStorage,
  suggestNextEmployeeCode,
} from "@/lib/employee-master-storage";

export function EmployeeCreateView() {
  const router = useRouter();
  const [employees, setEmployees] = useState<EmployeeMasterRecord[]>([]);
  const [salaryComponents, setSalaryComponents] = useState<SalaryComponent[]>([]);
  const [draft, setDraft] = useState<EmployeeMasterRecord>(() => emptyEmployeeRecord());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [suggestedCode, setSuggestedCode] = useState("");

  useEffect(() => {
    const loaded = loadEmployeesFromStorage();
    setEmployees(loaded);
    setSalaryComponents(loadSalaryComponentsFromStorage());
    setSuggestedCode(suggestNextEmployeeCode(loaded));
  }, []);

  const activeComponents = useMemo(
    () => salaryComponents.filter((item) => item.active && item.component_name.trim()),
    [salaryComponents]
  );

  const handleSave = () => {
    setSaveError(null);

    const trimmedCode = draft.employee_code.trim();
    const trimmedName = draft.employee_name.trim();

    if (!trimmedName) {
      setSaveError("Employee name is required.");
      return;
    }

    if (!isValidDateText(draft.doj)) {
      setSaveError("A valid date of joining is required.");
      return;
    }

    const finalCode = trimmedCode || suggestNextEmployeeCode(employees);
    const normalizedCode = finalCode.trim();

    if (employees.some((item) => item.employee_code.toLowerCase() === normalizedCode.toLowerCase())) {
      setSaveError(`Employee ID "${normalizedCode}" already exists. Use a unique ID.`);
      return;
    }

    const record: EmployeeMasterRecord = {
      ...draft,
      employee_code: normalizedCode,
      employee_name: trimmedName,
    };

    const next = [...employees, record].sort((a, b) =>
      a.employee_code.localeCompare(b.employee_code)
    );
    saveEmployeesToStorage(next);
    saveSalaryComponentsToStorage(salaryComponents);
    router.replace(`/employees/${employeeCodeToParam(normalizedCode)}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="shrink-0 rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft backdrop-blur">
        <HrmsBranding variant="page" withDivider={false} className="mb-0 pb-0" />
        <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/employees" className="text-sm font-semibold text-teal-700 hover:underline">
              ← Employee Master
            </Link>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
              New Employee
            </p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Create employee record</h1>
            <p className="mt-1 text-sm text-slateText">
              Enter employee master details. Attendance and payroll summaries unlock after save.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Save Employee
            </button>
            <Link
              href="/employees"
              className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] border border-white/70 bg-white/92 p-5 shadow-soft">
        {saveError ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {saveError}
          </div>
        ) : null}
        <EmployeeMasterForm
          draft={draft}
          isEditable
          setDraft={setDraft}
          activeComponents={activeComponents}
          salaryComponents={salaryComponents}
          onSalaryComponentsChange={setSalaryComponents}
          suggestedEmployeeCode={suggestedCode || undefined}
        />
      </div>
    </div>
  );
}
