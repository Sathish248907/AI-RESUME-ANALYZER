"use client";

import Link from "next/link";
import { ArrowRight, Info, ShieldAlert, Sparkles, TrendingDown } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import type { Assessment } from "@/services/careerService";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; cls: string }> = {
  demonstrated: { label: "Demonstrated", cls: "bg-green-50 text-green-800 border-green-200" }, needs_improvement: { label: "Needs improvement", cls: "bg-amber-50 text-amber-800 border-amber-200" }, learning_in_progress: { label: "Learning", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  self_reported: { label: "Self-reported", cls: "bg-indigo-50 text-indigo-800 border-indigo-200" }, not_demonstrated: { label: "Not demonstrated", cls: "bg-red-50 text-red-800 border-red-200" }, not_assessed: { label: "Not assessed", cls: "bg-gray-100 text-gray-700 border-gray-200" },
};
const color = (n: number | null) => (n === null ? "bg-gray-300" : n >= 80 ? "bg-green-500" : n >= 65 ? "bg-indigo-500" : n >= 45 ? "bg-amber-500" : "bg-red-500");

/** Full readiness report: overall, components with evidence, skill-wise table, strengths/improvements, missing evidence, next actions. */
export default function CareerReadinessAssessment({ assessment }: { assessment: Assessment }) {
  const a = assessment;
  const insufficient = a.overallScore === null;
  return (
    <div className="space-y-5 text-sm">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 flex flex-wrap items-center gap-5">
        <div className={cn("w-24 h-24 rounded-full flex flex-col items-center justify-center text-white", color(a.overallScore))}>
          <span className="text-3xl font-bold leading-none">{insufficient ? "—" : a.overallScore}</span>
          {!insufficient && <span className="text-[10px] uppercase tracking-wide">/ 100</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Readiness for</p>
          <h2 className="text-xl font-bold text-gray-900">{a.targetRole}</h2>
          <p className={cn("font-medium mt-1", insufficient ? "text-gray-600" : "text-gray-800")}>{a.readinessLabel}</p>
          <p className="text-xs text-gray-500 mt-1">{a.coverage ? `${a.coverage.componentsIncluded}/${a.coverage.componentsTotal} evidence areas available` : ""} · {new Date(a.createdAt).toLocaleString()} · {a.method}</p>
        </div>
      </div>
      {insufficient && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-xs inline-flex items-start gap-2"><ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" /> Fewer than two evidence areas have data, so no overall score is given. Add the missing evidence below and re-run.</p>}

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Score breakdown</h3>
        <div className="space-y-3">
          {a.components.map((c) => (
            <div key={c.key} className="rounded-xl border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-800">{c.label} <span className="text-xs text-gray-400">weight {c.weight}</span></span><span className="font-semibold tabular-nums">{c.included ? c.score : <span className="text-gray-400 text-xs">no evidence</span>}</span></div>
              <ProgressBar value={c.included ? (c.score ?? 0) : 0} animated={false} className="h-1.5 mt-1" barClassName={color(c.included ? c.score : null)} />
              {c.evidence.length > 0 && <ul className="mt-1.5 text-xs text-gray-600 list-disc pl-4 space-y-0.5">{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              {c.missing.length > 0 && <ul className="mt-1.5 text-xs text-amber-800 list-disc pl-4 space-y-0.5">{c.missing.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-xl border border-green-100 bg-green-50/40 p-4"><h3 className="font-semibold text-green-900 mb-1 inline-flex items-center gap-1"><Sparkles className="w-4 h-4" /> Strengths</h3>{a.strengths.length ? <ul className="list-disc pl-4 text-xs text-gray-700 space-y-0.5">{a.strengths.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="text-xs text-gray-500">None stand out yet.</p>}</section>
        <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4"><h3 className="font-semibold text-amber-900 mb-1 inline-flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Improvement areas</h3>{a.improvements.length ? <ul className="list-disc pl-4 text-xs text-gray-700 space-y-0.5">{a.improvements.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="text-xs text-gray-500">No weak areas among the evidence available.</p>}</section>
      </div>

      {a.missingEvidence.length > 0 && (
        <section className="rounded-xl border border-gray-200 p-4"><h3 className="font-semibold text-gray-900 mb-1">Missing or insufficient evidence</h3><ul className="list-disc pl-4 text-xs text-gray-700 space-y-0.5">{a.missingEvidence.map((m, i) => <li key={i}>{m}</li>)}</ul><p className="text-[11px] text-gray-500 mt-2">Missing evidence lowers confidence, not the score.</p></section>
      )}

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Skill-wise readiness</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600"><tr><th className="text-left px-3 py-2">Skill</th><th className="text-left px-3 py-2">Required by</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Evidence</th></tr></thead>
            <tbody>
              {a.skills.map((s) => (
                <tr key={s.skillName} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.skillName}{s.priority === "required" && <Badge variant="error" className="ml-1">required</Badge>}</td>
                  <td className="px-3 py-2 text-gray-500">{s.requiredBy.map((r) => r.replace(/_/g, " ")).join(", ")}</td>
                  <td className="px-3 py-2"><span className={cn("inline-flex px-2 py-0.5 rounded-full border font-medium", STATUS[s.status]?.cls ?? STATUS.not_assessed.cls)}>{STATUS[s.status]?.label ?? s.status}</span></td>
                  <td className="px-3 py-2 text-gray-600">{s.evidence.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-gray-900 mb-2">Recommended next actions</h3>
        <ul className="space-y-1.5">{a.nextActions.map((n, i) => <li key={i} className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 flex items-center justify-between gap-2"><span><span className="font-medium text-gray-900">{n.title}</span><span className="block text-xs text-gray-600">{n.reason}</span></span><Link href={n.href} className="text-xs font-medium text-indigo-700 inline-flex items-center gap-1 whitespace-nowrap">Go <ArrowRight className="w-3 h-3" /></Link></li>)}</ul>
      </section>
      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {a.disclaimer ?? "Scores summarise the evidence in your records; they are not a prediction of interview or job outcomes."}</p>
    </div>
  );
}
