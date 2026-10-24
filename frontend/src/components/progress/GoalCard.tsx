"use client";

import Link from "next/link";
import { CheckCircle2, Pause, Play, Archive, Trash2, Pencil, ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import { cn, formatDate } from "@/lib/utils";
import type { Goal } from "@/services/progressService";

interface GoalCardProps { goal: Goal; busy?: boolean; onStatus: (g: Goal, status: Goal["status"]) => void; onEdit: (g: Goal) => void; onDelete: (g: Goal) => void; onIncrement?: (g: Goal) => void }

const STATUS_VARIANT: Record<Goal["status"], "success" | "warning" | "neutral" | "info"> = { active: "info", paused: "warning", completed: "success", archived: "neutral" };

export default function GoalCard({ goal: g, busy, onStatus, onEdit, onDelete, onIncrement }: GoalCardProps) {
  const p = g.progress;
  return (
    <div className={cn("bg-white border rounded-2xl p-4 space-y-3", g.status === "completed" ? "border-emerald-200" : "border-gray-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{g.title}</p>
          <p className="text-xs text-gray-500">{g.typeLabel}{g.linkKey && g.goalType === "skill_practice" ? ` · ${g.linkKey}` : ""}</p>
        </div>
        <Badge variant={STATUS_VARIANT[g.status]} className="capitalize">{g.status}</Badge>
      </div>
      {g.description && <p className="text-sm text-gray-600">{g.description}</p>}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1"><span>{p.currentValue} / {g.targetValue} {p.unit}</span><span className="tabular-nums">{p.percent}%</span></div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}><div className={cn("h-full rounded-full", p.reached ? "bg-emerald-500" : "bg-indigo-500")} style={{ width: `${p.percent}%` }} /></div>
      </div>
      {p.evidence.length > 0 && <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">{p.evidence.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
        {g.targetDate && <span className={cn("inline-flex items-center gap-1", p.overdue && "text-rose-600")}><Clock className="w-3 h-3" /> {p.overdue ? "Overdue · " : "Target "}{formatDate(g.targetDate)}</span>}
        {g.completedAt && <span className="text-emerald-700">Completed {formatDate(g.completedAt)}</span>}
        {!p.measurable && <span>Tracked manually</span>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {p.nextAction && g.status === "active" && <Link href={p.nextAction.href} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100">{p.nextAction.title} <ArrowRight className="w-3 h-3" /></Link>}
        {!p.measurable && g.status === "active" && onIncrement && <Button size="sm" variant="outline" disabled={busy} onClick={() => onIncrement(g)}>+1 {p.unit}</Button>}
        {g.status === "active" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(g, "paused")} aria-label="Pause goal"><Pause className="w-3.5 h-3.5" /></Button>}
        {g.status === "paused" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(g, "active")} aria-label="Resume goal"><Play className="w-3.5 h-3.5" /></Button>}
        {g.status !== "completed" && g.status !== "archived" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(g, "completed")} aria-label="Mark complete"><CheckCircle2 className="w-3.5 h-3.5" /></Button>}
        {g.status !== "archived" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onStatus(g, "archived")} aria-label="Archive goal"><Archive className="w-3.5 h-3.5" /></Button>}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onEdit(g)} aria-label="Edit goal"><Pencil className="w-3.5 h-3.5" /></Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(g)} aria-label="Delete goal" className="text-rose-600"><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}
