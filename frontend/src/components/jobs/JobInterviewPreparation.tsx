"use client";

import Link from "next/link";
import {
  Mic, GraduationCap, ExternalLink, Info, MessageCircleQuestion,
  Code2, TrendingUp, CheckCircle2, CircleDashed, XCircle, Map,
} from "lucide-react";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { EvidenceState, JobPreparation } from "@/services/jobDiscoveryService";

interface Props {
  preparation: JobPreparation | null;
  note?: string | null;
}

const EVIDENCE_ICON: Record<EvidenceState, { icon: typeof CheckCircle2; cls: string }> = {
  demonstrated: { icon: CheckCircle2, cls: "text-emerald-600" },
  mentioned: { icon: CircleDashed, cls: "text-amber-600" },
  not_found: { icon: XCircle, cls: "text-gray-400" },
  not_assessed: { icon: Info, cls: "text-gray-300" },
};

/**
 * Preparation for one job, assembled from the existing mock-interview history,
 * skill-gap engine and learning catalogue. Topics are ordered by how much
 * evidence the resume shows, because that changes what to prepare.
 */
export default function JobInterviewPreparation({ preparation, note }: Props) {
  if (!preparation) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Mic className="w-4 h-4 text-rose-600" /> Interview preparation
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          {note ?? "Preparation is built from the gap between this listing and a resume version. Create a resume version first."}
        </p>
      </div>
    );
  }

  const { interview, learning, skillGaps } = preparation;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Mic className="w-4 h-4 text-rose-600" /> Interview preparation
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{interview.note}</p>
        </div>
        <Link href={interview.startSessionHref} className="text-xs font-medium text-indigo-700 hover:underline">
          Start a mock interview →
        </Link>
      </div>

      {/* Technical topics */}
      <div>
        <h4 className="text-xs font-semibold text-gray-800">Technical topics from this listing</h4>
        <ul className="mt-1.5 space-y-1.5">
          {interview.technicalTopics.map((t) => {
            const meta = EVIDENCE_ICON[t.evidence];
            const Icon = meta.icon;
            return (
              <li key={t.topic} className="rounded-lg border border-gray-200 px-2.5 py-2">
                <p className="text-xs font-medium text-gray-900 inline-flex items-center gap-1.5 flex-wrap">
                  <Icon className={cn("w-3.5 h-3.5", meta.cls)} />
                  {t.topic}
                  {t.requirement === "required" ? <Badge variant="warning">required</Badge> : <Badge variant="neutral">preferred</Badge>}
                  {t.priority === "high" && <Badge variant="error">prepare first</Badge>}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">{t.why}</p>
                <p className="text-[11px] text-gray-800 mt-0.5"><strong>Prepare:</strong> {t.prepare}</p>
              </li>
            );
          })}
          {interview.technicalTopics.length === 0 && (
            <li className="text-xs text-gray-500">This listing names no recognisable technical requirements.</li>
          )}
        </ul>
      </div>

      {/* Behavioural */}
      <div>
        <h4 className="text-xs font-semibold text-gray-800">Behavioural topics</h4>
        <ul className="mt-1.5 space-y-1">
          {interview.behaviouralTopics.map((b) => (
            <li key={b.key} className="text-xs text-gray-700">
              <strong className="text-gray-900">{b.topic}</strong>
              <span className="text-gray-400"> · {b.source}</span>
              <p className="text-[11px] text-gray-600">{b.question}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Practice questions */}
      {interview.practiceQuestions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
            <MessageCircleQuestion className="w-3.5 h-3.5 text-sky-600" /> Questions to rehearse
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {interview.practiceQuestions.map((q, i) => (
              <li key={`${q.kind}-${i}`} className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2">
                <p className="text-xs text-gray-900">{q.question}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{q.basis}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* From the user's own history */}
      {(interview.recommendedSessions.length > 0 || interview.weakTopics.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {interview.recommendedSessions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-800">Suggested sessions</h4>
              <ul className="mt-1 space-y-1">
                {interview.recommendedSessions.slice(0, 4).map((s) => (
                  <li key={s.key} className="text-[11px] text-gray-700">
                    <Link href={s.href} className="text-sky-700 hover:underline font-medium">{s.title}</Link>
                    <span className="text-gray-500"> — {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {interview.weakTopics.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-600" /> Your weak topics
              </h4>
              <ul className="mt-1 space-y-0.5">
                {interview.weakTopics.slice(0, 5).map((w) => (
                  <li key={w.topic} className="text-[11px] text-gray-700">
                    {w.topic} <span className="text-gray-400">· {w.mean}% over {w.attempts} answers</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {interview.codingExercises.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
            <Code2 className="w-3.5 h-3.5 text-violet-600" /> Coding exercises from your roadmap
          </h4>
          <ul className="mt-1 space-y-0.5">
            {interview.codingExercises.map((c) => (
              <li key={c.taskId} className="text-[11px] text-gray-700">
                <Link href={c.href} className="text-sky-700 hover:underline">{c.title}</Link>
                <span className="text-gray-400"> · {c.skillName} · {c.milestone}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Learning */}
      {learning.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-emerald-600" /> To close the gap
          </h4>
          <ul className="mt-1.5 space-y-1.5">
            {learning.map((l) => (
              <li key={l.skillName} className="rounded-lg border border-gray-200 px-2.5 py-2">
                <p className="text-xs font-medium text-gray-900 inline-flex items-center gap-1.5 flex-wrap">
                  {l.skillName}
                  {l.requirement === "required" && <Badge variant="warning">required</Badge>}
                  {l.inRoadmap && <Badge variant="info"><Map className="w-3 h-3" /> in your roadmap</Badge>}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">{l.why}</p>
                {l.resources.length > 0 && (
                  <ul className="mt-0.5 space-y-0.5">
                    {l.resources.map((r) => (
                      <li key={r.title} className="text-[11px]">
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-1">
                            {r.title} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span className="text-gray-700">{r.title}</span>}
                        <span className="text-gray-400"> · {r.resourceType}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={l.href} className="text-[11px] text-indigo-700 hover:underline font-medium mt-0.5 inline-block">
                  {l.inRoadmap ? "Open in your roadmap →" : "Add to your learning plan →"}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skillGaps.skills.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <summary className="text-xs text-gray-700 cursor-pointer">
            Full skill-gap analysis for this role ({skillGaps.skills.length} skills)
          </summary>
          <ul className="mt-1.5 space-y-1">
            {skillGaps.skills.map((s) => (
              <li key={s.skillName} className="text-[11px] text-gray-700">
                <strong className="text-gray-900">{s.skillName}</strong>
                <span className="text-gray-400"> · {s.proficiencyStatus.replace(/_/g, " ")} · {s.priority} priority</span>
                <span className="block text-gray-600">{s.explanation}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ul className="space-y-1">
        {preparation.notes.map((n) => (
          <li key={n} className="text-[11px] text-gray-500 flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}
          </li>
        ))}
      </ul>
    </div>
  );
}
