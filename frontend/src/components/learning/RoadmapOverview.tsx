"use client";

import { Archive, Calendar, Clock, Gauge, History, RefreshCw, Target, Trash2, GitBranch, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import { ProgressBar } from "@/components/common/ProgressBar";
import { OBJECTIVE_LABELS, type LearningRoadmap } from "@/services/learningRoadmapService";
import { formatDate } from "@/lib/utils";

interface Props {
  roadmap: LearningRoadmap;
  onRegenerate?: () => void;
  onArchive?: () => void;
  onActivate?: () => void;
  onDelete?: () => void;
  onShowHistory?: () => void;
  busy?: boolean;
}

const STATUS: Record<LearningRoadmap["status"], { label: string; variant: "success" | "neutral" | "warning" }> = {
  active: { label: "Active", variant: "success" },
  archived: { label: "Archived", variant: "neutral" },
  superseded: { label: "Superseded", variant: "warning" },
};

export default function RoadmapOverview({ roadmap, onRegenerate, onArchive, onActivate, onDelete, onShowHistory, busy }: Props) {
  const p = roadmap.progress;
  const hours = (m: number) => (m >= 60 ? `${Math.round(m / 60)} h` : `${m} min`);
  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-white to-white">
      <CardContent className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{roadmap.title}</h1>
              <Badge variant={STATUS[roadmap.status].variant}>{STATUS[roadmap.status].label}</Badge>
              <Badge variant="neutral" className="gap-1"><GitBranch className="w-3 h-3" /> v{roadmap.version}</Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {roadmap.targetRole}</span>
              <span className="inline-flex items-center gap-1 capitalize"><Gauge className="w-3.5 h-3.5" /> {roadmap.currentSkillLevel}</span>
              <span>{OBJECTIVE_LABELS[roadmap.objective] ?? roadmap.objective}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {roadmap.weeklyStudyHours} h/week · {roadmap.preferredSchedule}</span>
              {roadmap.targetCompletionDate && <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Target {formatDate(roadmap.targetCompletionDate)}</span>}
            </p>
            {roadmap.skillGapSummary?.overview && <p className="text-sm text-gray-700 mt-3 max-w-3xl">{roadmap.skillGapSummary.overview}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {onShowHistory && <Button size="sm" variant="ghost" onClick={onShowHistory}><History className="w-4 h-4 mr-1" /> Versions</Button>}
            {roadmap.status === "active" && onRegenerate && <Button size="sm" variant="outline" onClick={onRegenerate} disabled={busy}><RefreshCw className="w-4 h-4 mr-1" /> Regenerate</Button>}
            {roadmap.status === "active" && onArchive && <Button size="sm" variant="ghost" onClick={onArchive} disabled={busy}><Archive className="w-4 h-4 mr-1" /> Archive</Button>}
            {roadmap.status !== "active" && onActivate && <Button size="sm" variant="outline" onClick={onActivate} disabled={busy}><Sparkles className="w-4 h-4 mr-1" /> Make active</Button>}
            {onDelete && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onDelete} disabled={busy}><Trash2 className="w-4 h-4" /></Button>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium text-gray-800">Overall progress</span>
            <span className="text-gray-600">{p.percent}% · {p.completedTasks}/{p.requiredTasks} required tasks</span>
          </div>
          <ProgressBar value={p.percent} barClassName={p.percent === 100 ? "bg-green-500" : "bg-indigo-500"} />
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-sm">
          <Stat label="Milestones" value={`${p.completedMilestones}/${p.totalMilestones}`} sub={p.lockedMilestones ? `${p.lockedMilestones} locked` : undefined} />
          <Stat label="Tasks done" value={String(p.completedTasks)} sub={p.inProgressTasks ? `${p.inProgressTasks} in progress` : undefined} />
          <Stat label="Studied" value={hours(p.studiedMinutes)} sub="logged time" />
          <Stat label="Remaining" value={hours(p.remainingMinutes)} sub={`≈ ${p.remainingWeeksEstimate} wk at ${roadmap.weeklyStudyHours} h/wk`} />
          <Stat label="Plan size" value={`${roadmap.estimatedHours} h`} sub={`${roadmap.estimatedWeeks} weeks planned`} />
          <Stat label="Generated" value={formatDate(roadmap.createdAt)} sub={roadmap.model ? `${roadmap.provider} · ${roadmap.model}` : undefined} />
        </dl>

        {roadmap.changeSummary && (
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
            <span className="font-semibold">Version {roadmap.version} changes:</span> {roadmap.changeSummary.completedCarriedOver} completed task{roadmap.changeSummary.completedCarriedOver === 1 ? "" : "s"} carried over
            {roadmap.changeSummary.addedSkills.length > 0 && <> · added {roadmap.changeSummary.addedSkills.join(", ")}</>}
            {roadmap.changeSummary.removedSkills.length > 0 && <> · removed {roadmap.changeSummary.removedSkills.join(", ")}</>}
            {roadmap.changeSummary.reason && <> · reason: “{roadmap.changeSummary.reason}”</>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
      {sub && <dd className="text-[11px] text-gray-500">{sub}</dd>}
    </div>
  );
}
