"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck, AlertCircle } from "lucide-react";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import type { LearningTask } from "@/services/learningRoadmapService";
import { submitCheckpoint, type CheckpointResult, type CheckpointSubmitInput } from "@/services/learningTaskService";
import { toApiClientError } from "@/services/api";
import { cn } from "@/lib/utils";

interface Props {
  task: LearningTask | null;
  open: boolean;
  onClose: () => void;
  onResult: (result: CheckpointResult) => void;
}

/**
 * Knowledge checkpoint. MCQ quizzes are graded server-side (answers are never sent
 * to the browser before an attempt). Other checkpoint types are self-reported.
 */
export default function CheckpointModal({ task, open, onClose, onResult }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [projectLink, setProjectLink] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckpointResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setAnswers({}); setNotes(""); setProjectLink(""); setChecked([]); setError(null); setResult(null);
  }, [open, task]);

  const cp = task?.checkpoint;
  if (!task || !cp) return null;
  const isMcq = cp.type === "mcq";
  const questions = cp.questions ?? [];
  const allAnswered = questions.every((q) => answers[q.id] !== undefined);
  const evidenceOk = notes.trim() || projectLink.trim() || checked.length > 0;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const input: CheckpointSubmitInput = isMcq ? { answers } : { notes: notes.trim() || undefined, projectLink: projectLink.trim() || undefined, checkedItems: checked.length ? checked : undefined };
      const res = await submitCheckpoint(task!.id, cp!.id, input);
      setResult(res);
      onResult(res);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally { setBusy(false); }
  }

  const resultById = new Map((result?.results ?? []).map((r) => [r.questionId, r]));

  return (
    <Modal open={open} onClose={onClose} title={cp.title} description={cp.instructions} size="lg"
      footer={result ? <Button onClick={onClose}>Close</Button> : <><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy} disabled={isMcq ? !allAnswered : !evidenceOk}><ClipboardCheck className="w-4 h-4 mr-1" /> {isMcq ? "Submit answers" : "Record checkpoint"}</Button></>}>
      <div className="space-y-4 text-sm">
        {result && (
          <div className={cn("rounded-xl border px-4 py-3 flex items-start gap-2", result.passed ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900")}>
            {result.passed ? <CheckCircle2 className="w-5 h-5 mt-0.5" /> : <XCircle className="w-5 h-5 mt-0.5" />}
            <div>
              <p className="font-semibold">{isMcq ? `${result.score}% — ${result.passed ? "passed" : `not yet (need ${cp.passScore}%)`}` : "Checkpoint recorded"}</p>
              {isMcq && <p className="text-xs">{result.attempt.correct}/{result.attempt.total} correct. {result.passed ? "The task is now complete." : "Review the explanations below and try again."}</p>}
              {result.note && <p className="text-xs">{result.note}</p>}
            </div>
          </div>
        )}
        {isMcq ? (
          <ol className="space-y-4">
            {questions.map((q, qi) => {
              const r = resultById.get(q.id);
              return (
                <li key={q.id} className="rounded-xl border border-gray-200 p-4">
                  <p className="font-medium text-gray-900">{qi + 1}. {q.question}</p>
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((opt, oi) => {
                      const chosen = answers[q.id] === oi;
                      const correct = r ? r.correctIndex === oi : null;
                      return (
                        <label key={oi} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer", r ? (correct ? "border-green-300 bg-green-50" : chosen ? "border-red-300 bg-red-50" : "border-gray-100") : chosen ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-gray-300")}>
                          <input type="radio" name={q.id} className="mt-1" disabled={Boolean(r)} checked={chosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} />
                          <span className="text-gray-800">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                  {r && <p className={cn("mt-2 text-xs", r.correct ? "text-green-700" : "text-red-700")}>{r.correct ? "Correct." : "Incorrect."} {r.explanation}</p>}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="space-y-3">
            {cp.type === "checklist" && cp.items?.length ? (
              <ul className="space-y-1">{cp.items.map((item, i) => <li key={i}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={Boolean(result)} checked={checked.includes(i)} onChange={(e) => setChecked((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))} /> <span>{item}</span></label></li>)}</ul>
            ) : null}
            {(cp.type === "project" || cp.type === "coding") && <label className="block"><span className="text-xs font-medium text-gray-700">Link to your code (optional)</span><input type="url" disabled={Boolean(result)} value={projectLink} onChange={(e) => setProjectLink(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="https://github.com/you/repo" /></label>}
            <label className="block"><span className="text-xs font-medium text-gray-700">{cp.type === "conceptual" ? "Explain it in your own words" : "Notes"}</span><textarea disabled={Boolean(result)} value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
            <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><AlertCircle className="w-3 h-3 mt-0.5" /> Self-reported checkpoints are stored for your review and are not automatically verified.</p>
          </div>
        )}
        {error && <p role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </Modal>
  );
}
