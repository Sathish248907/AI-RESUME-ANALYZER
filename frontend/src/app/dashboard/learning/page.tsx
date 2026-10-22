"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Map, Plus, LogIn, Lightbulb, CalendarDays, BarChart3, ListChecks, Target, History, ArrowRight, Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { SkeletonCard, SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import RoadmapOverview from "@/components/learning/RoadmapOverview";
import RoadmapTimeline from "@/components/learning/RoadmapTimeline";
import WeeklyLearningPlan from "@/components/learning/WeeklyLearningPlan";
import LearningProgressChart from "@/components/learning/LearningProgressChart";
import RecommendationList from "@/components/learning/RecommendationList";
import TaskCompletionModal from "@/components/learning/TaskCompletionModal";
import CheckpointModal from "@/components/learning/CheckpointModal";
import RegenerateModal from "@/components/learning/RegenerateModal";
import type { TaskActions } from "@/components/learning/LearningTaskCard";
import { deleteRoadmap, getRoadmap, getRoadmapProgress, listRoadmaps, updateRoadmap, type LearningRoadmap, type LearningTask, type PlanEntry, type RoadmapListItem, type WeeklyPlan } from "@/services/learningRoadmapService";
import { completeTask, reopenTask, updateTask, type CheckpointResult, type TaskCompleteInput } from "@/services/learningTaskService";
import { dismissRecommendation, getLearningRecommendations, type LearningRecommendation } from "@/services/learningRecommendationService";
import { formatDate } from "@/lib/utils";

export default function LearningRoadmapPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-10"><SkeletonList /></div>}>
      <LearningInner />
    </Suspense>
  );
}

