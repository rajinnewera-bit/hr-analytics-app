import type { ReactNode } from "react";
import { HrmsBranding } from "@/components/hrms-branding";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  showBranding?: boolean;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  showBranding = true,
}: PageHeaderProps) {
  return (
    <header className="shrink-0 rounded-[1.5rem] border border-white/70 bg-white/88 px-5 py-4 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {showBranding ? <HrmsBranding variant="page" /> : null}
          <div className="space-y-1.5">
          <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-800">
            {eyebrow}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[2rem]">{title}</h1>
          <p className="max-w-3xl text-[15px] leading-7 text-slateText">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
