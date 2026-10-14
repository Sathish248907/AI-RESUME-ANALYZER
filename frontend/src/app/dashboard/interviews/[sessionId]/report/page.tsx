"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Printer, Eye, Target, RotateCcw, LayoutDashboard, LogIn, AlertCircle, TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, SkipForward, HelpCircle, Lightbulb, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import AnswerFeedback from "@/components/interview/AnswerFeedback";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { getInterview, INTERVIEW_TYPE_LABELS, type InterviewSession } from "@/services/interviewService";
import { getInterviewReport, type InterviewReport } from "@/services/interviewReportService";
import { scoreTone } from "@/services/answerEvaluationService";
import { cn, formatDate } from "@/lib/utils";

const TONE_TEXT = { green: "text-green-700", amber: "text-amber-700", red: "text-red-700", gray: "text-gray-500" };

export default function InterviewReportPage() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { user, ready } = useAuth();
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, s] = await Promise.all([getInterviewReport(sessionId), getInterview(sessionId)]);
      setReport(r);
      setSession(s);
    } catch (err) {
      setError(toApiClientError(err));
    }
  }, [sessionId]);

  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);

  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to view this report" action={{ label: "Sign in", href: `/auth/login?next=/dashboard/interviews/${sessionId}/report`, icon: LogIn }} /></div>;
  if (error) {
    const notDone = error.code === "SESSION_NOT_COMPLETED";
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={AlertCircle} title={notDone ? "Interview not finished yet" : error.status === 404 ? "Report not found" : "Could not load the report"} description={notDone ? "Complete the interview to generate its report." : error.message} action={notDone ? { label: "Continue interview", href: `/dashboard/interviews/${sessionId}` } : error.status === 404 ? { label: "Back to interviews", href: "/dashboard/interviews" } : { label: "Retry", onClick: load }} />
      </div>
    );
  }
  if (!report || !session) return <div className="max-w-5xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={4} /><SkeletonCard lines={8} /></div>;

  const tone = scoreTone(report.overallScore);
  const weakTopicsParam = report.recommendations.filter((r) => r.topic).map((r) => r.topic as string).slice(0, 5);
  const questionsById = new Map((session.questions ?? []).map((q) => [q.id, q]));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 print:py-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/dashboard/interviews" className="text-sm text-gray-500 hover:text-gray-800">← Mock interviews</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">Interview Report</h1>
          <p className="text-gray-500 mt-1">{INTERVIEW_TYPE_LABELS[report.session.interviewType]} · {report.session.targetRole} · <span className="capitalize">{report.session.difficulty}</span> · {report.session.completedAt ? formatDate(report.session.completedAt) : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4" /> Export as PDF</Button>
          <Link href={`/dashboard/interviews/${sessionId}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><Eye className="w-4 h-4" /> Review answers</Link>
          <Link href={`/dashboard/interviews/new?${weakTopicsParam.map((t) => `topic=${encodeURIComponent(t)}`).join("&")}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"><Target className="w-4 h-4" /> Practice weak topics</Link>
          <Link href="/dashboard/interviews/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><RotateCcw className="w-4 h-4" /> Another interview</Link>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"><LayoutDashboard className="w-4 h-4" /> Dashboard</Link>
        </div>
      </div>
      <h1 className="hidden print:block text-2xl font-bold">Interview Report — {report.session.targetRole} ({INTERVIEW_TYPE_LABELS[report.session.interviewType]})</h1>

      {/* Summary */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-1">
          <CardContent className="py-6 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Overall score</p>
            <p className={cn("text-5xl font-extrabold tabular-nums mt-1", TONE_TEXT[tone])}>{report.overallScore === null ? "—" : report.overallScore}</p>
            <p className={cn("text-sm font-semibold mt-1", TONE_TEXT[tone])}>{report.overallRating}</p>
            <p className="text-[11px] text-gray-400 mt-2">Mean of {report.counts.evaluated} evaluated answer{report.counts.evaluated === 1 ? "" : "s"} · rubric {report.rubricVersion ?? "n/a"}</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardContent className="py-5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <Stat label="Questions" value={report.counts.total} />
              <Stat label="Evaluated" value={report.counts.evaluated} icon={CheckCircle2} cls="text-green-600" />
              <Stat label="Not evaluable" value={report.counts.insufficient} icon={HelpCircle} cls="text-amber-600" />
              <Stat label="Skipped" value={report.counts.skipped} icon={SkipForward} cls="text-gray-500" />
              <Stat label="Unanswered" value={report.counts.unanswered + report.counts.failed} icon={XCircle} cls="text-red-500" />
            </div>
            {report.comparison ? (
              <div className="mt-4 flex items-start gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {report.comparison.delta > 0 ? <TrendingUp className="w-4 h-4 text-green-600 mt-0.5" /> : report.comparison.delta < 0 ? <TrendingDown className="w-4 h-4 text-red-600 mt-0.5" /> : <Minus className="w-4 h-4 text-gray-500 mt-0.5" />}
                <span><span className="font-medium">{report.comparison.delta > 0 ? "+" : ""}{report.comparison.delta} points</span> vs your previous average of {report.comparison.previousAverage}% (best {report.comparison.previousBest}%, last {report.comparison.lastScore}%). <span className="text-gray-500">{report.comparison.note}</span></span>
              </div>
            ) : (
              <p className="mt-4 text-xs text-gray-400">No comparison shown: it needs at least one earlier completed interview of the same type with 3+ evaluated answers.</p>
            )}
            <ul className="mt-3 text-xs text-gray-500 space-y-0.5">{report.notes.map((n) => <li key={n}>• {n}</li>)}</ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Topics + criteria */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" /> Strongest topics</CardTitle></CardHeader>
          <CardContent>{report.strongestTopics.length === 0 ? <p className="text-sm text-gray-400 italic">No topic scored 80% or higher.</p> : <TopicList items={report.strongestTopics} />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-600" /> Weakest topics</CardTitle></CardHeader>
          <CardContent>{report.weakestTopics.length === 0 ? <p className="text-sm text-gray-400 italic">No topic scored below 60%.</p> : <TopicList items={report.weakestTopics} />}{report.confirmedWeakTopics.length > 0 && <p className="text-[11px] text-gray-400 mt-2">Confirmed weak (2+ attempts): {report.confirmedWeakTopics.join(", ")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Criteria across questions</CardTitle><p className="text-xs text-gray-500 mt-0.5">Only identical criteria are averaged.</p></CardHeader>
          <CardContent className="space-y-2">
            {report.criterionSummary.length === 0 ? <p className="text-sm text-gray-400 italic">No evaluated answers.</p> : report.criterionSummary.map((c) => (
              <div key={c.criterion} className="text-sm">
                <div className="flex justify-between"><span className="text-gray-800">{c.criterion}</span><span className="text-gray-500 tabular-nums">{c.mean} / {c.maxScore} <span className="text-gray-400">({c.count})</span></span></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1"><div className={cn("h-full rounded-full", (c.mean ?? 0) >= 4 ? "bg-green-500" : (c.mean ?? 0) >= 3 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${((c.mean ?? 0) / c.maxScore) * 100}%` }} /></div>
              </div>
            ))}
            {report.communication?.notes?.length ? <div className="pt-2 border-t border-gray-100"><p className="text-xs font-medium text-gray-600">Clarity notes</p><ul className="text-xs text-gray-500 list-disc pl-4">{report.communication.notes.slice(0, 3).map((n, i) => <li key={i}>{n}</li>)}</ul></div> : null}
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Recommended next practice</CardTitle></CardHeader>
          <CardContent>
            {report.recommendations.length === 0 ? <p className="text-sm text-gray-400 italic">Not enough evaluated answers to recommend topics.</p> : (
              <ul className="space-y-2">{report.recommendations.map((r) => <li key={r.key} className="text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-900">{r.title}</span><Badge variant={r.priority === "high" ? "error" : r.priority === "medium" ? "warning" : "neutral"}>{r.priority}</Badge></div><p className="text-xs text-gray-500">{r.reason}</p></li>)}</ul>
            )}
            {report.recurringGaps.length > 0 && <p className="text-xs text-gray-500 mt-3">Recurring gaps: {report.recurringGaps.map((g) => `${g.concept} (×${g.count})`).join(", ")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-600" /> Suggested learning activities</CardTitle></CardHeader>
          <CardContent><ul className="space-y-2">{report.learningActivities.map((a) => <li key={a.title} className="text-sm"><p className="font-medium text-gray-900">{a.title}</p><p className="text-xs text-gray-500">{a.detail}</p></li>)}</ul></CardContent>
        </Card>
      </div>

      {/* Question by question */}
      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-gray-600" /> Question-by-question results</CardTitle><p className="text-xs text-gray-500 mt-0.5">Click a row to revisit the full feedback.</p></CardHeader>
        <CardContent className="px-0 py-0">
          <ul className="divide-y divide-gray-100">
            {report.questions.map((q) => {
              const full = questionsById.get(q.questionId)?.answer?.evaluation ?? null;
              const open = openQ === q.questionId;
              const t = scoreTone(q.score);
              return (
                <li key={q.questionId}>
                  <button type="button" onClick={() => setOpenQ(open ? null : q.questionId)} className="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-start gap-3" aria-expanded={open}>
                    <span className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{q.orderIndex + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-gray-900">{q.questionText}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{q.topic} · <span className="capitalize">{q.questionType}</span> · <span className="capitalize">{q.difficulty}</span>{q.missingConcepts.length ? ` · missing: ${q.missingConcepts.slice(0, 3).join(", ")}` : ""}</span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className={cn("block text-lg font-bold tabular-nums", TONE_TEXT[t])}>{q.score === null ? "—" : `${q.score}%`}</span>
                      <span className="block text-[11px] text-gray-500 capitalize">{q.rating ?? q.status.replace("_", " ")}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="px-5 pb-5">
                      {q.answerPreview && <details className="mb-3 text-sm"><summary className="cursor-pointer text-gray-600">Your answer</summary><p className="mt-1 text-gray-800 whitespace-pre-wrap">{questionsById.get(q.questionId)?.answer?.answerText ?? q.answerPreview}</p></details>}
                      {full ? <AnswerFeedback evaluation={full} compact /> : <p className="text-sm text-gray-500 italic">{q.status === "skipped" ? "Skipped — no evaluation." : q.insufficientReason ?? "No evaluation recorded for this question."}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">Aggregation method {report.methodVersion}: overall score is the mean of evaluated answers only; skipped and non-evaluable answers are excluded and listed separately. Scores estimate answer quality against each question&apos;s rubric and are not predictions of interview success.</p>
    </div>
  );
}

function Stat({ label, value, icon: Icon, cls }: { label: string; value: number; icon?: React.ComponentType<{ className?: string }>; cls?: string }) {
  return (
    <div>
      <p className={cn("text-2xl font-bold tabular-nums flex items-center justify-center gap-1", cls ?? "text-gray-900")}>{Icon && <Icon className="w-4 h-4" />}{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function TopicList({ items }: { items: { topic: string; mean: number; attempts: number }[] }) {
  return <ul className="space-y-1.5">{items.map((t) => <li key={t.topic} className="flex justify-between text-sm"><span className="text-gray-800">{t.topic}</span><span className={cn("tabular-nums font-medium", TONE_TEXT[scoreTone(t.mean)])}>{t.mean}% <span className="text-gray-400 font-normal">· {t.attempts}</span></span></li>)}</ul>;
}
