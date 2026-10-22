"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, LogIn, Sparkles, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import WeeklyCareerPlan from "@/components/career/WeeklyCareerPlan";
import { addPlanTask, deletePlanTask, generatePlan, getCurrentPlan, updatePlanTask, type ActionPlan, type PlanTask } from "@/services/careerService";
import CareerNav from "@/components/career/CareerNav";

export default function WeeklyPlanPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; weekStart: string; weekEnd: string; status: string; progress: { percent: number; done: number; total: number } }>>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hours, setHours] = useState(6);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { const r = await getCurrentPlan(); setPlan(r.plan); setHistory(r.history); if (r.plan) setHours(Math.max(1, Math.round(r.plan.summary.budgetMinutes / 60))); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, toast]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  async function generate() {
    setGenerating(true);
    try { const r = await generatePlan(hours * 60); setPlan(r.plan); toast.success(r.regenerated ? "Pending tasks regenerated; completed work kept." : "Weekly plan created."); await load(); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setGenerating(false); }
  }
  const guard = async (fn: () => Promise<unknown>, id?: string) => { if (id) setBusyId(id); try { await fn(); await load(); } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); } };

  if (!ready || (user && loading && !plan)) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to see your weekly plan" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career/plan", icon: LogIn }} /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><CalendarDays className="w-7 h-7 text-indigo-600" /> Weekly career plan</h1><p className="text-gray-500 mt-1">Follow-ups, roadmap sessions, interview practice and resume work for this week. In-app only — no background notifications.</p></div>
        <div className="flex items-end gap-2"><label className="text-xs"><span className="text-gray-700">Hours this week</span><input type="number" min={1} max={60} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm block" /></label><Button onClick={generate} loading={generating}><Sparkles className="w-4 h-4 mr-1" /> {plan ? "Regenerate" : "Generate plan"}</Button></div>
      </div>
      <CareerNav current="/dashboard/career/plan" />
      {!plan ? <Card><CardContent className="p-8"><EmptyState icon={CalendarDays} title="No plan for this week" description="Generate one from your recommendations, roadmap, interview history and applications. You can add your own tasks too." action={{ label: "Generate plan", onClick: generate, icon: Sparkles }} /></CardContent></Card> : (
        <WeeklyCareerPlan plan={plan} busyId={busyId} regenerating={generating} onRegenerate={generate}
          onStatus={(t, status) => guard(() => updatePlanTask(t.id, { status }), t.id)}
          onReschedule={(t, date) => guard(() => updatePlanTask(t.id, { dueDate: date }), t.id)}
          onDelete={(t: PlanTask) => guard(() => deletePlanTask(t.id), t.id)}
          onAdd={(input) => guard(() => addPlanTask(input))} />
      )}
      {history.length > 0 && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="w-4 h-4 text-gray-500" /> Previous weeks</CardTitle></CardHeader><CardContent><ul className="text-sm divide-y divide-gray-100">{history.map((h) => <li key={h.id} className="py-2 flex justify-between"><span>{new Date(h.weekStart).toLocaleDateString()} – {new Date(h.weekEnd).toLocaleDateString()}</span><span className="text-gray-600">{h.progress.done}/{h.progress.total} done · {h.progress.percent}%</span></li>)}</ul></CardContent></Card>}
    </div>
  );
}
