"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import GoalCard from "@/components/progress/GoalCard";
import { listGoals, createGoal, updateGoal, deleteGoal, type Goal, type GoalType, type GoalTypeInfo } from "@/services/progressService";
import { cn } from "@/lib/utils";

type Form = { title: string; description: string; goalType: GoalType; linkKey: string; targetValue: string; targetDate: string };
const EMPTY: Form = { title: "", description: "", goalType: "mock_interviews", linkKey: "", targetValue: "5", targetDate: "" };
const PRESETS: Array<{ label: string; form: Partial<Form> }> = [
  { label: "Finish 5 mock interviews", form: { title: "Finish five mock interviews", goalType: "mock_interviews", targetValue: "5" } },
  { label: "Reach resume quality 85", form: { title: "Reach a resume quality score of 85", goalType: "resume_quality", targetValue: "85" } },
  { label: "Complete my roadmap", form: { title: "Finish my learning roadmap", goalType: "roadmap_completion", targetValue: "100" } },
  { label: "Submit 10 applications", form: { title: "Submit ten job applications", goalType: "applications", targetValue: "10" } },
];

export default function CareerGoalsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [types, setTypes] = useState<GoalTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "paused" | "completed" | "archived">("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Goal | null>(null);

  const load = useCallback(async () => { if (!user) return; setLoading(true); setError(null); try { const r = await listGoals(); setGoals(r.goals); setTypes(r.goalTypes); } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); } }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  const typeInfo = types.find((t) => t.key === form.goalType);
  function openCreate(preset?: Partial<Form>) { setEditing(null); setForm({ ...EMPTY, ...preset }); setOpen(true); }
  function openEdit(g: Goal) { setEditing(g); setForm({ title: g.title, description: g.description ?? "", goalType: g.goalType, linkKey: g.linkKey ?? "", targetValue: String(g.targetValue), targetDate: g.targetDate ? g.targetDate.slice(0, 10) : "" }); setOpen(true); }
  async function save() {
    setSaving(true);
    try {
      if (editing) { const g = await updateGoal(editing.id, { title: form.title, description: form.description || null, targetValue: Number(form.targetValue), targetDate: form.targetDate || null }); setGoals((all) => all.map((x) => (x.id === g.id ? g : x))); toast.success("Goal updated."); }
      else { const g = await createGoal({ title: form.title, description: form.description || undefined, goalType: form.goalType, linkKey: form.linkKey || undefined, targetValue: Number(form.targetValue), targetDate: form.targetDate || null }); setGoals((all) => [g, ...all]); toast.success("Goal created."); }
      setOpen(false);
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setSaving(false); }
  }
  async function onStatus(g: Goal, status: Goal["status"]) { setBusyId(g.id); try { const u = await updateGoal(g.id, { status }); setGoals((all) => all.map((x) => (x.id === u.id ? u : x))); } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); } }
  async function onIncrement(g: Goal) { setBusyId(g.id); try { const u = await updateGoal(g.id, { currentValue: g.currentValue + 1 }); setGoals((all) => all.map((x) => (x.id === u.id ? u : x))); } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); } }
  async function onDelete() { if (!toDelete) return; setBusyId(toDelete.id); try { await deleteGoal(toDelete.id); setGoals((all) => all.filter((x) => x.id !== toDelete.id)); toast.success("Goal deleted."); } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); setToDelete(null); } }

  const shown = goals.filter((g) => g.status === tab);
  return (
    <ProgressPageShell current="/dashboard/progress/goals" title="Personal goals" description="Set measurable career-development goals. Progress is computed from your real records — unverified activity never counts." icon={Flag} loading={loading} error={error} onRetry={load} actions={<Button onClick={() => openCreate()}><Plus className="w-4 h-4 mr-1" /> New goal</Button>}>
      <div className="flex flex-wrap gap-2 text-xs">{PRESETS.map((p) => <button key={p.label} type="button" onClick={() => openCreate(p.form)} className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-gray-700">{p.label}</button>)}</div>
      <Card><CardHeader><CardTitle><div role="tablist" className="flex flex-wrap gap-1 text-sm font-normal">{(["active", "paused", "completed", "archived"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cn("px-3 py-1.5 rounded-lg border capitalize", tab === t ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700")}>{t} ({goals.filter((g) => g.status === t).length})</button>)}</div></CardTitle></CardHeader>
        <CardContent>{shown.length === 0 ? <p className="text-sm text-gray-500">No {tab} goals.{tab === "active" && " Use a preset above or create your own."}</p> : <div className="grid md:grid-cols-2 gap-3">{shown.map((g) => <GoalCard key={g.id} goal={g} busy={busyId === g.id} onStatus={onStatus} onEdit={openEdit} onDelete={setToDelete} onIncrement={onIncrement} />)}</div>}</CardContent></Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit goal" : "New goal"} description={editing ? "Type and link cannot change after creation; progress keeps counting from the original start date." : "Progress for measurable goals is computed from records created after today."} footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={saving} disabled={form.title.trim().length < 2 || !form.targetValue} onClick={save}>{editing ? "Save" : "Create goal"}</Button></>}>
        <div className="space-y-3 text-sm">
          <label className="block"><span className="text-gray-700">Title</span><input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          {!editing && <label className="block"><span className="text-gray-700">Type</span><select className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.goalType} onChange={(e) => setForm({ ...form, goalType: e.target.value as GoalType, targetValue: e.target.value === "roadmap_completion" ? "100" : form.targetValue })}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}{t.measurable ? "" : " (manual)"}</option>)}</select></label>}
          {!editing && form.goalType === "skill_practice" && <label className="block"><span className="text-gray-700">Skill name</span><input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.linkKey} placeholder="e.g. GraphQL" onChange={(e) => setForm({ ...form, linkKey: e.target.value })} /></label>}
          {!editing && form.goalType === "mock_interviews" && <label className="block"><span className="text-gray-700">Target role (optional)</span><input className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.linkKey} placeholder="Only count interviews for this role" onChange={(e) => setForm({ ...form, linkKey: e.target.value })} /></label>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-gray-700">Target ({typeInfo?.unit ?? "count"})</span><input type="number" min={1} max={typeInfo?.percent || typeInfo?.absolute ? 100 : 100000} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} /></label>
            <label className="block"><span className="text-gray-700">Target date (optional)</span><input type="date" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-gray-700">Notes (optional)</span><textarea className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" rows={2} maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        </div>
      </Modal>
      <ConfirmDialog open={Boolean(toDelete)} title="Delete goal?" message={`“${toDelete?.title ?? ""}” and its progress record will be removed. Your underlying activity is not affected.`} confirmLabel="Delete" busy={busyId === toDelete?.id} onConfirm={onDelete} onCancel={() => setToDelete(null)} />
    </ProgressPageShell>
  );
}
