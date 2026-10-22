"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ArrowRight, Info } from "lucide-react";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { toApiClientError } from "@/services/api";
import { applyRegeneration, previewRegeneration, SKILL_LEVELS, type LearningRoadmap, type RegenerateInput, type RegeneratePreview, type SkillLevel } from "@/services/learningRoadmapService";

interface Props {
  roadmap: LearningRoadmap | null;
  open: boolean;
  onClose: () => void;
  onApplied: (roadmap: LearningRoadmap) => void;
}

/** Two-step regeneration: preview the new plan and what carries over, then apply to create a new version. */
export default function RegenerateModal({ roadmap, open, onClose, onApplied }: Props) {
  const [hours, setHours] = useState(5);
  const [level, setLevel] = useState<SkillLevel>("intermediate");
  const [reason, setReason] = useState("");
  const [goals, setGoals] = useState("");
  const [preview, setPreview] = useState<RegeneratePreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !roadmap) return;
    setHours(roadmap.weeklyStudyHours); setLevel(roadmap.currentSkillLevel); setReason(""); setGoals(""); setPreview(null); setError(null);
  }, [open, roadmap]);

  if (!roadmap) return null;
  const input = (): Omit<RegenerateInput, "apply"> => ({ weeklyStudyHours: hours, currentSkillLevel: level, reason: reason.trim() || undefined, goalSkills: goals.split(",").map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 15) });

  async function doPreview() {
    setBusy("preview"); setError(null);
    try { setPreview(await previewRegeneration(roadmap!.id, input())); } catch (err) { setError(toApiClientError(err).message); } finally { setBusy(null); }
  }
  async function doApply() {
    setBusy("apply"); setError(null);
    try { const r = await applyRegeneration(roadmap!.id, input()); onApplied(r.roadmap); } catch (err) { setError(toApiClientError(err).message); } finally { setBusy(null); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Regenerate “${roadmap.title}”`} description="A new version is generated from your current records. Completed tasks on the same skill are carried over; the old version is kept in history." size="lg"
      footer={<><Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>{!preview ? <Button onClick={doPreview} loading={busy === "preview"}><RefreshCw className="w-4 h-4 mr-1" /> Preview new plan</Button> : <Button onClick={doApply} loading={busy === "apply"}><ArrowRight className="w-4 h-4 mr-1" /> Apply as version {roadmap.version + 1}</Button>}</>}>
      <div className="space-y-4 text-sm">
        {!preview && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-medium text-gray-700">Weekly study hours</span><input type="number" min={1} max={60} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <label className="block"><span className="text-xs font-medium text-gray-700">Current level</span><select value={level} onChange={(e) => setLevel(e.target.value as SkillLevel)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 capitalize">{SKILL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="block sm:col-span-2"><span className="text-xs font-medium text-gray-700">Extra goal skills (comma-separated, optional)</span><input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="Docker, System design" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <label className="block sm:col-span-2"><span className="text-xs font-medium text-gray-700">Why are you regenerating? (optional, kept in version history)</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="New job description, more time available, finished the basics…" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <p className="sm:col-span-2 text-xs text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5" /> Generation calls the AI provider and can take a few minutes. Nothing changes until you apply the preview.</p>
          </div>
        )}
        {preview && (
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <Diff label="Milestones" a={preview.changes.milestonesBefore} b={preview.changes.milestonesAfter} />
              <Diff label="Tasks" a={preview.changes.tasksBefore} b={preview.changes.tasksAfter} />
              <div><p className="text-gray-500">Carried over</p><p className="font-semibold text-gray-900">{preview.changes.completedCarriedOver} completed</p>{preview.changes.completedNotCarried > 0 && <p className="text-amber-700">{preview.changes.completedNotCarried} not matched</p>}</div>
              <div><p className="text-gray-500">Estimate</p><p className="font-semibold text-gray-900">{preview.roadmap.estimatedHours} h · {preview.roadmap.estimatedWeeks} wk</p></div>
            </div>
            {(preview.changes.addedSkills.length > 0 || preview.changes.removedSkills.length > 0) && (
              <div className="flex flex-wrap gap-1 text-xs">
                {preview.changes.addedSkills.map((s) => <Badge key={`a-${s}`} variant="success">+ {s}</Badge>)}
                {preview.changes.removedSkills.map((s) => <Badge key={`r-${s}`} variant="neutral">− {s}</Badge>)}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">{preview.roadmap.title}</p>
              <p className="text-gray-600">{preview.roadmap.summary}</p>
            </div>
            <ol className="space-y-2">
              {preview.roadmap.milestones.map((m) => (
                <li key={m.sequenceNumber} className="rounded-lg border border-gray-200 px-3 py-2">
                  <p className="font-medium text-gray-900">{m.sequenceNumber}. {m.title} <span className="text-xs text-gray-500">~{m.estimatedHours} h</span></p>
                  <ul className="mt-1 text-xs text-gray-600 space-y-0.5">{m.tasks.map((t, i) => <li key={i} className="flex items-center gap-2">{t.status === "completed" ? <Badge variant="success">carried</Badge> : <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />} {t.title} <span className="text-gray-400">· {t.estimatedMinutes} min</span></li>)}</ul>
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && <p role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}

function Diff({ label, a, b }: { label: string; a: number; b: number }) {
  return <div><p className="text-gray-500">{label}</p><p className="font-semibold text-gray-900">{a} <ArrowRight className="inline w-3 h-3" /> {b}</p></div>;
}
