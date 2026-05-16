"use client";

import { useEffect, useState } from "react";

import type { WorkbookSheetSummary } from "@/types/upload";

type WorkbookIntelligenceSummaryProps = {
  sheets: WorkbookSheetSummary[];
  selectedSheet: string;
};

export function WorkbookIntelligenceSummary({
  sheets,
  selectedSheet
}: WorkbookIntelligenceSummaryProps) {
  const safeSheets = sheets ?? [];
  const activeSheet = selectedSheet ?? "";
  const [expandedSheet, setExpandedSheet] = useState(activeSheet);

  useEffect(() => {
    if (activeSheet) {
      setExpandedSheet(activeSheet);
    }
  }, [activeSheet]);

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
          Workbook Intelligence
        </p>
        <h3 className="mt-2 text-xl font-bold text-ink">Sheet-Level Overview</h3>
        <p className="mt-1 text-sm leading-6 text-slateText">
          Expand a sheet to inspect type detection, financial fields, date fields, IDs,
          and warnings without leaving the current upload.
        </p>
      </div>

      {safeSheets.length > 0 ? (
        <div className="mt-4 space-y-3">
          {safeSheets.map((sheet) => {
            const isExpanded = expandedSheet === sheet.sheet_name;
            const isSelected = activeSheet === sheet.sheet_name;

            return (
              <article
                key={sheet.sheet_name}
                className={`rounded-2xl border bg-slate-50/80 transition ${
                  isSelected ? "border-teal-300 ring-2 ring-teal-100" : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSheet(isExpanded ? "" : sheet.sheet_name)
                  }
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-bold text-ink">{sheet.sheet_name}</h4>
                      {isSelected ? (
                        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slateText">
                      {sheet.likely_sheet_type} • {sheet.row_count} rows • {sheet.column_count} columns
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-teal-700">
                    {isExpanded ? "Hide" : "Show"}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="border-t border-slate-200 px-4 py-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <InfoBlock
                        title="Detected Financial Columns"
                        items={sheet.amount_value_columns}
                        emptyMessage="No financial or amount columns detected."
                        tone="sky"
                      />
                      <InfoBlock
                        title="Detected Date Columns"
                        items={sheet.date_columns}
                        emptyMessage="No date columns detected."
                        tone="amber"
                      />
                      <InfoBlock
                        title="Detected ID / Name Columns"
                        items={sheet.id_name_columns}
                        emptyMessage="No ID or name columns detected."
                        tone="emerald"
                      />
                      <InfoBlock
                        title="Warnings"
                        items={sheet.warnings}
                        emptyMessage="No basic warnings found."
                        tone={sheet.warnings.length > 0 ? "rose" : "slate"}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slateText">
          Workbook-level sheet intelligence is not available for this file yet.
        </div>
      )}
    </section>
  );
}

type InfoBlockProps = {
  title: string;
  items: string[];
  emptyMessage: string;
  tone: "sky" | "amber" | "emerald" | "rose" | "slate";
};

function InfoBlock({ title, items, emptyMessage, tone }: InfoBlockProps) {
  const toneClasses = {
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-white text-slate-700"
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/75 p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>

      {items.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={`${title}-${item}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slateText">{emptyMessage}</p>
      )}
    </div>
  );
}
