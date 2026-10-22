"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Clock, Lock, Pause, Play, RotateCcw, SkipForward, ChevronDown, ChevronUp, ClipboardCheck, Star } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import LearningResourceList from "./LearningResourceList";
import { TASK_TYPE_LABELS, type LearningTask } from "@/services/learningRoadmapService";
import { cn } from "@/lib/utils";

export interface TaskActions {
  onStart: (task: LearningTask) => Promise<void> | void;
  onPause: (task: LearningTask) => Promise<void> | void;
  onComplete: (task: LearningTask) => void;
  onReopen: (task: LearningTask) => Promise<void> | void;
  onSkip: (task: LearningTask) => Promise<void> | void;
  onCheckpoint: (task: LearningTask) => void;
  /** Reschedule (null clears the date). */
  onReschedule: (task: LearningTask, date: string | null) => Promise<void> | void;
  /** Add minutes to the logged study time. */
  onLogMinutes: (task: LearningTask, minutes: number) => Promise<void> | void;
}

const STATUS_META: Record<LearningTask["status"], { label: string; variant: "success" | "info" | "warning" | "neutral" }> = {
  not_started: { label: "Not started", variant: "neutral" },
  in_progress: { label: "In progress", variant: "info" },
  paused: { label: "Paused", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  skipped: { label: "Skipped", variant: "neutral" },
};

export default function LearningTaskCard({ task, actions, readOnly = false, highlight = false }: { task: LearningTask; actions: TaskActions; readOnly?: boolean; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [date, setDate] = useState(task.scheduledDate ? task.scheduledDate.slice(0, 10) : "");
  const [minutes, setMinutes] = useState("");
  const meta = STATUS_META[task.status];
  const done = task.status === "completed";
  const locked = task.locked;
  const isCheckpoint = task.taskType === "knowledge_checkpoint" && task.checkpoint;
  const passedCheckpoint = task.checkpointAttempts?.some((a) => a.passed);

  async function run(name: string, fn: () => Promise<void> | void) {
    setBusy(name);
    try { await fn(); } finally { setBusy(null); }
  }

  return (
    <div className={cn("rounded-xl border bg-white transition-shadow", highlight ? "border-indigo-300 ring-2 ring-indigo-100" : "border-gray-200", done && "bg-gray-50/60", locked && "opacity-70")}>
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">
          {locked ? <Lock className="w-5 h-5 text-gray-400" /> : done ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : task.status === "in_progress" ? <Play className="w-5 h-5 text-blue-600" /> : task.status === "paused" ? <Pause className="w-5 h-5 text-amber-600" /> : <Circle className="w-5 h-5 text-gray-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cn("font-medium text-gray-900", done && "line-through text-gray-500")}>{task.title}</h4>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {!task.isRequired && <Badge variant="neutral" className="gap-1"><Star className="w-3 h-3" /> Optional</Badge>}
            {isCheckpoint && <Badge variant={passedCheckpoint ? "success" : "warning"} className="gap-1"><ClipboardCheck className="w-3 h-3" /> {passedCheckpoint ? "Checkpoint passed" : "Checkpoint"}</Badge>}
          </div>
          <p className="text-xs text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-gray-700">{task.skillName}</span>
            <span>{TASK_TYPE_LABELS[task.taskType] ?? task.taskType}</span>
            <span className="capitalize">{task.difficulty}</span>
            <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> ~{task.estimatedMinutes} min{task.actualStudyMinutes ? ` · ${task.actualStudyMinutes} min logged` : ""}</span>
            {task.scheduledDate && <span>Scheduled {new Date(task.scheduledDate).toLocaleDateString()}</span>}
          </p>
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline">
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} {open ? "Hide details" : "Details, criteria & resources"}
          </button>
          {open && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-gray-700">{task.description}</p>
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Done when</p>
                <p className="text-gray-700">{task.completionCriteria}</p>
              </div>
              {task.notes && <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2"><p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Your notes</p><p className="text-gray-700 whitespace-pre-wrap">{task.notes}</p></div>}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resources</p>
                <LearningResourceList resources={task.resources} />
              </div>
              {!readOnly && !locked && (
                <div className="grid sm:grid-cols-2 gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <label htmlFor={`sched-${task.id}`} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scheduled for</label>
                    <div className="flex gap-2 mt-1">
                      <input id={`sched-${task.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      <Button size="sm" variant="outline" loading={busy === "sched"} onClick={() => run("sched", () => actions.onReschedule(task, date || null))}>Save</Button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Scheduling never completes a task by itself.</p>
                  </div>
                  <div>
                    <label htmlFor={`mins-${task.id}`} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Log study time</label>
                    <div className="flex gap-2 mt-1">
                      <input id={`mins-${task.id}`} type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="minutes" className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                      <Button size="sm" variant="outline" disabled={!(Number(minutes) >= 1)} loading={busy === "mins"} onClick={() => run("mins", async () => { await actions.onLogMinutes(task, Number(minutes)); setMinutes(""); })}>Add</Button>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">{task.actualStudyMinutes} min logged so far.</p>
                  </div>
                </div>
              )}
              {isCheckpoint && task.checkpointAttempts?.length > 0 && (
                <p className="text-xs text-gray-500">{task.checkpointAttempts.length} attempt{task.checkpointAttempts.length === 1 ? "" : "s"} · best score {Math.max(...task.checkpointAttempts.map((a) => a.score ?? (a.passed ? 100 : 0)))}%</p>
              )}
            </div>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2 px-4 pb-4 pl-12">
          {locked ? (
            <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Complete the prerequisite milestone first</span>
          ) : done || task.status === "skipped" ? (
            <Button size="sm" variant="outline" loading={busy === "reopen"} onClick={() => run("reopen", () => actions.onReopen(task))}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reopen</Button>
          ) : (
            <>
              {task.status !== "in_progress" && <Button size="sm" variant="primary" loading={busy === "start"} onClick={() => run("start", () => actions.onStart(task))}><Play className="w-3.5 h-3.5 mr-1" /> {task.status === "paused" ? "Resume" : "Start"}</Button>}
              {task.status === "in_progress" && <Button size="sm" variant="outline" loading={busy === "pause"} onClick={() => run("pause", () => actions.onPause(task))}><Pause className="w-3.5 h-3.5 mr-1" /> Pause</Button>}
              {isCheckpoint ? (
                <Button size="sm" variant={passedCheckpoint ? "outline" : "secondary"} onClick={() => actions.onCheckpoint(task)}><ClipboardCheck className="w-3.5 h-3.5 mr-1" /> {task.checkpoint?.type === "mcq" ? (passedCheckpoint ? "Retake quiz" : "Take quiz") : "Open checkpoint"}</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => actions.onComplete(task)}><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark complete</Button>
              )}
              <Button size="sm" variant="ghost" loading={busy === "skip"} onClick={() => run("skip", () => actions.onSkip(task))}><SkipForward className="w-3.5 h-3.5 mr-1" /> Skip</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
