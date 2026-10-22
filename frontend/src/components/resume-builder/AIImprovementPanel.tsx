"use client";

import { useState } from "react";
import { Sparkles, Info, Wand2 } from "lucide-react";
import Button from "@/components/common/Button";
import SuggestionList from "./SuggestionList";
import type { ResumeContent, Suggestion } from "@/services/resumeBuilderService";

interface Props {
  content: ResumeContent;
  suggestions: Suggestion[];
  generalNotes: string[];
  busy: boolean;
  busyId: string | null;
  aiConfigured: boolean | null;
  readOnly?: boolean;
  onGenerate: (input: { sectionIds?: string[]; userNotes?: string }) => Promise<void>;
  onResolve: (s: Suggestion, action: "accept" | "reject" | "edit" | "reset", text?: string) => Promise<void>;
  onLocate: (s: Suggestion) => void;
}

/** Generate field-level rewrite suggestions, per section or whole resume, with optional extra facts from the user. */
export default function AIImprovementPanel({ content, suggestions, generalNotes, busy, busyId, aiConfigured, readOnly, onGenerate, onResolve, onLocate }: Props) {
  const [scope, setScope] = useState<string>("all");
  const [notes, setNotes] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const sectionTitle = (id: string) => content.sections.find((s) => s.id === id)?.title ?? "Section";
  const visible = suggestions.filter((s) => s.mode === "improve" && (showResolved || s.status === "pending"));
  const pending = suggestions.filter((s) => s.mode === "improve" && s.status === "pending").length;
  return (
    <div className="space-y-4 text-sm">
      {readOnly ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">The original version is read-only. Create or open a working version to get AI suggestions.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs flex-1 min-w-[10rem]"><span className="font-medium text-gray-700">Scope</span>
              <select value={scope} onChange={(e) => setScope(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                <option value="all">Whole resume</option>
                {content.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select></label>
            <Button onClick={() => onGenerate({ sectionIds: scope === "all" ? undefined : [scope], userNotes: notes.trim() || undefined })} loading={busy} disabled={aiConfigured === false}><Wand2 className="w-4 h-4 mr-1" /> {pending ? "Regenerate" : "Suggest improvements"}</Button>
          </div>
          <label className="block text-xs"><span className="font-medium text-gray-700">Extra facts the AI may use (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1200} placeholder="e.g. The design system was adopted by 12 teams; the migration cut build time from 9 to 4 minutes." className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5" /></label>
          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> Suggestions never add employers, dates, numbers or technologies that are not in your resume or the facts above. Anything unverified is flagged for your confirmation. Nothing changes until you accept.</p>
          {aiConfigured === false && <p className="text-xs text-amber-700">The backend has no AI provider key configured, so suggestions cannot be generated.</p>}
        </div>
      )}
      {generalNotes.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900"><p className="font-semibold mb-1 inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> General notes</p><ul className="list-disc pl-4 space-y-0.5">{generalNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">{pending} pending suggestion{pending === 1 ? "" : "s"}</p>
        <label className="text-xs inline-flex items-center gap-1 text-gray-600"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> show resolved</label>
      </div>
      <SuggestionList suggestions={visible} busyId={busyId} onResolve={onResolve} onLocate={onLocate} sectionTitle={sectionTitle} />
    </div>
  );
}
