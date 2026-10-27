"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mic, Plus, Trash2, Video, Phone, MapPin, Home, Users, ExternalLink, Info, Check,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  INTERVIEW_MODES, INTERVIEW_OUTCOMES, INTERVIEW_STAGES, INTERVIEW_STAGE_LABELS,
  browserTimeZone, safeHref,
  type ApplicationInterview, type InterviewMode, type InterviewOutcome,
  type InterviewStage, type MockSession,
} from "@/services/applicationWorkspaceService";

interface Props {
  interviews: ApplicationInterview[];
  mockSessions: MockSession[];
  busyId: string | null;
  adding: boolean;
  onAdd: (input: {
    stage: InterviewStage; scheduledAt?: string; timezone?: string; durationMinutes?: number;
    mode: InterviewMode; location?: string; interviewers?: Array<{ name: string; role?: string }>;
    preparationNotes?: string; mockSessionId?: string; createReminder: boolean;
  }) => void;
  onUpdate: (id: string, patch: { outcome?: InterviewOutcome; feedback?: string | null; preparationNotes?: string | null }) => void;
  onDelete: (interview: ApplicationInterview) => void;
}

const MODE_ICON: Record<InterviewMode, typeof Video> = { video: Video, phone: Phone, onsite: MapPin, take_home: Home };
const MODE_LABEL: Record<InterviewMode, string> = { video: "Video", phone: "Phone", onsite: "On-site", take_home: "Take-home" };
const OUTCOME_TONE: Record<InterviewOutcome, "neutral" | "success" | "error" | "warning" | "info"> = {
  scheduled: "info", completed: "neutral", passed: "success", rejected: "error", cancelled: "neutral", no_response: "warning",
};

/**
 * Interview rounds for one application. Details are stored for the user's own
 * reference: nothing creates a calendar invitation and nothing contacts an
 * interviewer. Names appear only when the user types them in.
 */
