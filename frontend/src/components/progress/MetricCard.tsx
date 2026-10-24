"use client";

import { ArrowDownRight, ArrowUpRight, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Comparison } from "@/services/progressService";

interface MetricCardProps {
  label: string;
  value: number | string | null;
  unit?: string;
  comparison?: Comparison | null;
  definition?: string;
  /** Shown instead of a number when value is null. */
  unavailable?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "indigo" | "emerald" | "amber" | "rose" | "slate";
  className?: string;
}

const TONES = { indigo: "text-indigo-600 bg-indigo-50", emerald: "text-emerald-600 bg-emerald-50", amber: "text-amber-600 bg-amber-50", rose: "text-rose-600 bg-rose-50", slate: "text-slate-600 bg-slate-100" };

/** A metric with an explicit "no data" state (never shows 0 for missing data) and an optional period comparison. */
export default function MetricCard({ label, value, unit = "", comparison, definition, unavailable = "No data yet", icon: Icon, tone = "indigo", className }: MetricCardProps) {
  const hasValue = value !== null && value !== undefined;
  return (
    <div className={cn("bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-2", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
          {label}
          {definition && <span className="group relative inline-flex"><Info className="w-3.5 h-3.5 text-gray-400" aria-label={definition} /><span role="tooltip" className="pointer-events-none absolute left-0 top-5 z-20 hidden group-hover:block group-focus-within:block w-56 rounded-lg bg-gray-900 text-white text-[11px] leading-snug p-2 shadow-lg">{definition}</span></span>}
        </p>
        {Icon && <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center", TONES[tone])}><Icon className="w-4 h-4" /></span>}
      </div>
      {hasValue ? <p className="text-2xl font-semibold text-gray-900 tabular-nums">{value}<span className="text-sm font-normal text-gray-500 ml-0.5">{unit}</span></p> : <p className="text-sm text-gray-400 italic">{unavailable}</p>}
      {hasValue && comparison && <ComparisonLine comparison={comparison} unit={unit} />}
    </div>
  );
}

export function ComparisonLine({ comparison, unit = "" }: { comparison: Comparison; unit?: string }) {
  if (comparison.delta === null || comparison.previous === null) return <p className="text-[11px] text-gray-400">No previous period to compare.</p>;
  const Icon = comparison.direction === "better" ? ArrowUpRight : comparison.direction === "worse" ? ArrowDownRight : Minus;
  const cls = comparison.direction === "better" ? "text-emerald-700" : comparison.direction === "worse" ? "text-rose-700" : "text-gray-500";
  return <p className={cn("text-[11px] inline-flex items-center gap-1", cls)}><Icon className="w-3 h-3" />{comparison.delta > 0 ? "+" : ""}{comparison.delta}{unit} vs previous period ({comparison.previous}{unit})</p>;
}
