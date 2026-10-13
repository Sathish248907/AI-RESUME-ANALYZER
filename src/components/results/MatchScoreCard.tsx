"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface MatchScoreCardProps {
  score: number;
  matchedCount: number;
  missingCount: number;
  partialCount: number;
  explanation: string;
}

export default function MatchScoreCard({
  score,
  matchedCount,
  missingCount,
  partialCount,
  explanation,
}: MatchScoreCardProps) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDisplayed(score), 150);
    return () => clearTimeout(t);
  }, [score]);

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (displayed / 100) * circumference;

  const color =
    score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const ringBg =
    score >= 80 ? "#f0fdf4" : score >= 60 ? "#fffbeb" : "#fef2f2";
  const label =
    score >= 80 ? "Strong Match" : score >= 60 ? "Moderate Match" : "Needs Work";
  const labelColor =
    score >= 80 ? "text-green-700" : score >= 60 ? "text-amber-700" : "text-red-700";
  const labelBg =
    score >= 80 ? "bg-green-100" : score >= 60 ? "bg-amber-100" : "bg-red-100";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {/* Demo banner */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <p className="text-xs text-amber-800">
          <span className="font-semibold">Demo estimate</span> — this score is illustrative, not an AI evaluation of your actual resume.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="relative flex-shrink-0" style={{ background: ringBg, borderRadius: "50%", padding: 8 }}>
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120" aria-label={`Match score: ${score} percent`}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke={color} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-extrabold tabular-nums" style={{ color }}>{displayed}</span>
            <span className="text-xs text-gray-500 font-medium">/ 100</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div>
            <span className={cn("inline-block px-3 py-1 rounded-full text-sm font-semibold", labelBg, labelColor)}>
              {label}
            </span>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{explanation}</p>
          </div>

          {/* Stat chips */}
          <div className="flex flex-wrap justify-center sm:justify-start gap-3">
            <StatChip value={matchedCount} label="Matched" color="green" />
            <StatChip value={partialCount} label="Partial" color="amber" />
            <StatChip value={missingCount} label="Missing" color="red" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatChip({ value, label, color }: { value: number; label: string; color: "green" | "amber" | "red" }) {
  const styles = {
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border", styles[color])}>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
