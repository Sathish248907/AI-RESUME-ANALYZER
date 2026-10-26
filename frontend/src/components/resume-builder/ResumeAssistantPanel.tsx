"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  HelpCircle,
  Check,
  Copy,
  AlertCircle,
  Loader2,
  Info,
  ShieldAlert,
  Lock,
  CircleDashed,
  CheckCircle2,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_INTENTS,
  type AssistantDraft,
  type AssistantIntent,
  type AssistantTurn,
  type JobDescriptionOption,
  type ResumeContent,
  type ResumeSection,
} from "./types";

interface Props {
  content: ResumeContent;
  /** Thread, newest last. Owned by the page so it survives tab switches. */
  turns: AssistantTurn[];
  busy: boolean;
  aiConfigured: boolean | null;
  readOnly: boolean;
  savedJobs: JobDescriptionOption[];
  /** The version's target role, used as the default for skill suggestions. */
  targetRole: string | null;
  onAsk: (input: {
    intent: AssistantIntent;
    question?: string;
    sectionId?: string;
    entryId?: string;
    targetRole?: string;
    jobDescriptionId?: string;
    scopeLabel: string;
    intentLabel: string;
  }) => Promise<void>;
  /** Insert one draft into the resume. The panel never writes content itself. */
  onInsertDraft: (draft: AssistantDraft, text: string) => Promise<boolean>;
  onLocate: (target: { sectionId: string | null; entryId: string | null }) => void;
}

/** Entries of a section that can be addressed individually. */
function entriesOf(section: ResumeSection): Array<{ id: string; label: string }> {
  switch (section.type) {
    case "experience":
      return section.entries.map((e) => ({ id: e.id, label: e.role || e.company || "Role" }));
    case "projects":
      return section.entries.map((e) => ({ id: e.id, label: e.name || "Project" }));
    case "education":
      return section.entries.map((e) => ({ id: e.id, label: e.degree || e.institution || "Study" }));
    case "skills":
      return section.groups.map((g) => ({ id: g.id, label: g.name || "Skill group" }));
    default:
      return [];
  }
}

/**
 * The in-builder writing assistant (Phase 11). The user picks what they want
 * and which part of the resume it applies to; the reply comes back as prose
 * plus *drafts* — editable replacement text for one addressed field each.
 * Nothing is written until the user inserts a draft, and the assistant's
 * questions are shown as prominently as its drafts, because a question is what
 * it returns instead of inventing a fact.
 */
