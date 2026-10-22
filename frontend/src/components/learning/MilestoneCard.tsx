"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Flag, Lock, Target } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import LearningTaskCard, { type TaskActions } from "./LearningTaskCard";
import type { RoadmapMilestone } from "@/services/learningRoadmapService";
import { cn } from "@/lib/utils";

const STATUS_META: Record<RoadmapMilestone["status"], { label: string; variant: "success" | "info" | "warning" | "neutral"; bar: string }> = {
  locked: { label: "Locked", variant: "neutral", bar: "bg-gray-300" },
  not_started: { label: "Not started", variant: "neutral", bar: "bg-gray-400" },
  in_progress: { label: "In progress", variant: "info", bar: "bg-blue-500" },
  completed: { label: "Completed", variant: "success", bar: "bg-green-500" },
};

export default function MilestoneCard({ milestone, actions, readOnly = false, defaultOpen, highlightTaskId }: { milestone: RoadmapMilestone; actions: TaskActions; readOnly?: boolean; defaultOpen?: boolean; highlightTaskId?: string | null }) {
  const [open, setOpen] = useState(defaultOpen ?? milestone.status === "in_progress");
  const meta = STATUS_META[milestone.status];
  const p = milestone.progress;
  return (
    <section className={cn("rounded-2xl border bg-white shadow-sm", milestone.status === "completed" ? "border-green-200" : milestone.status === "locked" ? "border-gray-200" : "border-indigo-200")}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left px-5 py-4 flex items-start gap-4">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-semibold", milestone.status === "completed" ? "bg-green-100 text-green-700" : milestone.status === "locked" ? "bg-gray-100 text-gray-400" : "bg-indigo-100 text-indigo-700")}>
          {milestone.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> : milestone.status === "locked" ? <Lock className="w-4 h-4" /> : milestone.sequenceNumber}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{milestone.title}</h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <span className="text-xs text-gray-500">~{milestone.estimatedHours} h</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
          {milestone.status === "locked" && milestone.unmetPrerequisites.length > 0 && (
            <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Unlocks after milestone {milestone.unmetPrerequisites.join(", ")}</p>
          )}
          {p && <div className="mt-2 flex items-center gap-3"><div className="flex-1"><ProgressBar value={p.percent} animated={false} barClassName={meta.bar} className="h-1.5" /></div><span className="text-xs text-gray-500 whitespace-nowrap">{p.completedRequired}/{p.requiredTasks} required tasks</span></div>}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide inline-flex items-center gap-1"><Target className="w-3 h-3" /> Skills</p>
              <div className="flex flex-wrap gap-1 mt-1">{milestone.requiredSkills.map((s) => <Badge key={s} variant="info">{s}</Badge>)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide inline-flex items-center gap-1"><Flag className="w-3 h-3" /> Complete when</p>
              <p className="text-gray-700 mt-1">{milestone.completionCriteria}</p>
            </div>
          </div>
          {milestone.learningObjectives.length > 0 && (
            <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">{milestone.learningObjectives.map((o) => <li key={o}>{o}</li>)}</ul>
          )}
          <div className="space-y-2">
            {milestone.tasks.map((t) => <LearningTaskCard key={t.id} task={t} actions={actions} readOnly={readOnly} highlight={highlightTaskId === t.id} />)}
          </div>
        </div>
      )}
    </section>
  );
}
