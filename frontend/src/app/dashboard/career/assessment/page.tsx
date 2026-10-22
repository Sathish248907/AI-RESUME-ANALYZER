"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Target, LogIn, RefreshCw, History, Mic } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import CareerReadinessAssessment from "@/components/career/CareerReadinessAssessment";
import { createAssessment, getAssessment, getInterviewPrep, getProfile, listAssessments, type Assessment, type AssessmentSummary, type InterviewPrep } from "@/services/careerService";
import CareerNav from "@/components/career/CareerNav";
import { cn } from "@/lib/utils";

export default function CareerAssessmentPage() {
  return <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>}><Inner /></Suspense>;
}

function Inner() {
  const toast = useToast();
  const params = useSearchParams();
  const { user, ready } = useAuth();
  const [role, setRole] = useState("");
  const [custom, setCustom] = useState("");
  const [current, setCurrent] = useState<Assessment | null>(null);
  const [history, setHistory] = useState<AssessmentSummary[]>([]);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, h] = await Promise.all([getProfile(), listAssessments()]);
      const r = p?.targetRoles?.[0] ?? "";
      setRole((x) => x || r); setHistory(h);
      const id = params?.get("id") ?? h[0]?.id;
      if (id) { const a = await getAssessment(id); setCurrent(a); if (!p?.targetRoles?.[0]) setRole(a.targetRole); }
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, params, toast]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);
  useEffect(() => { if (!user || !role) return; getInterviewPrep(role).then(setPrep).catch(() => setPrep(null)); }, [user, role, current?.id]);

  async function run() {
    const target = role === "custom" ? custom.trim() : role;
    if (target.length < 2) { toast.error("Pick a target role."); return; }
    setRunning(true);
    try { const r = await createAssessment(target); setCurrent(r.assessment); setHistory(await listAssessments()); toast.success(r.assessment.overallScore === null ? "Assessment saved — more evidence needed for a score." : `Readiness ${r.assessment.overallScore}/100 for ${target}.`); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setRunning(false); }
  }

  if (!ready || (user && loading)) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to assess your readiness" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career/assessment", icon: LogIn }} /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Target className="w-7 h-7 text-red-500" /> Readiness assessment</h1><p className="text-gray-500 mt-1">A transparent score per target role, with the evidence behind every component. Re-run after you add records.</p></div>
      <CareerNav current="/dashboard/career/assessment" />
      <Card><CardContent className="p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm flex-1 min-w-[14rem]"><span className="font-medium text-gray-700">Target role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Select…</option>{TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}{role && !TARGET_ROLES.includes(role as (typeof TARGET_ROLES)[number]) && role !== "custom" && <option value={role}>{role}</option>}<option value="custom">Other…</option></select></label>
        {role === "custom" && <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={80} placeholder="Role title" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />}
        <Button onClick={run} loading={running}><RefreshCw className="w-4 h-4 mr-1" /> {current ? "Re-assess" : "Assess readiness"}</Button>
      </CardContent></Card>

      {current ? <CareerReadinessAssessment assessment={current} /> : <Card><CardContent className="p-8"><EmptyState icon={Target} title="No assessment yet" description="Pick a target role and run the assessment. Evidence comes from your resumes, analyses, skill gaps, roadmap and mock interviews — no AI is used for scoring." /></CardContent></Card>}

      {prep && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Mic className="w-5 h-5 text-pink-600" /> Interview preparation for {prep.targetRole}</CardTitle></CardHeader><CardContent className="text-sm grid md:grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-gray-800 mb-1">Recommended sessions</p>
            <ul className="space-y-1.5">{prep.recommendedSessions.map((s) => <li key={s.key} className="rounded-lg border border-gray-200 px-3 py-2"><Link href={s.href} className="font-medium text-indigo-700 hover:underline">{s.title}</Link><p className="text-xs text-gray-600">{s.interviewType} · {s.difficulty} · {s.reason}</p></li>)}</ul>
            {prep.untestedRequirements.length > 0 && <p className="text-xs text-gray-600 mt-2">Never practised: {prep.untestedRequirements.join(", ")}</p>}
          </div>
          <div>
            <p className="font-medium text-gray-800 mb-1">Practice plan</p>
            <ol className="space-y-1.5 text-xs">{prep.practicePlan.map((p) => <li key={p.step} className="flex gap-2"><span className="font-semibold text-gray-500">{p.step}.</span><span><Link href={p.href} className="text-gray-900 hover:underline">{p.title}</Link> <span className="text-gray-500">· {p.minutes} min — {p.detail}</span></span></li>)}</ol>
            {prep.weakTopics.length > 0 && <p className="text-xs text-red-700 mt-2">Recurring weak topics: {prep.weakTopics.map((w) => `${w.topic} (${w.mean}%)`).join(", ")}</p>}
            {prep.codingTasks.length > 0 && <p className="text-xs text-gray-600 mt-1">Related roadmap exercises: {prep.codingTasks.map((c) => c.title).join("; ")}</p>}
            <p className="text-[11px] text-gray-500 mt-2">{prep.sessionsCompleted} completed session{prep.sessionsCompleted === 1 ? "" : "s"} on record.</p>
          </div>
        </CardContent></Card>
      )}

      {history.length > 0 && (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4 text-gray-500" /> Assessment history</CardTitle></CardHeader><CardContent>
          <ul className="divide-y divide-gray-100 text-sm">{history.map((h) => <li key={h.id} className={cn("py-2 flex flex-wrap items-center gap-3", current?.id === h.id && "bg-indigo-50/50 -mx-2 px-2 rounded-lg")}><button type="button" onClick={async () => setCurrent(await getAssessment(h.id))} className="font-medium text-gray-900 hover:underline">{h.targetRole}</button><span className="text-gray-600">{h.readinessLabel === "Insufficient evidence" ? "—" : `${h.overallScore}/100`} · {h.readinessLabel}</span><span className="text-xs text-gray-400 ml-auto">{new Date(h.createdAt).toLocaleString()}</span></li>)}</ul>
        </CardContent></Card>
      )}
    </div>
  );
}
