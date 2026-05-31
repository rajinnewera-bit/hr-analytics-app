"use client";

import { useState, useMemo } from "react";
import type {
  AttendanceValidationSummary,
  AttendanceMergeInstruction,
  AttendanceProcessedRow,
} from "@/types/upload";

type MergeCardProps = {
  summary: AttendanceValidationSummary;
  onMerge: (instructions: AttendanceMergeInstruction[], dryRun: boolean) => Promise<void>;
  isProcessing: boolean;
};

type MergeState = {
  selectedEmployees: string[];
  finalEmployeeName: string;
  finalEmployeeCode: string;
};

export function AttendanceMergeCard({
  summary,
  onMerge,
  isProcessing,
}: MergeCardProps) {
  const [mergeState, setMergeState] = useState<MergeState>({
    selectedEmployees: [],
    finalEmployeeName: "",
    finalEmployeeCode: "",
  });
  const [previewVisible, setPreviewVisible] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const employeeOptions = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    summary.processed_attendance_rows.forEach((row) => {
      const name = (row.employee_name || "").trim();
      if (!name) {
        return;
      }
      if (!grouped.has(name)) {
        grouped.set(name, new Set<string>());
      }
      const code = (row.employee_code || "").trim();
      if (code) {
        grouped.get(name)!.add(code);
      }
    });
    return Array.from(grouped.entries())
      .map(([name, codeSet]) => {
        const codes = Array.from(codeSet).sort();
        return {
          name,
          codes,
          searchText: `${name.toLowerCase()} ${codes.join(" ").toLowerCase()}`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [summary.processed_attendance_rows]);

  const employees = useMemo(
    () => employeeOptions.map((item) => item.name),
    [employeeOptions]
  );

  const filteredEmployeeOptions = useMemo(
    () =>
      !searchQuery.trim()
        ? employeeOptions
        : employeeOptions.filter((item) =>
            item.searchText.includes(searchQuery.trim().toLowerCase())
          ),
    [employeeOptions, searchQuery]
  );

  const selectedRows = useMemo(
    () =>
      summary.processed_attendance_rows.filter((r) =>
        mergeState.selectedEmployees.includes(r.employee_name)
      ),
    [summary.processed_attendance_rows, mergeState.selectedEmployees]
  );

  const previewMerged = useMemo(() => {
    if (selectedRows.length === 0 || !mergeState.finalEmployeeName) return [];

    const grouped = new Map<string, AttendanceProcessedRow[]>();
    selectedRows.forEach((row) => {
      const key = row.date;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(row);
    });

    const merged: AttendanceProcessedRow[] = [];
    grouped.forEach((group) => {
      if (group.length === 1) {
        merged.push({ ...group[0] });
      } else {
        const base = { ...group[0] };
        base.employee_name = mergeState.finalEmployeeName;
        if (mergeState.finalEmployeeCode) {
          base.employee_code = mergeState.finalEmployeeCode;
        }
        base.original_employee_names = group.map((r) => r.employee_name).filter(Boolean);
        base.original_employee_codes = group.map((r) => r.employee_code).filter(Boolean);
        merged.push(base);
      }
    });

    return merged.sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedRows, mergeState.finalEmployeeName, mergeState.finalEmployeeCode]);

  const handleEmployeeToggle = (employee: string) => {
    setMergeState((prev) => ({
      ...prev,
      selectedEmployees: prev.selectedEmployees.includes(employee)
        ? prev.selectedEmployees.filter((e) => e !== employee)
        : [...prev.selectedEmployees, employee],
    }));
    setErrorMsg("");
  };

  const handleSelectAll = () => {
    setMergeState((prev) => ({
      ...prev,
      selectedEmployees: prev.selectedEmployees.length === employees.length ? [] : [...employees],
    }));
  };

  const handlePreview = () => {
    if (mergeState.selectedEmployees.length < 2) {
      setErrorMsg("Select at least 2 employees to merge.");
      return;
    }
    if (!mergeState.finalEmployeeName.trim()) {
      setErrorMsg("Enter a final employee name.");
      return;
    }
    setErrorMsg("");
    setPreviewVisible(true);
  };

  const handleApply = async () => {
    if (mergeState.selectedEmployees.length < 2) {
      setErrorMsg("Select at least 2 employees to merge.");
      return;
    }
    if (!mergeState.finalEmployeeName.trim()) {
      setErrorMsg("Enter a final employee name.");
      return;
    }

    const instruction: AttendanceMergeInstruction = {
      final_employee_name: mergeState.finalEmployeeName.trim(),
      final_employee_code: mergeState.finalEmployeeCode.trim() || undefined,
      sources: {
        source_names: mergeState.selectedEmployees,
      },
    };

    try {
      setErrorMsg("");
      await onMerge([instruction], false);
      setPreviewVisible(false);
      setConfirmApply(false);
      setMergeState({
        selectedEmployees: [],
        finalEmployeeName: "",
        finalEmployeeCode: "",
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to apply merge.");
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Employee Merge Workflow</h2>

      <div className="space-y-6">
        {/* Employee Selection */}
        <div>
          <div className="mb-4">
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Selected Employees Preview
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 min-h-[52px]">
              {mergeState.selectedEmployees.length === 0 ? (
                <p className="text-sm text-blue-700">No employees selected yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mergeState.selectedEmployees.map((employee) => (
                    <span
                      key={employee}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {employee}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Select Employees to Merge ({mergeState.selectedEmployees.length}/{employees.length})
            </label>
            {employees.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {mergeState.selectedEmployees.length === employees.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>

          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by employee name or code..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              disabled={isProcessing}
            />
            <p className="text-xs text-gray-500 mt-1">
              Showing {filteredEmployeeOptions.length} of {employees.length} employees
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
            {employees.length === 0 ? (
              <p className="text-sm text-gray-500">No employees found in processed data.</p>
            ) : filteredEmployeeOptions.length === 0 ? (
              <p className="text-sm text-gray-500">No employees match your search.</p>
            ) : (
              <div className="space-y-2">
                {filteredEmployeeOptions.map((employee) => (
                  <label key={employee.name} className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={mergeState.selectedEmployees.includes(employee.name)}
                      onChange={() => handleEmployeeToggle(employee.name)}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      disabled={isProcessing}
                    />
                    <span className="ml-3 text-sm text-gray-700">
                      {employee.name}
                      {employee.codes.length > 0 ? (
                        <span className="text-xs text-gray-500"> ({employee.codes.join(", ")})</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Final Employee Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Final Employee Name *
          </label>
          <input
            type="text"
            value={mergeState.finalEmployeeName}
            onChange={(e) =>
              setMergeState((prev) => ({ ...prev, finalEmployeeName: e.target.value }))
            }
            placeholder="e.g., Rajdeep Dutta"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isProcessing}
          />
        </div>

        {/* Final Employee Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Final Employee Code (Optional)
          </label>
          <input
            type="text"
            value={mergeState.finalEmployeeCode}
            onChange={(e) =>
              setMergeState((prev) => ({ ...prev, finalEmployeeCode: e.target.value }))
            }
            placeholder="e.g., EMP001"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={isProcessing}
          />
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={isProcessing || mergeState.selectedEmployees.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            Preview Merge
          </button>
        </div>

        {/* Preview Section */}
        {previewVisible && (
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Merge Preview</h3>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Source employees:</strong> {mergeState.selectedEmployees.join(", ")}
              </p>
              <p className="text-sm text-blue-800 mt-1">
                <strong>Final employee:</strong> {mergeState.finalEmployeeName}
                {mergeState.finalEmployeeCode && ` (${mergeState.finalEmployeeCode})`}
              </p>
              <p className="text-sm text-blue-800 mt-1">
                <strong>Total rows:</strong> {selectedRows.length} → {previewMerged.length} (after merge)
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-100">
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Employee</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">IN</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">OUT</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Hours</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-700">Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {previewMerged.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-100">
                      <td className="px-3 py-2 text-gray-700">{row.date}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {row.employee_name}
                        {row.original_employee_names && row.original_employee_names.length > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            From: {row.original_employee_names.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.in_time || "-"}</td>
                      <td className="px-3 py-2 text-gray-700">{row.out_time || "-"}</td>
                      <td className="px-3 py-2 text-gray-700">{row.working_hours}</td>
                      <td className="px-3 py-2 text-gray-700 text-xs">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                          {row.final_status_code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{row.payable_day_impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewMerged.length > 10 && (
                <div className="px-3 py-2 bg-gray-100 text-xs text-gray-600 border-t">
                  Showing 10 of {previewMerged.length} rows
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmApply(true)}
                disabled={isProcessing}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                Apply Merge
              </button>
              <button
                onClick={() => setPreviewVisible(false)}
                disabled={isProcessing}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                Cancel
              </button>
            </div>

            {/* Confirmation Dialog */}
            {confirmApply && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Confirm Merge</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Are you sure you want to merge {mergeState.selectedEmployees.length} employees into{" "}
                    <strong>{mergeState.finalEmployeeName}</strong>? This will consolidate{" "}
                    {selectedRows.length} attendance records into {previewMerged.length}.
                  </p>
                  <p className="text-sm text-gray-600 mb-6">
                    Original employee names will be preserved in the detailed report.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setConfirmApply(false)}
                      disabled={isProcessing}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={isProcessing}
                      className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
                    >
                      {isProcessing ? "Applying..." : "Confirm Merge"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
