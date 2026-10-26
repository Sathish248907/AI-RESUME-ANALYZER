"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Wand2,
  ArrowRight,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Filter,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { AtsFinding, AtsAutoFix, Priority } from "./types";

interface Props {
  actionPlan: AtsFinding[];
  busy: boolean;
  onApplyFix: (fix: AtsAutoFix, findingId: string) => Promise<void>;
  onLocate: (target: { sectionId: string | null; entryId: string | null }) => void;
  onRecheck: () => void;
  className?: string;
}

const PRIORITY_BADGE: Record<Priority, "error" | "warning" | "neutral"> = {
  high: "error",
  medium: "warning",
  low: "neutral",
};

export default function ATSIssueList({
  actionPlan,
  busy,
  onApplyFix,
  onLocate,
  onRecheck,
  className,
}: Props) {
  const [filter, setFilter] = useState<"all" | "high" | "fixable">("all");
  const [activeFixId, setActiveFixId] = useState<string | null>(null);

  const filtered = actionPlan.filter((item) => {
    if (filter === "high") return item.priority === "high";
    if (filter === "fixable") return Boolean(item.autoFix);
    return true;
  });

  const fixableCount = actionPlan.filter((item) => Boolean(item.autoFix)).length;

  const handleApply = async (fix: AtsAutoFix, findingId: string) => {
    setActiveFixId(findingId);
    try {
      await onApplyFix(fix, findingId);
    } finally {
      setActiveFixId(null);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            ATS Action Plan & Fixes
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Prioritized step-by-step improvements to boost your ATS compatibility
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRecheck} loading={busy}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} />
          Recheck ATS
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-gray-400 inline-flex items-center gap-1 mr-1">
          <Filter className="w-3 h-3" /> Filter:
        </span>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "px-2.5 py-1 rounded-full font-medium transition-colors",
            filter === "all"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          All ({actionPlan.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("high")}
          className={cn(
            "px-2.5 py-1 rounded-full font-medium transition-colors",
            filter === "high"
              ? "bg-red-600 text-white"
              : "bg-red-50 text-red-700 hover:bg-red-100"
          )}
        >
          High Priority ({actionPlan.filter((x) => x.priority === "high").length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("fixable")}
          className={cn(
            "px-2.5 py-1 rounded-full font-medium transition-colors",
            filter === "fixable"
              ? "bg-indigo-600 text-white"
              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          )}
        >
          1-Click Auto Fixable ({fixableCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-emerald-900">
            {actionPlan.length === 0
              ? "No critical ATS issues found!"
              : "No issues matching the selected filter."}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {actionPlan.length === 0
              ? "Your resume structure, formatting, and content align cleanly with ATS best practices."
              : "Switch filters above to view remaining recommendations."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item, idx) => (
            <li
              key={item.id || idx}
              className={cn(
                "rounded-xl border p-4 transition-all bg-white shadow-sm",
                item.priority === "high"
                  ? "border-red-200 hover:border-red-300"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Badge variant={PRIORITY_BADGE[item.priority]}>
                      {item.priority} priority
                    </Badge>
                    <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      {item.category}
                    </span>
                    {item.autoFix && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                        <Wand2 className="w-3 h-3" /> Safe auto-fix ready
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {item.title}
                  </h4>
                </div>
              </div>

              {/* Issue & Why it matters */}
              <div className="mt-2 space-y-1.5 text-xs text-gray-600">
                <p>
                  <strong className="text-gray-800">Issue:</strong> {item.issue}
                </p>
                <p>
                  <strong className="text-gray-800">Why it matters:</strong> {item.why}
                </p>
                <p className="text-indigo-900 bg-indigo-50/70 border border-indigo-100 rounded-lg p-2.5 mt-2">
                  <strong className="text-indigo-950 block mb-0.5 font-semibold">Recommended Action:</strong>
                  {item.action}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-3.5 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                <div>
                  {item.sectionId && (
                    <button
                      type="button"
                      onClick={() =>
                        onLocate({
                          sectionId: item.sectionId,
                          entryId: item.entryId,
                        })
                      }
                      className="text-xs text-sky-700 hover:text-sky-900 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Jump to section in editor
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {item.autoFix ? (
                    <Button
                      size="sm"
                      onClick={() => handleApply(item.autoFix!, item.id)}
                      loading={activeFixId === item.id}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                      {item.autoFix.label || "Apply Fix"}
                    </Button>
                  ) : item.sectionId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onLocate({
                          sectionId: item.sectionId,
                          entryId: item.entryId,
                        })
                      }
                    >
                      Edit Section
                      <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
