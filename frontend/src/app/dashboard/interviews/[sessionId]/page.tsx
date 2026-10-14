"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Save, Send, Flag, Clock, AlertCircle, CheckCircle2, SkipForward, LogIn, FileText, Loader2, RotateCcw, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import AnswerFeedback from "@/components/interview/AnswerFeedback";
import CodeEditor from "@/components/interview/CodeEditor";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { completeInterview, getInterview, INTERVIEW_TYPE_LABELS, saveAnswerDraft, skipQuestion, type InterviewAnswer, type InterviewQuestion, type InterviewSession, type ProgrammingLanguage } from "@/services/interviewService";
import { countWords, evaluateAnswer, waitForEvaluation } from "@/services/answerEvaluationService";
import { cn } from "@/lib/utils";

const DIFF_CLS: Record<string, string> = { beginner: "bg-green-50 text-green-800 border-green-200", intermediate: "bg-amber-50 text-amber-800 border-amber-200", advanced: "bg-red-50 text-red-800 border-red-200" };

export default function MockInterviewSessionPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();
  const sessionId = params?.sessionId as string;

  const [session, setSession] = useState<InterviewSession | null>(null);
  const [loadError, setLoadError] = useState<ApiClientError | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, { text: string; lang: ProgrammingLanguage; dirty: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<ApiClientError | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  const questions = useMemo(() => session?.questions ?? [], [session]);
  const current: InterviewQuestion | undefined = questions[index];
  const draft = current ? drafts[current.id] ?? { text: current.answer?.answerText ?? "", lang: current.answer?.programmingLanguage ?? "javascript", dirty: false } : null;
  const isCoding = current?.questionType === "coding";
  const locked = Boolean(current?.answer && ["evaluated", "insufficient", "evaluating"].includes(current.answer.status));
  const closed = session ? session.status !== "in_progress" : false;
  const anyDirty = Object.values(drafts).some((d) => d.dirty);

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const s = await getInterview(sessionId);
      setSession(s);
      // Resume at the first question without a final answer
      const firstOpen = (s.questions ?? []).findIndex((q) => !q.answer || !["evaluated", "insufficient", "skipped"].includes(q.answer.status));
      setIndex(firstOpen === -1 ? 0 : firstOpen);
      if (s.durationMinutes && s.status === "in_progress") {
        const end = new Date(s.startedAt).getTime() + s.durationMinutes * 60_000;
        setRemaining(Math.max(0, Math.floor((end - Date.now()) / 1000)));
      }
    } catch (err) {
      setLoadError(toApiClientError(err));
    }
  }, [sessionId]);

  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);

  // ── Timer (informational; never auto-submits) ─────────────────────────────
  useEffect(() => {
    if (remaining === null || closed) return;
    if (remaining <= 0) { setTimeUp(true); return; }
    const t = setInterval(() => setRemaining((r) => (r === null ? r : Math.max(0, r - 1))), 1000);
    return () => clearInterval(t);
  }, [remaining, closed]);

  // ── Leave warning ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (anyDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  // ── Draft editing with debounced autosave ─────────────────────────────────
  function updateDraft(text: string, lang?: ProgrammingLanguage) {
    if (!current || locked || closed) return;
    const next = { text, lang: lang ?? draft?.lang ?? "javascript", dirty: true };
    setDrafts((d) => ({ ...d, [current.id]: next }));
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => persistDraft(current.id, next, true), 2500);
  }

  async function persistDraft(questionId: string, d: { text: string; lang: ProgrammingLanguage }, silent = false) {
    if (!session) return;
    setSaving(true);
    try {
      const answer = await saveAnswerDraft(session.id, questionId, { answerText: d.text, programmingLanguage: isCoding ? d.lang : null });
      applyAnswer(questionId, answer);
      setDrafts((x) => ({ ...x, [questionId]: { ...d, dirty: false } }));
      if (!silent) toast.success("Answer saved.");
    } catch (err) {
      const e = toApiClientError(err);
      if (e.status !== 409 && !silent) toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  function applyAnswer(questionId: string, answer: InterviewAnswer, sessionPatch?: Partial<InterviewSession>) {
    setSession((s) => (s ? { ...s, ...sessionPatch, questions: (s.questions ?? []).map((q) => (q.id === questionId ? { ...q, answer } : q)) } : s));
  }

  // ── Submit for evaluation ─────────────────────────────────────────────────
  async function submit() {
    if (!session || !current || !draft) return;
    if (draft.text.trim().length < 15) { toast.error("Write a fuller answer (at least a sentence) before submitting."); return; }
    if (autosave.current) clearTimeout(autosave.current);
    setEvaluating(true);
    setEvalError(null);
    try {
      const { answer, question } = await evaluateAnswer(session.id, current.id, { answerText: draft.text, programmingLanguage: isCoding ? draft.lang : null });
      setDrafts((d) => ({ ...d, [current.id]: { ...draft, dirty: false } }));
      setSession((s) => s ? { ...s, answeredQuestions: s.answeredQuestions + (current.answer && ["evaluated", "insufficient", "skipped"].includes(current.answer.status) ? 0 : 1), questions: (s.questions ?? []).map((q) => (q.id === current.id ? { ...q, ...question, answer } : q)) } : s);
      setShowFeedback(true);
    } catch (err) {
      const e = toApiClientError(err);
      if (e.code === "EVALUATION_IN_PROGRESS" || e.code === "TIMEOUT") {
        // The server is still scoring (or finished after we gave up) — wait for the stored result instead of failing.
        toast.info("Still evaluating — waiting for the result…");
        const answer = await waitForEvaluation(session.id, current.id).catch(() => null);
        if (answer && (answer.status === "evaluated" || answer.status === "insufficient")) {
          setDrafts((d) => ({ ...d, [current.id]: { ...draft, dirty: false } }));
          await load();
          setShowFeedback(true);
          setEvaluating(false);
          return;
        }
      }
      setEvalError(e);
      await load(); // pick up "failed" state from the server
    } finally {
      setEvaluating(false);
    }
  }

  async function skip() {
    if (!session || !current) return;
    try {
      const answer = await skipQuestion(session.id, current.id);
      applyAnswer(current.id, answer, { answeredQuestions: session.answeredQuestions + 1 });
      setDrafts((d) => ({ ...d, [current.id]: { text: "", lang: "javascript", dirty: false } }));
      goTo(index + 1);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    }
  }

  async function endInterview() {
    if (!session) return;
    setEnding(true);
    try {
      const elapsed = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      await completeInterview(session.id, Math.max(0, elapsed));
      toast.success("Interview completed.");
      router.push(`/dashboard/interviews/${session.id}/report`);
    } catch (err) {
      toast.error(toApiClientError(err).message);
      setEnding(false);
    }
  }

  function goTo(i: number) {
    if (i < 0 || i >= questions.length) return;
    setShowFeedback(false);
    setEvalError(null);
    setIndex(i);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to continue this interview" action={{ label: "Sign in", href: `/auth/login?next=/dashboard/interviews/${sessionId}`, icon: LogIn }} /></div>;
  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={AlertCircle} title={loadError.status === 404 ? "Interview not found" : "Could not load the interview"} description={loadError.status === 404 ? "It may have been deleted or belongs to another account." : loadError.message} action={loadError.status === 404 ? { label: "Back to interviews", href: "/dashboard/interviews" } : { label: "Retry", onClick: () => { setLoadError(null); load(); } }} />
      </div>
    );
  }
  if (!session || !current || !draft) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;

  const answered = questions.filter((q) => q.answer && ["evaluated", "insufficient", "skipped"].includes(q.answer.status)).length;
  const progress = Math.round((answered / questions.length) * 100);
  const mm = remaining !== null ? String(Math.floor(remaining / 60)).padStart(2, "0") : null;
  const ss = remaining !== null ? String(remaining % 60).padStart(2, "0") : null;
  const feedbackVisible = (showFeedback || locked) && current.answer?.evaluation;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{INTERVIEW_TYPE_LABELS[session.interviewType]} · <span className="capitalize">{session.difficulty}</span></p>
          <h1 className="text-xl font-bold text-gray-900 truncate">{session.targetRole}</h1>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono border", remaining <= 60 ? "bg-red-50 text-red-700 border-red-200" : "bg-white text-gray-700 border-gray-200")} aria-live="polite">
              <Clock className="w-4 h-4" /> {mm}:{ss}
            </span>
          )}
          {closed ? (
            <Link href={`/dashboard/interviews/${session.id}/report`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"><FileText className="w-4 h-4" /> View report</Link>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmEnd(true)}><Flag className="w-4 h-4" /> End interview</Button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Question {index + 1} of {questions.length}</span>
          <span>{answered} answered · {progress}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <motion.div className="h-full bg-indigo-600 rounded-full" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
        </div>
        <div className="flex gap-1 mt-2 flex-wrap" role="tablist" aria-label="Questions">
          {questions.map((q, i) => {
            const st = q.answer?.status;
            return (
              <button key={q.id} type="button" role="tab" aria-selected={i === index} onClick={() => goTo(i)} title={`Question ${i + 1}${st ? ` · ${st}` : ""}`} className={cn("w-7 h-7 rounded-md text-xs font-medium border", i === index ? "ring-2 ring-indigo-500" : "", st === "evaluated" ? "bg-green-50 border-green-200 text-green-800" : st === "insufficient" || st === "failed" ? "bg-amber-50 border-amber-200 text-amber-800" : st === "skipped" ? "bg-gray-100 border-gray-200 text-gray-500 line-through" : st === "draft" ? "bg-blue-50 border-blue-200 text-blue-800" : "bg-white border-gray-200 text-gray-600")}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {timeUp && !closed && (
        <div role="status" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900"><Clock className="w-4 h-4 mt-0.5" /> Time is up. Nothing was submitted automatically — finish or skip the remaining questions, then end the interview.</div>
      )}
      {closed && <div role="status" className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700"><Eye className="w-4 h-4 mt-0.5" /> This interview is {session.status.replace("_", " ")}. You can review questions and feedback but not change answers.</div>}

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div key={current.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2 }}>
          <Card>
            <CardContent className="py-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">{current.topic}</span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 capitalize">{current.questionType}</span>
                <span className={cn("px-2 py-0.5 rounded-full border capitalize", DIFF_CLS[current.difficulty])}>{current.difficulty}</span>
                <span className="text-gray-400 ml-auto flex items-center gap-1"><Clock className="w-3 h-3" /> ~{Math.round(current.suggestedTimeSeconds / 60)} min</span>
              </div>
              <p className="text-lg text-gray-900 leading-relaxed whitespace-pre-wrap">{current.questionText}</p>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      {/* Answer or feedback */}
      {feedbackVisible ? (
        <div className="space-y-3">
          <details className="bg-white border border-gray-200 rounded-xl">
            <summary className="cursor-pointer px-4 py-3 text-sm text-gray-700">Your answer{current.answer?.programmingLanguage ? ` (${current.answer.programmingLanguage})` : ""}</summary>
            <pre className="px-4 pb-4 text-sm text-gray-800 whitespace-pre-wrap font-sans">{current.answer?.answerText}</pre>
          </details>
          <AnswerFeedback evaluation={current.answer!.evaluation!} onContinue={index < questions.length - 1 ? () => goTo(index + 1) : closed ? undefined : () => setConfirmEnd(true)} continueLabel={index < questions.length - 1 ? "Continue to next question" : "Finish interview"} />
        </div>
      ) : current.answer?.status === "skipped" ? (
        <Card><CardContent className="py-6 text-center text-sm text-gray-500"><SkipForward className="w-5 h-5 mx-auto mb-2 text-gray-400" /> You skipped this question. {!closed && <button type="button" className="text-blue-600 hover:underline" onClick={() => setDrafts((d) => ({ ...d, [current.id]: { text: "", lang: "javascript", dirty: true } }))}>Answer it anyway</button>}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="py-5 space-y-3">
            {isCoding ? (
              <CodeEditor value={draft.text} onChange={(v) => updateDraft(v)} language={draft.lang} onLanguageChange={(l) => updateDraft(draft.text, l)} disabled={closed || evaluating} />
            ) : (
              <textarea
                value={draft.text}
                onChange={(e) => updateDraft(e.target.value)}
                disabled={closed || evaluating}
                rows={10}
                placeholder="Type your answer here. For behavioral questions, try the STAR structure: situation, task, action, result."
                aria-label="Your answer"
                className="w-full text-sm px-3 py-2.5 border border-gray-300 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>{countWords(draft.text)} words · {draft.text.length.toLocaleString()} characters{draft.dirty ? " · unsaved changes" : current.answer?.status === "draft" ? " · draft saved" : ""}{saving && " · saving…"}</span>
              {current.answer?.status === "failed" && <span className="text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Last evaluation failed — you can retry.</span>}
            </div>

            {evalError && (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-semibold">Evaluation failed.</span> {evalError.message}</span>
                {evalError.retryable && <Button size="sm" variant="outline" onClick={submit}><RotateCcw className="w-3.5 h-3.5" /> Retry</Button>}
              </div>
            )}

            {!closed && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => persistDraft(current.id, draft)} disabled={!draft.dirty || evaluating}><Save className="w-4 h-4" /> Save answer</Button>
                <Button size="sm" onClick={submit} loading={evaluating} disabled={draft.text.trim().length < 15} className="bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500">
                  {evaluating ? <><Loader2 className="w-4 h-4 animate-spin" /> Evaluating…</> : <><Send className="w-4 h-4" /> Submit answer</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={skip} disabled={evaluating}><SkipForward className="w-4 h-4" /> Skip</Button>
                {evaluating && <span className="text-xs text-gray-500">The AI provider is scoring your answer against this question&apos;s rubric (usually 10–40 s).</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => goTo(index - 1)} disabled={index === 0}><ChevronLeft className="w-4 h-4" /> Previous</Button>
        <span className="text-xs text-gray-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Answers are saved to your account as you go.</span>
        <Button variant="outline" size="sm" onClick={() => goTo(index + 1)} disabled={index >= questions.length - 1}>Next <ChevronRight className="w-4 h-4" /></Button>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="End interview?"
        message={`${questions.length - answered} question${questions.length - answered === 1 ? "" : "s"} ${questions.length - answered === 1 ? "has" : "have"} no final answer and will be reported as unanswered. Your report will be generated from the evaluated answers.`}
        confirmLabel="End and view report"
        destructive={false}
        busy={ending}
        onConfirm={endInterview}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}
