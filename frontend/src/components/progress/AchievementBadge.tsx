"use client";

import { Search, FileText, Sparkles, Mic, Award, Flag, BookOpen, Map, Flame, Briefcase, CalendarCheck, CheckCircle2, Target, Lock } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Achievement } from "@/services/progressService";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { search: Search, file: FileText, sparkles: Sparkles, mic: Mic, award: Award, flag: Flag, book: BookOpen, map: Map, flame: Flame, briefcase: Briefcase, calendar: CalendarCheck, check: CheckCircle2, target: Target };
const CATEGORY_TONE: Record<string, string> = { resume: "from-sky-500 to-indigo-500", interview: "from-pink-500 to-rose-500", learning: "from-emerald-500 to-teal-500", application: "from-amber-500 to-orange-500", career: "from-violet-500 to-purple-500", gamification: "from-orange-500 to-red-500" };

export default function AchievementBadge({ achievement: a, size = "md" }: { achievement: Achievement; size?: "sm" | "md" }) {
  const Icon = ICONS[a.icon] ?? Award;
  const big = size === "md";
  return (
    <div className={cn("rounded-2xl border bg-white flex gap-3", big ? "p-4" : "p-3", a.unlocked ? "border-gray-200" : "border-dashed border-gray-200")} aria-label={`${a.title}: ${a.unlocked ? "unlocked" : `${a.percent}% progress`}`}>
      <div className={cn("shrink-0 rounded-full flex items-center justify-center text-white", big ? "w-12 h-12" : "w-9 h-9", a.unlocked ? `bg-gradient-to-br ${CATEGORY_TONE[a.category] ?? "from-gray-500 to-gray-700"}` : "bg-gray-200 text-gray-500")}>
        {a.unlocked ? <Icon className={big ? "w-6 h-6" : "w-4 h-4"} /> : <Lock className={big ? "w-5 h-5" : "w-4 h-4"} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-gray-900 truncate", !big && "text-sm")}>{a.title}</p>
        <p className="text-xs text-gray-600">{a.description}</p>
        {a.unlocked ? <p className="text-[11px] text-emerald-700 mt-1">Unlocked {a.unlockedAt ? formatDate(a.unlockedAt) : ""}</p> : (
          <div className="mt-1.5">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${a.percent}%` }} /></div>
            <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">{a.progress}/{a.target}</p>
          </div>
        )}
      </div>
    </div>
  );
}
