"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Compass, LogIn, User, Target, Briefcase, CalendarDays, MessageSquare, ArrowRight, Trophy, Mic, Map, FileText, Lightbulb, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import { ProgressBar } from "@/components/common/ProgressBar";
import { SkeletonCard, SkeletonStatRow } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import CareerRecommendations from "@/components/career/CareerRecommendations";
import { InterviewTrendChart, PipelineChart, ReadinessTrendChart } from "@/components/career/CareerProgressCharts";
import { getCareerDashboard, getRecommendations, updateRecommendation, type CareerDashboard, type Recommendation } from "@/services/careerService";
import CareerNav from "@/components/career/CareerNav";
import { cn, formatDate } from "@/lib/utils";

export default function CareerCoachDashboardPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [dash, setDash] = useState<CareerDashboard | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try { const [d, r] = await Promise.all([getCareerDashboard(), getRecommendations()]); setDash(d.dashboard); setRecs(r); }
    catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  async function onStatus(r: Recommendation, status: Recommendation["status"]) {
    setBusyId(r.id);
    try { const u = await updateRecommendation(r.id, status); setRecs((all) => all.map((x) => (x.id === u.id ? u : x))); if (status === "done") toast.success("Marked done."); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); }
  }

  if (!ready || (user && loading)) return <div className="max-w-6xl mx-auto px-4 py-10 space-y-4"><SkeletonStatRow count={4} /><SkeletonCard lines={6} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to open your career coach" description="Readiness, recommendations, job priorities and a weekly plan are derived from your own saved records." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career", icon: LogIn }} /></div>;
  if (error || !dash) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={AlertTriangle} title="Could not load the career dashboard" description={error ?? ""} action={{ label: "Retry", onClick: load }} /></div>;

  const r = dash.readiness.latest;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Compass className="w-7 h-7 text-indigo-600" /> Career coach</h1><p className="text-gray-500 mt-1">Where you stand for your target role, built from your real records, and what to do next.</p></div>
        <Link href="/dashboard/career/coach"><Button><MessageSquare className="w-4 h-4 mr-1" /> Ask the coach</Button></Link>
      </div>
      <CareerNav current="/dashboard/career" />
      {!dash.hasProfile && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2"><span>Set your target roles and preferences so assessments and priorities are specific to you.</span><Link href="/dashboard/career/profile"><Button size="sm" variant="outline">Create profile</Button></Link></div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Readiness" value={r ? (r.overallScore === null ? "—" : `${r.overallScore}`) : "—"} sub={r ? `${r.readinessLabel} · ${r.targetRole}` : "No assessment yet"} href="/dashboard/career/assessment" tone={r && r.overallScore !== null ? (r.overallScore >= 65 ? "green" : "amber") : "gray"} />
        <Stat label="Resume quality" value={dash.resume.bestQuality !== null ? `${dash.resume.bestQuality}` : "—"} sub={`${dash.resume.versions} version${dash.resume.versions === 1 ? "" : "s"} · ${dash.resume.uploads} upload${dash.resume.uploads === 1 ? "" : "s"}`} href="/dashboard/resume-builder" tone="indigo" />
        <Stat label="Best job match" value={dash.jobMatch.best ? `${dash.jobMatch.best.matchScore}%` : "—"} sub={dash.jobMatch.best ? dash.jobMatch.best.jobTitle : `${dash.jobMatch.analyses} analyses`} href={dash.jobMatch.best ? `/dashboard/resume-analysis/${dash.jobMatch.best.id}` : "/dashboard/resume-analyzer"} tone="blue" />
        <Stat label="Active applications" value={String(dash.applications.active)} sub={`${dash.applications.interviews} at interview stage`} href="/dashboard/applications" tone="pink" />
      </div>

      {dash.nextAction && (
        <Link href={dash.nextAction.href} className="block rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white px-5 py-4 hover:border-indigo-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Recommended next action</p>
          <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">{dash.nextAction.title} <ArrowRight className="w-5 h-5 text-indigo-500" /></p>
          <p className="text-sm text-gray-600">{dash.nextAction.reason}</p>
        </Link>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-500" /> Recommendations ({dash.openRecommendations} open)</CardTitle></CardHeader><CardContent><CareerRecommendations recommendations={recs} busyId={busyId} onStatus={onStatus} compact /></CardContent></Card>
        <div className="space-y-6">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="w-4 h-4 text-red-500" /> Strengths & priority gaps</CardTitle></CardHeader><CardContent className="text-sm space-y-2">
            {dash.strengths.length ? <ul className="text-xs text-green-800 space-y-0.5">{dash.strengths.map((s) => <li key={s}>✓ {s}</li>)}</ul> : <p className="text-xs text-gray-500">Run an assessment to see strengths.</p>}
            {dash.priorityGaps.length > 0 && <div className="flex flex-wrap gap-1">{dash.priorityGaps.map((g) => <Badge key={g.skillName} variant="error">{g.skillName}</Badge>)}</div>}
            <Link href="/dashboard/learning/skill-gaps" className="text-xs text-indigo-700 hover:underline">All skill gaps →</Link>
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="w-4 h-4 text-indigo-600" /> This week</CardTitle></CardHeader><CardContent className="text-sm">
            {dash.plan ? <><ProgressBar value={dash.plan.percent} animated={false} /><p className="text-xs text-gray-600 mt-1">{dash.plan.doneRequired}/{dash.plan.required} required done · {dash.plan.tasksDueToday} due today{dash.plan.overdue ? ` · ${dash.plan.overdue} overdue` : ""}</p></> : <p className="text-xs text-gray-500">No plan for this week yet.</p>}
            <Link href="/dashboard/career/plan" className="text-xs text-indigo-700 hover:underline">Open weekly plan →</Link>
          </CardContent></Card>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card><CardHeader><CardTitle className="text-base">Readiness trend</CardTitle></CardHeader><CardContent><ReadinessTrendChart trend={dash.readiness.trend} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-1"><Mic className="w-4 h-4 text-pink-600" /> Interview scores</CardTitle></CardHeader><CardContent><InterviewTrendChart trend={dash.interviews.trend} />{dash.interviews.weakTopics.length > 0 && <p className="text-xs text-gray-600 mt-2">Weak: {dash.interviews.weakTopics.join(", ")}</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-1"><Briefcase className="w-4 h-4 text-indigo-600" /> Application pipeline</CardTitle></CardHeader><CardContent><PipelineChart byStatus={dash.applications.byStatus} /></CardContent></Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-1"><Map className="w-4 h-4 text-emerald-600" /> Learning roadmap</CardTitle></CardHeader><CardContent className="text-sm">
          {dash.learning ? <><p className="font-medium text-gray-900 truncate">{dash.learning.title}</p><ProgressBar value={dash.learning.percent} animated={false} className="my-1" /><p className="text-xs text-gray-600">{dash.learning.completedTasks}/{dash.learning.requiredTasks} tasks{dash.learning.nextTask ? ` · next: ${dash.learning.nextTask}` : ""}</p></> : <p className="text-xs text-gray-500">No active roadmap.</p>}
          <Link href="/dashboard/learning" className="text-xs text-indigo-700 hover:underline">Open →</Link>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-1"><FileText className="w-4 h-4 text-blue-600" /> Upcoming follow-ups</CardTitle></CardHeader><CardContent className="text-sm">
          {dash.applications.upcoming.length ? <ul className="space-y-1 text-xs">{dash.applications.upcoming.map((a) => <li key={a.id} className={cn(a.overdue && "text-red-700")}>{formatDate(a.nextFollowUpDate)} · {a.companyName} — {a.jobTitle}{a.overdue ? " (overdue)" : ""}</li>)}</ul> : <p className="text-xs text-gray-500">Nothing due in the next two weeks.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-500" /> Recent achievements</CardTitle></CardHeader><CardContent className="text-sm">
          {dash.achievements.length ? <ul className="space-y-1 text-xs">{dash.achievements.map((a, i) => <li key={i}>{formatDate(a.date)} · {a.title}</li>)}</ul> : <p className="text-xs text-gray-500">Completed tasks, milestones and interviews from the last two weeks appear here.</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, href, tone }: { label: string; value: string; sub: string; href: string; tone: "green" | "amber" | "gray" | "indigo" | "blue" | "pink" }) {
  const tones = { green: "text-green-700", amber: "text-amber-700", gray: "text-gray-500", indigo: "text-indigo-700", blue: "text-blue-700", pink: "text-pink-700" };
  return <Link href={href} className="rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-300"><p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p><p className={cn("text-2xl font-bold", tones[tone])}>{value}</p><p className="text-xs text-gray-500 truncate">{sub}</p></Link>;
}
