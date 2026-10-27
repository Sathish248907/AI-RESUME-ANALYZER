"use client";

import { useEffect, useState } from "react";
import {
  FileText, Sparkles, Save, Download, Trash2, Check, ShieldAlert,
  HelpCircle, RefreshCw, Info, Plus, PenLine,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  LENGTHS, TONES,
  type CoverLetter, type CoverLetterSummary, type LengthTarget,
  type ResumeVersionRef, type Tone,
} from "@/services/applicationWorkspaceService";

interface Props {
  letters: CoverLetterSummary[];
  active: CoverLetter | null;
  resumeVersions: ResumeVersionRef[];
  aiConfigured: boolean | null;
  generating: boolean;
  saving: boolean;
  regenerating: boolean;
  exporting: boolean;
  /** Set after a draft, so the user sees what was asked and what was withheld. */
  lastDraft: {
    questions: string[];
    highlighted: string[];
    withheldParagraphs: Array<{ role: string; reason: string; text: string }>;
    note: string;
  } | null;
  onSelect: (id: string) => void;
  onGenerate: (input: { resumeVersionId?: string; tone: Tone; lengthTarget: LengthTarget; userNotes?: string; existingText?: string }) => void;
  onWriteOwn: (content: string) => void;
  onSave: (content: string, title: string) => void;
  onApprove: () => void;
  onRegenerate: (paragraph: string, instruction: string) => Promise<string | null>;
  onExport: () => void;
  onDelete: (id: string) => void;
}

const TONE_LABELS: Record<Tone, string> = {
  professional: "Professional", enthusiastic: "Enthusiastic", concise: "Concise", formal: "Formal",
};
const LENGTH_LABELS: Record<LengthTarget, string> = {
  short: "Short (140–200 words)", standard: "Standard (220–320)", detailed: "Detailed (350–450)",
};

/**
 * Drafting and editing a cover letter. The model's output is always a draft:
 * it is shown with what it withheld and what it still needs to know, and the
 * user edits and approves it before it counts as finished.
 */
