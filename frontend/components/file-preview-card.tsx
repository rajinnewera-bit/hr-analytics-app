import type { UploadResponse } from "@/types/upload";

type FilePreviewCardProps = {
  result: UploadResponse;
  isSwitchingSheet: boolean;
  onSheetSelect: (sheetName: string) => void;
};

export function FilePreviewCard({
  result,
  isSwitchingSheet,
  onSheetSelect
}: FilePreviewCardProps) {
  const safeResult = result;
  const sheetNames = safeResult?.sheet_names ?? [];
  const selectedSheet = safeResult?.selected_sheet ?? "";
  const columnHeaders = safeResult?.column_headers ?? [];
  const previewRows = safeResult?.preview_rows ?? [];

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            File Preview
          </p>
          <h3 className="mt-2 text-xl font-bold text-ink">
            {safeResult?.file_name ?? "Uploaded File"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slateText">
            {safeResult?.message ?? "File analyzed successfully."}
          </p>
        </div>

        <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
          {safeResult?.upload_status ?? "success"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PreviewStat label="File Type" value={(safeResult?.file_type ?? "unknown").toUpperCase()} />
        <PreviewStat label="Total Rows" value={(safeResult?.total_rows ?? 0).toString()} />
        <PreviewStat label="Total Columns" value={(safeResult?.total_columns ?? 0).toString()} />
        <PreviewStat label="Analysis Type" value={safeResult?.analysis_type ?? "Auto Detect"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">Sheet Names</p>
              <p className="mt-1 text-sm text-slateText">
                Switch sheets without uploading the workbook again.
              </p>
            </div>
            {isSwitchingSheet ? (
              <span className="text-sm font-medium text-teal-700">Analyzing sheet...</span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {sheetNames.map((sheetName) => (
              <button
                key={sheetName}
                type="button"
                disabled={isSwitchingSheet || selectedSheet === sheetName}
                onClick={() => onSheetSelect(sheetName)}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  selectedSheet === sheetName
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-teal-200 bg-white text-teal-800 hover:border-teal-400 hover:bg-teal-50"
                } disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {sheetName}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-semibold text-ink">Detected Columns</p>
          <p className="mt-1 text-sm text-slateText">
            Quick structure scan from the selected sheet.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {columnHeaders.length > 0 ? (
              columnHeaders.map((header, index) => (
                <span
                  key={`${header}-${index}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-ink"
                >
                  {header}
                </span>
              ))
            ) : (
              <p className="text-sm text-slateText">
                No column headers were detected in this file.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">First 5 Rows Preview</p>
            <p className="mt-1 text-sm text-slateText">
              A quick sample from the uploaded file so you can verify the structure.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Row</th>
                {columnHeaders.map((header, index) => (
                  <th
                    key={`${header}-${index}`}
                    className="whitespace-nowrap px-4 py-3 font-semibold"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {previewRows.length > 0 ? (
                previewRows.map((row, rowIndex) => (
                  <tr key={`preview-row-${rowIndex}`} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slateText">
                      {rowIndex + 1}
                    </td>
                    {columnHeaders.map((header, columnIndex) => (
                      <td
                        key={`${header}-${rowIndex}-${columnIndex}`}
                        className="whitespace-nowrap px-4 py-3 text-ink"
                      >
                        {row[columnIndex] || ""}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columnHeaders.length + 1}
                    className="px-4 py-4 text-slateText"
                  >
                    No preview rows are available for this file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

type PreviewStatProps = {
  label: string;
  value: string;
};

function PreviewStat({ label, value }: PreviewStatProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
