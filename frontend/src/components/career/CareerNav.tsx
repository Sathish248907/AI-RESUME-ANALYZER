"use client";

import Link from "next/link";
import { Compass, User, Target, Briefcase, CalendarDays, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard/career/profile", label: "Profile", icon: User }, { href: "/dashboard/career/assessment", label: "Readiness", icon: Target }, { href: "/dashboard/career/jobs", label: "Job priorities", icon: Briefcase },
  { href: "/dashboard/career/plan", label: "Weekly plan", icon: CalendarDays }, { href: "/dashboard/career/coach", label: "Coach chat", icon: MessageSquare },
];

export default function CareerNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Career coach">
      <Link href="/dashboard/career" className={cn("px-3 py-1.5 rounded-lg border inline-flex items-center gap-1", current === "/dashboard/career" ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700")}><Compass className="w-4 h-4" /> Overview</Link>
      {NAV.map((n) => <Link key={n.href} href={n.href} className={cn("px-3 py-1.5 rounded-lg border inline-flex items-center gap-1", current === n.href ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700")}><n.icon className="w-4 h-4" /> {n.label}</Link>)}
    </nav>
  );
}

