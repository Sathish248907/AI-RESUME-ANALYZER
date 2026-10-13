"use client";

import { useState } from "react";
import { ChevronDown, Link as LinkIcon, ClipboardPaste, Eraser, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TargetRole } from "@/services/mockAnalysisService";

export const TARGET_ROLES: TargetRole[] = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Analyst",
  "Software Engineer",
];

interface JobDescriptionFormProps {
  jobTitle: string;
  targetRole: TargetRole | "";
  jobDescription: string;
  jobUrl: string;
  onJobTitleChange: (v: string) => void;
  onTargetRoleChange: (v: TargetRole) => void;
  onJobDescriptionChange: (v: string) => void;
  onJobUrlChange: (v: string) => void;
  errors: Partial<Record<"jobTitle" | "targetRole" | "jobDescription" | "jobUrl" | "companyName", string>>;
  disabled?: boolean;
  /** Optional company name field — rendered only when a change handler is supplied. */
  companyName?: string;
  onCompanyNameChange?: (v: string) => void;
  /** Minimum characters for the description (default 50 — Phase 2 behaviour). */
  minLength?: number;
  /** Show paste / clear helper buttons above the description. */
  showDescriptionTools?: boolean;
  /** Optional "load example" callback shown next to the tools. */
  onLoadExample?: () => void;
  descriptionRows?: number;
}

export default function JobDescriptionForm({
  jobTitle,
  targetRole,
  jobDescription,
  jobUrl,
  onJobTitleChange,
  onTargetRoleChange,
  onJobDescriptionChange,
  onJobUrlChange,
  errors,
  disabled = false,
  companyName = "",
  onCompanyNameChange,
  minLength = 50,
  showDescriptionTools = false,
  onLoadExample,
  descriptionRows = 10,
}: JobDescriptionFormProps) {
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  const remaining = Math.max(0, minLength - jobDescription.trim().length);
  const showCompany = typeof onCompanyNameChange === "function";

  async function handlePaste() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteMsg("Clipboard is empty.");
      } else {
        onJobDescriptionChange(jobDescription.trim() ? `${jobDescription.trimEnd()}\n\n${text}` : text);
        setPasteMsg("Pasted from clipboard.");
      }
    } catch {
      setPasteMsg("Clipboard access was blocked — paste with Ctrl+V / ⌘V instead.");
    }
    setTimeout(() => setPasteMsg(null), 3000);
  }

  const inputBase =
    "w-full px-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="space-y-5">
      {/* Row: job title + company / target role */}
      <div className={cn("grid grid-cols-1 gap-4", showCompany ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <div>
          <label htmlFor="jobTitle" className="block text-sm font-medium text-gray-700 mb-1.5">
            Job Title <span className="text-red-500">*</span>
          </label>
          <input
            id="jobTitle"
            type="text"
            value={jobTitle}
            onChange={(e) => onJobTitleChange(e.target.value)}
            placeholder="e.g. Senior Frontend Developer"
            disabled={disabled}
            maxLength={120}
            className={cn(inputBase, errors.jobTitle ? "border-red-400 bg-red-50" : "border-gray-300")}
          />
          {errors.jobTitle && <p className="mt-1 text-xs text-red-600">{errors.jobTitle}</p>}
        </div>

        {showCompany && (
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1.5">
              Company <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="companyName"
                type="text"
                value={companyName}
                onChange={(e) => onCompanyNameChange?.(e.target.value)}
                placeholder="e.g. Northwind Health"
                disabled={disabled}
                maxLength={120}
                className={cn(inputBase, "pl-9", errors.companyName ? "border-red-400 bg-red-50" : "border-gray-300")}
              />
            </div>
            {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName}</p>}
          </div>
        )}

        <div>
          <label htmlFor="targetRole" className="block text-sm font-medium text-gray-700 mb-1.5">
            Target Role <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              id="targetRole"
              value={targetRole}
              onChange={(e) => onTargetRoleChange(e.target.value as TargetRole)}
              disabled={disabled}
              className={cn(inputBase, "appearance-none", errors.targetRole ? "border-red-400 bg-red-50" : "border-gray-300", !targetRole && "text-gray-400")}
            >
              <option value="" disabled>Select a role…</option>
              {TARGET_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {errors.targetRole && <p className="mt-1 text-xs text-red-600">{errors.targetRole}</p>}
        </div>
      </div>

      {/* Job Description */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <label htmlFor="jobDesc" className="block text-sm font-medium text-gray-700">
            Job Description <span className="text-red-500">*</span>
          </label>
          {showDescriptionTools && (
            <div className="flex items-center gap-1.5">
              {onLoadExample && (
                <button type="button" onClick={onLoadExample} disabled={disabled} className="text-xs px-2.5 py-1 rounded-lg text-blue-700 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors disabled:opacity-50">
                  Load example
                </button>
              )}
              <button type="button" onClick={handlePaste} disabled={disabled} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste
              </button>
              <button
                type="button"
                onClick={() => onJobDescriptionChange("")}
                disabled={disabled || !jobDescription}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          )}
        </div>
        <textarea
          id="jobDesc"
          rows={descriptionRows}
          value={jobDescription}
          onChange={(e) => onJobDescriptionChange(e.target.value)}
          placeholder="Paste the full job posting here — requirements, responsibilities, qualifications…&#10;&#10;The more detail you include, the more accurate the analysis."
          disabled={disabled}
          aria-invalid={Boolean(errors.jobDescription)}
          aria-describedby="jobDesc-help"
          className={cn(inputBase, "resize-y", errors.jobDescription ? "border-red-400 bg-red-50" : "border-gray-300")}
        />
        <div id="jobDesc-help" className="flex items-center justify-between mt-1 gap-3">
          {errors.jobDescription ? (
            <p className="text-xs text-red-600">{errors.jobDescription}</p>
          ) : pasteMsg ? (
            <p className="text-xs text-blue-600">{pasteMsg}</p>
          ) : (
            <p className="text-xs text-gray-400">
              Minimum {minLength} characters · {jobDescription.length.toLocaleString()} typed
            </p>
          )}
          {jobDescription.length > 0 && (
            <span className={cn("text-xs font-medium whitespace-nowrap", remaining === 0 ? "text-green-600" : "text-gray-400")}>
              {remaining === 0 ? "✓ Good length" : `${remaining} more to go`}
            </span>
          )}
        </div>
      </div>

      {/* Optional URL */}
      <div>
        <label htmlFor="jobUrl" className="block text-sm font-medium text-gray-700 mb-1.5">
          Job Posting URL <span className="text-xs text-gray-400 font-normal">(optional)</span>
        </label>
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            id="jobUrl"
            type="url"
            value={jobUrl}
            onChange={(e) => onJobUrlChange(e.target.value)}
            placeholder="https://company.com/jobs/role-name"
            disabled={disabled}
            className={cn(inputBase, "pl-9", errors.jobUrl ? "border-red-400 bg-red-50" : "border-gray-300")}
          />
        </div>
        {errors.jobUrl ? (
          <p className="mt-1 text-xs text-red-600">{errors.jobUrl}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">Saved for your reference only — the page is not fetched.</p>
        )}
      </div>
    </div>
  );
}
