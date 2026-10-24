"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, FileText, Mic, BookOpen, Briefcase, Target, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import EmptyState from "@/components/common/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import DateRangeFilter from "@/components/progress/DateRangeFilter";
import MetricCard from "@/components/progress/MetricCard";
import { TrendChart, ActivityBarChart, StatusDoughnut, CategoryBarChart, MultiTrendChart, SERIES_COLORS } from "@/components/progress/ProgressCharts";
import { getOverview, getCareerProgress, type AnalyticsRange, type OverviewAnalytics, type ProgressScore } from "@/services/progressService";
import { STATUS_LABELS, type ApplicationStatus } from "@/services/jobApplicationService";

const RANGE_KEY = "resumeai_progress_range_v1";

export default function AdvancedAnalyticsPage() {
  const { user, ready } = useAuth();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [data, setData] = useState<OverviewAnalytics | null>(null);
  const [progress, setProgress] = useState<ProgressScore | null>(null);
  const [history, setHistory] = useState<Array<{ dayKey: string; overallScore: number | null; dimensions: Array<{ key: string; score: number | null }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { try { const s = window.localStorage.getItem(RANGE_KEY) as AnalyticsRange | null; if (s && ["7d", "30d", "90d", "all"].includes(s)) setRange(s); } catch { /* ignore */ } }, []);
  const load = useCallback(async (r: AnalyticsRange, soft = false) => {
    if (!user) return;
    if (soft) setRefreshing(true); else setLoading(true);
    setError(null);
    try { const [o, cp] = await Promise.all([getOverview(r), getCareerProgress()]); setData(o.analytics); setProgress(o.progress); setHistory(cp.history); }
    catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); setRefreshing(false); }
  }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(range); }, [ready, user, load, range]);
  const onRange = (r: AnalyticsRange) => { setRange(r); try { window.localStorage.setItem(RANGE_KEY, r); } catch { /* ignore */ } };

  const dims = progress?.dimensions ?? [];
  const historyRows = history.map((h) => ({ label: h.dayKey.slice(5), overall: h.overallScore, ...Object.fromEntries(h.dimensions.map((d) => [d.key, d.score])) }));
  const series = [{ key: "overall", label: "Overall", color: "#111827" }, ...dims.map((d, i) => ({ key: d.key, label: d.label, color: SERIES_COLORS[i % SERIES_COLORS.length] }))];

  return (
    <ProgressPageShell current="/dashboard/progress/analytics" title="Advanced analytics" description="Trends from your resume versions, analyses, mock interviews, learning roadmap, applications and readiness assessments." icon={BarChart3} loading={loading} error={error} onRetry={() => load(range)} actions={<DateRangeFilter value={range} onChange={onRange} disabled={refreshing} />}>
      {data && (
        <>
          {data.emptyState && <EmptyState icon={Info} title="Not enough activity yet" description={data.emptyState} compact action={{ label: "Analyse a resume", href: "/dashboard/resume-analyzer" }} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.kpis.map((k) => <MetricCard key={k.label} label={k.label} value={k.current} comparison={k} definition={k.definition} />)}</div>
          <p className="text-[11px] text-gray-500">Range: {data.from ? new Date(data.from).toLocaleDateString() : "all time"} → {new Date(data.to).toLocaleDateString()}. Comparisons use the preceding window of the same length and appear only when it contains data.</p>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4 text-sky-600" /> Resume quality trend</CardTitle></CardHeader><CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2"><MetricCard label="Best quality" value={data.resume.quality.best} unit="/100" /><MetricCard label="Latest version" value={data.resume.quality.latest} unit="/100" /><MetricCard label="Original baseline" value={data.resume.quality.originalBaseline} unit="/100" unavailable="No original parsed" /></div>
              <TrendChart data={data.resume.qualityTrend} color="#0284c7" labelKey="name" emptyText="Edit resume versions in the Resume Builder to see quality over time." /><p className="text-[11px] text-gray-500">{data.resume.definitions.quality}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-4 h-4 text-indigo-600" /> Job-match score trend</CardTitle></CardHeader><CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2"><MetricCard label="Average (range)" value={data.resume.match.average} unit="/100" comparison={data.resume.match} /><MetricCard label="Best (range)" value={data.resume.match.best} unit="/100" /><MetricCard label="Analyses" value={data.resume.match.analyses} /></div>
              <TrendChart data={data.resume.matchTrend} labelKey="jobTitle" emptyText="Run analyses against job descriptions to see match scores over time." />
              {data.resume.match.byRole.length > 0 && <CategoryBarChart data={data.resume.match.byRole} xKey="role" valueKey="average" color="#4f46e5" height="h-36" />}<p className="text-[11px] text-gray-500">{data.resume.definitions.match}</p></CardContent></Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mic className="w-4 h-4 text-pink-600" /> Mock interview performance</CardTitle></CardHeader><CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2"><MetricCard label="Average (range)" value={data.interviews.score.average} unit="%" comparison={data.interviews.score} /><MetricCard label="Best (range)" value={data.interviews.score.best} unit="%" /><MetricCard label="Completed" value={data.interviews.sessions.completed} /></div>
              <TrendChart data={data.interviews.trend} color="#db2777" labelKey="type" emptyText="Complete mock interviews to see your score trend." />
              {data.interviews.byType.length > 0 && <CategoryBarChart data={data.interviews.byType} xKey="type" valueKey="average" color="#db2777" height="h-36" />}
              {data.interviews.coding && <p className="text-xs text-gray-700">Coding sessions: {data.interviews.coding.sessions}, average {data.interviews.coding.average ?? "n/a"}%.</p>}
              <div className="flex flex-wrap gap-1 text-xs">{data.interviews.weakTopics.map((t) => <span key={t.topic} className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-100">{t.topic} {t.mean}%</span>)}{data.interviews.strongTopics.map((t) => <span key={t.topic} className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100">{t.topic} {t.mean}%</span>)}</div>
              <p className="text-[11px] text-gray-500">{data.interviews.definitions.score} {data.interviews.definitions.weak}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-600" /> Learning roadmap completion</CardTitle></CardHeader><CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2"><MetricCard label="Tasks done (range)" value={data.learning.tasksCompleted.current} comparison={data.learning.tasksCompleted} /><MetricCard label="Study minutes (range)" value={data.learning.studyMinutesInRange} /><MetricCard label="Checkpoints passed" value={data.learning.checkpointsPassed} /></div>
              {data.learning.roadmaps.length === 0 && <p className="text-xs text-gray-500">No learning roadmap yet. <Link href="/dashboard/learning/new" className="text-indigo-700 hover:underline">Generate one</Link>.</p>}
              {data.learning.roadmaps.map((r) => <div key={r.id}><div className="flex justify-between text-sm"><Link href={`/dashboard/learning/${r.id}`} className="text-gray-900 hover:underline truncate">{r.title} <span className="text-xs text-gray-500">({r.status})</span></Link><span className="tabular-nums text-gray-700">{r.percent}%</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${r.percent}%` }} /></div><p className="text-[11px] text-gray-500">{r.completedTasks}/{r.requiredTasks} required tasks · {r.completedMilestones}/{r.totalMilestones} milestones · {r.studiedMinutes} min studied</p></div>)}
            </CardContent></Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-amber-600" /> Application status distribution</CardTitle></CardHeader><CardContent className="space-y-2">
              <StatusDoughnut data={Object.entries(data.applications.byStatus).map(([key, value]) => ({ key, label: STATUS_LABELS[key as ApplicationStatus] ?? key, value }))} />
              <div className="grid grid-cols-3 gap-2"><MetricCard label="Response rate" value={data.applications.rates.responseRate} unit="%" unavailable={`Needs ${data.applications.rates.minSample}+ submitted (${data.applications.rates.sampleSize})`} definition={data.applications.rates.definitions.responseRate} /><MetricCard label="Interview rate" value={data.applications.rates.interviewRate} unit="%" unavailable="Not enough data" definition={data.applications.rates.definitions.interviewRate} /><MetricCard label="Offer rate" value={data.applications.rates.offerRate} unit="%" unavailable="Not enough data" definition={data.applications.rates.definitions.offerRate} /></div>
              <Link href="/dashboard/progress/applications" className="text-sm text-indigo-700 hover:underline">Full application funnel →</Link></CardContent></Card>
            <Card><CardHeader><CardTitle>Career readiness history</CardTitle></CardHeader><CardContent className="space-y-2">
              <TrendChart data={data.readiness.map((r) => ({ date: r.date, score: r.score, role: r.targetRole }))} color="#7c3aed" labelKey="role" emptyText="Run readiness assessments in the Career Coach to track them here." />
              <MultiTrendChart rows={historyRows} series={series} />
              <p className="text-[11px] text-gray-500">Readiness comes from the Career Coach assessment; the progress-score history is snapshotted once per day when you open these pages.</p></CardContent></Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>Weekly activity</CardTitle></CardHeader><CardContent><ActivityBarChart data={data.activity.weekly} xKey="weekStart" /><p className="text-[11px] text-gray-500 mt-1">Recorded activities per week (learning, interviews, resume, applications, career).</p></CardContent></Card>
            <Card><CardHeader><CardTitle>Monthly activity</CardTitle></CardHeader><CardContent><ActivityBarChart data={data.activity.monthly} xKey="month" color="#0891b2" /></CardContent></Card>
          </div>
        </>
      )}
    </ProgressPageShell>
  );
}
