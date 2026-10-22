"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, SkipForward, CalendarDays, Trash2, ArrowRight, Clock, Plus, RotateCcw, AlertTriangle } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import type { ActionPlan, PlanTask } from "@/services/careerService";
import { cn } from "@/lib/utils";

const CAT: Record<PlanTask["category"], { label: string; variant: "info" | "warning" | "success" | "neutral" | "error" }> = { learning: { label: "Learning", variant: "info" }, interview: { label: "Interview", variant: "warning" }, resume: { label: "Resume", variant: "success" }, application: { label: "Application", variant: "error" }, personal: { label: "Personal", variant: "neutral" } };

interface Props {
  plan: ActionPlan;
  busyId?: string | null;
  onStatus: (t: PlanTask, status: PlanTask["status"]) => Promise<void> | void;
  onReschedule: (t: PlanTask, date: string | null) => Promise<void> | void;
  onDelete: (t: PlanTask) => Promise<void> | void;
  onAdd: (input: { title: string; category: PlanTask["category"]; estimatedMinutes: number; dueDate: string | null }) => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  regenerating?: boolean;
}

export default function WeeklyCareerPlan({ plan, busyId, onStatus, onReschedule, onDelete, onAdd, onRegenerate, regenerating }: Props) {
  const [view, setView] = useState<"open" | "done" | "all">("open");
  const [title, setTitle] = useState(""); const [category, setCategory] = useState<PlanTask["category"]>("personal"); const [minutes, setMinutes] = useState(30); const [due, setDue] = useState("");
  const [rescheduling, setRescheduling] = useState<string | null>(null); const [newDate, setNewDate] = useState("");
  const now = new Date();
  const tasks = plan.tasks.filter((t) => (view === "all" ? true : view === "done" ? t.status !== "pending" : t.status === "pending"));
  const overdue = (t: PlanTask) => t.status === "pending" && t.dueDate && new Date(t.dueDate) < now;
  const p = plan.progress;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-gray-900 inline-flex items-center gap-1"><CalendarDays className="w-4 h-4 text-indigo-600" /> Week of {new Date(plan.weekStart).toLocaleDateString()} – {new Date(plan.weekEnd).toLocaleDateString()}</p>
          <Button size="sm" variant="outline" onClick={onRegenerate} loading={regenerating}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Regenerate pending tasks</Button>
        </div>
        <div className="mt-2 flex items-center gap-3"><div className="flex-1"><ProgressBar value={p.percent} animated={false} barClassName="bg-indigo-500" /></div><span className="text-xs text-gray-600 whitespace-nowrap">{p.doneRequired}/{p.required} required · {p.minutesDone} min done{p.overdue ? ` · ${p.overdue} overdue` : ""}</span></div>
        <p className="text-[11px] text-gray-500 mt-1">Budget {Math.round(plan.summary.budgetMinutes / 60)} h · planned {plan.summary.requiredMinutes} min required + optional. Regenerating keeps completed and skipped tasks.</p>
      </div>
      <div className="flex gap-1 text-xs">{(["open", "done", "all"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={cn("px-3 py-1 rounded-lg border capitalize", view === v ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200")}>{v === "done" ? "Completed / skipped" : v}</button>)}</div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className={cn("rounded-xl border px-4 py-3 flex items-start gap-3", t.status === "done" ? "border-green-200 bg-green-50/40" : t.status === "skipped" ? "border-gray-200 bg-gray-50 opacity-70" : overdue(t) ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white")}>
            <button type="button" aria-label={t.status === "done" ? "Mark pending" : "Mark done"} disabled={busyId === t.id} onClick={() => onStatus(t, t.status === "done" ? "pending" : "done")} className="mt-0.5">{t.status === "done" ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-gray-300 hover:text-indigo-500" />}</button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("font-medium", t.status !== "pending" ? "text-gray-500 line-through" : "text-gray-900")}>{t.title}</p>
                <Badge variant={CAT[t.category].variant}>{CAT[t.category].label}</Badge>
                {t.isOptional && <Badge variant="neutral">optional</Badge>}
                {overdue(t) && <Badge variant="error" className="gap-1"><AlertTriangle className="w-3 h-3" /> overdue</Badge>}
              </div>
              {t.description && <p className="text-xs text-gray-600 mt-0.5">{t.description}</p>}
              <p className="text-[11px] text-gray-500 mt-0.5 inline-flex items-center gap-2"><Clock className="w-3 h-3" /> {t.estimatedMinutes} min{t.dueDate && <> · due {new Date(t.dueDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</>}{t.notes && <> · {t.notes}</>}</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {t.href && <Link href={t.href} className="text-xs font-medium text-indigo-700 inline-flex items-center gap-1">Open <ArrowRight className="w-3 h-3" /></Link>}
                {t.status === "pending" && <button type="button" className="text-xs text-gray-600 hover:underline inline-flex items-center gap-1" onClick={() => onStatus(t, "skipped")}><SkipForward className="w-3 h-3" /> Skip</button>}
                {t.status === "pending" && (rescheduling === t.id ? (
                  <span className="inline-flex items-center gap-1"><input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded border border-gray-300 px-1 py-0.5 text-xs" /><Button size="sm" variant="outline" onClick={async () => { await onReschedule(t, newDate || null); setRescheduling(null); }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setRescheduling(null)}>Cancel</Button></span>
                ) : <button type="button" className="text-xs text-gray-600 hover:underline inline-flex items-center gap-1" onClick={() => { setRescheduling(t.id); setNewDate(t.dueDate ? t.dueDate.slice(0, 10) : ""); }}><CalendarDays className="w-3 h-3" /> Reschedule</button>)}
                {t.status !== "pending" && <button type="button" className="text-xs text-gray-600 hover:underline" onClick={() => onStatus(t, "pending")}>Reopen</button>}
                <button type="button" aria-label="Delete task" className="text-xs text-red-500 hover:underline inline-flex items-center gap-1" onClick={() => onDelete(t)}><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          </li>
        ))}
        {tasks.length === 0 && <li className="text-xs text-gray-500">Nothing here.</li>}
      </ul>
      <form className="rounded-xl border border-dashed border-gray-300 px-4 py-3 grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end" onSubmit={async (e) => { e.preventDefault(); if (title.trim().length < 2) return; await onAdd({ title: title.trim(), category, estimatedMinutes: minutes, dueDate: due || null }); setTitle(""); setDue(""); }}>
        <label className="text-xs"><span className="font-medium text-gray-700">Add your own task</span><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Email a referral contact" className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5" /></label>
        <label className="text-xs"><span className="font-medium text-gray-700">Category</span><select value={category} onChange={(e) => setCategory(e.target.value as PlanTask["category"])} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5">{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="text-xs"><span className="font-medium text-gray-700">Minutes</span><input type="number" min={5} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 w-20 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
        <label className="text-xs"><span className="font-medium text-gray-700">Due</span><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5" /></label>
        <Button type="submit" size="sm" disabled={title.trim().length < 2}><Plus className="w-4 h-4" /></Button>
      </form>
    </div>
  );
}
