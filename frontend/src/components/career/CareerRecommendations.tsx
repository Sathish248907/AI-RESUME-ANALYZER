"use client";

import Link from "next/link";
import { CheckCircle2, X, ArrowRight, FileText, Mic, Map, Hammer, Briefcase, Target, User, RotateCcw, Clock } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import type { Recommendation } from "@/services/careerService";
import { cn } from "@/lib/utils";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { resume: FileText, interview: Mic, learning: Map, project: Hammer, application: Briefcase, skill: Target, profile: User };
const PRIORITY: Record<Recommendation["priority"], "error" | "warning" | "neutral"> = { high: "error", medium: "warning", low: "neutral" };

interface Props { recommendations: Recommendation[]; busyId?: string | null; onStatus: (r: Recommendation, status: Recommendation["status"]) => void; compact?: boolean; showResolved?: boolean }

/** Evidence-backed recommendation cards with action links and completion state. */
export default function CareerRecommendations({ recommendations, busyId, onStatus, compact = false, showResolved = false }: Props) {
  const list = recommendations.filter((r) => showResolved || r.status === "open");
  if (!list.length) return <p className="text-sm text-gray-500">{recommendations.length ? "All recommendations are done or dismissed." : "No recommendations yet — run a readiness assessment."}</p>;
  return (
    <ul className="space-y-2">
      {list.map((r) => {
        const Icon = ICON[r.type] ?? Target;
        const resolved = r.status !== "open";
        return (
          <li key={r.id} className={cn("rounded-xl border px-4 py-3", resolved ? "border-gray-200 bg-gray-50/60" : r.priority === "high" ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white")}>
            <div className="flex items-start gap-3">
              <Icon className="w-4 h-4 mt-1 text-indigo-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("font-medium text-sm", resolved ? "text-gray-500 line-through" : "text-gray-900")}>{r.title}</p>
                  <Badge variant={PRIORITY[r.priority]}>{r.priority}</Badge>
                  {r.effortMinutes && <span className="text-[11px] text-gray-500 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> ~{r.effortMinutes >= 60 ? `${Math.round(r.effortMinutes / 60)} h` : `${r.effortMinutes} min`}</span>}
                  {resolved && <Badge variant={r.status === "done" ? "success" : "neutral"}>{r.status}</Badge>}
                </div>
                {!compact && <p className="text-xs text-gray-700 mt-1">{r.explanation}</p>}
                <p className="text-xs text-gray-500 mt-0.5"><span className="font-medium">Why:</span> {r.reason}</p>
                {!compact && r.evidence.length > 0 && <p className="text-[11px] text-gray-500 mt-0.5"><span className="font-medium">Evidence:</span> {r.evidence.join(" · ")}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Link href={r.href} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline">Open <ArrowRight className="w-3 h-3" /></Link>
                  {!resolved ? (<>
                    <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => onStatus(r, "done")}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Done</Button>
                    <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => onStatus(r, "dismissed")}><X className="w-3.5 h-3.5 mr-1" /> Dismiss</Button>
                  </>) : (
                    <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => onStatus(r, "open")}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen</Button>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
