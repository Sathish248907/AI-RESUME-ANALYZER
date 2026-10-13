"use client";

import { useState } from "react";
import { Hash, Lightbulb, Repeat, Zap, Tag, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { cn } from "@/lib/utils";
import type { Keyword, KeywordAnalysisResult } from "@/services/jobDescriptionParser";
import { EmptyBox } from "./SkillCategorySection";

interface KeywordAnalysisCardProps {
  keywords: KeywordAnalysisResult;
}

type TabKey = "technical" | "roleTerms" | "actionWords" | "repeated" | "suggested";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: "technical", label: "Technical", icon: Hash, hint: "Dictionary skills found verbatim in the description." },
  { key: "roleTerms", label: "Role terms", icon: Tag, hint: "Role-specific vocabulary (process, architecture, collaboration) found verbatim." },
  { key: "actionWords", label: "Action words", icon: Zap, hint: "Verbs the posting uses — strong openers for resume bullets." },
  { key: "repeated", label: "Repeated", icon: Repeat, hint: "Words used three or more times, excluding common filler words." },
  { key: "suggested", label: "For your resume", icon: Lightbulb, hint: "Terms worth considering. Exact matches appear in the posting; inferred terms are dictionary relatives." },
];

export default function KeywordAnalysisCard({ keywords }: KeywordAnalysisCardProps) {
  const [tab, setTab] = useState<TabKey>("technical");
  const [copied, setCopied] = useState(false);
  const active = TABS.find((t) => t.key === tab)!;
  const list: Keyword[] = keywords[tab] ?? [];

  async function copyExact() {
    const exact = list.filter((k) => k.matchType === "exact").map((k) => k.term);
    try {
      await navigator.clipboard.writeText(exact.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-blue-600" />
          Keyword Analysis
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">Exact matches come straight from the text. Inferred terms are suggestions only.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="tablist" className="flex gap-1 overflow-x-auto pb-1 -mb-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                tab === key ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              <span className={cn("tabular-nums", tab === key ? "text-blue-100" : "text-gray-400")}>{(keywords[key] ?? []).length}</span>
            </button>
          ))}
        </div>

        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-500">{active.hint}</p>
          {list.some((k) => k.matchType === "exact") && (
            <button type="button" onClick={copyExact} className="text-xs text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy exact terms"}
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <EmptyBox icon={active.icon} text="Nothing detected in this group." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {list.map((k) => (
              <span
                key={`${k.term}-${k.matchType}`}
                title={k.matchType === "exact" ? `Appears ${k.count} time${k.count === 1 ? "" : "s"} in the description` : `Inferred from “${k.derivedFrom}” — not in the posting text`}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border",
                  k.matchType === "exact"
                    ? "bg-white text-gray-800 border-gray-300"
                    : "bg-purple-50 text-purple-800 border-purple-200 border-dashed"
                )}
              >
                {k.term}
                {k.matchType === "exact" && k.count > 1 && <span className="text-[10px] text-gray-400 tabular-nums">×{k.count}</span>}
                {k.matchType === "inferred" && <span className="text-[10px] italic opacity-80">inferred</span>}
              </span>
            ))}
          </div>
        )}

        {tab === "suggested" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
            <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Only add a keyword to your resume if it accurately reflects your real skills or experience. Inferred terms (dashed, purple) are
            not in the posting and are listed only because they are related in the demo dictionary.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
