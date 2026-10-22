"use client";

import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { ProgressBar } from "@/components/common/ProgressBar";
import type { WeeklyPlan } from "@/services/learningRoadmapService";
import { cn } from "@/lib/utils";

/** Seven-day view: study days by schedule preference, suggested tasks filled to the weekly budget. */
export default function WeeklyLearningPlan({ plan, onOpenTask }: { plan: WeeklyPlan; onOpenTask?: (taskId: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-gray-700 inline-flex items-center gap-1"><Clock className="w-4 h-4 text-indigo-600" /> Target <strong>{Math.round(plan.weeklyTargetMinutes / 60)} h</strong> this week · <span className="capitalize">{plan.schedule}</span></p>
        <p className="text-gray-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-600" /> {plan.completedThisWeek} task{plan.completedThisWeek === 1 ? "" : "s"} · {plan.completedMinutesThisWeek} min logged in the last 7 days</p>
      </div>
      <ProgressBar value={plan.weeklyCompletionPercent} barClassName="bg-green-500" className="h-2" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {plan.sessions.map((s) => (
          <div key={s.date} className={cn("rounded-xl border p-2.5 min-h-[7rem] flex flex-col", s.studyDay ? "bg-white border-indigo-100" : "bg-gray-50 border-gray-100", s.date === today && "ring-2 ring-indigo-200")}>
            <div className="flex items-center justify-between text-xs">
              <span className={cn("font-semibold", s.studyDay ? "text-gray-800" : "text-gray-400")}>{s.weekday}</span>
              <span className="text-gray-400">{s.date.slice(5)}</span>
            </div>
            {s.studyDay ? <p className="text-[11px] text-indigo-700 mt-0.5">{s.plannedMinutes || s.targetMinutes} min</p> : <p className="text-[11px] text-gray-400 mt-0.5">Rest day</p>}
            <ul className="mt-1.5 space-y-1 flex-1">
              {s.tasks.map((t) => (
                <li key={t.taskId}>
                  <button type="button" onClick={() => onOpenTask?.(t.taskId)} className="w-full text-left text-[11px] leading-tight rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-900 px-1.5 py-1 truncate" title={`${t.title} · ${t.estimatedMinutes} min`}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Suggested tasks follow roadmap order and your weekly budget. Finishing a task updates this plan.</p>
    </div>
  );
}
