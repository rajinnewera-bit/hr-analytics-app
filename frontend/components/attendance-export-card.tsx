"use client";

import { useState } from "react";
import type {
  AttendanceValidationSummary,
} from "@/types/upload";
import {
  generateDetailedAttendanceCSV,
  generatePayrollReadyCSV,
  generateEmployeeMonthlySummaryCSV,
} from "@/lib/export-attendance";

type ExportCardProps = {
  summary: AttendanceValidationSummary;
};

export function AttendanceExportCard({ summary }: ExportCardProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportDetailed = async () => {
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      generateDetailedAttendanceCSV(
        summary.processed_attendance_rows,
        `detailed_attendance_${timestamp}.csv`
      );
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export detailed report. Check console for errors.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPayrollReady = async () => {
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      generatePayrollReadyCSV(
        summary.processed_attendance_rows,
        summary.employee_monthly_summary,
        `payroll_ready_${timestamp}.csv`
      );
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export payroll report. Check console for errors.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMonthlySummary = async () => {
    setIsExporting(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      generateEmployeeMonthlySummaryCSV(
        summary.employee_monthly_summary,
        `employee_monthly_summary_${timestamp}.csv`
      );
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export monthly summary. Check console for errors.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Export Reports</h2>
      <p className="text-sm text-gray-600 mb-6">
        Generate CSV reports for the processed attendance data.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Detailed Report */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
          <h3 className="font-semibold text-gray-900 mb-2">Detailed Attendance Report</h3>
          <p className="text-xs text-gray-600 mb-4">
            All attendance records with original employee names and detailed punch information.
          </p>
          <button
            onClick={handleExportDetailed}
            disabled={isExporting || summary.processed_attendance_rows.length === 0}
            className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Records: {summary.processed_attendance_rows.length}
          </p>
        </div>

        {/* Payroll Ready Report */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
          <h3 className="font-semibold text-gray-900 mb-2">Payroll-Ready Report</h3>
          <p className="text-xs text-gray-600 mb-4">
            Clean report with only merged final rows, no duplicates. All payroll columns included.
          </p>
          <button
            onClick={handleExportPayrollReady}
            disabled={isExporting || summary.processed_attendance_rows.length === 0}
            className="w-full px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Format: Clean, HR-ready
          </p>
        </div>

        {/* Monthly Summary */}
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
          <h3 className="font-semibold text-gray-900 mb-2">Monthly Summary Report</h3>
          <p className="text-xs text-gray-600 mb-4">
            Employee-wise monthly summary with payable days, comp-off, and deductions.
          </p>
          <button
            onClick={handleExportMonthlySummary}
            disabled={isExporting || summary.employee_monthly_summary.length === 0}
            className="w-full px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Employees: {summary.employee_monthly_summary.length}
          </p>
        </div>
      </div>
    </div>
  );
}
