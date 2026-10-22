"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import type { LearningTask } from "@/services/learningRoadmapService";
import type { TaskCompleteInput } from "@/services/learningTaskService";

interface Props {
  task: LearningTask | null;
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (input: TaskCompleteInput) => Promise<void> | void;
}

/** Collects notes, time spent and — for non-quiz checkpoints — the evidence the backend requires. */
export default function TaskCompletionModal({ task, open, busy, error, onClose, onConfirm }: Props) {
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState<string>("");
  const [checkpointNotes, setCheckpointNotes] = useState("");
  const [projectLink, setProjectLink] = useState("");
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setNotes(task?.notes ?? "");
    setMinutes(task?.actualStudyMinutes ? String(task.actualStudyMinutes) : String(task?.estimatedMinutes ?? ""));
    setCheckpointNotes("");
    setProjectLink("");
    setChecked([]);
  }, [open, task]);

  if (!task) return null;
  const cp = task.checkpoint;
  const manualCheckpoint = cp && cp.type !== "mcq";
  const needsEvidence = manualCheckpoint && !task.checkpointAttempts?.length;
  const evidenceOk = !needsEvidence || checkpointNotes.trim().length > 0 || projectLink.trim().length > 0 || checked.length > 0;

  function submit() {
    const input: TaskCompleteInput = { notes: notes.trim() || null };
    const m = parseInt(minutes, 10);
    if (!Number.isNaN(m) && m >= 0) input.actualStudyMinutes = m;
    if (manualCheckpoint) {
      if (checkpointNotes.trim()) input.checkpointNotes = checkpointNotes.trim();
      if (projectLink.trim()) input.projectLink = projectLink.trim();
      if (checked.length) input.checkedItems = checked;
    }
    return onConfirm(input);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Complete “${task.title}”`} description={task.completionCriteria} size="md"
      footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!evidenceOk}><CheckCircle2 className="w-4 h-4 mr-1" /> Mark complete</Button></>}>
      <div className="space-y-4 text-sm">
        {manualCheckpoint && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
            <p className="font-semibold text-amber-900">{cp.title}</p>
            <p className="text-amber-900/80 whitespace-pre-wrap">{cp.instructions}</p>
            {cp.type === "checklist" && cp.items?.length ? (
              <ul className="space-y-1">
                {cp.items.map((item, i) => (
                  <li key={i}><label className="flex items-start gap-2 text-gray-800"><input type="checkbox" className="mt-1" checked={checked.includes(i)} onChange={(e) => setChecked((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))} /> <span>{item}</span></label></li>
                ))}
              </ul>
            ) : null}
            {(cp.type === "project" || cp.type === "coding") && (
              <label className="block"><span className="text-xs font-medium text-gray-700">Link to your code or project (optional)</span><input type="url" value={projectLink} onChange={(e) => setProjectLink(e.target.value)} placeholder="https://github.com/you/repo" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            )}
            <label className="block"><span className="text-xs font-medium text-gray-700">{cp.type === "conceptual" ? "Your explanation, in your own words" : "Checkpoint notes"}</span><textarea value={checkpointNotes} onChange={(e) => setCheckpointNotes(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder={cp.type === "conceptual" ? "Explain the key ideas and where you still feel unsure…" : "What did you build or verify?"} /></label>
            <p className="text-[11px] text-amber-800 inline-flex items-start gap-1"><AlertCircle className="w-3 h-3 mt-0.5" /> This checkpoint is self-reported. It is recorded but not automatically verified or executed.</p>
          </div>
        )}
        <label className="block"><span className="text-xs font-medium text-gray-700">Notes (optional)</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Key takeaways, links, things to revisit…" /></label>
        <label className="block max-w-[12rem]"><span className="text-xs font-medium text-gray-700">Time spent (minutes)</span><input type="number" min={0} max={100000} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        {error && <p role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}
