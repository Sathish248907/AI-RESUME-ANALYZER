"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Map, Sparkles, LogIn, AlertCircle, Info, FileText, BookOpen, Bot, Mic, Plus, X, Clock, Gauge, Target, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { createRoadmap, FORMATS, OBJECTIVE_LABELS, OBJECTIVES, SCHEDULES, SKILL_LEVELS, type LearningFormat, type Objective, type Schedule, type SkillLevel } from "@/services/learningRoadmapService";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import { listResumes, type ResumeListItem } from "@/services/resumeService";
import { listJobDescriptions, type SavedJobDescription } from "@/services/jobDescriptionService";
import { listAnalysisHistory, type AnalysisHistoryItem } from "@/services/analysisHistoryService";
import { getInterviewHistory } from "@/services/interviewService";
import { cn } from "@/lib/utils";

const OBJECTIVE_HELP: Record<Objective, string> = {
  job_readiness: "Close the gaps between your resume and the job you want.",
  interview_prep: "Prioritise topics you struggled with in mock interviews.",
  project_development: "Learn by building — more mini-projects and exercises.",
  skill_improvement: "Round out the baseline skills for your role.",
};
const FORMAT_LABELS: Record<LearningFormat, string> = { documentation: "Official docs", tutorials: "Tutorials", exercises: "Exercises", projects: "Projects", mixed: "Mixed" };

export default function NewRoadmapPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>}>
      <SetupInner />
    </Suspense>
  );
}

