"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Link2, MessageSquare, Pencil } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import { EVIDENCE_LABELS, PROFICIENCY_META, type SkillGap } from "@/services/learningRecommendationService";
import type { ProficiencyStatus } from "@/services/learningRoadmapService";
import { cn } from "@/lib/utils";

const PRIORITY: Record<SkillGap["priority"], "error" | "warning" | "neutral"> = { high: "error", medium: "warning", low: "neutral" };
const CONFIRMABLE: ProficiencyStatus[] = ["demonstrated", "needs_improvement", "not_demonstrated"];

export default function SkillGapCard({ gap, onUpdate, busy }: { gap: SkillGap; onUpdate: (id: string, input: { proficiencyStatus?: ProficiencyStatus; userNote?: string | null }) => Promise<void>; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(gap.userNote ?? "");
  const [status, setStatus] = useState<ProficiencyStatus>(gap.proficiencyStatus);
  const meta = PROFICIENCY_META[gap.proficiencyStatus];

  async function save() {
    await onUpdate(gap.id, { proficiencyStatus: status !== gap.proficiencyStatus ? status : undefined, userNote: note.trim() ? note.trim() : null });
    setEditing(false);
  }

  return (
    <div className={cn("rounded-xl border bg-white p-4", gap.priority === "high" && gap.proficiencyStatus !== "demonstrated" ? "border-red-100" : "border-gray-200")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">{gap.skillName}</h3>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", meta.cls)}>{meta.label}</span>
            <Badge variant={PRIORITY[gap.priority]}>{gap.priority} priority</Badge>
            {gap.userConfirmed && <Badge variant="info" className="gap-1"><CheckCircle2 className="w-3 h-3" /> You confirmed</Badge>}
          </div>
          <p className="text-xs text-gray-500 mt-1">{gap.category} · target: {gap.targetProficiency} · score {gap.priorityScore}/100</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-indigo-700 inline-flex items-center gap-1 hover:underline">{open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} {open ? "Less" : "Why?"}</button>
      </div>
      <p className="text-sm text-gray-700 mt-2">{gap.explanation}</p>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-gray-700"><span className="font-medium">Why it matters:</span> {gap.whyItMatters}</p>
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-gray-500 inline-flex items-center gap-1 mr-1"><Link2 className="w-3 h-3" /> Evidence:</span>
            {gap.evidenceSources.map((e) => <Badge key={e} variant="neutral">{EVIDENCE_LABELS[e] ?? e}</Badge>)}
          </div>
          {gap.relatedTopics && gap.relatedTopics.length > 0 && <p className="text-xs text-gray-500">Related interview topics: {gap.relatedTopics.join(", ")}</p>}
          {gap.userNote && !editing && <p className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-flex items-start gap-1"><MessageSquare className="w-3 h-3 mt-0.5" /> {gap.userNote}</p>}
          {editing ? (
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <label className="block"><span className="text-xs font-medium text-gray-700">Your assessment</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as ProficiencyStatus)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">
                  {CONFIRMABLE.map((s) => <option key={s} value={s}>{PROFICIENCY_META[s].label}</option>)}
                </select></label>
              <label className="block"><span className="text-xs font-medium text-gray-700">Note (optional)</span><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="e.g. Used daily at my last job" /></label>
              <p className="text-[11px] text-gray-500">Confirming a skill keeps your verdict when roadmaps are regenerated, and removes it from future plans if marked demonstrated.</p>
              <div className="flex gap-2"><Button size="sm" onClick={save} loading={busy}>Save</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setStatus(gap.proficiencyStatus); setNote(gap.userNote ?? ""); }}>Cancel</Button></div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="w-3.5 h-3.5 mr-1" /> Correct this assessment</Button>
          )}
        </div>
      )}
    </div>
  );
}