function LearningInner() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready } = useAuth();
  const requestedId = params?.get("roadmap") ?? null;

  const [roadmap, setRoadmap] = useState<LearningRoadmap | null>(null);
  const [history, setHistory] = useState<RoadmapListItem[]>([]);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [nextAction, setNextAction] = useState<PlanEntry | null>(null);
  const [recs, setRecs] = useState<LearningRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

  const [completing, setCompleting] = useState<LearningTask | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [checkpointTask, setCheckpointTask] = useState<LearningTask | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refreshSide = useCallback(async (id: string | null) => {
    const [p, r] = await Promise.allSettled([id ? getRoadmapProgress(id) : Promise.resolve(null), getLearningRecommendations()]);
    if (p.status === "fulfilled" && p.value) { setPlan(p.value.weeklyPlan); setNextAction(p.value.nextAction); } else { setPlan(null); setNextAction(null); }
    if (r.status === "fulfilled") setRecs(r.value.recommendations);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const all = await listRoadmaps({ limit: 50 });
      setHistory(all.roadmaps);
      const target = requestedId ? all.roadmaps.find((r) => r.id === requestedId) : all.roadmaps.find((r) => r.status === "active");
      if (!target) { setRoadmap(null); await refreshSide(null); return; }
      const full = await getRoadmap(target.id);
      setRoadmap(full);
      await refreshSide(full.status === "active" ? full.id : null);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally { setLoading(false); }
  }, [user, requestedId, refreshSide]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  /** Re-fetch the roadmap (task state → milestone locks → progress) plus plan/recommendations. */
  const refreshRoadmap = useCallback(async () => {
    if (!roadmap) return;
    const full = await getRoadmap(roadmap.id);
    setRoadmap(full);
    await refreshSide(full.status === "active" ? full.id : null);
    setHistory((h) => h.map((x) => (x.id === full.id ? { ...x, progress: full.progress, status: full.status } : x)));
  }, [roadmap, refreshSide]);

  async function guard(fn: () => Promise<unknown>, success?: string): Promise<void> {
    try {
      await fn();
      if (success) toast.success(success);
      await refreshRoadmap();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    }
  }

  const actions: TaskActions = {
    onStart: (t) => guard(() => updateTask(t.id, { status: "in_progress" })),
    onPause: (t) => guard(() => updateTask(t.id, { status: "paused" })),
    onComplete: (t) => { setCompleteError(null); setCompleting(t); },
    onReopen: (t) => guard(() => reopenTask(t.id), "Task reopened. Milestone progress has been recalculated."),
    onSkip: (t) => guard(() => updateTask(t.id, { status: "skipped" }), "Task skipped. Skipped required tasks do not complete a milestone."),
    onCheckpoint: (t) => setCheckpointTask(t),
    onReschedule: (t, date) => guard(() => updateTask(t.id, { scheduledDate: date }), date ? "Task rescheduled. The weekly plan has been updated." : "Schedule cleared."),
    onLogMinutes: (t, minutes) => guard(() => updateTask(t.id, { addStudyMinutes: minutes }), `${minutes} minutes logged.`),
  };

  async function confirmComplete(input: TaskCompleteInput) {
    if (!completing) return;
    setBusy(true); setCompleteError(null);
    try {
      const res = await completeTask(completing.id, input);
      toast.success(res.milestoneStatus?.status === "completed" ? "Milestone completed — the next one is unlocked." : "Task completed.");
      setCompleting(null);
      await refreshRoadmap();
    } catch (err) {
      setCompleteError(toApiClientError(err).message);
    } finally { setBusy(false); }
  }

  async function onCheckpointResult(res: CheckpointResult) {
    if (res.passed) toast.success(res.task.taskType === "knowledge_checkpoint" ? "Checkpoint passed — task completed." : "Checkpoint recorded.");
    await refreshRoadmap();
  }

  function openTask(taskId: string) {
    setHighlightTaskId(taskId);
    setTimeout(() => document.getElementById("roadmap-timeline")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function onDismiss(key: string) {
    try { await dismissRecommendation(key); setRecs((r) => r.filter((x) => x.key !== key)); } catch (err) { toast.error(toApiClientError(err).message); }
  }

  async function archive() {
    if (!roadmap) return;
    setBusy(true);
    try { await updateRoadmap(roadmap.id, { status: "archived" }); toast.success("Roadmap archived. Generate a new one or re-activate it from Versions."); router.replace("/dashboard/learning"); await load(); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(false); }
  }
  async function activate() {
    if (!roadmap) return;
    setBusy(true);
    try { await updateRoadmap(roadmap.id, { status: "active" }); toast.success("Roadmap is active again."); router.replace("/dashboard/learning"); await load(); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!roadmap) return;
    setBusy(true);
    try { await deleteRoadmap(roadmap.id); toast.success("Roadmap deleted. Your skill-gap records were kept."); setDeleting(false); router.replace("/dashboard/learning"); await load(); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(false); }
  }

  if (!ready || (user && loading && !roadmap)) return <div className="max-w-6xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={4} /><SkeletonList /></div>;
  if (!user) {
    return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to build your learning roadmap" description="Roadmaps are generated from your stored resume analyses, job descriptions and mock-interview history, and your progress is saved to your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/learning", icon: LogIn }} /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Map className="w-7 h-7 text-emerald-600" /> Learning roadmap</h1>
          <p className="text-gray-500 mt-1">A personalised, ordered plan built from your real skill gaps. Progress is tracked per task.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/learning/skill-gaps"><Button variant="outline"><Target className="w-4 h-4 mr-1" /> Skill gaps</Button></Link>
          <Link href="/dashboard/learning/new"><Button><Plus className="w-4 h-4 mr-1" /> New roadmap</Button></Link>
        </div>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">{error} <button className="underline ml-2" onClick={load}>Retry</button></div>}

      {!roadmap ? (
        <>
          <Card><CardContent className="p-8">
            <EmptyState icon={Compass} title="No active roadmap yet" description="Answer a few questions about your target role and schedule. The roadmap is generated from your resume analyses, saved job descriptions and interview results — then validated and stored." action={{ label: "Generate my roadmap", href: "/dashboard/learning/new", icon: Plus }} />
          </CardContent></Card>
          {recs.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-500" /> Suggestions</CardTitle></CardHeader><CardContent><RecommendationList recommendations={recs} onDismiss={onDismiss} /></CardContent></Card>}
          {history.length > 0 && <HistoryList items={history} currentId={null} />}
        </>
      ) : (
        <>
          <RoadmapOverview roadmap={roadmap} busy={busy} onRegenerate={() => setRegenOpen(true)} onArchive={archive} onActivate={activate} onDelete={() => setDeleting(true)} onShowHistory={() => setShowHistory((s) => !s)} />
          {showHistory && <HistoryList items={history} currentId={roadmap.id} />}

          {roadmap.status !== "active" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This version is {roadmap.status}. Tasks are read-only here; make it active to continue working on it, or <Link href="/dashboard/learning" className="underline">go to your active roadmap</Link>.</div>
          )}

          {roadmap.status === "active" && (
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="w-5 h-5 text-indigo-600" /> This week</CardTitle></CardHeader>
                <CardContent>
                  {nextAction && (
                    <button type="button" onClick={() => openTask(nextAction.taskId)} className="w-full text-left mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 hover:bg-indigo-100 transition-colors">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Recommended next action</p>
                      <p className="font-medium text-gray-900">{nextAction.title}</p>
                      <p className="text-xs text-gray-600">{nextAction.skillName} · ~{nextAction.estimatedMinutes} min · {nextAction.milestoneTitle}{nextAction.reason ? ` — ${nextAction.reason}` : ""}</p>
                      <span className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5">Continue learning <ArrowRight className="w-4 h-4" /></span>
                    </button>
                  )}
                  {plan ? <WeeklyLearningPlan plan={plan} onOpenTask={openTask} /> : <SkeletonCard lines={3} />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-amber-500" /> Recommended next</CardTitle></CardHeader>
                <CardContent><RecommendationList recommendations={recs} onOpenTask={openTask} onDismiss={onDismiss} roadmapId={roadmap.id} /></CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-600" /> Milestone progress</CardTitle></CardHeader>
            <CardContent><LearningProgressChart roadmap={roadmap} /></CardContent>
          </Card>

          <section id="roadmap-timeline" className="space-y-3 scroll-mt-24">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><ListChecks className="w-5 h-5 text-indigo-600" /> Milestones & tasks</h2>
            <RoadmapTimeline roadmap={roadmap} actions={actions} readOnly={roadmap.status !== "active"} highlightTaskId={highlightTaskId} />
          </section>
        </>
      )}

      <TaskCompletionModal task={completing} open={Boolean(completing)} busy={busy} error={completeError} onClose={() => setCompleting(null)} onConfirm={confirmComplete} />
      <CheckpointModal task={checkpointTask} open={Boolean(checkpointTask)} onClose={() => setCheckpointTask(null)} onResult={onCheckpointResult} />
      <RegenerateModal roadmap={roadmap} open={regenOpen} onClose={() => setRegenOpen(false)} onApplied={async (r) => { setRegenOpen(false); toast.success(`Roadmap version ${r.version} is now active.`); router.replace("/dashboard/learning"); await load(); }} />
      <ConfirmDialog open={deleting} title="Delete this roadmap?" message="Milestones, tasks, notes and checkpoint attempts for this version are removed permanently. Your skill-gap records are kept." confirmLabel="Delete roadmap" busy={busy} onConfirm={remove} onCancel={() => setDeleting(false)} />
    </div>
  );
}

function HistoryList({ items, currentId }: { items: RoadmapListItem[]; currentId: string | null }) {
  const STATUS: Record<RoadmapListItem["status"], "success" | "neutral" | "warning"> = { active: "success", archived: "neutral", superseded: "warning" };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="w-5 h-5 text-gray-500" /> Roadmap versions</CardTitle></CardHeader>
      <CardContent className="divide-y divide-gray-100">
        {items.map((r) => (
          <Link key={r.id} href={r.status === "active" ? "/dashboard/learning" : `/dashboard/learning?roadmap=${r.id}`} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-gray-50 -mx-2 px-2 rounded-lg ${r.id === currentId ? "bg-indigo-50/60" : ""}`}>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{r.title} <span className="text-gray-400">v{r.version}</span></p>
              <p className="text-xs text-gray-500">{r.targetRole} · {r.currentSkillLevel} · {formatDate(r.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2"><span className="text-xs text-gray-600">{r.progress.percent}%</span><Badge variant={STATUS[r.status]}>{r.status}</Badge></div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