export default function ApplicationInterviewPlanner({
  interviews, mockSessions, busyId, adding, onAdd, onUpdate, onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<InterviewStage>("screening");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDuration] = useState("60");
  const [mode, setMode] = useState<InterviewMode>("video");
  const [location, setLocation] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerRole, setInterviewerRole] = useState("");
  const [preparationNotes, setNotes] = useState("");
  const [mockSessionId, setMockSessionId] = useState("");
  const [createReminder, setCreateReminder] = useState(true);
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      stage,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      timezone: scheduledAt ? browserTimeZone() : undefined,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      mode,
      location: location.trim() || undefined,
      interviewers: interviewerName.trim() ? [{ name: interviewerName.trim(), role: interviewerRole.trim() || undefined }] : undefined,
      preparationNotes: preparationNotes.trim() || undefined,
      mockSessionId: mockSessionId || undefined,
      createReminder: createReminder && Boolean(scheduledAt),
    });
    setScheduledAt(""); setLocation(""); setInterviewerName(""); setInterviewerRole(""); setNotes(""); setMockSessionId("");
    setOpen(false);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Mic className="w-4 h-4 text-rose-600" /> Interview rounds
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Your own record of each round. Nothing is sent to anyone and no invitation is created.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a round
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Stage</span>
              <select value={stage} onChange={(e) => setStage(e.target.value as InterviewStage)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {INTERVIEW_STAGES.map((s) => <option key={s} value={s}>{INTERVIEW_STAGE_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">When <span className="text-gray-400">(optional)</span></span>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Minutes</span>
              <input type="number" min={5} max={600} value={durationMinutes} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value as InterviewMode)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {INTERVIEW_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700">Meeting link or address <span className="text-gray-400">(optional)</span></span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Interviewer <span className="text-gray-400">(optional)</span></span>
              <input value={interviewerName} onChange={(e) => setInterviewerName(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Their role <span className="text-gray-400">(optional)</span></span>
              <input value={interviewerRole} onChange={(e) => setInterviewerRole(e.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            {mockSessions.length > 0 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Link a mock interview</span>
                <select value={mockSessionId} onChange={(e) => setMockSessionId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="">None</option>
                  {mockSessions.map((s) => <option key={s.id} value={s.id}>{s.targetRole} · {s.interviewType}{s.score !== null ? ` · ${s.score}%` : ""}</option>)}
                </select>
              </label>
            )}
          </div>
          <textarea
            value={preparationNotes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Preparation notes"
            aria-label="Preparation notes"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input type="checkbox" checked={createReminder} disabled={!scheduledAt} onChange={(e) => setCreateReminder(e.target.checked)} className="rounded border-gray-300" />
              Also create a reminder{!scheduledAt && " (needs a date)"}
            </label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" type="submit" loading={adding}>Add round</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </form>
      )}

      {interviews.length === 0 ? (
        <p className="text-sm text-gray-500">No rounds recorded.</p>
      ) : (
        <ul className="space-y-2">
          {interviews.map((i) => {
            const ModeIcon = MODE_ICON[i.mode];
            const href = safeHref(i.location);
            const mock = mockSessions.find((s) => s.id === i.mockSessionId);
            return (
              <li key={i.id} className="rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 inline-flex items-center gap-2 flex-wrap">
                      {INTERVIEW_STAGE_LABELS[i.stage]}
                      <Badge variant={OUTCOME_TONE[i.outcome]}>{i.outcome.replace(/_/g, " ")}</Badge>
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5 inline-flex items-center gap-1.5 flex-wrap">
                      <ModeIcon className="w-3.5 h-3.5 text-gray-400" /> {MODE_LABEL[i.mode]}
                      {i.scheduledAt && <> · {new Date(i.scheduledAt).toLocaleString()}{i.timezone ? ` (${i.timezone})` : ""}</>}
                      {i.durationMinutes && <> · {i.durationMinutes} min</>}
                    </p>
                    {i.interviewers.length > 0 && (
                      <p className="text-[11px] text-gray-600 mt-0.5 inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        {i.interviewers.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}
                      </p>
                    )}
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1 mt-0.5">
                        Join link <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {!href && i.location && <p className="text-[11px] text-gray-600 mt-0.5">{i.location}</p>}
                    {mock && (
                      <Link href={`/dashboard/interviews/${mock.id}`} className="text-[11px] text-indigo-700 hover:underline block mt-0.5">
                        Practised with a mock interview{mock.score !== null ? ` · ${mock.score}%` : ""} →
                      </Link>
                    )}
                    {i.preparationNotes && <p className="text-[11px] text-gray-600 mt-1 whitespace-pre-wrap">{i.preparationNotes}</p>}
                    {i.feedback && <p className="text-[11px] text-gray-700 mt-1 bg-gray-50 border border-gray-100 rounded px-2 py-1 whitespace-pre-wrap">{i.feedback}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={i.outcome}
                      onChange={(e) => onUpdate(i.id, { outcome: e.target.value as InterviewOutcome })}
                      disabled={busyId === i.id}
                      aria-label="Outcome"
                      className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                    >
                      {INTERVIEW_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busyId === i.id} onClick={() => onDelete(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {feedbackFor === i.id ? (
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={2}
                      maxLength={4000}
                      placeholder="How did it go?"
                      aria-label="Interview feedback"
                      className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={busyId === i.id} onClick={() => { onUpdate(i.id, { feedback: feedback.trim() || null }); setFeedbackFor(null); setFeedback(""); }}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setFeedbackFor(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setFeedbackFor(i.id); setFeedback(i.feedback ?? ""); }} className="text-[11px] text-sky-700 hover:underline mt-1">
                    {i.feedback ? "Edit feedback" : "Add feedback"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-400 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Interviewer names are stored only because you typed them. They are never used to contact anyone.
      </p>
    </section>
  );
}
