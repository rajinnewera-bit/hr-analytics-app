import { HRMS_BRAND } from "@/lib/hrms-brand";

type HrmsBrandingProps = {
  variant?: "sidebar" | "topbar" | "page";
  className?: string;
  withDivider?: boolean;
};

function joinClasses(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function HrmsBranding({
  variant = "page",
  className,
  withDivider = true,
}: HrmsBrandingProps) {
  if (variant === "sidebar") {
    return (
      <div className={joinClasses("space-y-0.5", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-800">
          {HRMS_BRAND.company}
        </p>
        <p className="text-sm font-semibold leading-snug tracking-[0.06em] text-ink">
          {HRMS_BRAND.platform}
        </p>
        <p className="text-xs text-slateText">{HRMS_BRAND.subtitle}</p>
      </div>
    );
  }

  if (variant === "topbar") {
    return (
      <div className={joinClasses("min-w-0", className)}>
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-800">
          {HRMS_BRAND.company}
        </p>
        <p className="truncate text-sm font-semibold tracking-[0.04em] text-ink">
          {HRMS_BRAND.platform}
        </p>
        <p className="truncate text-xs text-slateText">{HRMS_BRAND.subtitle}</p>
      </div>
    );
  }

  return (
    <div
      className={joinClasses(
        withDivider && "border-b border-slate-200/80 pb-3",
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-800">
        {HRMS_BRAND.company}
      </p>
      <p className="mt-0.5 text-sm font-semibold tracking-[0.06em] text-ink">
        {HRMS_BRAND.platform}
      </p>
      <p className="mt-0.5 text-xs text-slateText">{HRMS_BRAND.subtitle}</p>
    </div>
  );
}
