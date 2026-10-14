"use client";

import { useState } from "react";
import type { MockAnalysisResult } from "@/services/mockAnalysisService";
import MatchScoreCard from "./MatchScoreCard";
import SkillsComparison from "./SkillsComparison";
import ATSReadinessCard from "./ATSReadinessCard";
import RecommendationList from "./RecommendationList";
import InterviewQuestionsList from "./InterviewQuestionsList";
import { cn } from "@/lib/utils";
import {
  BarChart3, Layers, Shield, Lightbulb, HelpCircle,
} from "lucide-react";

interface AnalysisResultsLayoutProps {
  result: MockAnalysisResult;
}

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "skills", label: "Skills", icon: Layers },
  { id: "ats", label: "ATS", icon: Shield },
  { id: "recommendations", label: "Improvements", icon: Lightbulb },
  { id: "interview", label: "Interview", icon: HelpCircle },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function AnalysisResultsLayout({ result }: AnalysisResultsLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const matchedCount = result.skills.filter((s) => s.matchType === "matched").length;
  const partialCount = result.skills.filter((s) => s.matchType === "partial").length;
  const missingCount = result.skills.filter((s) => s.matchType === "missing").length;

  return (
    <div className="space-y-6">
      {/* Score — always visible */}
      <MatchScoreCard
        score={result.matchScore}
        matchedCount={matchedCount}
        partialCount={partialCount}
        missingCount={missingCount}
        explanation={result.matchExplanation}
      />

      {/* Tab bar */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                activeTab === id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <SkillsComparison skills={result.skills} />
            <ATSReadinessCard checks={result.atsChecks} />
          </div>
        )}
        {activeTab === "skills" && <SkillsComparison skills={result.skills} />}
        {activeTab === "ats" && <ATSReadinessCard checks={result.atsChecks} />}
        {activeTab === "recommendations" && (
          <RecommendationList
            recommendations={result.recommendations}
            strengths={result.strengths}
          />
        )}
        {activeTab === "interview" && (
          <InterviewQuestionsList questions={result.interviewQuestions} />
        )}
      </div>
    </div>
  );
}
