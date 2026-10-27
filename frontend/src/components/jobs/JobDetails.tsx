"use client";

import Link from "next/link";
import {
  Building2, MapPin, Clock, Banknote, ExternalLink, Bookmark, BookmarkCheck, EyeOff,
  Info, Megaphone, ClipboardList, PenSquare, Sparkles, ShieldQuestion,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS, WORK_ARRANGEMENT_LABELS,
  externalHref, formatPostedAt, formatSalary,
  type JobDetail, type SavedState, type TailorHandoff,
} from "@/services/jobDiscoveryService";

interface Props {
  detail: JobDetail;
  busy: boolean;
  tailoring: boolean;
  tailorHandoff: TailorHandoff | null;
  onSave: (state: SavedState) => void;
  onUnsave: () => void;
  onStartApplication: () => void;
  onTailor: () => void;
}

/**
 * The job itself: the full description as the source supplied it, the facts it
 * did and did not provide, and the actions that connect it to the rest of the
 * app. Nothing about the employer is added or verified here.
 */
export default function JobDetails({ detail, busy, tailoring, tailorHandoff, onSave, onUnsave, onStartApplication, onTailor }: Props) {
  const { job, requirements, ranking, savedJob, application } = detail;
  const salary = formatSalary(job);
  const posted = formatPostedAt(job);
  const apply = externalHref(job.applyUrl);
  const source = externalHref(job.sourceUrl);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{job.title}</h1>
            <p className="text-sm text-gray-700 mt-1 inline-flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-gray-400" /> {job.companyName}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {job.sourceKind === "own" && <Badge variant="neutral">Entered by you</Badge>}
              <Badge variant="info">{WORK_ARRANGEMENT_LABELS[job.workArrangement]}</Badge>
              <Badge variant="neutral">{EMPLOYMENT_TYPE_LABELS[job.employmentType]}</Badge>
              <Badge variant="neutral">{EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}</Badge>
              {job.isSponsored && (
                <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                  <Megaphone className="w-3 h-3" /> Promoted by the provider
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {savedJob ? (
              <Button size="sm" variant="outline" loading={busy} onClick={onUnsave}>
                <BookmarkCheck className="w-3.5 h-3.5 mr-1.5" /> Saved
              </Button>
            ) : (
              <Button size="sm" variant="outline" loading={busy} onClick={() => onSave("saved")}>
                <Bookmark className="w-3.5 h-3.5 mr-1.5" /> Save
              </Button>
            )}
            {savedJob?.state !== "hidden" && (
              <Button size="sm" variant="ghost" loading={busy} onClick={() => onSave("hidden")} title="Hide from your results">
                <EyeOff className="w-3.5 h-3.5" />
              </Button>
            )}
            {apply && (
              <a
                href={apply}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open application page <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        {/* Facts, with absences named */}
        <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <dt className="text-gray-500 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Location</dt>
            <dd className={cn("mt-0.5", job.location ? "text-gray-900" : "text-gray-400")}>
              {job.location ?? (job.workArrangement === "remote" ? "Remote" : "Not provided by the source")}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 inline-flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Salary</dt>
            <dd className={cn("mt-0.5", salary ? "text-gray-900" : "text-gray-400")}>{salary ?? "Not published"}</dd>
          </div>
          <div>
            <dt className="text-gray-500 inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Posted</dt>
            <dd className={cn("mt-0.5", posted ? "text-gray-900" : "text-gray-400")}>
              {posted ?? (job.postedAt ? "Date not reliable enough to show" : "Not provided by the source")}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Source</dt>
            <dd className="mt-0.5 text-gray-900">
              {source
                ? <a href={source} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-700 hover:underline inline-flex items-center gap-1">{job.providerName ?? job.providerSlug} <ExternalLink className="w-3 h-3" /></a>
                : (job.providerName ?? job.providerSlug)}
            </dd>
          </div>
        </dl>

        {job.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.tags.map((t) => <span key={t} className="text-[11px] bg-gray-100 text-gray-700 border border-gray-200 rounded-full px-2 py-0.5">{t}</span>)}
          </div>
        )}

        {detail.attribution && <p className="mt-3 text-[11px] text-gray-400">{detail.attribution}</p>}
      </div>

      {/* Why this is in your list */}
      {ranking.reasons.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> Why this is recommended to you
          </h2>
          <ul className="mt-2 space-y-1">
            {ranking.reasons.map((r) => (
              <li key={r} className="text-xs text-gray-700 flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" /> {r}
              </li>
            ))}
          </ul>
          <details className="mt-2">
            <summary className="text-[11px] text-sky-700 cursor-pointer">How this position was decided</summary>
            <ul className="mt-1.5 space-y-0.5">
              {ranking.factors.map((f) => (
                <li key={f.key} className="text-[11px] text-gray-600 flex justify-between gap-2">
                  <span>{f.label} <span className="text-gray-400">(weight {f.weight})</span></span>
                  <span className="tabular-nums">{f.applicable ? f.score : "not assessed"}</span>
                </li>
              ))}
            </ul>
            {ranking.notes.map((n) => <p key={n} className="text-[11px] text-gray-500 mt-1">{n}</p>)}
          </details>
        </div>
      )}

      {/* Actions that connect to the rest of the app */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Next steps</h2>
        <div className="flex flex-wrap items-center gap-2">
          {application ? (
            <Link href="/dashboard/applications" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline">
              <ClipboardList className="w-4 h-4" /> Tracked as {application.status} — open the application tracker
            </Link>
          ) : savedJob ? (
            <Button size="sm" variant="outline" loading={busy} onClick={onStartApplication}>
              <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Start an application record
            </Button>
          ) : (
            <p className="text-xs text-gray-500">Save this job to start tracking an application for it.</p>
          )}

          <Button size="sm" variant="outline" loading={tailoring} onClick={onTailor}>
            <PenSquare className="w-3.5 h-3.5 mr-1.5" /> Tailor a resume for this job
          </Button>
        </div>

        {tailorHandoff && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2.5 space-y-2">
            <p className="text-xs text-indigo-950">
              Best match: <strong>{tailorHandoff.recommendedVersion.name}</strong>
              {tailorHandoff.recommendedVersion.matchScore !== null && ` · ${tailorHandoff.recommendedVersion.matchScore}% (${tailorHandoff.recommendedVersion.label})`}
            </p>
            {tailorHandoff.keywordSuggestions.addWhereTrue.length > 0 && (
              <p className="text-[11px] text-indigo-900">
                Keywords the listing asks for that your resume does not mention:{" "}
                <strong>{tailorHandoff.keywordSuggestions.addWhereTrue.join(", ")}</strong>
              </p>
            )}
            {tailorHandoff.keywordSuggestions.evidenceNeeded.length > 0 && (
              <p className="text-[11px] text-indigo-900">
                Listed but not evidenced: <strong>{tailorHandoff.keywordSuggestions.evidenceNeeded.join(", ")}</strong>
              </p>
            )}
            <p className="text-[11px] text-indigo-900/80 inline-flex items-start gap-1">
              <ShieldQuestion className="w-3 h-3 mt-0.5 shrink-0" /> {tailorHandoff.keywordSuggestions.rule}
            </p>
            <p className="text-[11px] text-indigo-900/80">{tailorHandoff.next.message}</p>
            <Link href={tailorHandoff.next.href} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
              <PenSquare className="w-3.5 h-3.5" /> Open the resume builder
            </Link>
          </div>
        )}
      </div>

      {/* Requirements read from the listing */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Requirements read from this listing</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Extracted from the text by a deterministic parser. “Preferred” means it appeared under a nice-to-have heading.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {requirements.skills.map((s) => (
            <span
              key={s.name}
              className={cn(
                "text-[11px] rounded-full px-2 py-0.5 border",
                s.priority === "required" ? "bg-amber-50 text-amber-900 border-amber-200" : "bg-gray-50 text-gray-700 border-gray-200"
              )}
            >
              {s.name}
            </span>
          ))}
          {requirements.skills.length === 0 && <span className="text-xs text-gray-500">No recognisable skill requirements.</span>}
        </div>
        <ul className="mt-2 space-y-0.5">
          {requirements.educationRequired && <li className="text-[11px] text-gray-700">States a degree requirement.</li>}
          {requirements.minYears !== null && <li className="text-[11px] text-gray-700">Asks for {requirements.minYears}+ years of experience.</li>}
          {requirements.level && <li className="text-[11px] text-gray-700">Targets a {requirements.level} level.</li>}
        </ul>
      </div>

      {/* The description, as supplied */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Full job description</h2>
        <p className="text-[11px] text-gray-500 mt-0.5">
          Shown as plain text exactly as the source supplied it, with markup removed.
        </p>
        <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{job.description}</p>
      </div>

      {detail.notes.length > 0 && (
        <ul className="space-y-1">
          {detail.notes.map((n) => (
            <li key={n} className="text-[11px] text-gray-500 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
