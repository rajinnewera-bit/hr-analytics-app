import { UploadPanel } from "@/components/upload-panel";
import { UploadWorkspaceBoundary } from "@/components/upload-workspace-boundary";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1380px] flex-col px-4 py-5 lg:px-6 xl:px-8">
      <section className="mb-4 rounded-[1.75rem] border border-white/70 bg-white/78 px-5 py-4 shadow-soft backdrop-blur">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
              HR Payroll Dashboard
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[2.35rem]">
              Attendance processing and payroll-ready working
            </h1>
            <p className="max-w-3xl text-[15px] leading-7 text-slateText">
              Upload the attendance workbook, resolve HR exceptions, and finalize a clean employee working register from one unified workspace.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[28rem]">
            <HeaderStat label="Workspace" value="Unified HR View" />
            <HeaderStat label="Review Mode" value="Exception Driven" />
            <HeaderStat label="Output" value="Payroll Ready" />
          </div>
        </div>
      </section>

      <UploadWorkspaceBoundary>
        <UploadPanel />
      </UploadWorkspaceBoundary>
    </main>
  );
}

type HeaderStatProps = {
  label: string;
  value: string;
};

function HeaderStat({ label, value }: HeaderStatProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/88 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slateText">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
