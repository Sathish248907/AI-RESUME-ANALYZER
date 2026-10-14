"use client";

import { useState } from "react";
import { HelpCircle, Code, User, FileText, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { InterviewQuestion } from "@/services/mockAnalysisService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface InterviewQuestionsListProps {
  questions: InterviewQuestion[];
}

const TYPE_META = {
  technical: { label: "Technical", icon: Code, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
  behavioral: { label: "Behavioral", icon: User, color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  "resume-based": { label: "Resume-based", icon: FileText, color: "text-green-700", bg: "bg-green-50 border-green-200" },
} as const;

const DIFFICULTY_META = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
} as const;

type TypeFilter = "all" | InterviewQuestion["type"];

export default function InterviewQuestionsList({ questions }: InterviewQuestionsListProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = typeFilter === "all"
    ? questions
    : questions.filter((q) => q.type === typeFilter);

  const counts = {
    technical: questions.filter((q) => q.type === "technical").length,
    behavioral: questions.filter((q) => q.type === "behavioral").length,
    "resume-based": questions.filter((q) => q.type === "resume-based").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-purple-600" />
          <CardTitle>Interview Preparation</CardTitle>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Suggested questions based on this role — not derived from your resume content.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Type filter */}
        <div className="flex flex-wrap gap-2">
          <FilterBtn active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All ({questions.length})
          </FilterBtn>
          {(["technical", "behavioral", "resume-based"] as const).map((t) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            return (
              <FilterBtn key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                <Icon className="w-3 h-3" />
                {meta.label} ({counts[t]})
              </FilterBtn>
            );
          })}
        </div>

        {/* Questions */}
        <div className="space-y-2">
          {filtered.map((q, i) => {
            const meta = TYPE_META[q.type];
            const Icon = meta.icon;
            const isOpen = expanded === i;
            return (
              <div
                key={i}
                className={cn("rounded-xl border transition-colors", isOpen ? meta.bg : "border-gray-200 bg-white hover:border-gray-300")}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : i)}
                  className="w-full flex items-start gap-3 p-4 text-left"
                  aria-expanded={isOpen}
                >
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", meta.bg)}>
                    <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={cn("px-2 py-0.5 rounded-full text-xs border", meta.bg, meta.color)}>
                        {meta.label}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", DIFFICULTY_META[q.difficulty])}>
                        {q.difficulty}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 leading-snug">{q.question}</p>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ml-10 bg-white rounded-lg border border-gray-100 p-3">
                      <p className="text-xs text-gray-500 font-medium mb-1">How to approach this:</p>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {getTip(q.type, q.difficulty)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="pt-2 border-t border-gray-100">
          <Link
            href="/analyze"
            className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            Start Interview Practice
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-center text-xs text-gray-400 mt-2">
            Full mock interview feature coming soon
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
      )}
    >
      {children}
    </button>
  );
}

function getTip(type: InterviewQuestion["type"], difficulty: InterviewQuestion["difficulty"]): string {
  if (type === "technical" && difficulty === "hard")
    return "Break the problem down before coding. Talk through your approach, mention edge cases, and analyse time/space complexity.";
  if (type === "technical")
    return "Explain your reasoning clearly. Interviewers value your thought process as much as the correct answer.";
  if (type === "behavioral")
    return "Use the STAR method: describe the Situation, Task, Action you took, and the Result you achieved.";
  return "Reference specific projects or experiences from your resume. Be concise and concrete with examples.";
}
