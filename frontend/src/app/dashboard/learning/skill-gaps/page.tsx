"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Target, LogIn, Map, Info, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList, SkeletonStatRow } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import SkillGapCard from "@/components/learning/SkillGapCard";
import { getSkillGaps, PROFICIENCY_META, updateSkillGap, type SkillGap, type SkillGapSummary } from "@/services/learningRecommendationService";
import type { ProficiencyStatus } from "@/services/learningRoadmapService";
import { cn } from "@/lib/utils";

const ORDER: ProficiencyStatus[] = ["not_demonstrated", "needs_improvement", "learning_in_progress", "not_assessed", "demonstrated"];

export default function SkillGapsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [gaps, setGaps] = useState<SkillGap[]>([]);
  const [summary, setSummary] = useState<SkillGapSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProficiencyStatus | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try { const r = await getSkillGaps(); setGaps(r.skillGaps); setSummary(r.summary); }
    catch (err) { setError(toApiClientError(err).message); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  async function onUpdate(id: string, input: { proficiencyStatus?: ProficiencyStatus; userNote?: string | null }) {
    setSavingId(id);
    try {
      const updated = await updateSkillGap(id, input);
      setGaps((g) => g.map((x) => (x.id === id ? updated : x)));
      toast.success("Assessment saved. Future roadmaps will respect it.");
    } catch (err) { toast.error(toApiClientError(err).message); }
    finally { setSavingId(null); }
  }

  const categories = useMemo(() => Array.from(new Set(gaps.map((g) => g.category))).sort(), [gaps]);
  const visible = useMemo(() => gaps.filter((g) => (filter === "all" || g.proficiencyStatus === filter) && (category === "all" || g.category === category)), [gaps, filter, category]);
  const grouped = useMemo(() => ORDER.map((s) => ({ status: s, items: visible.filter((g) => g.proficiencyStatus === s) })).filter((x) => x.items.length), [visible]);

  if (!ready || (user && loading)) return <div className="max-w-5xl mx-auto px-4 py-10 space-y-4"><SkeletonStatRow count={5} /><SkeletonList /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to see your skill gaps" description="Skill gaps are derived from your resume analyses, job descriptions and interview results." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/learning/skill-gaps", icon: LogIn }} /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Target className="w-7 h-7 text-red-500" /> Skill gap analysis</h1>
          <p className="text-gray-500 mt-1">Every skill shows where the evidence came from and why it is prioritised. Correct anything the records got wrong.</p>
        </div>
        <Link href="/dashboard/learning"><Button variant="outline"><Map className="w-4 h-4 mr-1" /> Roadmap</Button></Link>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">{error} <button className="underline ml-2" onClick={load}>Retry</button></div>}

      {gaps.length === 0 ? (
        <Card><CardContent className="p-8"><EmptyState icon={Target} title="No skill gaps computed yet" description="Skill gaps are calculated when you generate a learning roadmap, using your resume analyses, saved job descriptions and interview history." action={{ label: "Generate a roadmap", href: "/dashboard/learning/new", icon: Map }} /></CardContent></Card>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat label="Skills assessed" value={summary.total} onClick={() => setFilter("all")} active={filter === "all"} />
              <Stat label="Not demonstrated" value={summary.notDemonstrated} cls="text-red-700" onClick={() => setFilter("not_demonstrated")} active={filter === "not_demonstrated"} />
              <Stat label="Needs improvement" value={summary.needsImprovement} cls="text-amber-700" onClick={() => setFilter("needs_improvement")} active={filter === "needs_improvement"} />
              <Stat label="In progress" value={summary.learningInProgress} cls="text-blue-700" onClick={() => setFilter("learning_in_progress")} active={filter === "learning_in_progress"} />
              <Stat label="Demonstrated" value={summary.demonstrated} cls="text-green-700" onClick={() => setFilter("demonstrated")} active={filter === "demonstrated"} />
              <Stat label="High priority" value={summary.highPriority} cls="text-indigo-700" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-gray-500">{visible.length} of {gaps.length} skills</span>
          </div>

          {grouped.map(({ status, items }) => (
            <section key={status} className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", PROFICIENCY_META[status].cls)}>{PROFICIENCY_META[status].label}</span>
                <span className="text-gray-400 font-normal">{items.length}</span>
                <span className="text-xs text-gray-400 font-normal hidden sm:inline">— {PROFICIENCY_META[status].help}</span>
              </h2>
              <div className="grid md:grid-cols-2 gap-3">{items.map((g) => <SkillGapCard key={g.id} gap={g} onUpdate={onUpdate} busy={savingId === g.id} />)}</div>
            </section>
          ))}

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Info className="w-4 h-4 text-gray-500" /> How priority is calculated (skill-gap-1.0)</CardTitle></CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-1">
              <p>Points are added per signal: required by the job +40, preferred +20, mentioned +15, role baseline +10; weak in mock interviews +25, one low score +10; no evidence +20, partial evidence +10; foundation for other skills +10; your goal +5. Demonstrated skills are capped at 25.</p>
              <p>High priority is 60 or more, medium 35–59, low below 35. “Not demonstrated” means no evidence was found in your records — it may still be an undetected mention, so confirm skills you actually have.</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, cls, onClick, active }: { label: string; value: number; cls?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={cn("rounded-xl border bg-white px-3 py-2 text-left", onClick ? "hover:border-indigo-300" : "cursor-default", active ? "border-indigo-400 ring-2 ring-indigo-100" : "border-gray-200")}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn("text-xl font-bold", cls ?? "text-gray-900")}>{value}</p>
    </button>
  );
}
