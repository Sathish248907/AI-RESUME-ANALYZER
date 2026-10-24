"use client";

import { cn } from "@/lib/utils";
import { ANALYTICS_RANGE_OPTIONS, type AnalyticsRange } from "@/services/progressService";

export default function DateRangeFilter({ value, onChange, disabled }: { value: AnalyticsRange; onChange: (r: AnalyticsRange) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-xl border border-gray-200 bg-white p-0.5 text-sm">
      {ANALYTICS_RANGE_OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={disabled} onClick={() => onChange(o.value)} className={cn("px-3 py-1.5 rounded-lg transition-colors", value === o.value ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-50", disabled && "opacity-60")}>{o.label}</button>
      ))}
    </div>
  );
}
