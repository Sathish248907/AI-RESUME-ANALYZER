"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Info, Sparkles, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import type { ScoreBreakdownItem } from "@/services/mockAnalysisService";

interface MatchScoreCardProps {
  score: number;
  matchedCount: number;
  missingCount: number;
  partialCount: number;
  explanation: string;
  /** "demo" (illustrative) or "ai" (real analysis, application-defined score). Defaults to demo. */
  mode?: "demo" | "ai";
  /** False when the backend could not compute a score from the evidence. */
  scoreAvailable?: boolean;
  lowEvidence?: boolean;
  breakdown?: ScoreBreakdownItem[];
  provider?: string | null;
  model?: string | null;
}

export default function MatchScoreCard({
  score,
  matchedCount,
  missingCount,
  partialCount,
  explanation,
  mode = "demo",
  scoreAvailable = true,
  lowEvidence = false,
  breakdown,
  provider,
  model,
}: MatchScoreCardProps) {
  const [displayed, setDisplayed] = useState(0);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDisplayed(scoreAvailable ? score : 0), 150);
    return () => clearTimeout(t);
  }, [score, scoreAvailable]);

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (displayed / 100) * circumference;

  const color = !scoreAvailable ? "#9ca3af" : score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const ringBg = !scoreAvailable ? "#f3f4f6" : score >= 80 ? "#f0fdf4" : score >= 60 ? "#fffbeb" : "#fef2f2";
  const label = !scoreAvailable ? "Score unavailable" : score >= 80 ? "Strong Match" : score >= 60 ? "Moderate Match" : "Needs Work";
  const labelColor = !scoreAvailable ? "text-gray-600" : score >= 80 ? "text-green-700" : score >= 60 ? "text-amber-700" : "text-red-700";
  const labelBg = !scoreAvailable ? "bg-gray-100" : score >= 80 ? "bg-green-100" : score >= 60 ? "bg-amber-100" : "bg-red-100";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      {/* Mode banner */}
      {mode === "ai" ? (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-5">
          <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <p className="text-xs text-indigo-900">
            <span className="font-semibold">AI analysis.</span> Skills and evidence were extracted by the model; the score is an application-defined estimate
            computed from those classifications, not a hiring probability.
            {provider && <span className="text-indigo-700"> · {provider}{model ? ` / ${model}` : ""}</span>}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Demo estimate</span> — this score is illustrative, not an AI evaluation of your actual resume.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Gauge */}
        <div className="relative flex-shrink-0" style={{ background: ringBg, borderRadius: "50%", padding: 8 }}>
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120" aria-label={scoreAvailable ? `Match score: ${score} percent` : "Match score unavailable"}>
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
            <span className="text-4xl font-extrabold tabular-nums" style={{ color }}>{scoreAvailable ? displayed : "—"}</span>
            <span className="text-xs text-gray-500 font-medium">/ 100</span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4 text-center sm:text-left">
          <div>
            <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              <span className={cn("inline-block px-3 py-1 rounded-full text-sm font-semibold", labelBg, labelColor)}>{label}</span>
              {lowEvidence && scoreAvailable && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  <AlertTriangle className="w-3 h-3" /> Low evidence
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{explanation}</p>
          </div>

          <div className="flex flex-wrap justify-center sm:justify-start gap-3">
            <StatChip value={matchedCount} label="Matched" color="green" />
            <StatChip value={partialCount} label="Partial" color="amber" />
            <StatChip value={missingCount} label={mode === "ai" ? "Missing / unverified" : "Missing"} color="red" />
          </div>
        </div>
      </div>

      {breakdown && breakdown.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-100">
          <button type="button" onClick={() => setShowBreakdown((s) => !s)} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            How this score was calculated
          </button>
          {showBreakdown && (
            <div className="mt-3 space-y-2">
              {breakdown.map((b) => (
                <div key={b.key} className="text-sm">
                  <div className="flex items-center justify-between gap-3 text-gray-700">
                    <span>{b.label}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{Math.round(b.ratio * 100)}% × weight {Math.round(b.weight * 100)}% = <span className="font-semibold text-gray-800">{b.contribution} pts</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(b.ratio * 100)}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pt-1">
                Weights: required skills 45%, preferred skills 15%, experience 25%, education 15%. Components the job does not specify are dropped and the rest re-normalised.
              </p>
            </div>
          )}
        </div>
      )}
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
