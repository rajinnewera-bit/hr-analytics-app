import { apiRequest } from "@/lib/api-client";
import {
  loadEmployeesFromStorage,
  saveEmployeesToStorage,
  saveSalaryComponentsToStorage,
} from "@/lib/employee-master-storage";
import type { EmployeeMasterRecord, SalaryComponent } from "@/types/employee-master";


export async function fetchEmployees(): Promise<EmployeeMasterRecord[]> {
  const employees = await apiRequest<EmployeeMasterRecord[]>("/employees");
  if (typeof window !== "undefined") {
    saveEmployeesToStorage(employees);
  }
  return employees;
}

export async function fetchEmployee(employeeCode: string): Promise<EmployeeMasterRecord> {
  return apiRequest<EmployeeMasterRecord>(`/employees/${encodeURIComponent(employeeCode)}`);
}

export async function createEmployeeApi(
  employee: EmployeeMasterRecord,
): Promise<EmployeeMasterRecord> {
  const savedEmployee = await apiRequest<EmployeeMasterRecord>("/employees", {
    method: "POST",
    body: JSON.stringify(employee),
  });
  if (typeof window !== "undefined") {
    const next = [...loadEmployeesFromStorage(), savedEmployee].sort((a, b) =>
      a.employee_code.localeCompare(b.employee_code),
    );
    saveEmployeesToStorage(next);
  }
  return savedEmployee;
}

export async function updateEmployeeApi(
  existingEmployeeCode: string,
  employee: EmployeeMasterRecord,
): Promise<EmployeeMasterRecord> {
  const savedEmployee = await apiRequest<EmployeeMasterRecord>(`/employees/${encodeURIComponent(existingEmployeeCode)}`, {
    method: "PUT",
    body: JSON.stringify(employee),
  });
  if (typeof window !== "undefined") {
    const next = loadEmployeesFromStorage()
      .filter(
        (item) =>
          item.employee_code !== existingEmployeeCode &&
          item.employee_code !== savedEmployee.employee_code,
      )
      .concat(savedEmployee)
      .sort((a, b) => a.employee_code.localeCompare(b.employee_code));
    saveEmployeesToStorage(next);
  }
  return savedEmployee;
}

export async function deleteEmployeeApi(employeeCode: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/employees/${encodeURIComponent(employeeCode)}`, {
    method: "DELETE",
  });
  if (typeof window !== "undefined") {
    saveEmployeesToStorage(
      loadEmployeesFromStorage().filter((item) => item.employee_code !== employeeCode),
    );
  }
}

export async function clearEmployeesApi(): Promise<void> {
  await apiRequest<{ ok: boolean }>("/employees", { method: "DELETE" });
  if (typeof window !== "undefined") {
    saveEmployeesToStorage([]);
  }
}

export async function bulkUpsertEmployeesApi(
  employees: EmployeeMasterRecord[],
): Promise<EmployeeMasterRecord[]> {
  const savedEmployees = await apiRequest<EmployeeMasterRecord[]>("/employees/bulk-upsert", {
    method: "POST",
    body: JSON.stringify({ employees }),
  });
  if (typeof window !== "undefined") {
    saveEmployeesToStorage(savedEmployees);
  }
  return savedEmployees;
}

export async function fetchSalaryComponentsApi(): Promise<SalaryComponent[]> {
  const components = await apiRequest<SalaryComponent[]>("/salary-components");
  if (typeof window !== "undefined") {
    saveSalaryComponentsToStorage(components);
  }
  return components;
}

export async function saveSalaryComponentsApi(
  components: SalaryComponent[],
): Promise<SalaryComponent[]> {
  const savedComponents = await apiRequest<SalaryComponent[]>("/salary-components", {
    method: "PUT",
    body: JSON.stringify({ components }),
  });
  if (typeof window !== "undefined") {
    saveSalaryComponentsToStorage(savedComponents);
  }
  return savedComponents;
}
