import type { AnalysisOverview } from "@/types/upload";

type AnalysisOverviewCardProps = {
  analysisType: string;
  overview: AnalysisOverview;
};

export function AnalysisOverviewCard({
  analysisType,
  overview
}: AnalysisOverviewCardProps) {
  const styles = {
    valid: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-800"
  };

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">
            Analysis Route
          </p>
          <h3 className="mt-2 text-xl font-bold text-ink">{overview.title}</h3>
          <p className="mt-1 text-sm leading-6 text-slateText">{overview.message}</p>
        </div>

        <span
          className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold capitalize ${styles[overview.status]}`}
        >
          {overview.status}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetaCard label="Selected Analysis" value={analysisType} />
        <MetaCard label="Active Engine" value={overview.engine} />
        <MetaCard label="Rendered Block" value={overview.engine === "generic" ? "Preview Only" : "Specialized"} />
      </div>
    </section>
  );
}

type MetaCardProps = {
  label: string;
  value: string;
};

function MetaCard({ label, value }: MetaCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slateText">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
