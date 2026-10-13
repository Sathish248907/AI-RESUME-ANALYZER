"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalysisRecord } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import AnalysisResult from "@/components/dashboard/AnalysisResult";
import {
  formatDate,
  getScoreColor,
  getScoreLabel,
} from "@/lib/utils";
import {
  History,
  PlusCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import Button from "@/components/common/Button";

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses ?? []))
      .catch(() => setAnalyses([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this analysis?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      if (expanded === id) setExpanded(null);
    } catch {
      alert("Failed to delete.");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <svg className="animate-spin w-6 h-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading history…
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">No history yet</h2>
        <p className="text-gray-500 mt-3">
          Each analysis you run will appear here so you can track your progress.
        </p>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          Run First Analysis
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analysis History</h1>
          <p className="text-gray-500 mt-1">
            {analyses.length} analysis{analyses.length !== 1 ? "es" : ""} saved
          </p>
        </div>
        <Link
          href="/analyze"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
        >
          <PlusCircle className="w-4 h-4" />
          New Analysis
        </Link>
      </div>

      {/* List */}
      <div className="space-y-4">
        {analyses.map((analysis) => (
          <Card key={analysis.id} hover>
            {/* Row */}
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* File icon */}
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">
                    {analysis.jobTitle}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {analysis.resume?.fileName} · {formatDate(analysis.createdAt)}
                  </p>
                </div>

                {/* Score + badge */}
                <div className="flex items-center gap-3">
                  <span
                    className={`text-2xl font-bold tabular-nums ${getScoreColor(analysis.matchScore)}`}
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
                  >
                    {getScoreLabel(analysis.matchScore)}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpanded(expanded === analysis.id ? null : analysis.id)
                    }
                    aria-expanded={expanded === analysis.id}
                    aria-label={expanded === analysis.id ? "Collapse" : "Expand"}
                  >
                    {expanded === analysis.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    {expanded === analysis.id ? "Hide" : "View"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === analysis.id}
                    onClick={() => handleDelete(analysis.id)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Delete analysis"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Skill chips preview */}
              {expanded !== analysis.id && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {analysis.result?.matchedSkills?.slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-green-50 text-green-800 border border-green-200 rounded-full text-xs"
                    >
                      ✓ {s}
                    </span>
                  ))}
                  {analysis.result?.missingSkills?.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-red-50 text-red-800 border border-red-200 rounded-full text-xs"
                    >
                      ✗ {s}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>

            {/* Expanded full result */}
            {expanded === analysis.id && (
              <div className="border-t border-gray-100 px-6 py-6">
                <AnalysisResult
                  result={analysis.result}
                  jobTitle={analysis.jobTitle}
                  fileName={analysis.resume?.fileName ?? "resume"}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
