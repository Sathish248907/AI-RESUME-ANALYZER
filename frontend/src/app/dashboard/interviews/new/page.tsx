"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, Play, LogIn, Info, FileText, BookOpen, Sparkles, X, Plus, AlertCircle, Clock, Hash, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { createInterview, DIFFICULTIES, DURATIONS, INTERVIEW_TYPE_LABELS, INTERVIEW_TYPES, QUESTION_COUNTS, type Difficulty, type InterviewType } from "@/services/interviewService";
import { getPracticeRecommendations } from "@/services/interviewReportService";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import { listResumes, type ResumeListItem } from "@/services/resumeService";
import { listJobDescriptions, type SavedJobDescription } from "@/services/jobDescriptionService";
import { listAnalysisHistory } from "@/services/analysisHistoryService";
import { cn } from "@/lib/utils";

const TYPE_HELP: Record<InterviewType, string> = {
  technical: "Concepts, trade-offs and scenarios for the role's stack.",
  hr: "Motivation, teamwork and workplace situations.",
  coding: "Short coding problems answered in a code editor (evaluated as text).",
  resume_based: "Questions about the projects and skills on your selected resume.",
  behavioral: "STAR-style questions about real situations.",
  mixed: "A balanced mix of technical, project and behavioral questions.",
  project: "Deep dive into architecture and decisions in your projects.",
};

export default function MockInterviewSetupPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>}>
      <SetupInner />
    </Suspense>
  );
}

function SetupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [roleChoice, setRoleChoice] = useState<string>("Frontend Developer");
  const [customRole, setCustomRole] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType>("technical");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [duration, setDuration] = useState<number>(20);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [topics, setTopics] = useState<string[]>(params?.get("topic") ? [params.get("topic") as string] : []);
  const [topicInput, setTopicInput] = useState("");
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const [availableWeak, setAvailableWeak] = useState<string[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [useLatestAnalysis, setUseLatestAnalysis] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [jds, setJds] = useState<SavedJobDescription[]>([]);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [h, r, j, a, recs] = await Promise.allSettled([getBackendHealth(), listResumes({ limit: 100 }), listJobDescriptions({ limit: 100 }), listAnalysisHistory({ mode: "ai", limit: 1 }), getPracticeRecommendations()]);
      if (h.status === "fulfilled") setAiConfigured(Boolean(h.value?.ai.configured));
      if (r.status === "fulfilled") setResumes(r.value.resumes);
      if (j.status === "fulfilled") setJds(j.value.jobDescriptions);
      if (a.status === "fulfilled") setHasAnalysis(a.value.analyses.length > 0);
      if (recs.status === "fulfilled") setAvailableWeak([...recs.value.weakTopics.map((t) => t.topic), ...recs.value.candidateTopics.map((t) => t.topic)]);
    })();
  }, [user]);

  const targetRole = roleChoice === "custom" ? customRole.trim() : roleChoice;

  function addTopic() {
    const t = topicInput.trim();
    if (!t) return;
    if (topics.length >= 10) return setFieldErrors({ topics: "Up to 10 topics." });
    if (!topics.some((x) => x.toLowerCase() === t.toLowerCase())) setTopics([...topics, t.slice(0, 60)]);
    setTopicInput("");
    setFieldErrors({});
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (targetRole.length < 2) errs.targetRole = "Enter a target role (at least 2 characters).";
    if (targetRole.length > 80) errs.targetRole = "Target role is too long.";
    if (interviewType === "resume_based" && !resumeId && !useLatestAnalysis) errs.resumeId = "Resume-based interviews need a stored resume or your latest analysis.";
    if (questionCount === 15 && duration === 10) errs.duration = "15 questions in 10 minutes leaves under a minute each — pick a longer duration.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function start() {
    setError(null);
    if (!validate()) return;
    setStarting(true);
    try {
      const session = await createInterview({ targetRole, interviewType, difficulty, durationMinutes: duration, questionCount, topics, weakTopics, resumeId: resumeId || undefined, jobDescriptionId: jobDescriptionId || undefined, useLatestAnalysis });
      toast.success(`Interview ready — ${session.totalQuestions} questions generated.`);
      router.push(`/dashboard/interviews/${session.id}`);
    } catch (err) {
      const e = toApiClientError(err);
      setError(e);
      if (e.details?.length) setFieldErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
    } finally {
      setStarting(false);
    }
  }

  if (!ready) return <div className="max-w-3xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to start a mock interview" description="Sessions, answers and feedback are saved to your account so you can resume and review them." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/interviews/new", icon: LogIn }} /></div>;

  const seg = (active: boolean) => cn("px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left", active ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <Link href="/dashboard/interviews" className="text-sm text-gray-500 hover:text-gray-800">← Mock interviews</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-2 flex items-center gap-2"><Mic className="w-7 h-7 text-purple-600" /> Configure your interview</h1>
        <p className="text-gray-500 mt-1">Questions are generated by the AI provider for your role, type and difficulty. Nothing is pre-written.</p>
      </div>

      {aiConfigured === false && (
        <div role="alert" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800"><AlertCircle className="w-4 h-4 mt-0.5" /> The backend has no AI provider key configured (LLM_API_KEY), so interviews cannot be generated right now.</div>
      )}
      {aiConfigured === null && <p className="text-xs text-gray-400">Checking AI availability…</p>}

      {/* Role */}
      <Card>
        <CardHeader><CardTitle className="text-base">Target role</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TARGET_ROLES.map((r) => <button key={r} type="button" onClick={() => setRoleChoice(r)} className={seg(roleChoice === r)}>{r}</button>)}
            <button type="button" onClick={() => setRoleChoice("custom")} className={seg(roleChoice === "custom")}>Custom role…</button>
          </div>
          {roleChoice === "custom" && <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} maxLength={80} placeholder="e.g. Mobile Developer, DevOps Engineer" className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />}
          {fieldErrors.targetRole && <p className="text-xs text-red-600">{fieldErrors.targetRole}</p>}
        </CardContent>
      </Card>

      {/* Type + difficulty */}
      <Card>
        <CardHeader><CardTitle className="text-base">Interview type &amp; difficulty</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {INTERVIEW_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setInterviewType(t)} className={seg(interviewType === t)}>
                <span className="block">{INTERVIEW_TYPE_LABELS[t]}</span>
                <span className="block text-xs font-normal text-gray-500 mt-0.5">{TYPE_HELP[t]}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1"><Gauge className="w-3.5 h-3.5" /> Difficulty</p>
            <div className="grid grid-cols-3 gap-2">{DIFFICULTIES.map((d) => <button key={d} type="button" onClick={() => setDifficulty(d)} className={cn(seg(difficulty === d), "capitalize text-center")}>{d}</button>)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Length */}
      <Card>
        <CardHeader><CardTitle className="text-base">Length</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Duration</p>
            <div className="grid grid-cols-4 gap-2">{DURATIONS.map((d) => <button key={d} type="button" onClick={() => setDuration(d)} className={cn(seg(duration === d), "text-center")}>{d} min</button>)}</div>
            {fieldErrors.duration && <p className="text-xs text-red-600 mt-1">{fieldErrors.duration}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Questions</p>
            <div className="grid grid-cols-3 gap-2">{QUESTION_COUNTS.map((n) => <button key={n} type="button" onClick={() => setQuestionCount(n)} className={cn(seg(questionCount === n), "text-center")}>{n}</button>)}</div>
            <p className="text-[11px] text-gray-400 mt-1">≈ {Math.round((duration * 60) / questionCount / 60 * 10) / 10} min per question</p>
          </div>
        </CardContent>
      </Card>

      {/* Personalisation */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-600" /> Personalisation <span className="text-xs font-normal text-gray-400">(optional)</span></CardTitle><p className="text-xs text-gray-500 mt-1">Only the records you select are used, and only to tailor the questions.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700"><span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Resume</span>
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className={cn("mt-1 w-full text-sm px-3 py-2 border rounded-lg bg-white", fieldErrors.resumeId ? "border-red-400" : "border-gray-300")}>
                <option value="">None</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {fieldErrors.resumeId && <span className="block text-xs text-red-600 mt-1">{fieldErrors.resumeId}</span>}
              {resumes.length === 0 && <span className="block text-xs text-gray-400 mt-1">No stored resumes — <Link href="/dashboard/my-resumes" className="text-blue-600 hover:underline">upload one</Link>.</span>}
            </label>
            <label className="text-sm text-gray-700"><span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> Saved job description</span>
              <select value={jobDescriptionId} onChange={(e) => setJobDescriptionId(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg bg-white">
                <option value="">None</option>{jds.map((j) => <option key={j.id} value={j.id}>{j.jobTitle}{j.companyName ? ` · ${j.companyName}` : ""}</option>)}
              </select>
            </label>
          </div>
          <label className={cn("flex items-start gap-2 text-sm", hasAnalysis ? "text-gray-700" : "text-gray-400")}>
            <input type="checkbox" checked={useLatestAnalysis} disabled={!hasAnalysis} onChange={(e) => setUseLatestAnalysis(e.target.checked)} className="mt-1 rounded border-gray-300" />
            <span>Use my latest AI resume analysis (matched and missing skills guide the questions){!hasAnalysis && " — no AI analysis yet"}</span>
          </label>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-1.5">Topics to practise</p>
            <div className="flex gap-2">
              <input value={topicInput} onChange={(e) => setTopicInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTopic(); } }} maxLength={60} placeholder="e.g. React hooks, SQL joins" className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <Button type="button" variant="outline" size="sm" onClick={addTopic}><Plus className="w-4 h-4" /> Add</Button>
            </div>
            {fieldErrors.topics && <p className="text-xs text-red-600 mt-1">{fieldErrors.topics}</p>}
            {topics.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{topics.map((t) => <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs">{t}<button type="button" onClick={() => setTopics(topics.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X className="w-3 h-3" /></button></span>)}</div>}
          </div>

          {availableWeak.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Weak topics from previous interviews</p>
              <div className="flex flex-wrap gap-1.5">
                {availableWeak.map((t) => {
                  const on = weakTopics.includes(t);
                  return <button key={t} type="button" onClick={() => setWeakTopics(on ? weakTopics.filter((x) => x !== t) : [...weakTopics, t].slice(0, 8))} className={cn("px-2.5 py-1 rounded-full border text-xs", on ? "bg-red-50 text-red-800 border-red-300" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50")}>{on ? "✓ " : ""}{t}</button>;
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-1">
          <p className="font-semibold">Could not create the interview.</p>
          <p>{error.message}</p>
          {error.retryable && <p className="text-xs">This looks temporary — try again in a moment.</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Generating {questionCount} questions usually takes 15–60 seconds.</p>
        <Button size="lg" onClick={start} loading={starting} disabled={aiConfigured === false} className="bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500">
          <Play className="w-5 h-5" /> {starting ? "Generating questions…" : "Start interview"}
        </Button>
      </div>
    </div>
  );
}
