"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Bookmark, SlidersHorizontal, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/jobs", label: "Discover", icon: Search },
  { href: "/dashboard/jobs/saved", label: "Saved", icon: Bookmark },
  { href: "/dashboard/jobs/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/dashboard/jobs/alerts", label: "Alerts", icon: BellRing },
];

/** Shared sub-navigation for the job discovery area. */
export default function JobsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Job discovery" className="flex overflow-x-auto border-b border-gray-200 text-sm">
      {TABS.map((t) => {
        const active = t.href === "/dashboard/jobs" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-2.5 inline-flex items-center gap-1.5 whitespace-nowrap border-b-2",
              active ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-gray-600 hover:text-gray-900"
            )}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
