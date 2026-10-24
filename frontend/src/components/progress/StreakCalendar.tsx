"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreakDetail } from "@/services/progressService";

const shade = (n: number) => (n === 0 ? "bg-gray-100" : n === 1 ? "bg-emerald-200" : n === 2 ? "bg-emerald-400" : "bg-emerald-600");

/** 16-week activity calendar (columns = weeks, rows = Mon–Sun) plus streak stats. Never shames missed days. */
export default function StreakCalendar({ streaks }: { streaks: StreakDetail }) {
  const weeks: StreakDetail["calendar"]["cells"][] = [];
  for (let i = 0; i < streaks.calendar.cells.length; i += 7) weeks.push(streaks.calendar.cells.slice(i, i + 7));
  const next = streaks.milestones.find((m) => m > streaks.currentStreak);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-3"><p className="text-2xl font-semibold text-orange-700 inline-flex items-center gap-1"><Flame className="w-5 h-5" />{streaks.currentStreak}</p><p className="text-[11px] text-gray-600">current streak (days)</p></div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><p className="text-2xl font-semibold text-gray-900">{streaks.longestStreak}</p><p className="text-[11px] text-gray-600">longest streak</p></div>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3"><p className="text-2xl font-semibold text-gray-900">{streaks.totalLearningDays}</p><p className="text-[11px] text-gray-600">learning days total</p></div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max" role="img" aria-label={`Activity calendar from ${streaks.calendar.start} to ${streaks.calendar.end}`}>
          {weeks.map((w, wi) => <div key={wi} className="flex flex-col gap-1">{w.map((c) => <span key={c.day} title={`${c.day}: ${c.count} activit${c.count === 1 ? "y" : "ies"}`} className={cn("w-3.5 h-3.5 rounded-sm", c.future ? "bg-transparent border border-dashed border-gray-200" : shade(c.count), c.day === streaks.today && "ring-2 ring-indigo-400")} />)}</div>)}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{streaks.calendar.start} → {streaks.calendar.end} · timezone {streaks.timezone}{streaks.activeToday ? " · active today" : ""}</p>
      </div>
      <p className="text-xs text-gray-600">{next ? `Next milestone: ${next} days.` : "You've passed every streak milestone."} {streaks.rules}</p>
    </div>
  );
}
