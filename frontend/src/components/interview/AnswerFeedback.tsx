"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Lightbulb, Eye, EyeOff, ArrowRight, Info, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import type { AnswerEvaluation } from "@/services/interviewService";
import { scoreTone } from "@/services/answerEvaluationService";

interface AnswerFeedbackProps {
  evaluation: AnswerEvaluation;
  questionText?: string;
  onContinue?: () => void;
  continueLabel?: string;
  /** Collapsed mode for the review list. */
  compact?: boolean;
}

const TONE = {
  green: { ring: "#22c55e", bg: "bg-green-50 border-green-200", text: "text-green-800" },
  amber: { ring: "#f59e0b", bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
  red: { ring: "#ef4444", bg: "bg-red-50 border-red-200", text: "text-red-800" },
  gray: { ring: "#9ca3af", bg: "bg-gray-50 border-gray-200", text: "text-gray-700" },
};

export default function AnswerFeedback({ evaluation: ev, questionText, onContinue, continueLabel = "Continue to next question", compact = false }: AnswerFeedbackProps) {
  const [showSuggested, setShowSuggested] = useState(false);
  const tone = TONE[scoreTone(ev.score)];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
      {/* Score header */}
      <div className={cn("rounded-2xl border p-5 flex flex-col sm:flex-row items-center gap-5", tone.bg)}>
        <ScoreRing score={ev.score} color={tone.ring} />
        <div className="flex-1 text-center sm:text-left">
          <p className={cn("text-lg font-bold", tone.text)}>{ev.rating}</p>
          {ev.evaluable ? (
            <p className="text-sm text-gray-700 mt-1">Estimated answer quality against this question&apos;s rubric (v{ev.rubricVersion.replace(/^\D+/, "")}). Not a prediction of interview success.</p>
          ) : (
            <p className="text-sm text-gray-700 mt-1"><span className="font-medium">Could not be evaluated reliably.</span> {ev.insufficientReason}</p>
          )}
          {ev.communicationNote && <p className="text-xs text-gray-600 mt-2 italic">Clarity: {ev.communicationNote}</p>}
          {!ev.codeExecuted && ev.criterionFeedback.some((c) => /correct/i.test(c.criterion)) && (
            <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1 justify-center sm:justify-start"><Info className="w-3 h-3" /> Code was assessed as written text; it was not executed.</p>
          )}
        </div>
      </div>

      {ev.evaluable && (
        <div className={cn("grid gap-4", compact ? "grid-cols-1" : "md:grid-cols-2")}>
          <FeedbackList icon={CheckCircle2} iconCls="text-green-600" title="Strengths" items={ev.strengths} empty="No specific strengths were identified." />
          <FeedbackList icon={AlertTriangle} iconCls="text-amber-600" title="Areas for improvement" items={ev.improvements} empty="No improvements suggested." />
          <FeedbackList icon={Target} iconCls="text-indigo-600" title="Missing concepts" items={ev.missingConcepts} empty="Nothing important was missing." hint="Not mentioned in your answer — distinct from mistakes." />
          <FeedbackList icon={XCircle} iconCls="text-red-600" title="Incorrect statements" items={ev.incorrectStatements} empty="No incorrect statements found." hint="Claims that are factually wrong." />
        </div>
      )}

      {/* Criterion feedback */}
      {ev.criterionFeedback.length > 0 && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-base">Criterion-by-criterion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {ev.criterionFeedback.map((c) => (
              <div key={c.criterion}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-800">{c.criterion}</span>
                  <span className="text-gray-500 tabular-nums">{c.score} / {c.maxScore}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1" role="progressbar" aria-valuenow={c.score} aria-valuemax={c.maxScore} aria-label={c.criterion}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(c.score / c.maxScore) * 100}%` }} transition={{ duration: 0.5 }} className={cn("h-full rounded-full", c.score >= 4 ? "bg-green-500" : c.score >= 3 ? "bg-amber-500" : "bg-red-500")} />
                </div>
                <p className="text-xs text-gray-600 mt-1">{c.feedback}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Suggested answer (hidden until requested) */}
      {ev.suggestedAnswer && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Example of a stronger answer</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowSuggested((s) => !s)}>
                {showSuggested ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showSuggested ? "Hide" : "Show suggested answer"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">One possible strong answer — other valid approaches exist. Try to improve your own answer first.</p>
          </CardHeader>
          {showSuggested && (
            <CardContent>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-amber-50/60 border border-amber-100 rounded-lg p-3">{ev.suggestedAnswer}</p>
            </CardContent>
          )}
        </Card>
      )}

      {ev.nextPracticeTopics.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-600">Practise next:</span>
          {ev.nextPracticeTopics.map((t) => <span key={t} className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-medium">{t}</span>)}
        </div>
      )}

      {onContinue && (
        <div className="flex justify-end">
          <Button onClick={onContinue}>{continueLabel} <ArrowRight className="w-4 h-4" /></Button>
        </div>
      )}
      {questionText && compact && <p className="sr-only">{questionText}</p>}
    </motion.div>
  );
}

function ScoreRing({ score, color }: { score: number | null; color: string }) {
  const c = 2 * Math.PI * 34;
  const pct = score ?? 0;
  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="w-24 h-24 -rotate-90" aria-label={score === null ? "No score" : `Score ${score} out of 100`}>
        <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <motion.circle cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }} transition={{ duration: 0.8 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tabular-nums" style={{ color }}>{score === null ? "—" : score}</span>
        <span className="text-[10px] text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

function FeedbackList({ icon: Icon, iconCls, title, items, empty, hint }: { icon: React.ComponentType<{ className?: string }>; iconCls: string; title: string; items: string[]; empty: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Icon className={cn("w-4 h-4", iconCls)} /> {title} <span className="text-xs text-gray-400 font-normal">({items.length})</span></CardTitle>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? <p className="text-sm text-gray-400 italic">{empty}</p> : (
          <ul className="space-y-1.5 text-sm text-gray-700 list-disc pl-4">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
        )}
      </CardContent>
    </Card>
  );
}
