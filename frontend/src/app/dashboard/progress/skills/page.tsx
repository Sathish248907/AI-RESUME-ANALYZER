"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, CheckCircle2, AlertCircle, HelpCircle, TrendingUp, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import MetricCard from "@/components/progress/MetricCard";
import { TrendChart } from "@/components/progress/ProgressCharts";
import { getSkillAnalytics, type SkillAnalytics, type SkillEntry } from "@/services/progressService";
import { cn, formatDate } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { demonstrated: "Demonstrated", needs_improvement: "Needs improvement", not_demonstrated: "Not demonstrated", not_assessed: "Not assessed", learning_in_progress: "Learning" };

function SkillRow({ s }: { s: SkillEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border border-gray-200 rounded-xl bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full p-3 text-left flex items-center justify-between gap-2">
        <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{s.skillName} {s.recentImprovement && <TrendingUp className="w-3.5 h-3.5 inline text-emerald-600" aria-label="Recently improved" />}</p><p className="text-[11px] text-gray-500">{STATUS_LABEL[s.status] ?? s.status}{s.lastAssessedAt ? ` · last evidence ${formatDate(s.lastAssessedAt)}` : ""}{s.interview ? ` · interview mean ${s.interview.mean}% (${s.interview.attempts})` : ""}{s.learning.totalTasks ? ` · ${s.learning.completedTasks}/${s.learning.totalTasks} tasks` : ""}</p></div>
        <Badge variant={s.bucket === "demonstrated" ? "success" : s.bucket === "needs_practice" ? "warning" : "neutral"}>{s.bucket.replace("_", " ")}</Badge>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs text-gray-700">
          {s.notes.map((n, i) => <p key={i} className="text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">{n}</p>)}
          <div><p className="font-semibold text-gray-800">Evidence sources</p><ul className="list-disc pl-4">{s.sources.map((x, i) => <li key={i}>{x.source.replace("_", " ")} · {x.method} · {formatDate(x.date)} — {x.detail}</li>)}</ul></div>
          {s.history.length > 0 && <div><p className="font-semibold text-gray-800">Assessment history</p><ul className="list-disc pl-4">{s.history.map((h, i) => <li key={i}>{formatDate(h.date)} · {h.targetRole}: {STATUS_LABEL[h.status] ?? h.status}{typeof h.score === "number" ? ` (${h.score})` : ""}</li>)}</ul></div>}
          <div className="flex flex-wrap gap-1.5">{s.links.map((l) => <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-100">{l.label} <ArrowRight className="w-3 h-3" /></Link>)}</div>
        </div>
      )}
    </li>
  );
}

export default function SkillGrowthPage() {
  const { user, ready } = useAuth();
  const [data, setData] = useState<SkillAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"demonstrated" | "needsPractice" | "improving" | "notAssessed">("needsPractice");
  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(null); try { setData(await getSkillAnalytics()); } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); } }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  const tabs = [{ key: "demonstrated", label: "Demonstrated", icon: CheckCircle2 }, { key: "needsPractice", label: "Needs practice", icon: AlertCircle }, { key: "improving", label: "Recently improved", icon: TrendingUp }, { key: "notAssessed", label: "Not assessed", icon: HelpCircle }] as const;
  return (
    <ProgressPageShell current="/dashboard/progress/skills" title="Skill growth" description="Skill status combined from your skill-gap analysis, mock-interview topic scores and roadmap tasks, with the source and date of every assessment." icon={Brain} loading={loading} error={error} onRetry={load}>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Skills tracked" value={data.totals.tracked} unavailable="Generate a roadmap to track skills" /><MetricCard label="Demonstrated" value={data.totals.demonstrated} tone="emerald" /><MetricCard label="Need practice" value={data.totals.needsPractice} tone="amber" /><MetricCard label="Recently improved" value={data.totals.improving} tone="indigo" definition={data.definitions.improving} /><MetricCard label="Not assessed" value={data.totals.notAssessed} tone="slate" />
          </div>
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">{data.definitions.status} Improved assessment results show practice progress, not confirmed real-world proficiency; a missing resume keyword never proves a skill is absent.</p>
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Skills</CardTitle></CardHeader><CardContent className="space-y-3">
              <div role="tablist" className="flex flex-wrap gap-1 text-sm">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)} className={cn("px-3 py-1.5 rounded-lg border inline-flex items-center gap-1", tab === t.key ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700")}><t.icon className="w-3.5 h-3.5" /> {t.label} ({data[t.key].length})</button>)}</div>
              {data[tab].length === 0 ? <p className="text-sm text-gray-500">Nothing in this group{data.totals.tracked === 0 ? ". Generate a learning roadmap or run analyses to start tracking skills" : ""}.</p> : <ul className="space-y-2">{data[tab].map((s) => <SkillRow key={s.key} s={s} />)}</ul>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Assessment history</CardTitle></CardHeader><CardContent>
              <TrendChart data={data.assessmentHistory.map((a) => ({ date: a.date, score: a.total ? Math.round((a.demonstrated / a.total) * 100) : null, role: a.targetRole }))} color="#7c3aed" labelKey="role" emptyText="Run readiness assessments to see how the share of demonstrated skills changes." />
              <p className="text-[11px] text-gray-500 mt-2">Share of required skills marked demonstrated in each Career Coach assessment.</p>
              <Link href="/dashboard/learning/skill-gaps" className="text-sm text-indigo-700 hover:underline mt-3 inline-block">Open skill gap analysis →</Link>
            </CardContent></Card>
          </div>
        </>
      )}
    </ProgressPageShell>
  );
}
