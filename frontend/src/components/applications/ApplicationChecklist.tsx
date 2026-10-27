"use client";

import { useState } from "react";
import {
  CheckCircle2, Circle, Plus, Trash2, Info, Sparkles, Lock, Eye, X,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_CATEGORIES, CHECKLIST_CATEGORY_LABELS,
  type ChecklistCategory, type ChecklistItem, type ChecklistSummary,
} from "@/services/applicationWorkspaceService";

interface Props {
  items: ChecklistItem[];
  summary: ChecklistSummary;
  /** Steps the app can see evidence for but has not ticked on the user's behalf. */
  autoCompletions: Array<{ key: string; title: string; reason: string }>;
  busyId: string | null;
  adding: boolean;
  onToggle: (item: ChecklistItem, completed: boolean, source: "in_app" | "external") => void;
  onAdd: (input: { title: string; description?: string; category: ChecklistCategory; isRequired: boolean }) => void;
  onDelete: (item: ChecklistItem) => void;
}

const STAGE_TONE: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700 border-gray-200",
  preparing: "bg-amber-50 text-amber-800 border-amber-200",
  ready_to_apply: "bg-emerald-50 text-emerald-800 border-emerald-200",
  submitted: "bg-sky-50 text-sky-800 border-sky-200",
};

/**
 * The preparation checklist. Each step shows who can verify it, because that is
 * the difference between a step this app watched happen and one the user is
 * asserting — and nothing here ever ticks a box on the user's behalf.
 */
export default function ApplicationChecklist({
  items, summary, autoCompletions, busyId, adding, onToggle, onAdd, onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ChecklistCategory>("research");
  const [isRequired, setIsRequired] = useState(false);
  const [confirming, setConfirming] = useState<ChecklistItem | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return;
    onAdd({ title: title.trim(), description: description.trim() || undefined, category, isRequired });
    setTitle(""); setDescription(""); setIsRequired(false); setOpen(false);
  };

  /** Completing an "external" step is an assertion, so it asks first. */
  const handleToggle = (item: ChecklistItem) => {
    if (item.completed) { onToggle(item, false, "external"); return; }
    if (item.verifiableBy === "external") { setConfirming(item); return; }
    onToggle(item, true, "in_app");
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Preparation checklist</h2>
          <p className="text-xs text-gray-500 mt-0.5">{summary.preparationExplanation}</p>
        </div>
        <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", STAGE_TONE[summary.preparationStage])}>
          {summary.preparationLabel}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-gray-600">
          <span>{summary.completed} of {summary.total} steps</span>
          <span className="tabular-nums">{summary.percent}%</span>
        </div>
        <ProgressBar value={summary.percent} animated={false} className="h-2 mt-1" barClassName={summary.requiredPercent === 100 ? "bg-emerald-500" : "bg-indigo-500"} />
        <p className="text-[11px] text-gray-500 mt-1">
          {summary.requiredCompleted} of {summary.required} required steps done
          {summary.remainingRequired.length > 0 && ` · next: ${summary.remainingRequired[0]}`}
        </p>
      </div>

      {autoCompletions.length > 0 && (
        <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2">
          <p className="text-xs font-semibold text-sky-950 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> We can see evidence for {autoCompletions.length} step{autoCompletions.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {autoCompletions.map((a) => (
              <li key={a.key} className="text-[11px] text-sky-900">
                <strong>{a.title}</strong> — {a.reason}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-sky-900/70 mt-1">Tick them yourself when you are satisfied; nothing is ticked for you.</p>
        </div>
      )}

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "rounded-lg border px-3 py-2.5 flex items-start gap-3",
              item.completed ? "border-emerald-100 bg-emerald-50/40" : "border-gray-200"
            )}
          >
            <button
              type="button"
              onClick={() => handleToggle(item)}
              disabled={busyId === item.id}
              aria-pressed={item.completed}
              aria-label={item.completed ? `Reopen: ${item.title}` : `Complete: ${item.title}`}
              className="mt-0.5 shrink-0 disabled:opacity-50"
            >
              {item.completed
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <Circle className="w-5 h-5 text-gray-300 hover:text-gray-400" />}
            </button>

            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium flex flex-wrap items-center gap-1.5", item.completed ? "text-gray-500 line-through" : "text-gray-900")}>
                {item.title}
                {item.isRequired && <Badge variant="warning">required</Badge>}
                {item.isCustom && <Badge variant="neutral">yours</Badge>}
                {item.verifiableBy === "external" && (
                  <span title={item.verificationNote} className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" /> only you can confirm
                  </span>
                )}
                {item.verifiableBy === "in_app" && (
                  <span title={item.verificationNote} className="inline-flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded-full">
                    <Eye className="w-3 h-3" /> visible to the app
                  </span>
                )}
              </p>
              {item.description && <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>}
              <p className="text-[11px] text-gray-400 mt-0.5">
                {CHECKLIST_CATEGORY_LABELS[item.category]}
                {item.completed && item.completionSource && ` · marked ${item.completionSource === "external" ? "done outside the app" : "done in the app"}`}
              </p>
            </div>

            {item.isCustom && (
              <button
                type="button"
                onClick={() => onDelete(item)}
                disabled={busyId === item.id}
                aria-label={`Delete ${item.title}`}
                className="text-gray-300 hover:text-red-600 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Confirming an assertion the app cannot verify */}
      {confirming && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> {confirming.title}
          </p>
          <p className="text-[11px] text-amber-900 mt-0.5">{confirming.verificationNote}</p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" loading={busyId === confirming.id} onClick={() => { onToggle(confirming, true, "external"); setConfirming(null); }}>
              Yes, I did this
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Custom step */}
      {open ? (
        <form onSubmit={submit} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Step title"
            maxLength={160}
            aria-label="Step title"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional detail"
            maxLength={600}
            aria-label="Step detail"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ChecklistCategory)}
              aria-label="Category"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {CHECKLIST_CATEGORIES.map((c) => <option key={c} value={c}>{CHECKLIST_CATEGORY_LABELS[c]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded border-gray-300" />
              Required before applying
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" type="submit" loading={adding} disabled={title.trim().length < 2}>Add step</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add your own step
        </Button>
      )}
    </section>
  );
}
