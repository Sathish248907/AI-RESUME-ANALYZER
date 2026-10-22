"use client";

import { useState } from "react";
import { Check, X, Pencil, RotateCcw, AlertTriangle, ArrowRight } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import type { Suggestion } from "@/services/resumeBuilderService";
import { cn } from "@/lib/utils";

interface Props {
  suggestions: Suggestion[];
  busyId?: string | null;
  onResolve: (s: Suggestion, action: "accept" | "reject" | "edit" | "reset", text?: string) => Promise<void> | void;
  onLocate?: (s: Suggestion) => void;
  sectionTitle: (sectionId: string) => string;
}

const STATUS: Record<Suggestion["status"], { label: string; variant: "neutral" | "success" | "error" | "info" }> = { pending: { label: "Pending", variant: "neutral" }, accepted: { label: "Accepted", variant: "success" }, rejected: { label: "Rejected", variant: "error" }, edited: { label: "Edited & applied", variant: "info" } };

/** Before/after suggestion cards with accept / edit / reject / reset. Shared by improve and tailor panels. */
export default function SuggestionList({ suggestions, busyId, onResolve, onLocate, sectionTitle }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!suggestions.length) return <p className="text-sm text-gray-500">No suggestions yet.</p>;
  return (
    <ul className="space-y-3">
      {suggestions.map((s) => {
        const st = STATUS[s.status];
        const resolved = s.status !== "pending";
        return (
          <li key={s.id} className={cn("rounded-xl border p-3 text-sm", s.needsConfirmation && !resolved ? "border-amber-300 bg-amber-50/40" : resolved ? "border-gray-200 bg-gray-50/60" : "border-indigo-200 bg-white")}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button type="button" onClick={() => onLocate?.(s)} className="text-xs font-semibold text-gray-700 hover:underline">{sectionTitle(s.sectionId)} · {s.field.replace(":", " #")}</button>
              <Badge variant="info">{s.category}</Badge>
              <Badge variant={st.variant}>{st.label}</Badge>
              {s.mode === "tailor" && <Badge variant="warning">tailored</Badge>}
            </div>
            {s.needsConfirmation && !resolved && (
              <p className="mb-2 text-xs text-amber-900 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {s.confirmationQuestion ?? "This rewrite adds details that are not in your resume. Confirm or edit before applying."}</p>
            )}
            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-2 items-start">
              <div className="rounded-lg bg-white border border-gray-200 px-2.5 py-2 text-gray-600 line-through decoration-gray-300">{s.originalText || <span className="italic text-gray-400">(empty)</span>}</div>
              <ArrowRight className="w-4 h-4 text-gray-400 hidden md:block mt-2" />
              {editing === s.id ? (
                <textarea className="rounded-lg border border-indigo-300 px-2.5 py-2 w-full" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
              ) : (
                <div className="rounded-lg bg-white border border-indigo-100 px-2.5 py-2 text-gray-900">{s.status === "edited" && s.acceptedText ? s.acceptedText : s.suggestedText}</div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2"><span className="font-medium text-gray-700">Why:</span> {s.rationale}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {editing === s.id ? (<>
                <Button size="sm" loading={busyId === s.id} disabled={!draft.trim()} onClick={async () => { await onResolve(s, "edit", draft.trim()); setEditing(null); }}><Check className="w-3.5 h-3.5 mr-1" /> Apply edited text</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </>) : resolved ? (
                <Button size="sm" variant="ghost" loading={busyId === s.id} onClick={() => onResolve(s, "reset")}><RotateCcw className="w-3.5 h-3.5 mr-1" /> {s.status === "rejected" ? "Reconsider" : "Undo & restore original"}</Button>
              ) : (<>
                <Button size="sm" loading={busyId === s.id} onClick={() => onResolve(s, "accept")} variant={s.needsConfirmation ? "outline" : "primary"}><Check className="w-3.5 h-3.5 mr-1" /> {s.needsConfirmation ? "Confirm & apply" : "Accept"}</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(s.id); setDraft(s.suggestedText); }}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                <Button size="sm" variant="ghost" loading={busyId === s.id} onClick={() => onResolve(s, "reject")}><X className="w-3.5 h-3.5 mr-1" /> Reject</Button>
              </>)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
