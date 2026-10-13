"use client";

import { useEffect, useState } from "react";
import { getScoreLabel } from "@/lib/utils";

interface ScoreGaugeProps {
  score: number;
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDisplayed(score), 200);
    return () => clearTimeout(timer);
  }, [score]);

  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (displayed / 100) * circumference;

  const color =
    score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const bgColor =
    score >= 80 ? "#f0fdf4" : score >= 60 ? "#fffbeb" : "#fef2f2";

  return (
    <div
      className="flex flex-col items-center justify-center p-8 rounded-2xl"
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative w-36 h-36">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-4xl font-bold tabular-nums"
            style={{ color }}
          >
            {displayed}
          </span>
          <span className="text-xs text-gray-500 font-medium">/ 100</span>
        </div>
      </div>
      <p className="mt-3 font-semibold text-gray-800">{getScoreLabel(score)}</p>
      <p className="text-xs text-gray-500 mt-1 text-center max-w-[160px]">
        Estimated based on skills, keywords & experience
      </p>
    </div>
  );
}
