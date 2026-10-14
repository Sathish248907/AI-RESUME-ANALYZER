"use client";

import { useState } from "react";
import type { AnalysisView, AlignmentSummary } from "@/services/mockAnalysisService";
import MatchScoreCard from "./MatchScoreCard";
import SkillsComparison from "./SkillsComparison";
import ATSReadinessCard from "./ATSReadinessCard";
import RecommendationList from "./RecommendationList";
import InterviewQuestionsList from "@/components/interview/InterviewQuestionsList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import { BarChart3, Layers, Shield, Lightbulb, HelpCircle, Briefcase, GraduationCap, Hash, AlertTriangle, FileText } from "lucide-react";

interface AnalysisResultsLayoutProps {
  result: AnalysisView;
}

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "skills", label: "Skills", icon: Layers },
  { id: "alignment", label: "Alignment", icon: Briefcase, aiOnly: true },
  { id: "ats", label: "ATS", icon: Shield },
  { id: "recommendations", label: "Improvements", icon: Lightbulb },
  { id: "interview", label: "Interview", icon: HelpCircle },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function AnalysisResultsLayout({ result }: AnalysisResultsLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const isAi = result.analysisMode === "ai";

  const matchedCount = result.skills.filter((s) => s.matchType === "matched").length;
  const partialCount = result.skills.filter((s) => s.matchType === "partial").length;
  const missingCount = result.skills.filter((s) => s.matchType === "missing").length;
  const tabs = TABS.filter((t) => !("aiOnly" in t && t.aiOnly) || isAi);

  return (
    <div className="space-y-6">
      <MatchScoreCard
        score={result.matchScore}
        matchedCount={matchedCount}
        partialCount={partialCount}
        missingCount={missingCount}
        explanation={result.matchExplanation}
        mode={result.analysisMode}
        scoreAvailable={result.scoreAvailable ?? true}
        lowEvidence={result.lowEvidence}
        breakdown={result.scoreBreakdown}
        provider={result.provider}
        model={result.model}
      />

      {isAi && result.summary && (
        <Card>
          <CardContent className="py-4 flex items-start gap-3">
            <FileText className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Summary</p>
              <p className="text-sm text-gray-700 leading-relaxed">{result.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {isAi && result.limitations && result.limitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Limitations noted by the analysis</p>
          <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5">
            {result.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                activeTab === id ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="animate-fade-in">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <SkillsComparison skills={result.skills} mode={result.analysisMode} />
            <ATSReadinessCard checks={result.atsChecks} mode={result.analysisMode} />
          </div>
        )}
        {activeTab === "skills" && <SkillsComparison skills={result.skills} mode={result.analysisMode} />}
        {activeTab === "alignment" && isAi && (
          <AlignmentPanel experience={result.experienceAlignment} education={result.educationAlignment} keywords={result.keywordAnalysis} />
        )}
        {activeTab === "ats" && <ATSReadinessCard checks={result.atsChecks} mode={result.analysisMode} />}
        {activeTab === "recommendations" && <RecommendationList recommendations={result.recommendations} strengths={result.strengths} />}
        {activeTab === "interview" && (
          <InterviewQuestionsList
            questions={result.interviewQuestions}
            mode={result.analysisMode}
            session={isAi ? { analysisId: result.id, targetRole: result.targetRole, enabled: true } : undefined}
          />
        )}
      </div>
    </div>
  );
}

const MEETS_META: Record<AlignmentSummary["meetsRequirement"], { label: string; variant: "success" | "warning" | "error" | "neutral" }> = {
  yes: { label: "Meets requirement", variant: "success" },
  partial: { label: "Partially meets", variant: "warning" },
  no: { label: "Does not meet", variant: "error" },
  unknown: { label: "Could not determine", variant: "neutral" },
};

function AlignmentPanel({ experience, education, keywords }: { experience?: AlignmentSummary; education?: AlignmentSummary; keywords?: AnalysisView["keywordAnalysis"] }) {
  return (
    <div className="space-y-4">
      {experience && <AlignmentCard title="Experience alignment" icon={Briefcase} data={experience} />}
      {education && <AlignmentCard title="Education alignment" icon={GraduationCap} data={education} />}
      {keywords && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Hash className="w-5 h-5 text-blue-600" /> Keyword Coverage</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Only add a recommended term if it genuinely reflects your experience — recommended terms are rephrasings of what the resume already shows.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <KeywordRow label="Found in resume" items={keywords.foundKeywords} cls="bg-green-50 text-green-800 border-green-200" />
            <KeywordRow label="Missing or unverified" items={keywords.missingOrUnverifiedKeywords} cls="bg-red-50 text-red-800 border-red-200" />
            <KeywordRow label="Recommended rewording" items={keywords.recommendedKeywords} cls="bg-indigo-50 text-indigo-800 border-indigo-200" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KeywordRow({ label, items, cls }: { label: string; items: string[]; cls: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1.5">{label} <span className="text-gray-400">({items.length})</span></p>
      {items.length === 0 ? <p className="text-xs text-gray-400 italic">None.</p> : (
        <div className="flex flex-wrap gap-1.5">{items.map((k) => <span key={k} className={cn("px-2 py-0.5 rounded-full text-xs border", cls)}>{k}</span>)}</div>
      )}
    </div>
  );
}

function AlignmentCard({ title, icon: Icon, data }: { title: string; icon: React.ComponentType<{ className?: string }>; data: AlignmentSummary }) {
  const meta = MEETS_META[data.meetsRequirement] ?? MEETS_META.unknown;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Icon className="w-5 h-5 text-blue-600" /> {title}</CardTitle>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700 leading-relaxed">{data.assessment}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EvidenceList title="Job requirements" items={data.jobRequirements} empty="The job description states no requirement." />
          <EvidenceList title="Evidence in resume" items={data.resumeEvidence} empty="No supporting evidence found in the resume text." />
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      {items.length === 0 ? <p className="text-xs text-gray-400 italic">{empty}</p> : (
        <ul className="text-sm text-gray-700 space-y-1 list-disc pl-4">{items.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
      )}
    </div>
  );
}
