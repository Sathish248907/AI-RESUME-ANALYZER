"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  animated?: boolean;
  label?: string;
  showValue?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className,
  barClassName,
  animated = true,
  label,
  showValue = false,
}: ProgressBarProps) {
  const [displayed, setDisplayed] = useState(animated ? 0 : value);
  const pct = Math.min(100, Math.max(0, (displayed / max) * 100));

  useEffect(() => {
    if (!animated) return;
    const timer = setTimeout(() => setDisplayed(value), 100);
    return () => clearTimeout(timer);
  }, [value, animated]);

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-gray-600">{label}</span>}
          {showValue && (
            <span className="text-sm font-medium text-gray-900">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-1000 ease-out",
            barClassName ?? "bg-blue-600"
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
