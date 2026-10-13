"use client";

import { useState, useCallback } from "react";
import ResumeDropzone from "@/components/resume/ResumeDropzone";
import AnalysisResult from "@/components/dashboard/AnalysisResult";
import Button from "@/components/common/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import type { AnalysisResult as AnalysisResultType } from "@/types";
import { Sparkles, AlertCircle, RotateCcw } from "lucide-react";

interface ParsedFile {
  file: File;
  text: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export default function AnalyzePage() {
  const [parsedResume, setParsedResume] = useState<ParsedFile | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [result, setResult] = useState<AnalysisResultType | null>(null);
  const [parsing, setParsing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle file drop → parse immediately
  const handleFileAccepted = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setParsedResume(null);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to parse resume.");
      }

      setParsedResume({
        file,
        text: data.text,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse resume.");
    } finally {
      setParsing(false);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!parsedResume) return setError("Please upload a resume first.");
    if (!jobDescription.trim()) return setError("Please enter a job description.");
    if (!jobTitle.trim()) return setError("Please enter the job title.");

    setAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: parsedResume.text,
          jobDescription: jobDescription.trim(),
          jobTitle: jobTitle.trim(),
          fileName: parsedResume.fileName,
          fileSize: parsedResume.fileSize,
          mimeType: parsedResume.mimeType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Analysis failed.");
      }

      setResult(data.result);
      // Scroll to results
      setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReset = () => {
    setParsedResume(null);
    setJobDescription("");
    setJobTitle("");
    setResult(null);
    setError(null);
  };

  const canAnalyze = parsedResume && jobDescription.trim().length > 30 && jobTitle.trim().length > 1;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Page header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Analyze Your Resume</h1>
        <p className="text-gray-500 mt-2">
          Upload your resume and paste a job description to get AI-powered feedback.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input form */}
      {!result && (
        <div className="space-y-6">
          {/* Resume upload */}
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Resume</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">PDF or DOCX, max 5MB</p>
            </CardHeader>
            <CardContent>
              {parsing ? (
                <div className="flex items-center justify-center gap-3 py-10 text-gray-500">
                  <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Extracting text from resume…
                </div>
              ) : (
                <ResumeDropzone
                  onFileAccepted={handleFileAccepted}
                  onClear={() => setParsedResume(null)}
                  accepted={parsedResume?.file ?? null}
                />
              )}

              {parsedResume && (
                <p className="mt-3 text-xs text-gray-400">
                  ✓ Extracted {parsedResume.text.length.toLocaleString()} characters
                </p>
              )}
            </CardContent>
          </Card>

          {/* Job details */}
          <Card>
            <CardHeader>
              <CardTitle>2. Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="jobTitle"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Job Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="jobTitle"
                  type="text"
                  placeholder="e.g. Frontend Developer, Data Analyst"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  htmlFor="jobDesc"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Job Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="jobDesc"
                  rows={10}
                  placeholder="Paste the full job description here — requirements, responsibilities, qualifications…"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {jobDescription.length} characters — the more detail, the better the analysis
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Analyze button */}
          <Button
            onClick={handleAnalyze}
            loading={analyzing}
            disabled={!canAnalyze || analyzing}
            size="lg"
            className="w-full"
          >
            <Sparkles className="w-5 h-5" />
            {analyzing ? "Analyzing with AI…" : "Analyze Resume"}
          </Button>

          {analyzing && (
            <p className="text-center text-sm text-gray-500 animate-pulse">
              Sending to Gemini AI — this takes about 10–20 seconds…
            </p>
          )}
        </div>
      )}

      {/* Results */}
      {result && parsedResume && (
        <div id="results" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Your Results</h2>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
              New Analysis
            </Button>
          </div>
          <AnalysisResult
            result={result}
            jobTitle={jobTitle}
            fileName={parsedResume.fileName}
          />
        </div>
      )}
    </div>
  );
}
