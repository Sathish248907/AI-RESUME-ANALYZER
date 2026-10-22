"use client";

import { RefreshCw, ShieldCheck, Info } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import type { QualityReport, QualityIssue } from "@/services/resumeBuilderService";
import { cn } from "@/lib/utils";

interface Props { report: QualityReport | null; busy: boolean; onRun: () => void; onLocate?: (issue: QualityIssue) => void; dirty?: boolean }

const SEV: Record<QualityIssue["severity"], "error" | "warning" | "neutral"> = { high: "error", medium: "warning", low: "neutral" };
const color = (n: number) => (n >= 85 ? "bg-green-500" : n >= 70 ? "bg-indigo-500" : n >= 50 ? "bg-amber-500" : "bg-red-500");

export default function ResumeQualityPanel({ report, busy, onRun, onLocate, dirty }: Props) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600">Deterministic checks on the document itself. Separate from the job-match score.</p>
        <Button size="sm" variant="outline" onClick={onRun} loading={busy}><RefreshCw className="w-3.5 h-3.5 mr-1" /> {report ? "Re-check" : "Run checks"}</Button>
      </div>
      {!report ? <p className="text-sm text-gray-500">Run the checks to get a quality score with explanations.</p> : (
        <>
          {dirty && <p className="text-[11px] text-amber-700">You have edited since this check; re-run for current results.</p>}
          <div className="rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className={cn("w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold", color(report.overall))}>{report.overall}</div>
            <div>
              <p className="font-semibold text-gray-900 inline-flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-indigo-600" /> {report.label} resume quality</p>
              <p className="text-xs text-gray-500">{report.issues.length} finding{report.issues.length === 1 ? "" : "s"} · checked {new Date(report.checkedAt).toLocaleTimeString()}{report.jobTitle ? ` · keywords vs “${report.jobTitle}”` : ""}</p>
            </div>
          </div>
          <div className="space-y-2">
            {report.categories.map((c) => (
              <div key={c.key} title={c.explanation}>
                <div className="flex justify-between text-xs"><span className="text-gray-700">{c.label} <span className="text-gray-400">(weight {c.weight})</span></span><span className="font-medium tabular-nums">{c.score}</span></div>
                <ProgressBar value={c.score} animated={false} className="h-1.5" barClassName={color(c.score)} />
              </div>
            ))}
          </div>
          {report.keywordCoverage && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs">
              <p className="font-medium text-gray-800">Job keywords: {report.keywordCoverage.percent}% present ({report.keywordCoverage.found.length}/{report.keywordCoverage.total})</p>
              {report.keywordCoverage.missing.length > 0 && <p className="text-gray-600 mt-1">Missing: {report.keywordCoverage.missing.join(", ")} — add only where you genuinely have the skill.</p>}
            </div>
          )}
          <ul className="space-y-2">
            {report.issues.map((i) => (
              <li key={i.id} className="rounded-lg border border-gray-200 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2"><Badge variant={SEV[i.severity]}>{i.severity}</Badge><span className="text-xs text-gray-500">{i.category}</span>{i.sectionId && onLocate && <button type="button" onClick={() => onLocate(i)} className="text-xs text-indigo-700 hover:underline">show in editor</button>}</div>
                <p className="text-gray-900 mt-1">{i.message}</p>
                <p className="text-xs text-gray-600">{i.suggestion}</p>
              </li>
            ))}
            {report.issues.length === 0 && <li className="text-sm text-green-700">No issues found.</li>}
          </ul>
          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {report.disclaimer}</p>
        </>
      )}
    </div>
  );
}
