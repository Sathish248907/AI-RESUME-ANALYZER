"use client";

import { useState } from "react";
import {
  Lightbulb, Tag, Trophy, FolderOpen, AlignLeft, ChevronDown, ChevronUp,
} from "lucide-react";
import type { RecommendationItem } from "@/services/mockAnalysisService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { cn } from "@/lib/utils";

interface RecommendationListProps {
  recommendations: RecommendationItem[];
  strengths: string[];
}

const TYPE_META = {
  keyword: { label: "Keyword", icon: Tag, color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  achievement: { label: "Achievement", icon: Trophy, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  project: { label: "Project", icon: FolderOpen, color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  structure: { label: "Structure", icon: AlignLeft, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  general: { label: "General", icon: Lightbulb, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
} as const;

const PRIORITY_META = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
} as const;

export default function RecommendationList({ recommendations, strengths }: RecommendationListProps) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? recommendations : recommendations.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Strengths */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <CardTitle>Resume Strengths</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-500" />
            <CardTitle>Improvement Recommendations</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {displayed.map((rec, i) => {
            const meta = TYPE_META[rec.type];
            const Icon = meta.icon;
            return (
              <div
                key={i}
                className={cn("flex items-start gap-3 rounded-xl border p-4", meta.bg)}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", meta.bg)}>
                  <Icon className={cn("w-4 h-4", meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-gray-900">{rec.title}</p>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", PRIORITY_META[rec.priority])}>
                      {rec.priority} priority
                    </span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs border", meta.bg, meta.color)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{rec.description}</p>
                </div>
              </div>
            );
          })}

          {recommendations.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors rounded-lg hover:bg-blue-50"
            >
              {showAll ? (
                <><ChevronUp className="w-4 h-4" /> Show less</>
              ) : (
                <><ChevronDown className="w-4 h-4" /> Show {recommendations.length - 3} more recommendations</>
              )}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
