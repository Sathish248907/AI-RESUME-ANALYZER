"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ResumeUploader from "@/components/analyzer/ResumeUploader";
import JobDescriptionForm from "@/components/analyzer/JobDescriptionForm";
import AnalysisLoading from "@/components/analyzer/AnalysisLoading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { runMockAnalysis, type TargetRole, type LoadingPhase } from "@/services/mockAnalysisService";
import { saveAnalysis } from "@/services/analysisStorage";
import { extractResumeSkills } from "@/services/skillComparisonService";
import { saveSessionResumeSkills, saveJobAnalysis } from "@/services/jobAnalysisStorage";
import { parseJobDescription, validateJobDescriptionInput } from "@/services/jobDescriptionParser";
import { getBackendHealth, runAiAnalysis, type BackendHealth } from "@/services/resumeAnalysisService";
import { useAuth } from "@/services/authService";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { cn } from "@/lib/utils";
import { Sparkles, AlertCircle, FileText, Briefcase, Info, SearchCode, Bot, FlaskConical, LogIn, Server, RefreshCw } from "lucide-react";

interface FormErrors {
  resume?: string;
  jobTitle?: string;
  targetRole?: string;
  jobDescription?: string;
}

type AnalysisMode = "ai" | "demo";

export default function ResumeAnalyzerPage() {
  const router = useRouter();
  const { user, ready: authReady } = useAuth();

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [parsed, setParsed] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Form state
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole | "">("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");

  // Mode & backend state
  const [mode, setMode] = useState<AnalysisMode>("demo");
  const [health, setHealth] = useState<BackendHealth | null | "checking">("checking");
  const [aiError, setAiError] = useState<ApiClientError | null>(null);

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("parsing");

  const checkHealth = useCallback(async () => {
    setHealth("checking");
    const h = await getBackendHealth();
    setHealth(h);
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Default to AI mode when the backend is configured and the user is signed in.
  useEffect(() => {
    if (health && health !== "checking" && health.ai.configured && user) setMode("ai");
  }, [health, user]);

  const backendUp = health !== "checking" && health !== null;
  const aiConfigured = backendUp && Boolean(health.ai.configured);
  const aiAvailable = aiConfigured && Boolean(user);

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleFileParsed = useCallback((f: File, text: string, count: number) => {
    setFile(f);
    setResumeText(text);
    setCharCount(count);
    setParsed(true);
    setParseError(null);
    setErrors((e) => ({ ...e, resume: undefined }));
    // Phase 3: keep only extracted skill names (never the text) for job comparison in this session.
    saveSessionResumeSkills(extractResumeSkills(text, f.name));
  }, []);

  const handleParseError = useCallback((msg: string) => {
    setParseError(msg);
    setParsed(false);
    setErrors((e) => ({ ...e, resume: msg }));
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setResumeText("");
    setCharCount(0);
    setParsed(false);
    setParseError(null);
    setErrors((e) => ({ ...e, resume: undefined }));
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  const minDescription = mode === "ai" ? 100 : 50;
  const minResume = mode === "ai" ? 200 : 50;

  function validate(): boolean {
    const next: FormErrors = {};
    if (!file || !parsed) next.resume = "Please upload a resume (PDF or DOCX).";
    else if (resumeText.trim().length < minResume)
      next.resume = `Only ${resumeText.trim().length} characters could be extracted. AI analysis needs at least ${minResume} — the file may be image-based.`;
    if (!jobTitle.trim()) next.jobTitle = "Job title is required.";
    if (!targetRole) next.targetRole = "Please select a target role.";
    if (jobDescription.trim().length < minDescription)
      next.jobDescription = `Please enter at least ${minDescription} characters of job description.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleAnalyze() {
    setAiError(null);
    if (!validate()) return;
    if (!file || !targetRole) return;

    setAnalyzing(true);
    setLoadingPhase("parsing");
    try {
      // Phase 3: also save a rule-based job analysis when the description is long enough for the parser.
      const jdInput = { jobTitle: jobTitle.trim(), companyName, targetRole, description: jobDescription.trim(), jobUrl };
      if (validateJobDescriptionInput(jdInput).length === 0) saveJobAnalysis(parseJobDescription(jdInput));

      if (mode === "ai") {
        const phases: LoadingPhase[] = ["extracting", "comparing", "scoring", "generating"];
        let i = 0;
        const ticker = setInterval(() => {
          if (i < phases.length) setLoadingPhase(phases[i++]);
        }, 4000);
        try {
          const record = await runAiAnalysis({
            resumeText,
            jobTitle: jobTitle.trim(),
            targetRole,
            jobDescription: jobDescription.trim(),
            companyName: companyName.trim() || undefined,
            fileName: file.name,
          });
          setLoadingPhase("done");
          router.push(`/dashboard/resume-analysis/${record.id}`);
          return;
        } finally {
          clearInterval(ticker);
        }
      }

      const result = await runMockAnalysis(jobTitle.trim(), targetRole, jobDescription.trim(), file.name, (phase) => setLoadingPhase(phase));
      saveAnalysis(result);
      router.push(`/dashboard/resume-analysis/${result.id}`);
    } catch (err) {
      setAnalyzing(false);
      if (mode === "ai") {
        const apiErr = toApiClientError(err);
        setAiError(apiErr);
        if (apiErr.details?.length) {
          const next: FormErrors = {};
          for (const d of apiErr.details) {
            if (d.field === "resumeText") next.resume = d.message;
            if (d.field === "jobDescription") next.jobDescription = d.message;
            if (d.field === "jobTitle") next.jobTitle = d.message;
            if (d.field === "targetRole") next.targetRole = d.message;
          }
          setErrors((e) => ({ ...e, ...next }));
        }
      } else {
        setErrors((e) => ({ ...e, resume: "Analysis failed. Please try again." }));
      }
    }
  }

  // ── Job-description-only analysis (Phase 3) ───────────────────────────────
  function handleAnalyzeJobOnly() {
    const jdInput = { jobTitle: jobTitle.trim(), companyName, targetRole, description: jobDescription.trim(), jobUrl };
    const validation = validateJobDescriptionInput(jdInput);
    if (validation.length > 0) {
      const next: FormErrors = {};
      for (const v of validation) {
        if (v.field === "description") next.jobDescription = v.message;
        else if (v.field === "jobTitle") next.jobTitle = v.message;
        else if (v.field === "targetRole") next.targetRole = v.message;
      }
      setErrors((e) => ({ ...e, ...next }));
      return;
    }
    const analysis = parseJobDescription(jdInput);
    const saved = saveJobAnalysis(analysis);
    if (!saved.ok) {
      setErrors((e) => ({ ...e, jobDescription: saved.error ?? "Could not save the job analysis." }));
      return;
    }
    router.push(`/dashboard/job-analysis/${analysis.id}`);
  }

  // ── Render: Loading state ─────────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        {mode === "ai" && (
          <div className="flex items-center gap-2 justify-center text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2">
            <Bot className="w-4 h-4" /> Running real AI analysis — this usually takes 15–60 seconds.
          </div>
        )}
        <AnalysisLoading currentPhase={loadingPhase} />
      </div>
    );
  }

  const canSubmit = file && parsed && jobTitle.trim() && targetRole && jobDescription.trim().length >= minDescription;

  // ── Render: Form ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Resume Analyzer</h1>
        <p className="text-gray-500 mt-1.5">Upload your resume and paste a job description to get a detailed match analysis.</p>
      </div>

      {/* Mode selector */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModeOption
              active={mode === "ai"}
              disabled={!aiAvailable}
              onClick={() => aiAvailable && setMode("ai")}
              icon={Bot}
              title="AI Analysis"
              description="Real model-based analysis with resume evidence, saved to your account."
              accent="indigo"
            />
            <ModeOption
              active={mode === "demo"}
              onClick={() => setMode("demo")}
              icon={FlaskConical}
              title="Demo Analysis"
              description="Illustrative sample results for the role type. Stored only in this browser."
              accent="amber"
            />
          </div>

          {/* Availability notes */}
          {health === "checking" && <p className="text-xs text-gray-400 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Checking analysis server…</p>}
          {health === null && (
            <p className="text-xs text-gray-600 flex items-start gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Server className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
              <span>
                The analysis server is not reachable, so AI mode is unavailable. Start it with <code className="bg-gray-100 px-1 rounded">npm run dev</code> in <code className="bg-gray-100 px-1 rounded">backend/</code>, then{" "}
                <button type="button" onClick={checkHealth} className="text-blue-600 hover:underline">retry</button>. Demo mode works offline.
              </span>
            </p>
          )}
          {backendUp && !health.ai.configured && (
            <p className="text-xs text-gray-600 flex items-start gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
              The server is running but no AI provider key is configured (LLM_API_KEY). AI mode is disabled until it is set.
            </p>
          )}
          {aiConfigured && authReady && !user && (
            <p className="text-xs text-gray-700 flex items-start gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
              <LogIn className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-indigo-500" />
              <span>
                AI analysis is available ({health.ai.provider}).{" "}
                <Link href="/auth/login?next=/dashboard/resume-analyzer" className="text-blue-600 hover:underline font-medium">Sign in</Link> to use it and save results to your account.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {mode === "demo" ? (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Demo mode active.</span> Results are illustrative examples for this role type — not an AI evaluation of your actual resume. Your resume text is never stored.
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <Bot className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-indigo-900">
            <span className="font-semibold">AI mode active.</span> The extracted resume text and job description are sent to the project&apos;s backend, which calls the configured AI provider. Only the structured result is stored — not the resume text (unless the server is configured to keep it).
          </div>
        </div>
      )}

      {/* Step 1 — Upload */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">1</div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <CardTitle>Upload Resume</CardTitle>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-11">PDF or DOCX · max 5 MB</p>
        </CardHeader>
        <CardContent>
          <ResumeUploader
            onFileParsed={handleFileParsed}
            onParseError={handleParseError}
            onClear={handleClear}
            currentFile={file}
            parsed={parsed}
            charCount={charCount}
            parseError={parseError}
          />
          {errors.resume && !parseError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {errors.resume}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Job details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">2</div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <CardTitle>Job Details</CardTitle>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-11">Tell us about the role you&apos;re targeting.</p>
        </CardHeader>
        <CardContent>
          <JobDescriptionForm
            jobTitle={jobTitle}
            companyName={companyName}
            onCompanyNameChange={setCompanyName}
            targetRole={targetRole}
            jobDescription={jobDescription}
            jobUrl={jobUrl}
            onJobTitleChange={setJobTitle}
            onTargetRoleChange={setTargetRole}
            onJobDescriptionChange={setJobDescription}
            onJobUrlChange={setJobUrl}
            showDescriptionTools
            minLength={minDescription}
            errors={{ jobTitle: errors.jobTitle, targetRole: errors.targetRole, jobDescription: errors.jobDescription }}
          />
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Want only the job requirements? Extract skills, experience and keywords without uploading a resume (needs 100+ characters).
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleAnalyzeJobOnly}>
              <SearchCode className="w-4 h-4" /> Analyze Job Description Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI error with explicit demo fallback */}
      {aiError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <p className="font-semibold">AI analysis failed.</p>
              <p>{aiError.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-7">
            {aiError.retryable && (
              <Button size="sm" variant="outline" onClick={handleAnalyze}><RefreshCw className="w-3.5 h-3.5" /> Retry AI analysis</Button>
            )}
            {aiError.isAuthError && (
              <Link href="/auth/login?next=/dashboard/resume-analyzer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"><LogIn className="w-3.5 h-3.5" /> Sign in again</Link>
            )}
            {aiError.suggestsDemoMode && (
              <Button size="sm" variant="secondary" onClick={() => { setMode("demo"); setAiError(null); }}>
                <FlaskConical className="w-3.5 h-3.5" /> Switch to demo mode instead
              </Button>
            )}
          </div>
          <p className="text-xs text-red-600 pl-7">Demo results are illustrative samples and will be clearly labelled as such — they are not a substitute for the AI analysis.</p>
        </div>
      )}

      {Object.keys(errors).some((k) => errors[k as keyof FormErrors]) && !canSubmit && !aiError && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">Please fix the errors above before analyzing.</p>
        </div>
      )}

      <Button onClick={handleAnalyze} size="lg" className={cn("w-full", mode === "ai" && "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500")} disabled={!canSubmit}>
        {mode === "ai" ? <Bot className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        {mode === "ai" ? "Run AI Analysis" : "Run Demo Analysis"}
      </Button>

      <p className="text-center text-xs text-gray-400">
        {mode === "ai"
          ? `AI analysis takes 15–60 seconds · Provider: ${backendUp ? health.ai.provider : "—"} · Saved to your account`
          : "Demo analysis takes about 3–5 seconds · Demo results only · No data sent to external services"}
      </p>
    </div>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  icon: Icon,
  title,
  description,
  accent,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accent: "indigo" | "amber";
}) {
  const ring = accent === "indigo" ? "border-indigo-500 bg-indigo-50" : "border-amber-500 bg-amber-50";
  const iconCls = accent === "indigo" ? "text-indigo-600" : "text-amber-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "text-left rounded-xl border-2 p-3 transition-colors",
        active ? ring : "border-gray-200 bg-white hover:border-gray-300",
        disabled && "opacity-50 cursor-not-allowed hover:border-gray-200"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", iconCls)} />
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        {disabled && <span className="text-[10px] uppercase tracking-wide text-gray-400 ml-auto">unavailable</span>}
      </div>
      <p className="text-xs text-gray-600 leading-snug">{description}</p>
    </button>
  );
}
