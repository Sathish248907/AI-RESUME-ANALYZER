"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Sparkles, AlertCircle, History, FileText, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import JobDescriptionForm from "@/components/analyzer/JobDescriptionForm";
import DemoNotice from "@/components/job-analysis/DemoNotice";
import type { TargetRole } from "@/services/mockAnalysisService";
import {
  MIN_DESCRIPTION_LENGTH,
  SAMPLE_JOB_DESCRIPTION,
  parseJobDescription,
  validateJobDescriptionInput,
  type ValidationError,
} from "@/services/jobDescriptionParser";
import { saveJobAnalysis, loadSessionResumeSkills, getJobAnalysisMetas } from "@/services/jobAnalysisStorage";

type Errors = Partial<Record<ValidationError["field"], string>>;

export default function JobAnalyzerPage() {
  const router = useRouter();
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole | "">("");
  const [description, setDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    setResumeFile(loadSessionResumeSkills()?.fileName ?? null);
    setSavedCount(getJobAnalysisMetas().length);
  }, []);

  function clearFieldError(field: keyof Errors) {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  function loadExample() {
    setJobTitle("Senior Frontend Developer");
    setCompanyName("Northwind Health");
    setTargetRole("Frontend Developer");
    setDescription(SAMPLE_JOB_DESCRIPTION);
    setJobUrl("");
    setErrors({});
  }

  async function handleAnalyze() {
    setSubmitError(null);
    const input = { jobTitle, companyName, targetRole, description, jobUrl };
    const validation = validateJobDescriptionInput(input);
    if (validation.length > 0) {
      const next: Errors = {};
      for (const v of validation) next[v.field] = v.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setAnalyzing(true);
    try {
      // Brief artificial delay so the loading state is visible and the UI stays ready for an async backend.
      await new Promise((r) => setTimeout(r, 600));
      const analysis = parseJobDescription(input);
      const saved = saveJobAnalysis(analysis);
      if (!saved.ok) {
        setSubmitError(saved.error ?? "Could not save the analysis.");
        setAnalyzing(false);
        return;
      }
      router.push(`/dashboard/job-analysis/${analysis.id}`);
    } catch {
      setSubmitError("Analysis failed unexpectedly. Please try again.");
      setAnalyzing(false);
    }
  }

  const trimmedLen = description.trim().length;
  const canSubmit = jobTitle.trim() && targetRole && trimmedLen >= MIN_DESCRIPTION_LENGTH && !analyzing;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Description Analyzer</h1>
          <p className="text-gray-500 mt-1.5">
            Paste a job posting to extract skills, experience, education, responsibilities and keywords.
          </p>
        </div>
        <Link href="/dashboard/job-history" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <History className="w-4 h-4" /> Saved jobs {savedCount > 0 && <span className="text-xs text-gray-400">({savedCount})</span>}
        </Link>
      </div>

      <DemoNotice />

      {resumeFile ? (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
          <span>
            Resume skills from <span className="font-semibold">{resumeFile}</span> are available for this session and will be compared against the job automatically.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600">
          <FileText className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          <span>
            No resume skills in this session yet. You can upload a resume on the results page, or run the{" "}
            <Link href="/dashboard/resume-analyzer" className="text-blue-600 hover:underline">Resume Analyzer</Link> first.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Briefcase className="w-4 h-4" /></div>
            <div>
              <CardTitle>Job Description</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">Title, target role and the full posting text are required.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <JobDescriptionForm
            jobTitle={jobTitle}
            companyName={companyName}
            targetRole={targetRole}
            jobDescription={description}
            jobUrl={jobUrl}
            onJobTitleChange={(v) => { setJobTitle(v); clearFieldError("jobTitle"); }}
            onCompanyNameChange={setCompanyName}
            onTargetRoleChange={(v) => { setTargetRole(v); clearFieldError("targetRole"); }}
            onJobDescriptionChange={(v) => { setDescription(v); clearFieldError("description"); }}
            onJobUrlChange={(v) => { setJobUrl(v); clearFieldError("jobUrl"); }}
            errors={{ jobTitle: errors.jobTitle, targetRole: errors.targetRole, jobDescription: errors.description, jobUrl: errors.jobUrl }}
            disabled={analyzing}
            minLength={MIN_DESCRIPTION_LENGTH}
            showDescriptionTools
            onLoadExample={loadExample}
            descriptionRows={14}
          />
        </CardContent>
      </Card>

      {(Object.values(errors).some(Boolean) || submitError) && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3" role="alert">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{submitError ?? "Please fix the highlighted fields before analyzing."}</p>
        </div>
      )}

      <Button onClick={handleAnalyze} size="lg" className="w-full" disabled={!canSubmit} loading={analyzing}>
        {!analyzing && <Sparkles className="w-5 h-5" />}
        {analyzing ? "Analyzing job description…" : "Analyze Job Description"}
      </Button>

      <p className="text-center text-xs text-gray-400">
        Rule-based demo analysis runs in your browser · Results are saved locally · No data is sent to external services
      </p>
    </div>
  );
}
