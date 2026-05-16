import type { ValidationSummary } from "@/types/upload";

type ValidationSummaryCardProps = {
  summary: ValidationSummary;
};

export function ValidationSummaryCard({ summary }: ValidationSummaryCardProps) {
  const safeSummary = summary;

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Analysis Checks
          </p>
          <h3 className="mt-2 text-xl font-bold text-ink">Payroll & HR Validation</h3>
          <p className="mt-1 text-sm leading-6 text-slateText">
            Payroll-specific checks for salary structure, missing columns, duplicate IDs,
            short working hours, and in/out time gaps.
          </p>
        </div>

        <StatusBadge status={safeSummary?.status ?? "valid"} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <SummaryStat label="Valid Rows" value={(safeSummary?.total_valid_rows ?? 0).toString()} />
        <SummaryStat label="Invalid Rows" value={(safeSummary?.total_invalid_rows ?? 0).toString()} />
        <SummaryStat label="Warnings" value={(safeSummary?.warnings_count ?? 0).toString()} />
        <SummaryStat label="Errors" value={(safeSummary?.errors_count ?? 0).toString()} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <IssueSection
          title="Missing Required Columns"
          status={(safeSummary?.missing_required_columns?.length ?? 0) > 0 ? "error" : "valid"}
          emptyMessage="All required columns are present."
          items={safeSummary?.missing_required_columns ?? []}
          renderItem={(item) => item}
        />

        <IssueSection
          title="Duplicate Employee IDs"
          status={(safeSummary?.duplicate_employee_ids?.length ?? 0) > 0 ? "error" : "valid"}
          emptyMessage="No duplicate employee IDs were found."
          items={safeSummary?.duplicate_employee_ids ?? []}
          renderItem={(item) => `${item.employee_id} (rows: ${item.row_numbers.join(", ")})`}
        />

        <IssueSection
          title="Blank Rows"
          status={(safeSummary?.blank_row_numbers?.length ?? 0) > 0 ? "warning" : "valid"}
          emptyMessage="No fully blank rows were found."
          items={safeSummary?.blank_row_numbers ?? []}
          renderItem={(item) => `Row ${item}`}
        />

        <IssueSection
          title="Negative Salary Values"
          status={(safeSummary?.negative_salary_values?.length ?? 0) > 0 ? "error" : "valid"}
          emptyMessage="No negative salary values were found."
          items={safeSummary?.negative_salary_values ?? []}
          renderItem={(item) =>
            `Row ${item.row_number}: ${formatEmployeeLabel(item as EmployeeLike)} | Salary ${item.salary_value}`
          }
        />

        <IssueSection
          title="Working Hours Less Than 4"
          status={(safeSummary?.low_working_hours?.length ?? 0) > 0 ? "warning" : "valid"}
          emptyMessage="No employees were found below 4 working hours."
          items={safeSummary?.low_working_hours ?? []}
          renderItem={(item) =>
            `Row ${item.row_number}: ${formatEmployeeLabel(item as EmployeeLike)} | Hours ${item.working_hours}`
          }
        />

        <IssueSection
          title="Missing In / Out Time"
          status={(safeSummary?.missing_in_out_time?.length ?? 0) > 0 ? "warning" : "valid"}
          emptyMessage="No missing in time or out time values were found."
          items={safeSummary?.missing_in_out_time ?? []}
          renderItem={(item) =>
            `Row ${item.row_number}: ${formatEmployeeLabel(item as EmployeeLike)} | Missing ${item.missing_fields.join(", ")}`
          }
        />
      </div>
    </section>
  );
}

type IssueSectionProps<T> = {
  title: string;
  status: ValidationSummary["status"];
  emptyMessage: string;
  items: T[];
  renderItem: (item: T) => string;
};

function IssueSection<T>({
  title,
  status,
  emptyMessage,
  items,
  renderItem
}: IssueSectionProps<T>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <StatusBadge status={status} compact />
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-slateText">
          {items.map((item, index) => (
            <li
              key={`${title}-${index}`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              {renderItem(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slateText">{emptyMessage}</p>
      )}
    </div>
  );
}

type SummaryStatProps = {
  label: string;
  value: string;
};

function SummaryStat({ label, value }: SummaryStatProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-semibold text-slateText">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

type Status = ValidationSummary["status"];

type StatusBadgeProps = {
  status: Status;
  compact?: boolean;
};

function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  const styles = {
    valid: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold capitalize ${
        compact ? "px-3 py-1 text-xs" : "px-4 py-2 text-sm"
      } ${styles[status]}`}
    >
      {status}
    </span>
  );
}

type EmployeeLike = {
  employee_name: string;
  employee_id: string;
};

function formatEmployeeLabel(item: EmployeeLike) {
  if (item.employee_name && item.employee_id) {
    return `${item.employee_name} (${item.employee_id})`;
  }

  if (item.employee_name) {
    return item.employee_name;
  }

  if (item.employee_id) {
    return item.employee_id;
  }

  return "Unknown Employee";
}
