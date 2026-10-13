"use client";

import { useMemo, useState } from "react";
import { Code2, Search, Plus, X, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import { SKILL_CATEGORIES, type SkillCategory } from "@/services/skillDictionary";
import type { JobSkill, SkillPriority } from "@/services/jobDescriptionParser";
import EditableSkillBadge, { type SkillEditHandlers } from "./EditableSkillBadge";

interface SkillCategorySectionProps extends SkillEditHandlers {
  skills: JobSkill[];
  onAddSkill?: (name: string, category: SkillCategory, priority: SkillPriority) => string | null;
  /** Categories shown as the "technical" group. Defaults to everything except soft skills. */
  categories?: SkillCategory[];
  title?: string;
}

const DEFAULT_CATEGORIES: SkillCategory[] = SKILL_CATEGORIES.filter((c) => c !== "Soft Skills");

export default function SkillCategorySection({
  skills,
  onAddSkill,
  onChangeCategory,
  onChangePriority,
  onRemove,
  categories = DEFAULT_CATEGORIES,
  title = "Technical Skills",
}: SkillCategorySectionProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<SkillPriority | "all">("all");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<SkillCategory>(categories[0] ?? "Other");
  const [newPriority, setNewPriority] = useState<SkillPriority>("unclear");
  const [addError, setAddError] = useState<string | null>(null);

  const scoped = useMemo(() => skills.filter((s) => categories.includes(s.category)), [skills, categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(
      (s) =>
        (categoryFilter === "all" || s.category === categoryFilter) &&
        (priorityFilter === "all" || s.priority === priorityFilter) &&
        (!q || s.name.toLowerCase().includes(q) || s.matchedText.some((t) => t.toLowerCase().includes(q)))
    );
  }, [scoped, query, categoryFilter, priorityFilter]);

  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, JobSkill[]>();
    for (const c of categories) map.set(c, []);
    for (const s of filtered) map.get(s.category)?.push(s);
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [filtered, categories]);

  const soft = skills.filter((s) => s.category === "Soft Skills");

  function submitAdd() {
    if (!onAddSkill) return;
    const err = onAddSkill(newName, newCategory, newPriority);
    if (err) {
      setAddError(err);
      return;
    }
    setNewName("");
    setAddError(null);
    setAdding(false);
  }

  const editable = Boolean(onChangeCategory || onChangePriority || onRemove);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-blue-600" />
              {title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {scoped.length} detected from the built-in dictionary · grouped by category
              {editable && " · click a badge to edit"}
            </p>
          </div>
          {onAddSkill && (
            <Button variant="outline" size="sm" onClick={() => { setAdding((a) => !a); setAddError(null); }}>
              {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {adding ? "Cancel" : "Add skill"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {adding && onAddSkill && (
          <form
            onSubmit={(e) => { e.preventDefault(); submitAdd(); }}
            className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-start"
          >
            <div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
                placeholder="Skill name, e.g. Svelte"
                maxLength={40}
                aria-label="Skill name"
                className={cn(
                  "w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  addError ? "border-red-400 bg-red-50" : "border-gray-300"
                )}
              />
              {addError && <p className="text-xs text-red-600 mt-1">{addError}</p>}
            </div>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as SkillCategory)} aria-label="Category" className="text-sm px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              {SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as SkillPriority)} aria-label="Priority" className="text-sm px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="required">Required</option>
              <option value="preferred">Preferred</option>
              <option value="unclear">Unclear</option>
            </select>
            <Button type="submit" size="sm" disabled={!newName.trim()}>Add</Button>
          </form>
        )}

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills…"
              aria-label="Search skills"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as SkillCategory | "all")} aria-label="Filter by category" className="text-sm px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as SkillPriority | "all")} aria-label="Filter by priority" className="text-sm px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">Any priority</option>
            <option value="required">Required</option>
            <option value="preferred">Preferred</option>
            <option value="unclear">Unclear</option>
          </select>
        </div>

        {/* Groups */}
        {scoped.length === 0 ? (
          <EmptyBox icon={Layers} text="No technical skills from the demo dictionary were detected. Add skills manually so the comparison can use them." />
        ) : grouped.length === 0 ? (
          <EmptyBox icon={Search} text="No skills match your search or filters." />
        ) : (
          <div className="space-y-4">
            {grouped.map(([category, list]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-sm font-semibold text-gray-800">{category}</h4>
                  <span className="text-xs text-gray-400 tabular-nums">{list.length}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <EditableSkillBadge key={s.id} skill={s} onChangeCategory={onChangeCategory} onChangePriority={onChangePriority} onRemove={onRemove} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Soft skills */}
        {soft.length > 0 && categories.indexOf("Soft Skills") === -1 && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-semibold text-gray-800">Soft Skills</h4>
              <span className="text-xs text-gray-400 tabular-nums">{soft.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {soft.map((s) => (
                <EditableSkillBadge key={s.id} skill={s} onChangeCategory={onChangeCategory} onChangePriority={onChangePriority} onRemove={onRemove} />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 pt-1">
          <LegendDot className="bg-blue-500" label="Required" />
          <LegendDot className="bg-green-500" label="Preferred" />
          <LegendDot className="bg-gray-400" label="Unclear priority" />
          <span className="italic">“inferred” = priority guessed without supporting wording</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", className)} /> {label}
    </span>
  );
}

export function EmptyBox({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-4 py-4">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      {text}
    </div>
  );
}
