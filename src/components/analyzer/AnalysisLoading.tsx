"use client";

import { useEffect, useState } from "react";
import { LOADING_MESSAGES, type LoadingPhase } from "@/services/mockAnalysisService";
import { cn } from "@/lib/utils";

interface AnalysisLoadingProps {
  currentPhase: LoadingPhase;
}

const PHASE_ORDER: LoadingPhase[] = [
  "parsing",
  "extracting",
  "comparing",
  "scoring",
  "generating",
  "done",
];

export default function AnalysisLoading({ currentPhase }: AnalysisLoadingProps) {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    return () => clearInterval(t);
  }, []);

  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const progress = Math.round(((currentIdx + 1) / PHASE_ORDER.length) * 100);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      {/* Spinner ring */}
      <div className="relative w-24 h-24 mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - progress / 100)}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-blue-600">{progress}%</span>
        </div>
      </div>

      {/* Current message */}
      <p className="text-xl font-semibold text-gray-900 text-center">
        {LOADING_MESSAGES[currentPhase]}
        {currentPhase !== "done" && (
          <span className="text-blue-600">{dots}</span>
        )}
      </p>

      {/* Phase steps */}
      <div className="mt-8 w-full max-w-sm space-y-2">
        {PHASE_ORDER.filter((p) => p !== "done").map((phase, i) => {
          const idx = PHASE_ORDER.indexOf(phase);
          const isCompleted = idx < currentIdx;
          const isCurrent = phase === currentPhase;

          return (
            <div key={phase} className="flex items-center gap-3">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all",
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isCurrent
                    ? "bg-blue-600 text-white ring-4 ring-blue-100"
                    : "bg-gray-200 text-gray-500"
                )}
              >
                {isCompleted ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  "text-sm transition-colors",
                  isCompleted
                    ? "text-green-700 line-through opacity-60"
                    : isCurrent
                    ? "text-gray-900 font-medium"
                    : "text-gray-400"
                )}
              >
                {LOADING_MESSAGES[phase]}
              </span>
              {isCurrent && (
                <span className="ml-auto">
                  <span className="inline-flex gap-0.5">
                    {[0, 1, 2].map((j) => (
                      <span
                        key={j}
                        className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${j * 150}ms` }}
                      />
                    ))}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center max-w-xs">
        This is a demo analysis. Results are illustrative and not derived from AI processing of your actual resume.
      </p>
    </div>
  );
}