function SetupInner() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [roleChoice, setRoleChoice] = useState<string>("Frontend Developer");
  const [customRole, setCustomRole] = useState("");
  const [level, setLevel] = useState<SkillLevel>("intermediate");
  const [hours, setHours] = useState(6);
  const [schedule, setSchedule] = useState<Schedule>("flexible");
  const [objective, setObjective] = useState<Objective>("job_readiness");
  const [format, setFormat] = useState<LearningFormat>("mixed");
  const [targetDate, setTargetDate] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [useInterviews, setUseInterviews] = useState(true);
  const [goalSkills, setGoalSkills] = useState<string[]>([]);
  const [goalInput, setGoalInput] = useState("");
  const [confirmedSkills, setConfirmedSkills] = useState<string[]>([]);
  const [confirmedInput, setConfirmedInput] = useState("");

  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [jds, setJds] = useState<SavedJobDescription[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [interviewCount, setInterviewCount] = useState<number | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [h, r, j, a, iv] = await Promise.allSettled([getBackendHealth(), listResumes({ limit: 100 }), listJobDescriptions({ limit: 100 }), listAnalysisHistory({ mode: "ai", limit: 25 }), getInterviewHistory({ status: "completed", source: "mock_interview", limit: 1 })]);
      if (h.status === "fulfilled") setAiConfigured(Boolean(h.value?.ai.configured));
      if (r.status === "fulfilled") setResumes(r.value.resumes);
      if (j.status === "fulfilled") setJds(j.value.jobDescriptions);
      if (a.status === "fulfilled") { setAnalyses(a.value.analyses); if (a.value.analyses[0]) { setAnalysisId(a.value.analyses[0].id); const role = a.value.analyses[0].targetRole; if (TARGET_ROLES.includes(role as (typeof TARGET_ROLES)[number])) setRoleChoice(role); } }
      if (iv.status === "fulfilled") setInterviewCount(iv.value.total ?? iv.value.sessions.length);
    })();
  }, [user]);

  const targetRole = roleChoice === "custom" ? customRole.trim() : roleChoice;
  const selectedAnalysis = analyses.find((a) => a.id === analysisId);

  function addChip(list: string[], set: (v: string[]) => void, input: string, clear: () => void) {
    const t = input.trim().slice(0, 60);
    if (t.length < 2 || list.length >= 15) return;
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) set([...list, t]);
    clear();
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (targetRole.length < 2) errs.targetRole = "Enter a target role (at least 2 characters).";
    if (hours < 1 || hours > 60) errs.weeklyStudyHours = "Between 1 and 60 hours per week.";
    if (targetDate && new Date(targetDate).getTime() <= Date.now()) errs.targetCompletionDate = "Pick a date in the future.";
    if (!analysisId && !jobDescriptionId && !resumeId && goalSkills.length === 0 && !useInterviews) errs.sources = "Select at least one evidence source or add goal skills, otherwise the plan is generic.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function generate() {
    setError(null);
    if (!validate()) return;
    setGenerating(true);
    try {
      const res = await createRoadmap({ targetRole, currentSkillLevel: level, weeklyStudyHours: hours, preferredSchedule: schedule, objective, preferredFormat: format, targetCompletionDate: targetDate || null, resumeId: resumeId || undefined, jobDescriptionId: jobDescriptionId || undefined, analysisId: analysisId || undefined, useInterviewHistory: useInterviews, goalSkills, confirmedSkills });
      toast.success(`Roadmap ready — ${res.roadmap.milestones.length} milestones, ${res.skillGaps.skills.length} skills assessed.`);
      router.push("/dashboard/learning");
    } catch (err) {
      const e = toApiClientError(err);
      setError(e);
      if (e.details?.length) setFieldErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
    } finally { setGenerating(false); }
  }

  if (!ready) return <div className="max-w-3xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to generate a roadmap" description="Your roadmap is built from the analyses, job descriptions and interviews stored in your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/learning/new", icon: LogIn }} /></div>;

  const seg = (active: boolean) => cn("px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left", active ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300");
  const sourceCount = [analysisId, jobDescriptionId, resumeId].filter(Boolean).length + (useInterviews && interviewCount ? 1 : 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <Link href="/dashboard/learning" className="text-sm text-gray-500 hover:text-gray-800">← Learning roadmap</Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-2 flex items-center gap-2"><Map className="w-7 h-7 text-emerald-600" /> Set up your learning roadmap</h1>
        <p className="text-gray-500 mt-1">Skill gaps are computed from your records with a documented scoring method; the AI then turns them into ordered milestones and tasks, which are validated before being saved.</p>
      </div>

      {aiConfigured === false && <div role="alert" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800"><AlertCircle className="w-4 h-4 mt-0.5" /> The backend has no AI provider key configured (LLM_API_KEY), so roadmaps cannot be generated right now.</div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-emerald-600" /> Goal</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target role</label>
            <div className="grid sm:grid-cols-2 gap-2">
              <select value={roleChoice} onChange={(e) => setRoleChoice(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                <option value="custom">Other…</option>
              </select>
              {roleChoice === "custom" && <input value={customRole} onChange={(e) => setCustomRole(e.target.value)} maxLength={80} placeholder="e.g. Platform Engineer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />}
            </div>
            {fieldErrors.targetRole && <p className="text-xs text-red-600 mt-1">{fieldErrors.targetRole}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Objective</label>
            <div className="grid sm:grid-cols-2 gap-2">
              {OBJECTIVES.map((o) => <button key={o} type="button" onClick={() => setObjective(o)} className={seg(objective === o)}><span className="block">{OBJECTIVE_LABELS[o]}</span><span className="block text-xs font-normal text-gray-500">{OBJECTIVE_HELP[o]}</span></button>)}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 inline-flex items-center gap-1"><Gauge className="w-4 h-4" /> Current level</label>
              <div className="flex gap-2">{SKILL_LEVELS.map((l) => <button key={l} type="button" onClick={() => setLevel(l)} className={cn(seg(level === l), "capitalize flex-1 text-center")}>{l}</button>)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred format</label>
              <select value={format} onChange={(e) => setFormat(e.target.value as LearningFormat)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">{FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}</select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-indigo-600" /> Time</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours per week</label>
            <input type="number" min={1} max={60} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {fieldErrors.weeklyStudyHours && <p className="text-xs text-red-600 mt-1">{fieldErrors.weeklyStudyHours}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
            <select value={schedule} onChange={(e) => setSchedule(e.target.value as Schedule)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm capitalize">{SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target date (optional)</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {fieldErrors.targetCompletionDate && <p className="text-xs text-red-600 mt-1">{fieldErrors.targetCompletionDate}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-600" /> Evidence sources</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">The more real evidence you include, the less generic the plan. Every source is owner-checked on the server.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 inline-flex items-center gap-1"><Bot className="w-4 h-4" /> AI resume analysis</label>
            <select value={analysisId} onChange={(e) => setAnalysisId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">None</option>
              {analyses.map((a) => <option key={a.id} value={a.id}>{a.jobTitle} — {a.matchScore}% match · {a.skillCounts.missing} missing, {a.skillCounts.partial} partial ({new Date(a.createdAt).toLocaleDateString()})</option>)}
            </select>
            {analyses.length === 0 && <p className="text-xs text-gray-500 mt-1">No AI analyses yet. <Link href="/dashboard/resume-analyzer" className="text-indigo-700 underline">Run one</Link> to feed matched / missing skills into the plan.</p>}
            {selectedAnalysis && <p className="text-xs text-gray-500 mt-1">Matched skills are treated as demonstrated; missing and partial skills become gaps.</p>}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 inline-flex items-center gap-1"><BookOpen className="w-4 h-4" /> Saved job description</label>
              <select value={jobDescriptionId} onChange={(e) => setJobDescriptionId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">None</option>
                {jds.map((j) => <option key={j.id} value={j.id}>{j.jobTitle}{j.companyName ? ` · ${j.companyName}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 inline-flex items-center gap-1"><FileText className="w-4 h-4" /> Stored resume</label>
              <select value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">None</option>
                {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-1" checked={useInterviews} onChange={(e) => setUseInterviews(e.target.checked)} />
            <span><span className="inline-flex items-center gap-1 font-medium"><Mic className="w-4 h-4" /> Use my mock-interview history</span><br /><span className="text-xs text-gray-500">{interviewCount === null ? "Checking…" : interviewCount === 0 ? "No completed interviews yet — nothing to add." : `${interviewCount} completed session${interviewCount === 1 ? "" : "s"}: weak topics become review tasks.`}</span></span>
          </label>
          {fieldErrors.sources && <p className="text-xs text-red-600">{fieldErrors.sources}</p>}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-xs text-gray-700 space-y-1">
            <p className="font-semibold text-indigo-900 inline-flex items-center gap-1"><Info className="w-3 h-3" /> {sourceCount === 0 ? "No sources selected — the plan will use the role baseline and your goal skills only." : `How your ${sourceCount} selected source${sourceCount === 1 ? "" : "s"} shape the plan`}</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {selectedAnalysis && <li><strong>{selectedAnalysis.jobTitle}</strong> analysis: {selectedAnalysis.skillCounts.matched} matched skills count as demonstrated and are skipped; {selectedAnalysis.skillCounts.missing} missing and {selectedAnalysis.skillCounts.partial} partial skills become prioritised gaps.</li>}
              {jobDescriptionId && <li><strong>{jds.find((j) => j.id === jobDescriptionId)?.jobTitle ?? "Job description"}</strong>: its required skills score highest, preferred skills next; the text is given to the AI as untrusted context.</li>}
              {resumeId && <li><strong>{resumes.find((r) => r.id === resumeId)?.name ?? "Resume"}</strong>: linked as the roadmap's source resume for future regeneration.</li>}
              {useInterviews && interviewCount ? <li><strong>Interview history</strong>: topics with repeatedly low scores become review tasks and raise that skill's priority.</li> : null}
              {goalSkills.length > 0 && <li><strong>Goal skills</strong> ({goalSkills.join(", ")}) are always included.</li>}
              {confirmedSkills.length > 0 && <li><strong>Confirmed skills</strong> ({confirmedSkills.join(", ")}) are marked demonstrated and never taught.</li>}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your input</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-5">
          <ChipInput label="Skills you want to learn" help="Added as goals even if no job asks for them." value={goalInput} onChange={setGoalInput} items={goalSkills} onAdd={() => addChip(goalSkills, setGoalSkills, goalInput, () => setGoalInput(""))} onRemove={(s) => setGoalSkills(goalSkills.filter((x) => x !== s))} placeholder="Docker" />
          <ChipInput label="Skills you already have" help="Marked demonstrated and excluded from the plan." value={confirmedInput} onChange={setConfirmedInput} items={confirmedSkills} onAdd={() => addChip(confirmedSkills, setConfirmedSkills, confirmedInput, () => setConfirmedInput(""))} onRemove={(s) => setConfirmedSkills(confirmedSkills.filter((x) => x !== s))} placeholder="Git" />
        </CardContent>
      </Card>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm"><p className="font-medium">{error.message}</p>{error.retryable && <p className="text-xs mt-1">This looks temporary — try again in a moment.</p>}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 max-w-md">Generation calls the AI provider and can take 1–3 minutes. The result is validated (3–10 milestones, ordered prerequisites, only verified resource links) before anything is saved. If you already have an active roadmap it is kept in history as superseded.</p>
        <Button size="lg" onClick={generate} loading={generating} disabled={aiConfigured === false}>{generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Plus className="w-4 h-4 mr-1" /> Generate roadmap</>}</Button>
      </div>
    </div>
  );
}

function ChipInput({ label, help, value, onChange, items, onAdd, onRemove, placeholder }: { label: string; help: string; value: string; onChange: (v: string) => void; items: string[]; onAdd: () => void; onRemove: (s: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500 mb-1">{help}</p>
      <div className="flex gap-2">
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }} maxLength={60} placeholder={placeholder} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={onAdd}><Plus className="w-4 h-4" /></Button>
      </div>
      {items.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{items.map((s) => <span key={s} className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs text-gray-800">{s}<button type="button" onClick={() => onRemove(s)} aria-label={`Remove ${s}`}><X className="w-3 h-3" /></button></span>)}</div>}
    </div>
  );
}