export default function CoverLetterEditor({
  letters, active, resumeVersions, aiConfigured, generating, saving, regenerating, exporting,
  lastDraft, onSelect, onGenerate, onWriteOwn, onSave, onApprove, onRegenerate, onExport, onDelete,
}: Props) {
  const [content, setContent] = useState(active?.content ?? "");
  const [title, setTitle] = useState(active?.title ?? "");
  const [tone, setTone] = useState<Tone>(active?.tone ?? "professional");
  const [lengthTarget, setLengthTarget] = useState<LengthTarget>(active?.lengthTarget ?? "standard");
  const [versionId, setVersionId] = useState(resumeVersions.find((v) => !v.isOriginal)?.id ?? resumeVersions[0]?.id ?? "");
  const [userNotes, setUserNotes] = useState("");
  const [mode, setMode] = useState<"idle" | "compose" | "own">("idle");
  const [ownText, setOwnText] = useState("");
  const [selectedParagraph, setSelectedParagraph] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    setContent(active?.content ?? "");
    setTitle(active?.title ?? "");
    if (active) { setTone(active.tone); setLengthTarget(active.lengthTarget); }
    setSelectedParagraph(null);
  }, [active]);

  const dirty = active ? content !== active.content || title !== active.title : false;
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim());

  async function replaceParagraph() {
    if (!selectedParagraph) return;
    const replacement = await onRegenerate(selectedParagraph, instruction);
    if (replacement) {
      setContent((c) => c.replace(selectedParagraph, replacement));
      setSelectedParagraph(null);
      setInstruction("");
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Cover letter
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Written from one of your resume versions and this job description. Nothing else is available to it.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setMode(mode === "compose" ? "idle" : "compose")} disabled={aiConfigured === false}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Draft with AI
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === "own" ? "idle" : "own")}>
            <PenLine className="w-3.5 h-3.5 mr-1.5" /> Write my own
          </Button>
        </div>
      </div>

      {aiConfigured === false && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          No AI provider is configured, so drafting is unavailable. You can still write and store a letter yourself.
        </p>
      )}

      {/* Versions */}
      {letters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {letters.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelect(l.id)}
              aria-pressed={active?.id === l.id}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1.5",
                active?.id === l.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              )}
            >
              v{l.versionNumber}
              {l.status === "approved" && <Check className="w-3 h-3" />}
              <span className="opacity-60">{l.wordCount}w</span>
            </button>
          ))}
        </div>
      )}

      {/* Compose */}
      {mode === "compose" && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-2">
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">From which resume</span>
              <select value={versionId} onChange={(e) => setVersionId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {resumeVersions.map((v) => <option key={v.id} value={v.id}>{v.name}{v.isOriginal ? " (original)" : ""}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Tone</span>
              <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Length</span>
              <select value={lengthTarget} onChange={(e) => setLengthTarget(e.target.value as LengthTarget)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {LENGTHS.map((l) => <option key={l} value={l}>{LENGTH_LABELS[l]}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Anything it should know <span className="text-gray-400">(optional)</span></span>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Facts about you it cannot read from your resume."
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-500">Treated as facts you are asserting about yourself.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={generating} disabled={!versionId} onClick={() => onGenerate({ resumeVersionId: versionId, tone, lengthTarget, userNotes: userNotes.trim() || undefined })}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {letters.length ? "Draft another version" : "Draft a letter"}
            </Button>
            {active && (
              <Button size="sm" variant="outline" loading={generating} onClick={() => onGenerate({ resumeVersionId: versionId, tone, lengthTarget, existingText: content })}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Improve this one
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Write your own */}
      {mode === "own" && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <textarea
            value={ownText}
            onChange={(e) => setOwnText(e.target.value)}
            rows={8}
            maxLength={12000}
            placeholder="Paste or write your letter."
            aria-label="Your cover letter"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-mono"
          />
          <Button size="sm" loading={saving} disabled={ownText.trim().length < 20} onClick={() => { onWriteOwn(ownText.trim()); setOwnText(""); setMode("idle"); }}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Save as a version
          </Button>
        </div>
      )}

      {/* What the last draft withheld and still needs */}
      {lastDraft && (
        <div className="space-y-2">
          {lastDraft.withheldParagraphs.length > 0 && (
            <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-red-900 inline-flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> {lastDraft.withheldParagraphs.length} paragraph{lastDraft.withheldParagraphs.length === 1 ? " was" : "s were"} withheld
              </p>
              <ul className="mt-1 space-y-0.5">
                {lastDraft.withheldParagraphs.map((w, i) => (
                  <li key={`${w.role}-${i}`} className="text-[11px] text-red-900">
                    <strong>{w.role}:</strong> {w.reason}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-red-900/70 mt-1">{lastDraft.note}</p>
            </div>
          )}
          {lastDraft.questions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
              <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Answer these and the letter gets stronger
              </p>
              <ul className="mt-1 space-y-0.5">
                {lastDraft.questions.map((q) => <li key={q} className="text-[11px] text-amber-950">{q}</li>)}
              </ul>
            </div>
          )}
          {lastDraft.highlighted.length > 0 && (
            <p className="text-[11px] text-gray-500">Leaned on: {lastDraft.highlighted.join(", ")}</p>
          )}
        </div>
      )}

      {/* Editor */}
      {active ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              aria-label="Letter title"
              className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium"
            />
            <Badge variant={active.status === "approved" ? "success" : "neutral"}>{active.status}</Badge>
            <Badge variant="info">{active.source}</Badge>
            <span className="text-[11px] text-gray-400">{content.split(/\s+/).filter(Boolean).length} words</span>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            maxLength={12000}
            aria-label="Cover letter text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed"
          />

          {/* Per-paragraph regeneration */}
          {paragraphs.length > 1 && (
            <details className="rounded-lg border border-gray-200 px-3 py-2">
              <summary className="text-xs text-gray-700 cursor-pointer">Rewrite one paragraph</summary>
              <div className="mt-2 space-y-1.5">
                {paragraphs.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedParagraph(p)}
                    className={cn(
                      "block w-full text-left text-[11px] rounded border px-2 py-1.5 transition-colors",
                      selectedParagraph === p ? "border-indigo-300 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    {p.slice(0, 160)}{p.length > 160 ? "…" : ""}
                  </button>
                ))}
                {selectedParagraph && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder="What should be different? (optional)"
                      maxLength={400}
                      aria-label="Rewrite instruction"
                      className="flex-1 min-w-[12rem] rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs"
                    />
                    <Button size="sm" loading={regenerating} onClick={replaceParagraph}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rewrite
                    </Button>
                  </div>
                )}
              </div>
            </details>
          )}

          {active.groundingNotes && (
            <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" /> {active.groundingNotes.rule}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" loading={saving} disabled={!dirty} onClick={() => onSave(content, title)}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save changes
            </Button>
            {active.status !== "approved" && (
              <Button size="sm" variant="outline" loading={saving} onClick={onApprove}>
                <Check className="w-3.5 h-3.5 mr-1.5" /> Mark approved
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={exporting} onClick={onExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Export PDF
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50" onClick={() => onDelete(active.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No cover letter yet. Draft one from a resume version, or write your own — many applications never need one.
        </p>
      )}
    </section>
  );
}
