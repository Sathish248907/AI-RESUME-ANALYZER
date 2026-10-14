"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Eye, Trash2, RefreshCw, Bot, FlaskConical, Briefcase, Calendar, FileText, LogIn, PlusCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { listAnalysisHistory, type AnalysisHistoryItem, type AnalysisSort } from "@/services/analysisHistoryService";
import { deleteAiAnalysis, regenerateAiAnalysis } from "@/services/resumeAnalysisService";
import { getAnalysisMetas, deleteAnalysis as deleteDemo, clearAllAnalyses } from "@/services/analysisStorage";
import { cn, formatDate, getScoreColor, getScoreLabel } from "@/lib/utils";

type Source = "all" | "ai" | "demo";

interface Row {
  id: string;
  mode: "ai" | "demo";
  jobTitle: string;
  companyName: string | null;
  targetRole: string;
  resumeName: string | null;
  matchScore: number;
  scoreAvailable: boolean;
  createdAt: string;
  skillCounts?: { matched: number; partial: number; missing: number };
  provider?: string | null;
}

export default function AnalysisHistoryPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [aiRows, setAiRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("all");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<AnalysisSort>("newest");

  const [demoRows, setDemoRows] = useState<Row[]>([]);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadDemo = useCallback(() => {
    setDemoRows(
      getAnalysisMetas().map((m) => ({ id: m.id, mode: "demo", jobTitle: m.jobTitle, companyName: null, targetRole: m.targetRole, resumeName: m.fileName, matchScore: m.matchScore, scoreAvailable: true, createdAt: m.createdAt }))
    );
  }, []);

  const loadAi = useCallback(async () => {
    if (!user) {
      setAiRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listAnalysisHistory({ targetRole: role || undefined, from: from || undefined, to: to ? `${to}T23:59:59` : undefined, sort, page, limit: 20 });
      setAiRows(
        data.analyses.map((a: AnalysisHistoryItem) => ({
          id: a.id, mode: "ai", jobTitle: a.jobTitle, companyName: a.companyName, targetRole: a.targetRole, resumeName: a.resumeName, matchScore: a.matchScore, scoreAvailable: a.scoreAvailable, createdAt: a.createdAt, skillCounts: a.skillCounts, provider: a.provider,
        }))
      );
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, role, from, to, sort, page]);

  useEffect(() => { loadDemo(); }, [loadDemo]);
  useEffect(() => { if (ready) loadAi(); }, [ready, loadAi]);
  useEffect(() => { setPage(1); }, [role, from, to, sort]);

  const filteredDemo = useMemo(() => {
    let rows = demoRows;
    if (role) rows = rows.filter((r) => r.targetRole === role);
    if (from) rows = rows.filter((r) => r.createdAt >= from);
    if (to) rows = rows.filter((r) => r.createdAt <= `${to}T23:59:59`);
    const dir = sort === "oldest" ? 1 : -1;
    return [...rows].sort((a, b) => (sort.startsWith("score") ? (sort === "score_desc" ? b.matchScore - a.matchScore : a.matchScore - b.matchScore) : (a.createdAt < b.createdAt ? dir : -dir)));
  }, [demoRows, role, from, to, sort]);

  const rows = source === "ai" ? aiRows : source === "demo" ? filteredDemo : [...aiRows, ...filteredDemo].sort((a, b) => (sort.startsWith("score") ? (sort === "score_desc" ? b.matchScore - a.matchScore : a.matchScore - b.matchScore) : sort === "oldest" ? (a.createdAt < b.createdAt ? -1 : 1) : (a.createdAt < b.createdAt ? 1 : -1)));

  async function handleDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      if (deleting.mode === "ai") {
        await deleteAiAnalysis(deleting.id);
        await loadAi();
      } else {
        deleteDemo(deleting.id);
        loadDemo();
      }
      toast.success("Analysis deleted.");
      setDeleting(null);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleReanalyze(row: Row) {
    if (row.mode !== "ai") {
      router.push("/dashboard/resume-analyzer");
      return;
    }
    setBusyId(row.id);
    try {
      const rec = await regenerateAiAnalysis(row.id);
      toast.success("New analysis created. The previous result was kept in your history.");
      router.push(`/dashboard/resume-analysis/${rec.id}`);
    } catch (err) {
      const e = toApiClientError(err);
      toast.error(e.code === "RESUME_TEXT_UNAVAILABLE" ? "Resume text is not stored for this analysis — upload the resume to My Resumes and run a new analysis." : e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analysis History</h1>
          <p className="text-gray-500 mt-1">
            {user ? `${total} AI ${total === 1 ? "analysis" : "analyses"} in your account` : "Sign in to see AI analyses"} · {demoRows.length} demo in this browser
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/resume-analyzer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 text-sm"><PlusCircle className="w-4 h-4" /> New analysis</Link>
          {demoRows.length > 0 && <Button variant="outline" size="sm" className="text-red-600" onClick={() => { if (confirm("Delete all demo analyses in this browser?")) { clearAllAnalyses(); loadDemo(); } }}><Trash2 className="w-3.5 h-3.5" /> Clear demo</Button>}
        </div>
      </div>

      {!user && (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-900">
          <LogIn className="w-4 h-4 mt-0.5 text-indigo-500" />
          <span><Link href="/auth/login?next=/dashboard/analysis-history" className="font-medium text-blue-600 hover:underline">Sign in</Link> to see AI analyses saved to your account. Demo results below are illustrative samples stored only in this browser.</span>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <label className="text-xs text-gray-600">Source
            <select value={source} onChange={(e) => setSource(e.target.value as Source)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="all">All</option><option value="ai">AI only</option><option value="demo">Demo only</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">Target role
            <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Any</option>{TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white" />
          </label>
          <label className="text-xs text-gray-600">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white" />
          </label>
          <label className="text-xs text-gray-600">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as AnalysisSort)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="score_desc">Score high → low</option><option value="score_asc">Score low → high</option>
            </select>
          </label>
          <Button variant="ghost" size="sm" onClick={() => { setRole(""); setFrom(""); setTo(""); setSort("newest"); setSource("all"); }}>Reset</Button>
        </CardContent>
      </Card>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex justify-between gap-3"><span>{error}</span><Button size="sm" variant="outline" onClick={loadAi}>Retry</Button></div>}

      {loading && user ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="No analyses match" description={user ? "Run an analysis or widen the filters." : "Sign in to load your AI analyses, or run a demo analysis."} action={{ label: "Run an analysis", href: "/dashboard/resume-analyzer", icon: PlusCircle }} />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={`${row.mode}-${row.id}`} hover>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0", row.mode === "ai" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600")}>
                    {row.mode === "ai" ? <Bot className="w-5 h-5" /> : <FlaskConical className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{row.jobTitle}{row.companyName ? ` · ${row.companyName}` : ""}</p>
                      <span className={cn("text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded", row.mode === "ai" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700")}>{row.mode === "ai" ? "AI" : "Demo"}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{row.targetRole}</span>
                      {row.resumeName && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{row.resumeName}</span>}
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(row.createdAt)}</span>
                      {row.skillCounts && <span>{row.skillCounts.matched} matched · {row.skillCounts.partial} partial · {row.skillCounts.missing} missing/unverified</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={cn("text-lg font-bold tabular-nums w-12 text-right", getScoreColor(row.matchScore))}>{row.scoreAvailable ? `${row.matchScore}%` : "—"}</span>
                    <Badge variant={row.matchScore >= 80 ? "success" : row.matchScore >= 60 ? "warning" : "error"} className="hidden sm:inline-flex">{row.scoreAvailable ? getScoreLabel(row.matchScore) : "No score"}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Link href={`/dashboard/resume-analysis/${row.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"><Eye className="w-3.5 h-3.5" /> View</Link>
                    <Button size="sm" variant="ghost" onClick={() => handleReanalyze(row)} loading={busyId === row.id} title={row.mode === "ai" ? "Run again as a new history record" : "Start a new analysis"}><RefreshCw className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(row)} className="text-red-500 hover:bg-red-50" aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {user && source !== "demo" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /> Prev</Button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}

      <p className="text-xs text-gray-400">Match scores are application-defined estimates, not hiring probabilities. Demo analyses are illustrative samples and are never mixed into AI statistics.</p>

      <ConfirmDialog open={Boolean(deleting)} title="Delete analysis?" message={`"${deleting?.jobTitle}" will be permanently removed${deleting?.mode === "ai" ? " from your account" : " from this browser"}.`} confirmLabel="Delete" busy={Boolean(busyId)} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
