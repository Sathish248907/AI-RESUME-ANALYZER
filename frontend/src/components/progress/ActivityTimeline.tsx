"use client";

import Link from "next/link";
import { BookOpen, Mic, FileText, Briefcase, Compass, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/services/progressService";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { learning: BookOpen, interview: Mic, resume: FileText, application: Briefcase, career: Compass, gamification: Trophy };
const TONE: Record<string, string> = { learning: "bg-emerald-100 text-emerald-700", interview: "bg-pink-100 text-pink-700", resume: "bg-sky-100 text-sky-700", application: "bg-amber-100 text-amber-700", career: "bg-violet-100 text-violet-700", gamification: "bg-orange-100 text-orange-700" };

const when = (d: string) => { const t = new Date(d); const diff = (Date.now() - t.getTime()) / 36e5; if (diff < 1) return "just now"; if (diff < 24) return `${Math.floor(diff)} h ago`; if (diff < 48) return "yesterday"; return t.toLocaleDateString(undefined, { month: "short", day: "numeric", year: t.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }); };

export default function ActivityTimeline({ items, emptyText = "No activity recorded yet." }: { items: ActivityItem[]; emptyText?: string }) {
  if (!items.length) return <p className="text-sm text-gray-500">{emptyText}</p>;
  return (
    <ol className="relative border-l border-gray-200 ml-3 space-y-4">
      {items.map((a) => { const Icon = ICON[a.category] ?? Trophy; return (
        <li key={a.id} className="ml-5 relative">
          <span className={cn("absolute -left-[31px] top-0.5 w-6 h-6 rounded-full flex items-center justify-center", TONE[a.category] ?? "bg-gray-100 text-gray-600")}><Icon className="w-3.5 h-3.5" /></span>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {a.href ? <Link href={a.href} className="text-sm text-gray-900 hover:underline">{a.title}</Link> : <p className="text-sm text-gray-900">{a.title}</p>}
              <p className="text-[11px] text-gray-500"><time dateTime={a.occurredAt}>{when(a.occurredAt)}</time> · {a.category}</p>
            </div>
            {a.points > 0 && <span className="shrink-0 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5 tabular-nums">+{a.points} XP</span>}
          </div>
        </li>
      ); })}
    </ol>
  );
}
