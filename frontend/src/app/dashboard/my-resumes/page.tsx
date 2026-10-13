"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAnalysisMetas, deleteAnalysis, clearAllAnalyses } from "@/services/analysisStorage";
import { deleteAiAnalysis, listAiAnalyses } from "@/services/resumeAnalysisService";
import { useAuth } from "@/services/authService";
import { toApiClientError } from "@/services/api";
import { formatDate, getScoreColor, getScoreLabel } from "@/lib/utils";
import { Badge } from "@/components/common/Badge";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { ProgressBar } from "@/components/common/ProgressBar";
import { History, PlusCircle, Trash2, Eye, FileText, Calendar, Briefcase, TrendingUp, Target, AlertTriangle, Bot, FlaskConical, LogIn, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryItem {
  id: string;
  mode: "ai" | "demo";
  jobTitle: string;
  targetRole: string;
  companyName?: string | null;
  fileName: string;
  matchScore: number;
  createdAt: string;
  provider?: string | null;
}

type Filter = "all" | "ai" | "demo";

export default function MyResumesPage() {
  const { user, ready: authReady } = useAuth();
  const [demoItems, setDemoItems] = useState<HistoryItem[]>([]);
  const [aiItems, setAiItems] = useState<HistoryItem[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const reloadDemo = useCallback(() => {
    setDemoItems(
      getAnalysisMetas().map((m) => ({ id: m.id, mode: "demo", jobTitle: m.jobTitle, targetRole: m.targetRole, fileName: m.fileName, matchScore: m.matchScore, createdAt: m.createdAt }))
    );
    setLoaded(true);
  }, []);

  const reloadAi = useCallback(async () => {
    if (!user) {
      setAiItems([]);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const list = await listAiAnalyses();
      setAiItems(
        list.map((a) => ({ id: a.id, mode: "ai", jobTitle: a.jobTitle, targetRole: a.targetRole, companyName: a.companyName, fileName: a.fileName ?? "resume", matchScore: a.matchScore, createdAt: a.createdAt, provider: a.provider }))
      );
    } catch (err) {
      setAiError(toApiClientError(err).message);
    } finally {
      setAiLoading(false);
    }
  }, [user]);

  useEffect(() => { reloadDemo(); }, [reloadDemo]);
  useEffect(() => { if (authReady) reloadAi(); }, [authReady, reloadAi]);

  const handleDelete = useCallback(async (item: HistoryItem) => {
    if (!confirm(`Delete this ${item.mode === "ai" ? "AI" : "demo"} analysis?`)) return;
    setDeleting(item.id);
    try {
      if (item.mode === "ai") {
        await deleteAiAnalysis(item.id);
        setAiItems((prev) => prev.filter((a) => a.id !== item.id));
      } else {
        deleteAnalysis(item.id);
        reloadDemo();
      }
    } catch (err) {
      alert(toApiClientError(err).message);
    } finally {
      setDeleting(null);
    }
  }, [reloadDemo]);

  const handleClearDemo = useCallback(() => {
    if (!confirm("Delete ALL demo analyses saved in this browser? This cannot be undone.")) return;
    clearAllAnalyses();
    reloadDemo();
  }, [reloadDemo]);

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

  const all = [...aiItems, ...demoItems].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const analyses = filter === "all" ? all : all.filter((a) => a.mode === filter);

  if (all.length === 0 && !aiLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <History className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">No analyses yet</h2>
        <p className="text-gray-500 mt-3 text-sm leading-relaxed">
          Run a resume analysis to see your results here. AI analyses are saved to your account; demo analyses stay in this browser.
        </p>
        {aiError && <p className="text-xs text-red-600 mt-3">{aiError}</p>}
        <Link href="/dashboard/resume-analyzer" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
          <PlusCircle className="w-4 h-4" /> Analyze a Resume
        </Link>
      </div>
    );
  }

  const scored = all.filter((a) => a.matchScore > 0);
  const avgScore = scored.length ? Math.round(scored.reduce((s, a) => s + a.matchScore, 0) / scored.length) : 0;
  const best = scored.length ? scored.reduce((b, a) => (a.matchScore > b.matchScore ? a : b)) : null;
  const latest = all[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resume History</h1>
          <p className="text-gray-500 mt-1">
            {aiItems.length} AI {aiItems.length === 1 ? "analysis" : "analyses"} · {demoItems.length} demo {demoItems.length === 1 ? "analysis" : "analyses"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/resume-analyzer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm">
            <PlusCircle className="w-4 h-4" /> New Analysis
          </Link>
          {demoItems.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearDemo} className="text-red-500 hover:text-red-700 hover:border-red-300">
              <Trash2 className="w-3.5 h-3.5" /> Clear demo
            </Button>
          )}
        </div>
      </div>

      {!user && authReady && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-900">
          <LogIn className="w-4 h-4 mt-0.5 flex-shrink-0 text-indigo-500" />
          <span>
            <Link href="/auth/login?next=/dashboard/my-resumes" className="font-medium text-blue-600 hover:underline">Sign in</Link> to see AI analyses saved to your account. Demo analyses below are stored in this browser only.
          </span>
        </div>
      )}
      {aiError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Could not load AI analyses: {aiError} <button type="button" onClick={reloadAi} className="underline ml-1">Retry</button></span>
        </div>
      )}
      {aiLoading && <p className="text-xs text-gray-400 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Loading AI analyses…</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total" value={all.length} color="blue" />
        <StatCard icon={TrendingUp} label="Average" value={scored.length ? `${avgScore}%` : "—"} color={avgScore >= 80 ? "green" : avgScore >= 60 ? "amber" : "red"} />
        <StatCard icon={Target} label="Best" value={best ? `${best.matchScore}%` : "—"} color="green" />
        <StatCard icon={Calendar} label="Latest" value={latest ? formatDate(latest.createdAt) : "—"} color="indigo" small />
      </div>

      <div className="flex gap-1.5">
        {(["all", "ai", "demo"] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize", filter === f ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400")}>
            {f === "all" ? `All (${all.length})` : f === "ai" ? `AI (${aiItems.length})` : `Demo (${demoItems.length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {analyses.length === 0 && <p className="text-sm text-gray-400 italic">No analyses in this filter.</p>}
        {analyses.map((analysis) => (
          <Card key={analysis.id} hover>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", analysis.mode === "ai" ? "bg-indigo-50" : "bg-amber-50")}>
                  {analysis.mode === "ai" ? <Bot className="w-5 h-5 text-indigo-600" /> : <FlaskConical className="w-5 h-5 text-amber-600" />}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{analysis.jobTitle}</p>
                    <span className={cn("text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded flex-shrink-0", analysis.mode === "ai" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700")}>
                      {analysis.mode === "ai" ? "AI" : "Demo"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{analysis.targetRole}</span>
                    {analysis.companyName && <span>{analysis.companyName}</span>}
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{analysis.fileName}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(analysis.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="hidden sm:block w-24">
                    <ProgressBar value={analysis.matchScore} barClassName={cn(analysis.matchScore >= 80 ? "bg-green-500" : analysis.matchScore >= 60 ? "bg-yellow-500" : "bg-red-500")} />
                  </div>
                  <span className={`text-lg font-bold tabular-nums w-12 text-right ${getScoreColor(analysis.matchScore)}`}>{analysis.matchScore}%</span>
                  <Badge variant={analysis.matchScore >= 80 ? "success" : analysis.matchScore >= 60 ? "warning" : "error"} className="hidden sm:inline-flex">
                    {getScoreLabel(analysis.matchScore)}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link href={`/dashboard/resume-analysis/${analysis.id}`} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> View
                  </Link>
                  <Button variant="ghost" size="sm" loading={deleting === analysis.id} onClick={() => handleDelete(analysis)} className="text-red-400 hover:text-red-600 hover:bg-red-50" aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        Demo analyses are illustrative samples stored in localStorage. AI analyses are stored on the server under your account; resume text is not retained by default.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
        <Link href="/dashboard/resume-analyzer" className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-sm">
          <Bot className="w-4 h-4" /> Run AI Analysis
        </Link>
        <Link href="/dashboard" className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
          <TrendingUp className="w-4 h-4" /> View Dashboard
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, small = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string; small?: boolean }) {
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
      <div className={cn("font-bold text-gray-900 leading-tight", small ? "text-base" : "text-2xl")}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
