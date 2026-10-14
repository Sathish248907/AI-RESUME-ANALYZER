"use client";

import { Briefcase, Building2, Target, Clock, GraduationCap, Link as LinkIcon, Calendar, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { JobAnalysis } from "@/services/jobDescriptionParser";

interface JobOverviewCardProps {
  analysis: JobAnalysis;
}

export function formatExperience(exp: JobAnalysis["experience"]): string {
  if (exp.minYears === null) return "Not specified";
  if (exp.maxYears !== null) return `${exp.minYears}–${exp.maxYears} years`;
  return `${exp.minYears}+ years`;
}

export function formatEducation(edu: JobAnalysis["education"]): string {
  if (edu.degrees.length === 0) return "Not specified";
  const fields = edu.fields.length > 0 ? ` in ${edu.fields.slice(0, 2).join(" / ")}` : "";
  return `${edu.degrees.join(" or ")}${fields}`;
}

export default function JobOverviewCard({ analysis }: JobOverviewCardProps) {
  const required = analysis.skills.filter((s) => s.priority === "required").length;
  const preferred = analysis.skills.filter((s) => s.priority === "preferred").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Job Overview
          </CardTitle>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-medium">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
            Demo analysis
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <OverviewItem icon={Briefcase} label="Job title" value={analysis.jobTitle} />
          <OverviewItem icon={Building2} label="Company" value={analysis.companyName ?? "Not specified"} muted={!analysis.companyName} />
          <OverviewItem icon={Target} label="Target role" value={analysis.targetRole} />
          <OverviewItem icon={Calendar} label="Analyzed" value={formatDate(analysis.createdAt)} />
          <OverviewItem
            icon={Clock}
            label="Experience"
            value={formatExperience(analysis.experience)}
            muted={analysis.experience.minYears === null}
            note={analysis.experience.userConfirmed ? "Confirmed by you" : undefined}
          />
          <OverviewItem
            icon={GraduationCap}
            label="Education"
            value={formatEducation(analysis.education)}
            muted={analysis.education.degrees.length === 0}
            note={analysis.education.userConfirmed ? "Confirmed by you" : undefined}
          />
          {analysis.jobUrl && (
            <div className="sm:col-span-2 flex items-start gap-2.5">
              <LinkIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <dt className="text-xs text-gray-500">Job posting</dt>
                <dd className="truncate">
                  <a href={analysis.jobUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                    {analysis.jobUrl}
                  </a>
                </dd>
              </div>
            </div>
          )}
        </dl>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Description summary</p>
          <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            {analysis.summary || "No summary could be generated."}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Opening paragraph of the description · {analysis.descriptionLength.toLocaleString()} characters analyzed
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="info">{analysis.skills.length} skills detected</Badge>
          <Badge variant="info">{required} required</Badge>
          <Badge variant="success">{preferred} preferred</Badge>
          <Badge variant="neutral">{analysis.responsibilities.length} responsibilities</Badge>
          {analysis.certifications.length > 0 && <Badge variant="neutral">{analysis.certifications.length} certifications</Badge>}
        </div>

        {analysis.warnings.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Parser notes
            </p>
            <ul className="text-xs text-gray-600 space-y-0.5 list-disc pl-4">
              {analysis.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewItem({
  icon: Icon,
  label,
  value,
  muted,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  muted?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className={muted ? "text-gray-400 italic" : "text-gray-900 font-medium"}>{value}</dd>
        {note && <dd className="text-[11px] text-green-700">{note}</dd>}
      </div>
    </div>
  );
}
