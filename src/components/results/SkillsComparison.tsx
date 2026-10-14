"use client";

import { useState, useMemo } from "react";
import { Search, CheckCircle, MinusCircle, XCircle } from "lucide-react";
import type { SkillItem } from "@/services/mockAnalysisService";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface SkillsComparisonProps {
  skills: SkillItem[];
}

type FilterType = "all" | "matched" | "partial" | "missing";
type CategoryFilter = "all" | SkillItem["category"];

const MATCH_META = {
  matched: {
    label: "Matched",
    icon: CheckCircle,
    chip: "bg-green-50 text-green-800 border-green-200",
    dot: "bg-green-500",
  },
  partial: {
    label: "Partial match",
    icon: MinusCircle,
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    dot: "bg-amber-500",
  },
  missing: {
    label: "Missing",
    icon: XCircle,
    chip: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
} as const;

export default function SkillsComparison({ skills }: SkillsComparisonProps) {
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState<FilterType>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const categories = useMemo<CategoryFilter[]>(() => {
    const cats = [...new Set(skills.map((s) => s.category))];
    return ["all", ...cats] as CategoryFilter[];
  }, [skills]);

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      const matchOk = matchFilter === "all" || s.matchType === matchFilter;
      const catOk = categoryFilter === "all" || s.category === categoryFilter;
      const searchOk =
        search.trim() === "" ||
        s.name.toLowerCase().includes(search.toLowerCase());
      return matchOk && catOk && searchOk;
    });
  }, [skills, matchFilter, categoryFilter, search]);

  const counts = {
    matched: skills.filter((s) => s.matchType === "matched").length,
    partial: skills.filter((s) => s.matchType === "partial").length,
    missing: skills.filter((s) => s.matchType === "missing").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Skills Comparison</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500" />{counts.matched} matched
            </span>
            <span className="flex items-center gap-1 text-xs text-amber-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />{counts.partial} partial
            </span>
            <span className="flex items-center gap-1 text-xs text-red-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" />{counts.missing} missing
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Match filter */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "matched", "partial", "missing"] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setMatchFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border",
                  matchFilter === f
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 2 && (
          <div className="flex gap-1.5 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors",
                  categoryFilter === c
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Skill badges */}
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">No skills match your filters.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filtered.map((skill) => {
              const meta = MATCH_META[skill.matchType];
              const Icon = meta.icon;
              return (
                <span
                  key={`${skill.name}-${skill.matchType}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium",
                    meta.chip
                  )}
                  title={meta.label}
                >
                  <Icon className="w-3 h-3 flex-shrink-0" />
                  {skill.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
          {(Object.entries(MATCH_META) as [keyof typeof MATCH_META, (typeof MATCH_META)[keyof typeof MATCH_META]][]).map(
            ([key, meta]) => {
              const Icon = meta.icon;
              return (
                <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Icon className={cn("w-3.5 h-3.5", key === "matched" ? "text-green-600" : key === "partial" ? "text-amber-600" : "text-red-500")} />
                  {meta.label}
                </div>
              );
            }
          )}
        </div>
      </CardContent>
    </Card>
  );
}
