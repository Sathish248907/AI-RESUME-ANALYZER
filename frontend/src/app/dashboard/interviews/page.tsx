"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Plus, LogIn, Play, FileText, Trash2, Target, TrendingDown, TrendingUp, Lightbulb, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { SkeletonList, SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { deleteInterview, getInterviewHistory, INTERVIEW_TYPE_LABELS, type InterviewSession, type InterviewStatus } from "@/services/interviewService";
import { getPracticeRecommendations, type PracticeRecommendations } from "@/services/interviewReportService";
import { cn, formatDate, getScoreColor } from "@/lib/utils";

const STATUS_META: Record<InterviewStatus, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-800 border-blue-200" },
  completed: { label: "Completed", cls: "bg-green-50 text-green-800 border-green-200" },
  abandoned: { label: "Abandoned", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function InterviewsHubPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [summary, setSummary] = useState<{ completed: number; questionsPracticed: number } | null>(null);
  const [recs, setRecs] = useState<PracticeRecommendations | null>(null);
  const [status, setStatus] = useState<InterviewStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<InterviewSession | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [h, r] = await Promise.all([getInterviewHistory({ status: status || undefined, source: "mock_interview", limit: 50 }), getPracticeRecommendations()]);
      setSessions(h.sessions);
      setSummary(h.summary);
      setRecs(r);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, status]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteInterview(deleting.id);
      toast.success("Interview deleted, including its questions and answers.");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={LogIn} title="Sign in to practise interviews" description="AI mock interviews generate personalised questions, evaluate your answers and track weak topics in your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/interviews", icon: LogIn }} />
      </div>
    );
  }

  const inProgress = sessions.filter((s) => s.status === "in_progress");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mock Interviews</h1>
          <p className="text-gray-500 mt-1">{summary ? `${summary.completed} completed · ${summary.questionsPracticed} questions answered` : "AI-generated questions, evaluated answers, tracked progress."}</p>
        </div>
        <Link href="/dashboard/interviews/new" className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 text-sm"><Plus className="w-4 h-4" /> New interview</Link>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex justify-between gap-3"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3"><SkeletonCard className="lg:col-span-2" lines={6} /><SkeletonCard lines={6} /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {inProgress.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/40">
                <CardContent className="py-4">
                  <p className="text-sm font-semibold text-blue-900 flex items-center gap-2"><Clock className="w-4 h-4" /> Resume where you left off</p>
                  <ul className="mt-2 space-y-2">
                    {inProgress.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-800">{INTERVIEW_TYPE_LABELS[s.interviewType]} · {s.targetRole} · {s.answeredQuestions}/{s.totalQuestions} answered</span>
                        <Link href={`/dashboard/interviews/${s.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><Play className="w-3.5 h-3.5" /> Continue</Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">History</h2>
              <select value={status} onChange={(e) => setStatus(e.target.value as InterviewStatus | "")} className="text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white" aria-label="Filter by status">
                <option value="">All statuses</option><option value="completed">Completed</option><option value="in_progress">In progress</option><option value="abandoned">Abandoned</option>
              </select>
            </div>

            {sessions.length === 0 ? (
              <EmptyState icon={Mic} title="No interviews yet" description="Configure a mock interview for your target role. Questions are generated by the AI provider and your answers are evaluated against a per-question rubric." action={{ label: "Start your first interview", href: "/dashboard/interviews/new", icon: Plus }} />
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <Card key={s.id} hover>
                    <CardContent className="py-4 flex flex-wrap items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0"><Mic className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 truncate">{INTERVIEW_TYPE_LABELS[s.interviewType]} · {s.targetRole}</p>
                          <span className={cn("text-[11px] font-medium rounded-full border px-2 py-0.5", STATUS_META[s.status].cls)}>{STATUS_META[s.status].label}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 capitalize">{s.difficulty} · {s.totalQuestions} questions · {s.durationMinutes ?? "—"} min · {formatDate(s.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        {s.status === "completed" ? (
                          <>
                            <span className={cn("text-xl font-bold tabular-nums", s.overallScore === null ? "text-gray-400" : getScoreColor(s.overallScore))}>{s.overallScore === null ? "—" : `${s.overallScore}%`}</span>
                            <span className="block text-[11px] text-gray-400">{s.answeredQuestions}/{s.totalQuestions} answered</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500">{s.answeredQuestions}/{s.totalQuestions} answered</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.status === "completed" ? (
                          <Link href={`/dashboard/interviews/${s.id}/report`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"><FileText className="w-3.5 h-3.5" /> Report</Link>
                        ) : s.status === "in_progress" ? (
                          <Link href={`/dashboard/interviews/${s.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"><Play className="w-3.5 h-3.5" /> Continue</Link>
                        ) : (
                          <Link href={`/dashboard/interviews/${s.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Review</Link>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDeleting(s)} className="text-red-500 hover:bg-red-50" aria-label="Delete interview"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Recommendations */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Practice recommendations</CardTitle><p className="text-xs text-gray-500 mt-1">Derived from {recs?.evidence.evaluatedAnswers ?? 0} evaluated answers</p></CardHeader>
              <CardContent>
                {!recs || recs.recommendations.length === 0 ? <p className="text-sm text-gray-400 italic">Complete an interview to get recommendations based on your answers.</p> : (
                  <ul className="space-y-2.5">
                    {recs.recommendations.map((r) => (
                      <li key={r.key} className="rounded-lg border border-gray-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-gray-900">{r.title}</p><Badge variant={r.priority === "high" ? "error" : r.priority === "medium" ? "warning" : "neutral"}>{r.priority}</Badge></div>
                        <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>
                        {r.topic && <Link href={`/dashboard/interviews/new?topic=${encodeURIComponent(r.topic)}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">Practise this topic →</Link>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            {recs && (recs.weakTopics.length > 0 || recs.strongTopics.length > 0) && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-4 h-4 text-indigo-600" /> Topic performance</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {recs.weakTopics.length > 0 && <div><p className="text-xs font-semibold text-red-700 flex items-center gap-1 mb-1"><TrendingDown className="w-3 h-3" /> Confirmed weak</p>{recs.weakTopics.map((t) => <p key={t.topic} className="flex justify-between text-gray-700"><span>{t.topic}</span><span className="tabular-nums text-gray-500">{t.mean}% · {t.attempts} tries</span></p>)}</div>}
                  {recs.candidateTopics.length > 0 && <div><p className="text-xs font-semibold text-amber-700 mb-1">Needs another attempt</p>{recs.candidateTopics.map((t) => <p key={t.topic} className="flex justify-between text-gray-700"><span>{t.topic}</span><span className="tabular-nums text-gray-500">{t.mean}%</span></p>)}</div>}
                  {recs.strongTopics.length > 0 && <div><p className="text-xs font-semibold text-green-700 flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3" /> Strong</p>{recs.strongTopics.map((t) => <p key={t.topic} className="flex justify-between text-gray-700"><span>{t.topic}</span><span className="tabular-nums text-gray-500">{t.mean}%</span></p>)}</div>}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 flex items-start gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> Scores are estimates of answer quality against each question&apos;s rubric (versioned), not predictions of interview outcomes. <XCircle className="w-3.5 h-3.5 mt-0.5 ml-2" /> Deleting an interview permanently removes its questions and answers.</p>

      <ConfirmDialog open={Boolean(deleting)} title="Delete interview?" message={`This ${deleting ? INTERVIEW_TYPE_LABELS[deleting.interviewType].toLowerCase() : "interview"} and all its answers and feedback will be permanently removed.`} confirmLabel="Delete" busy={busy} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
