"use client";

import { useState } from "react";
import type { AnalysisResult as AnalysisResultType } from "@/types";
import ScoreGauge from "./ScoreGauge";
import SkillsPanel from "./SkillsPanel";
import SuggestionsList from "./SuggestionsList";
import KeywordAnalysis from "./KeywordAnalysis";
import { Card, CardContent } from "@/components/ui/Card";
import { Layers, Tag, Lightbulb, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalysisResultProps {
  result: AnalysisResultType;
  jobTitle: string;
  fileName: string;
}

const tabs = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "skills", label: "Skills", icon: Layers },
  { id: "keywords", label: "Keywords", icon: Tag },
  { id: "suggestions", label: "Suggestions", icon: Lightbulb },
] as const;

type Tab = (typeof tabs)[number]["id"];

export default function AnalysisResult({ result, jobTitle, fileName }: AnalysisResultProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <Card>
        <CardContent className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Analysis Complete</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-medium">{fileName}</span> vs{" "}
                <span className="font-medium">{jobTitle}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
              <span className="text-sm text-gray-600">AI-powered analysis by Gemini</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Score + stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-1">
          <ScoreGauge score={result.matchScore} />
        </div>
        <div className="sm:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard
            label="Matched Skills"
            value={result.matchedSkills.length}
            color="green"
          />
          <StatCard
            label="Missing Skills"
            value={result.missingSkills.length}
            color="red"
          />
          <StatCard
            label="Suggestions"
            value={result.suggestions.length}
            color="blue"
          />
          <StatCard
            label="ATS Issues"
            value={result.atsIssues.length}
            color={result.atsIssues.length === 0 ? "green" : "orange"}
          />
          <StatCard
            label="Keywords Found"
            value={result.keywordAnalysis.found.length}
            color="indigo"
          />
          <StatCard
            label="Interview Qs"
            value={result.interviewQuestions.length}
            color="purple"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "overview" && (
          <SkillsPanel
            matched={result.matchedSkills}
            missing={result.missingSkills}
          />
        )}
        {activeTab === "skills" && (
          <SkillsPanel
            matched={result.matchedSkills}
            missing={result.missingSkills}
          />
        )}
        {activeTab === "keywords" && (
          <KeywordAnalysis
            found={result.keywordAnalysis.found}
            missing={result.keywordAnalysis.missing}
            experienceAlignment={result.experienceAlignment}
            educationAlignment={result.educationAlignment}
          />
        )}
        {activeTab === "suggestions" && (
          <SuggestionsList
            strengths={result.strengths}
            suggestions={result.suggestions}
            atsIssues={result.atsIssues}
            interviewQuestions={result.interviewQuestions}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-4 rounded-xl border",
        colors[color] ?? colors.blue
      )}
    >
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-xs font-medium mt-1 text-center">{label}</span>
    </div>
  );
}
