"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronDown, ChevronUp, FileText, Mic, Info, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import type { JobPriorities, JobPriorityItem } from "@/services/careerService";
import { cn, getScoreColor } from "@/lib/utils";

interface Props { data: JobPriorities; weights: Record<string, number>; onWeights: (w: Record<string, number>) => void; includeClosed: boolean; onIncludeClosed: (v: boolean) => void }
const STATUS_VARIANT: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = { INTERESTED: "neutral", APPLIED: "info", ASSESSMENT: "info", INTERVIEW: "warning", OFFER: "success", REJECTED: "error", WITHDRAWN: "neutral" };
const FACTORS = [["match", "Match score"], ["skills", "Demonstrated skills"], ["relevance", "Role relevance"], ["preference", "Location / mode"], ["urgency", "Urgency"]] as const;

export default function JobPriorityBoard({ data, weights, onWeights, includeClosed, onIncludeClosed }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showWeights, setShowWeights] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-600">{data.items.length} job{data.items.length === 1 ? "" : "s"} ranked · {data.closedCount} closed hidden</p>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1 text-gray-600"><input type="checkbox" checked={includeClosed} onChange={(e) => onIncludeClosed(e.target.checked)} /> show rejected / withdrawn</label>
            <button type="button" onClick={() => setShowWeights((s) => !s)} className="text-indigo-700 inline-flex items-center gap-1"><SlidersHorizontal className="w-3.5 h-3.5" /> Weights</button>
          </div>
        </div>
        {showWeights && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
            {FACTORS.map(([k, label]) => <label key={k} className="text-xs"><span className="text-gray-700">{label}</span><input type="range" min={0} max={100} value={weights[k] ?? data.weights[k]} onChange={(e) => onWeights({ ...weights, [k]: Number(e.target.value) })} className="w-full" /><span className="text-gray-500">{weights[k] ?? data.weights[k]}</span></label>)}
          </div>
        )}
      </div>
      {data.items.length === 0 && <p className="text-sm text-gray-500">Save a job description or track an application to see priorities here.</p>}
      <ul className="space-y-2">
        {data.items.map((it) => {
          const id = it.jobDescriptionId ?? it.applicationId ?? it.jobTitle;
          const o = open[id];
          return (
            <li key={id} className={cn("rounded-xl border bg-white", it.closed ? "border-gray-200 opacity-70" : "border-gray-200")}>
              <div className="px-4 py-3 flex items-start gap-3">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shrink-0", it.priorityScore === null ? "bg-gray-300" : it.priorityScore >= 70 ? "bg-green-600" : it.priorityScore >= 45 ? "bg-indigo-600" : "bg-gray-500")}>{it.priorityScore ?? "—"}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{it.jobTitle}</p>
                    {it.companyName && <span className="text-gray-600 inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> {it.companyName}</span>}
                    {it.status && <Badge variant={STATUS_VARIANT[it.status] ?? "neutral"}>{it.status.toLowerCase()}</Badge>}
                    {it.matchScore !== null && <span className={cn("text-xs font-semibold", getScoreColor(it.matchScore))}>{it.matchScore}% match</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{it.demonstratedSkills.length} demonstrated · {it.skillsNeedingEvidence.length} need evidence{it.experienceAlignment ? ` · experience: ${it.experienceAlignment}` : ""}{it.nextFollowUpDate ? ` · follow-up ${new Date(it.nextFollowUpDate).toLocaleDateString()}` : ""} · confidence {Math.round(it.confidence * 100)}%</p>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs">
                    {it.recommendedVersion && <Link href={`/dashboard/resume-builder/${it.recommendedVersion.id}`} className="text-indigo-700 inline-flex items-center gap-1"><FileText className="w-3 h-3" /> {it.recommendedVersion.tailored ? "Tailored version" : "Best version"}: {it.recommendedVersion.name}</Link>}
                    {!it.recommendedVersion && <Link href="/dashboard/resume-builder" className="text-indigo-700 inline-flex items-center gap-1"><FileText className="w-3 h-3" /> Create a tailored resume</Link>}
                    <Link href={it.interviewPrep.href} className="text-indigo-700 inline-flex items-center gap-1"><Mic className="w-3 h-3" /> {it.interviewPrep.suggestedType} interview{it.interviewPrep.topics.length ? `: ${it.interviewPrep.topics.join(", ")}` : ""}</Link>
                    {it.analysisId ? <Link href={`/dashboard/resume-analysis/${it.analysisId}`} className="text-gray-600 hover:underline">Analysis</Link> : <Link href="/dashboard/resume-analyzer" className="text-gray-600 hover:underline">Run an analysis</Link>}
                    {it.applicationId ? <Link href="/dashboard/applications" className="text-gray-600 hover:underline">Application</Link> : <Link href="/dashboard/applications" className="text-gray-600 hover:underline">Track as application</Link>}
                  </div>
                </div>
                <button type="button" aria-label="Details" onClick={() => setOpen((s) => ({ ...s, [id]: !s[id] }))} className="p-1 text-gray-400">{o ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
              </div>
              {o && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3 grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {it.factors.map((f) => <div key={f.key}><div className="flex justify-between text-xs"><span className="text-gray-700">{f.label} <span className="text-gray-400">w{f.weight}</span></span><span className="font-medium">{f.score ?? "n/a"}</span></div><ProgressBar value={f.score ?? 0} animated={false} className="h-1.5" barClassName={f.score === null ? "bg-gray-300" : "bg-indigo-500"} /><p className="text-[11px] text-gray-500">{f.evidence}</p></div>)}
                  </div>
                  <div className="text-xs space-y-2">
                    <p><span className="font-medium text-gray-800">Demonstrated:</span> {it.demonstratedSkills.join(", ") || "—"}</p>
                    <p><span className="font-medium text-gray-800">Need evidence / improvement:</span> {it.skillsNeedingEvidence.join(", ") || "—"}</p>
                    {it.educationAlignment && <p><span className="font-medium text-gray-800">Education:</span> {it.educationAlignment}</p>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {data.disclaimer}</p>
    </div>
  );
}
