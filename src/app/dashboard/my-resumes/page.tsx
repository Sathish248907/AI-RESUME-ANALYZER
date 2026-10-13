"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnalysisMetas, deleteAnalysis, clearAllAnalyses } from "@/services/analysisStorage";
import type { StoredAnalysisMeta } from "@/services/analysisStorage";
import { formatDate, getScoreColor, getScoreLabel } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import {
  History, PlusCircle, Trash2, Eye, FileText, Calendar,
  Briefcase, TrendingUp, Target, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function MyResumesPage() {
  const [analyses, setAnalyses] = useState<StoredAnalysisMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = useCallback(() => {
    setAnalyses(getAnalysisMetas());
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this analysis?")) return;
    setDeleting(id);
    deleteAnalysis(id);
    reload();
    setDeleting(null);
  }, [reload]);

  const handleClearAll = useCallback(() => {
    if (!confirm("Delete ALL saved analyses? This cannot be undone.")) return;
    clearAllAnalyses();
    reload();
  }, [reload]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (analyses.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">No analyses yet</h2>
        <p className="text-gray-500 mt-3 text-sm leading-relaxed">
          Run your first demo resume analysis to see your results here.
          Analyses are saved locally in your browser.
        </p>
        <Link
          href="/dashboard/resume-analyzer"
          className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Analyze a Resume
        </Link>
      </div>
    );
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const avgScore = Math.round(
    analyses.reduce((s, a) => s + a.matchScore, 0) / analyses.length
  );
  const best = analyses.reduce((b, a) => (a.matchScore > b.matchScore ? a : b));
  const latest = analyses[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resume History</h1>
          <p className="text-gray-500 mt-1">
            {analyses.length} demo {analyses.length === 1 ? "analysis" : "analyses"} saved locally
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/resume-analyzer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Analysis
          </Link>
          {analyses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="text-red-500 hover:text-red-700 hover:border-red-300"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Demo notice */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Demo analyses only.</span>{" "}
          Stored in your browser&apos;s localStorage. Clearing browser data will remove these.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total" value={analyses.length} color="blue" />
        <StatCard
          icon={TrendingUp}
          label="Average"
          value={`${avgScore}%`}
          color={avgScore >= 80 ? "green" : avgScore >= 60 ? "amber" : "red"}
        />
        <StatCard icon={Target} label="Best" value={`${best.matchScore}%`} color="green" />
        <StatCard
          icon={Calendar}
          label="Latest"
          value={formatDate(latest.createdAt)}
          color="indigo"
          small
        />
      </div>

      {/* Analysis list */}
      <div className="space-y-3">
        {analyses.map((analysis) => (
          <Card key={analysis.id} hover>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Icon */}
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-semibold text-gray-900 truncate">{analysis.jobTitle}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-3 h-3" />
                      {analysis.targetRole}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {analysis.fileName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(analysis.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="hidden sm:block w-24">
                    <ProgressBar
                      value={analysis.matchScore}
                      barClassName={cn(
                        analysis.matchScore >= 80
                          ? "bg-green-500"
                          : analysis.matchScore >= 60
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      )}
                    />
                  </div>
                  <span
                    className={`text-lg font-bold tabular-nums w-12 text-right ${getScoreColor(analysis.matchScore)}`}
                  >
                    {analysis.matchScore}%
                  </span>
                  <Badge
                    variant={
                      analysis.matchScore >= 80
                        ? "success"
                        : analysis.matchScore >= 60
                        ? "warning"
                        : "error"
                    }
                    className="hidden sm:inline-flex"
                  >
                    {getScoreLabel(analysis.matchScore)}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link
                    href={`/dashboard/resume-analysis/${analysis.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === analysis.id}
                    onClick={() => handleDelete(analysis.id)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
        <Link
          href="/analyze"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors text-sm"
        >
          <FileText className="w-4 h-4" />
          Try Live AI Analysis
        </Link>
        <Link
          href="/dashboard"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm"
        >
          <TrendingUp className="w-4 h-4" />
          View Dashboard
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  small = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  small?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2.5", colors[color] ?? colors.blue)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className={cn("font-bold text-gray-900 leading-tight", small ? "text-base" : "text-2xl")}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
