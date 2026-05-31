"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HrmsBranding } from "@/components/hrms-branding";
import { HRMS_NAV_ITEMS, navItemMatchesPath } from "@/lib/hrms-nav";

export function HrmsTopbar() {
  const pathname = usePathname();
  const activeItem =
    HRMS_NAV_ITEMS.find((item) => navItemMatchesPath(item.href, pathname)) ?? HRMS_NAV_ITEMS[0];

  return (
    <header className="shrink-0 border-b border-white/60 bg-white/80 px-4 py-3 backdrop-blur-xl lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="lg:hidden">
            <HrmsBranding variant="topbar" />
          </div>
          <p className="mt-2 truncate text-base font-bold text-ink lg:mt-0">{activeItem.label}</p>
          <p className="hidden truncate text-sm text-slateText sm:block">{activeItem.description}</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50"
        >
          Home
        </Link>
      </div>

      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {HRMS_NAV_ITEMS.map((item) => {
          const active = navItemMatchesPath(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                active
                  ? "bg-teal-700 text-white"
                  : "border border-slate-200 bg-white text-slateText"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
