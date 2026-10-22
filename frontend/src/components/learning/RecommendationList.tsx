"use client";

import Link from "next/link";
import { Lightbulb, X, Play, BookOpenCheck, Hammer, Sparkles, RefreshCw } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import type { LearningRecommendation } from "@/services/learningRecommendationService";
import { cn } from "@/lib/utils";

const ICON: Record<LearningRecommendation["type"], React.ComponentType<{ className?: string }>> = { continue: Play, review: BookOpenCheck, study: Lightbulb, build: Hammer, setup: Sparkles };
const PRIORITY: Record<LearningRecommendation["priority"], "error" | "warning" | "neutral"> = { high: "error", medium: "warning", low: "neutral" };

export default function RecommendationList({ recommendations, onOpenTask, onDismiss, roadmapId }: { recommendations: LearningRecommendation[]; onOpenTask?: (taskId: string) => void; onDismiss?: (key: string) => void; roadmapId?: string | null }) {
  if (!recommendations.length) return <p className="text-sm text-gray-500">No recommendations right now — you are up to date with your plan.</p>;
  return (
    <ul className="space-y-2">
      {recommendations.map((r) => {
        const Icon = ICON[r.type] ?? Lightbulb;
        return (
          <li key={r.key} className={cn("rounded-xl border px-4 py-3 flex items-start gap-3", r.priority === "high" ? "border-indigo-200 bg-indigo-50/50" : "border-gray-200 bg-white")}>
            <Icon className="w-4 h-4 mt-1 text-indigo-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-gray-900 text-sm">{r.title}</p>
                <Badge variant={PRIORITY[r.priority]}>{r.priority}</Badge>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">{r.reason}</p>
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                {r.taskId && onOpenTask && <button type="button" onClick={() => onOpenTask(r.taskId!)} className="text-indigo-700 font-medium hover:underline">Open task</button>}
                {r.action === "create" && <Link href="/dashboard/learning/new" className="text-indigo-700 font-medium hover:underline">Generate a roadmap</Link>}
                {r.action === "regenerate" && roadmapId && <span className="text-gray-500 inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Use “Regenerate” on your roadmap to cover this</span>}
                {r.skillName && <Link href={`/dashboard/interviews/new?topic=${encodeURIComponent(r.skillName)}`} className="text-gray-600 hover:underline">Practise in an interview</Link>}
              </div>
            </div>
            {onDismiss && <button type="button" onClick={() => onDismiss(r.key)} className="text-gray-400 hover:text-gray-700" aria-label="Dismiss recommendation"><X className="w-4 h-4" /></button>}
          </li>
        );
      })}
    </ul>
  );
}
