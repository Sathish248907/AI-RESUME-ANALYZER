"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgressScore, ProgressComparison } from "@/services/progressService";

const ring = (score: number | null) => (score === null ? "text-gray-400" : score >= 75 ? "text-emerald-600" : score >= 50 ? "text-indigo-600" : score >= 25 ? "text-amber-600" : "text-rose-600");

/** The Career Progress Score with every dimension, weight, evidence and formula visible. */
export default function ProgressScoreCard({ progress, comparison, compact = false }: { progress: ProgressScore; comparison?: ProgressComparison | null; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const deltaFor = (key: string) => comparison?.dimensions.find((d) => d.key === key)?.delta ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className={cn("w-24 h-24 rounded-full border-8 flex items-center justify-center shrink-0", progress.overallScore === null ? "border-gray-200" : "border-indigo-100")}>
          <span className={cn("text-3xl font-bold tabular-nums", ring(progress.overallScore))}>{progress.overallScore ?? "–"}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{progress.label}</p>
          <p className="text-xs text-gray-600">{progress.coverage.included}/{progress.coverage.total} dimensions have evidence{progress.coverage.included < progress.coverage.total ? " — missing ones are excluded, not counted as zero" : ""}.</p>
          {comparison?.overallDelta !== null && comparison?.overallDelta !== undefined && <p className={cn("text-xs mt-0.5", comparison.overallDelta >= 0 ? "text-emerald-700" : "text-rose-700")}>{comparison.overallDelta >= 0 ? "+" : ""}{comparison.overallDelta} since {comparison.previousDayKey}</p>}
        </div>
      </div>
      <ul className="space-y-2">
        {progress.dimensions.map((d) => { const delta = deltaFor(d.key); return (
          <li key={d.key} className="rounded-xl border border-gray-200 bg-white">
            <button type="button" onClick={() => setOpen(open === d.key ? null : d.key)} aria-expanded={open === d.key} className="w-full flex items-center gap-3 p-3 text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-gray-900">{d.label} <span className="text-[11px] text-gray-500 font-normal">weight {d.weight}</span></span><span className={cn("text-sm font-semibold tabular-nums", ring(d.score))}>{d.score === null ? "no evidence" : d.score}{delta !== null && d.score !== null && <span className={cn("ml-1 text-[11px] font-normal", delta >= 0 ? "text-emerald-700" : "text-rose-700")}>({delta >= 0 ? "+" : ""}{delta})</span>}</span></div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden"><div className={cn("h-full rounded-full", d.score === null ? "bg-gray-200" : "bg-indigo-500")} style={{ width: `${d.score ?? 0}%` }} /></div>
              </div>
              <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open === d.key && "rotate-180")} />
            </button>
            {(open === d.key || !compact) && open === d.key && (
              <div className="px-3 pb-3 text-xs text-gray-700 space-y-1">
                <p><Info className="w-3 h-3 inline mr-1 text-gray-400" />{d.explanation}</p>
                <p className="font-mono text-[11px] text-gray-500">{d.formula}</p>
                {d.evidence.length > 0 && <ul className="list-disc pl-4">{d.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              </div>
            )}
          </li>
        ); })}
      </ul>
      <p className="text-[11px] text-gray-500">{progress.disclaimer}</p>
    </div>
  );
}
