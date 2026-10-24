"use client";

import { Bot, Calculator, Download } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { formatDate } from "@/lib/utils";
import type { ProgressReport } from "@/services/progressService";

const row = (label: string, value: unknown, suffix = "") => <div className="flex justify-between gap-3 text-sm border-b border-gray-100 py-1"><span className="text-gray-600">{label}</span><span className="font-medium text-gray-900 tabular-nums">{value === null || value === undefined ? <span className="text-gray-400 italic font-normal">no data</span> : `${value}${suffix}`}</span></div>;

export default function ReportPreview({ report, onDownload, downloading }: { report: ProgressReport; onDownload?: () => void; downloading?: boolean }) {
  const m = report.metrics, n = report.narrative;
  return (
    <article className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{report.periodType === "weekly" ? "Weekly" : "Monthly"} report · {m.period?.label}</h3>
          <p className="text-xs text-gray-500">{formatDate(report.periodStart)} – {formatDate(report.periodEnd)} · generated {formatDate(report.updatedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={report.aiUsed ? "info" : "neutral"}>{report.aiUsed ? <><Bot className="w-3 h-3" /> AI narrative</> : <><Calculator className="w-3 h-3" /> Rule-based narrative</>}</Badge>
          {onDownload && <Button size="sm" variant="outline" loading={downloading} onClick={onDownload}><Download className="w-3.5 h-3.5 mr-1" /> PDF</Button>}
        </div>
      </header>
      {n && (
        <section className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-4 space-y-2">
          <p className="text-sm text-gray-900">{n.summary}</p>
          {n.note && <p className="text-[11px] text-amber-700">{n.note}</p>}
          {n.highlights.length > 0 && <div><p className="text-xs font-semibold text-gray-700 mt-2">Highlights</p><ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">{n.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
          {n.priorities.length > 0 && <div><p className="text-xs font-semibold text-gray-700 mt-2">Recommended priorities <span className="font-normal text-gray-500">(suggestions, not verified facts)</span></p><ul className="list-disc pl-5 text-sm text-gray-800 space-y-0.5">{n.priorities.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
        </section>
      )}
      <section className="grid sm:grid-cols-2 gap-x-6">
        <div>
          {row("Activities recorded", m.activities?.total)}{row("Learning tasks completed", m.activities?.learningTasks)}{row("Checkpoints passed", m.activities?.checkpoints)}{row("Milestones completed", m.activities?.milestones)}
          {row("Mock interviews finished", m.interviews?.completed)}{row("Average interview score", m.interviews?.average, "%")}{row("Best interview score", m.interviews?.best, "%")}
        </div>
        <div>
          {row("Best resume quality", m.resume?.bestQuality)}{row("Quality before period", m.resume?.bestBefore)}{row("Resume versions edited", m.resume?.versionsEdited)}{row("Analyses run", m.resume?.analysesRun)}
          {row("Applications submitted", m.applications?.submitted)}{row("Interview stages reached", m.applications?.interviewsReached)}{row("Points earned", m.pointsEarned)}{row("Achievements unlocked", m.achievements?.length)}
        </div>
      </section>
      {m.learning && <p className="text-sm text-gray-700">Roadmap “{m.learning.roadmap}”: {m.learning.percent}% complete · {m.learning.tasksThisPeriod} task{m.learning.tasksThisPeriod === 1 ? "" : "s"} this period · {m.learning.minutesThisPeriod} min studied.</p>}
      {m.skillsPractised?.length > 0 && <p className="text-sm text-gray-700">Skills practised: {m.skillsPractised.join(", ")}.</p>}
      <p className="text-[11px] text-gray-500">Metrics are computed from your records; the narrative only restates them. Nothing here predicts employment outcomes.</p>
    </article>
  );
}