export default function ResumeAssistantPanel({
  content,
  turns,
  busy,
  aiConfigured,
  readOnly,
  savedJobs,
  targetRole,
  onAsk,
  onInsertDraft,
  onLocate,
}: Props) {
  const [intent, setIntent] = useState<AssistantIntent>("improve_summary");
  const [sectionId, setSectionId] = useState("");
  const [entryId, setEntryId] = useState("");
  const [question, setQuestion] = useState("");
  const [role, setRole] = useState(targetRole ?? "");
  const [jobId, setJobId] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const spec = ASSISTANT_INTENTS.find((i) => i.key === intent)!;
  const allowedTypes = spec.sectionTypes as readonly string[] | null;

  /** Sections this intent can be pointed at. */
  const sections = useMemo(
    () => content.sections.filter((s) => !allowedTypes || allowedTypes.includes(s.type)),
    [content.sections, allowedTypes]
  );
  const section = sections.find((s) => s.id === sectionId) ?? null;
  const entries = section ? entriesOf(section) : [];

  // Keep the scope valid when the intent changes: an intent restricted to
  // summary sections must not keep a projects section selected.
  useEffect(() => {
    if (sectionId && !sections.some((s) => s.id === sectionId)) {
      setSectionId(sections.length === 1 ? sections[0].id : "");
      setEntryId("");
    } else if (!sectionId && allowedTypes && sections.length === 1) {
      setSectionId(sections[0].id);
    }
  }, [sectionId, sections, allowedTypes]);
  useEffect(() => {
    if (entryId && !entries.some((e) => e.id === entryId)) setEntryId("");
  }, [entryId, entries]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const needsSection = Boolean(allowedTypes);
  const missingSection = needsSection && !sectionId;
  const missingQuestion = intent === "freeform" && !question.trim();
  const canSend = aiConfigured !== false && !busy && !missingSection && !missingQuestion;

  const scopeLabel = section
    ? [section.title, entries.find((e) => e.id === entryId)?.label].filter(Boolean).join(" → ")
    : "Whole resume";

  async function send() {
    if (!canSend) return;
    const asked = question.trim();
    await onAsk({
      intent,
      question: asked || undefined,
      sectionId: sectionId || undefined,
      entryId: entryId || undefined,
      targetRole: role.trim() || undefined,
      jobDescriptionId: jobId || undefined,
      scopeLabel,
      intentLabel: spec.label,
    });
    setQuestion("");
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-600" />
          Writing assistant
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Ask about one part of your resume. Drafts are proposals — nothing changes until you insert
          one.
        </p>
      </div>

      {aiConfigured === false && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 inline-flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          No AI provider is configured on the server, so the assistant is unavailable. The ATS score
          and the checks work without it.
        </p>
      )}

      {/* Thread */}
      {turns.length > 0 && (
        <ul className="space-y-3">
          {turns.map((turn) => (
            <li key={turn.id} className="space-y-2">
              <div className="rounded-xl bg-gray-100 px-3 py-2">
                <p className="text-xs font-medium text-gray-900">{turn.intentLabel}</p>
                {turn.question && <p className="text-xs text-gray-700 mt-0.5">{turn.question}</p>}
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {turn.scopeLabel} · {new Date(turn.askedAt).toLocaleTimeString()}
                </p>
              </div>

              {turn.error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 inline-flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {turn.error}
                </p>
              ) : !turn.reply ? (
                <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
                </p>
              ) : (
                <Reply
                  turn={turn}
                  readOnly={readOnly}
                  onInsertDraft={onInsertDraft}
                  onLocate={onLocate}
                />
              )}
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      )}

      {/* Composer */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">What do you want?</span>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as AssistantIntent)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          >
            {ASSISTANT_INTENTS.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">
              Section {needsSection ? <span className="text-red-600">*</span> : <span className="text-gray-400">(optional)</span>}
            </span>
            <select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setEntryId("");
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">{needsSection ? "Choose a section…" : "Whole resume"}</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {needsSection && sections.length === 0 && (
              <span className="text-[11px] text-amber-700 mt-0.5 block">
                This resume has no {allowedTypes!.join(" or ")} section yet. Add one in the editor
                first.
              </span>
            )}
          </label>

          {entries.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">
                Entry <span className="text-gray-400">(optional)</span>
              </span>
              <select
                value={entryId}
                onChange={(e) => setEntryId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">Whole section</option>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {(intent === "suggest_skills" || intent === "freeform") && (
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">
                Target role <span className="text-gray-400">(optional)</span>
              </span>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Backend Engineer"
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            {savedJobs.length > 0 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-700">
                  Saved job <span className="text-gray-400">(optional)</span>
                </span>
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {savedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.jobTitle}
                      {j.companyName ? ` — ${j.companyName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            {intent === "freeform" ? (
              <>
                Your question <span className="text-red-600">*</span>
              </>
            ) : (
              <>
                Anything to add <span className="text-gray-400">(optional)</span>
              </>
            )}
          </span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder={
              intent === "freeform"
                ? "Ask about this section…"
                : "Context the assistant should know (optional)"
            }
            className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            Scope: <span className="font-medium text-gray-700">{scopeLabel}</span>
            {readOnly && " · the original is read-only, so drafts can only be copied"}
          </p>
          <Button size="sm" onClick={send} loading={busy} disabled={!canSend}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> Ask
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        The assistant can only use what is already in your resume. When a stronger sentence would
        need a fact it does not have, it asks you for it instead of writing one.
      </p>
    </div>
  );
}

function Reply({
  turn,
  readOnly,
  onInsertDraft,
  onLocate,
}: {
  turn: AssistantTurn;
  readOnly: boolean;
  onInsertDraft: Props["onInsertDraft"];
  onLocate: Props["onLocate"];
}) {
  const reply = turn.reply!;
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 space-y-2.5">
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{reply.answer}</p>

      {reply.drafts.map((d, i) => (
        <DraftCard
          key={`${turn.id}-${d.sectionId}-${d.field}-${i}`}
          draft={d}
          readOnly={readOnly}
          onInsertDraft={onInsertDraft}
          onLocate={onLocate}
        />
      ))}

      {reply.questions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
          <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" /> Answer these and it can do better
          </p>
          <ul className="mt-1 space-y-1">
            {reply.questions.map((q) => (
              <li key={q} className="text-xs text-amber-950 flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(reply.evidencedSkills.length > 0 || reply.skillsToLearn.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-2">
          {reply.evidencedSkills.length > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-emerald-950 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Already evidenced here
              </p>
              <p className="text-[11px] text-emerald-900 mt-0.5">{reply.evidencedSkills.join(", ")}</p>
            </div>
          )}
          {reply.skillsToLearn.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
              <p className="text-[11px] font-semibold text-gray-800 inline-flex items-center gap-1">
                <CircleDashed className="w-3.5 h-3.5 text-gray-500" /> You would need to learn
              </p>
              <p className="text-[11px] text-gray-700 mt-0.5">{reply.skillsToLearn.join(", ")}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Not added to your resume — list a skill only once you have it.
              </p>
            </div>
          )}
        </div>
      )}

      {reply.rejectedDrafts.length > 0 && (
        <div className="rounded-lg border border-red-100 bg-red-50/60 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-red-900 inline-flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> {reply.rejectedDrafts.length} draft
            {reply.rejectedDrafts.length === 1 ? " was" : "s were"} withheld
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {reply.rejectedDrafts.map((r) => (
              <li key={r.key} className="text-[11px] text-red-900">
                {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-500">{reply.note}</p>
    </div>
  );
}

function DraftCard({
  draft,
  readOnly,
  onInsertDraft,
  onLocate,
}: {
  draft: AssistantDraft;
  readOnly: boolean;
  onInsertDraft: Props["onInsertDraft"];
  onLocate: Props["onLocate"];
}) {
  const [text, setText] = useState(draft.text);
  const [state, setState] = useState<"idle" | "busy" | "inserted">("idle");
  const [copied, setCopied] = useState(false);
  const edited = text.trim() !== draft.text.trim();

  async function insert() {
    setState("busy");
    const ok = await onInsertDraft(draft, text);
    setState(ok ? "inserted" : "idle");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="info">
          <Sparkles className="w-3 h-3" /> draft
        </Badge>
        <button
          type="button"
          onClick={() => onLocate({ sectionId: draft.sectionId, entryId: draft.entryId })}
          className="text-[11px] text-sky-700 hover:underline font-medium"
        >
          {draft.field}
        </button>
        {draft.needsConfirmation && <Badge variant="warning">confirm before using</Badge>}
        {state === "inserted" && <Badge variant="success">inserted</Badge>}
      </div>

      {draft.originalText && (
        <p className="text-[11px] text-gray-500 line-through mt-1.5 whitespace-pre-wrap">
          {draft.originalText}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
        aria-label="Draft text, editable before inserting"
      />
      {draft.rationale && <p className="text-[11px] text-gray-600 mt-0.5">{draft.rationale}</p>}
      {draft.needsConfirmation && draft.confirmationQuestion && (
        <p className="text-[11px] text-amber-900 bg-amber-50/70 border border-amber-100 rounded-lg px-2 py-1.5 mt-1">
          {draft.confirmationQuestion}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={insert}
          loading={state === "busy"}
          disabled={readOnly || state === "inserted"}
          title={readOnly ? "The original is read-only. Duplicate it to edit." : undefined}
        >
          {readOnly ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          {state === "inserted" ? "Inserted" : edited ? "Insert my edit" : "Insert into resume"}
        </Button>
        <Button size="sm" variant="ghost" onClick={copy}>
          <Copy className="w-3.5 h-3.5 mr-1.5" /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
