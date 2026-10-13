"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ResumeUploader from "@/components/analyzer/ResumeUploader";
import JobDescriptionForm from "@/components/analyzer/JobDescriptionForm";
import AnalysisLoading from "@/components/analyzer/AnalysisLoading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { runMockAnalysis, type TargetRole, type LoadingPhase } from "@/services/mockAnalysisService";
import { saveAnalysis } from "@/services/analysisStorage";
import { extractResumeSkills } from "@/services/skillComparisonService";
import { saveSessionResumeSkills, saveJobAnalysis } from "@/services/jobAnalysisStorage";
import { parseJobDescription, validateJobDescriptionInput } from "@/services/jobDescriptionParser";
import { Sparkles, AlertCircle, FileText, Briefcase, Info, SearchCode } from "lucide-react";

interface FormErrors {
  resume?: string;
  jobTitle?: string;
  targetRole?: string;
  jobDescription?: string;
}

export default function ResumeAnalyzerPage() {
  const router = useRouter();

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

  // UI state
  const [errors, setErrors] = useState<FormErrors>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("parsing");

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
  function validate(): boolean {
    const next: FormErrors = {};
    if (!file || !parsed) next.resume = "Please upload a resume (PDF or DOCX).";
    if (!jobTitle.trim()) next.jobTitle = "Job title is required.";
    if (!targetRole) next.targetRole = "Please select a target role.";
    if (jobDescription.trim().length < 50)
      next.jobDescription = "Please enter at least 50 characters of job description.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!validate()) return;
    if (!file || !targetRole) return;

    setAnalyzing(true);
    try {
      const result = await runMockAnalysis(
        jobTitle.trim(),
        targetRole,
        jobDescription.trim(),
        file.name,
        (phase) => setLoadingPhase(phase)
      );
      saveAnalysis(result);
      // Phase 3: also save a rule-based job analysis when the description is long enough for the parser.
      const jdInput = { jobTitle: jobTitle.trim(), companyName, targetRole, description: jobDescription.trim(), jobUrl };
      if (validateJobDescriptionInput(jdInput).length === 0) {
        saveJobAnalysis(parseJobDescription(jdInput));
      }
      router.push(`/dashboard/resume-analysis/${result.id}`);
    } catch {
      setAnalyzing(false);
      setErrors((e) => ({ ...e, resume: "Analysis failed. Please try again." }));
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
      <div className="max-w-2xl mx-auto px-4 py-10">
        <AnalysisLoading currentPhase={loadingPhase} />
      </div>
    );
  }

  const canSubmit = file && parsed && jobTitle.trim() && targetRole && jobDescription.trim().length >= 50;

  // ── Render: Form ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Resume Analyzer</h1>
        <p className="text-gray-500 mt-1.5">
          Upload your resume and paste a job description to get a detailed match analysis.
        </p>
      </div>

      {/* Demo notice */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-amber-800">
          <span className="font-semibold">Demo mode active.</span> Results are illustrative examples for this role type — not an AI evaluation of your actual resume. Your resume text is never stored.
        </div>
      </div>

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
            targetRole={targetRole}
            jobDescription={jobDescription}
            jobUrl={jobUrl}
            companyName={companyName}
            onCompanyNameChange={setCompanyName}
            onJobTitleChange={setJobTitle}
            onTargetRoleChange={setTargetRole}
            onJobDescriptionChange={setJobDescription}
            onJobUrlChange={setJobUrl}
            showDescriptionTools
            errors={{
              jobTitle: errors.jobTitle,
              targetRole: errors.targetRole,
              jobDescription: errors.jobDescription,
            }}
          />
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Want only the job requirements? Extract skills, experience and keywords without uploading a resume (needs 100+ characters).
            </p>
            <Button type="button" variant="outline" size="sm" onClick={handleAnalyzeJobOnly} disabled={analyzing}>
              <SearchCode className="w-4 h-4" /> Analyze Job Description Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Global form error */}
      {Object.keys(errors).length > 0 && !canSubmit && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">Please fix the errors above before analyzing.</p>
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleAnalyze}
        size="lg"
        className="w-full"
        disabled={!canSubmit}
      >
        <Sparkles className="w-5 h-5" />
        Analyze Resume
      </Button>

      <p className="text-center text-xs text-gray-400">
        Analysis takes about 3–5 seconds · Demo results only · No data sent to external services
      </p>
    </div>
  );
}
