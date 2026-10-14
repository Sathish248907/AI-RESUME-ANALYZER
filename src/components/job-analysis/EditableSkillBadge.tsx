"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SKILL_CATEGORIES, type SkillCategory } from "@/services/skillDictionary";
import type { JobSkill, SkillPriority } from "@/services/jobDescriptionParser";

export interface SkillEditHandlers {
  onChangeCategory?: (id: string, category: SkillCategory) => void;
  onChangePriority?: (id: string, priority: SkillPriority) => void;
  onRemove?: (id: string) => void;
}

interface EditableSkillBadgeProps extends SkillEditHandlers {
  skill: JobSkill;
  /** Show the priority colour and label. */
  showPriority?: boolean;
  /** Show the category text under the name in the editor. */
  readOnly?: boolean;
  className?: string;
}

export const PRIORITY_STYLES: Record<SkillPriority, { badge: string; dot: string; label: string }> = {
  required: { badge: "bg-blue-50 text-blue-800 border-blue-200", dot: "bg-blue-500", label: "Required" },
  preferred: { badge: "bg-green-50 text-green-800 border-green-200", dot: "bg-green-500", label: "Preferred" },
  unclear: { badge: "bg-gray-50 text-gray-700 border-gray-200", dot: "bg-gray-400", label: "Unclear" },
};

export default function EditableSkillBadge({
  skill,
  showPriority = true,
  readOnly = false,
  onChangeCategory,
  onChangePriority,
  onRemove,
  className,
}: EditableSkillBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editable = !readOnly && (onChangeCategory || onChangePriority || onRemove);
  const style = PRIORITY_STYLES[skill.priority];

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const title = [
    skill.mentions > 0 ? `${skill.mentions} mention${skill.mentions === 1 ? "" : "s"}` : "Added manually",
    showPriority ? `${style.label}${skill.priorityInferred ? " (inferred)" : ""}` : null,
    skill.priorityEvidence ? `Evidence: ${skill.priorityEvidence}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => editable && setOpen((o) => !o)}
        title={title}
        aria-haspopup={editable ? "dialog" : undefined}
        aria-expanded={editable ? open : undefined}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
          showPriority ? style.badge : "bg-gray-50 text-gray-700 border-gray-200",
          editable && "hover:shadow-sm hover:border-gray-400 cursor-pointer",
          !editable && "cursor-default"
        )}
      >
        {showPriority && <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} aria-hidden />}
        <span>{skill.name}</span>
        {skill.mentions > 1 && <span className="text-[10px] opacity-70 tabular-nums">×{skill.mentions}</span>}
        {skill.source === "manual" && <span className="text-[10px] uppercase tracking-wide opacity-70">manual</span>}
        {showPriority && skill.priorityInferred && skill.priority !== "unclear" && (
          <span className="text-[10px] italic opacity-70">inferred</span>
        )}
        {editable && <Pencil className="w-3 h-3 opacity-50" aria-hidden />}
      </button>

      {open && editable && (
        <div
          role="dialog"
          aria-label={`Edit ${skill.name}`}
          className="absolute z-30 top-full left-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-3 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{skill.name}</p>
              <p className="text-[11px] text-gray-500">
                {skill.mentions > 0 ? `${skill.mentions} mention${skill.mentions === 1 ? "" : "s"} in description` : "Added manually"}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-400" aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {onChangeCategory && (
            <label className="block">
              <span className="text-[11px] font-medium text-gray-600">Category</span>
              <select
                value={skill.category}
                onChange={(e) => onChangeCategory(skill.id, e.target.value as SkillCategory)}
                className="mt-1 w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          )}

          {onChangePriority && (
            <div>
              <span className="text-[11px] font-medium text-gray-600">Priority</span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {(["required", "preferred", "unclear"] as SkillPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChangePriority(skill.id, p)}
                    className={cn(
                      "text-[11px] px-2 py-1.5 rounded-lg border transition-colors flex items-center justify-center gap-1",
                      skill.priority === p
                        ? PRIORITY_STYLES[p].badge + " font-semibold"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {skill.priority === p && <Check className="w-3 h-3" />}
                    {PRIORITY_STYLES[p].label}
                  </button>
                ))}
              </div>
              {skill.priorityEvidence && (
                <p className="mt-1.5 text-[11px] text-gray-500 leading-snug">
                  <span className="font-medium">Evidence:</span> {skill.priorityEvidence}
                </p>
              )}
              {!skill.priorityEvidence && (
                <p className="mt-1.5 text-[11px] text-gray-400 italic">No supporting wording found in the description.</p>
              )}
            </div>
          )}

          {onRemove && (
            <button
              type="button"
              onClick={() => { onRemove(skill.id); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove skill
            </button>
          )}
        </div>
      )}
    </div>
  );
}
