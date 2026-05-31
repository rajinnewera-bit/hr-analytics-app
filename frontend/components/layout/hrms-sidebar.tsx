"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HrmsBranding } from "@/components/hrms-branding";
import { HRMS_NAV_ITEMS, navItemMatchesPath } from "@/lib/hrms-nav";

const SECTION_LABELS: Record<string, string> = {
  core: "Overview",
  attendance: "Attendance",
  people: "People",
};

export function HrmsSidebar() {
  const pathname = usePathname();

  const sections = ["core", "attendance", "people"] as const;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/60 bg-white/75 backdrop-blur-xl lg:flex">
      <div className="border-b border-slate-200/80 px-5 py-5">
        <HrmsBranding variant="sidebar" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => {
          const items = HRMS_NAV_ITEMS.filter((item) => item.section === section);
          if (items.length === 0) {
            return null;
          }

          return (
            <div key={section} className="mb-5">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slateText">
                {SECTION_LABELS[section]}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = navItemMatchesPath(item.href, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-xl px-3 py-2.5 transition ${
                          active
                            ? "bg-teal-700 text-white shadow-sm"
                            : "text-ink hover:bg-teal-50 hover:text-teal-900"
                        }`}
                      >
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span
                          className={`mt-0.5 block text-xs leading-5 ${
                            active ? "text-teal-100" : "text-slateText"
                          }`}
                        >
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
