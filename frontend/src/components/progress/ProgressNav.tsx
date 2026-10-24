"use client";

import Link from "next/link";
import { Activity, BarChart3, Brain, Filter, Trophy, Flag, FileBarChart, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard/progress", label: "Progress", icon: Activity },
  { href: "/dashboard/progress/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/progress/skills", label: "Skill growth", icon: Brain },
  { href: "/dashboard/progress/applications", label: "Application funnel", icon: Filter },
  { href: "/dashboard/progress/achievements", label: "Achievements", icon: Trophy },
  { href: "/dashboard/progress/goals", label: "Goals", icon: Flag },
  { href: "/dashboard/progress/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/progress/notifications", label: "Notifications", icon: Bell },
];

export default function ProgressNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Progress and analytics">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined} className={cn("px-3 py-1.5 rounded-lg border inline-flex items-center gap-1", current === n.href ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>
          <n.icon className="w-4 h-4" /> {n.label}
        </Link>
      ))}
    </nav>
  );
}
