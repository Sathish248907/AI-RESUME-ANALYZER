"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import AchievementBadge from "@/components/progress/AchievementBadge";
import XpProgressBar from "@/components/progress/XpProgressBar";
import { getAchievements, getGamificationProfile, getPointsHistory, type Achievement, type GamificationProfile, type PointRule, type PointTransaction, CATEGORY_LABELS } from "@/services/progressService";
import { cn, formatDate } from "@/lib/utils";

export default function AchievementsPage() {
  const { user, ready } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [rules, setRules] = useState<PointRule[]>([]);
  const [tx, setTx] = useState<PointTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try { const [a, p, h] = await Promise.all([getAchievements(), getGamificationProfile(), getPointsHistory({ page: 1, limit: 20 })]); setAchievements(a.achievements); setProfile(p.profile); setRules(p.rules); setTx(h.transactions); setTxTotal(h.total); setTxPage(1); }
    catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);
  async function more() { const next = txPage + 1; const h = await getPointsHistory({ page: next, limit: 20 }); setTx((all) => [...all, ...h.transactions]); setTxPage(next); }

  const shown = achievements.filter((a) => (filter === "all" ? true : filter === "unlocked" ? a.unlocked : !a.unlocked));
  const byCat = rules.reduce<Record<string, PointRule[]>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {});
  return (
    <ProgressPageShell current="/dashboard/progress/achievements" title="Achievements & XP" description="Badges and points come only from activity that is saved in your account. Reopened or deleted activity reverses its points; nothing can be submitted directly." icon={Trophy} loading={loading} error={error} onRetry={load}>
      {profile && (
        <>
          <Card><CardContent className="pt-5 space-y-3"><XpProgressBar level={profile.level} />
            <ol className="flex flex-wrap gap-2 text-xs">{profile.levels.map((l) => <li key={l.level} className={cn("px-2 py-1 rounded-lg border", profile.level.level >= l.level ? "bg-indigo-50 border-indigo-200 text-indigo-900" : "bg-white border-gray-200 text-gray-500")}>L{l.level} {l.name} · {l.minPoints} XP</li>)}<li className="px-2 py-1 text-gray-400">then +{profile.levelStepAfterLast} XP per level</li></ol></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center justify-between flex-wrap gap-2"><span>Badges ({achievements.filter((a) => a.unlocked).length}/{achievements.length})</span>
            <div role="radiogroup" className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs font-normal">{(["all", "unlocked", "locked"] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={cn("px-2.5 py-1 rounded-md capitalize", filter === f ? "bg-indigo-600 text-white" : "text-gray-700")}>{f}</button>)}</div></CardTitle></CardHeader>
            <CardContent><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{shown.map((a) => <AchievementBadge key={a.key} achievement={a} />)}</div>{shown.length === 0 && <p className="text-sm text-gray-500">Nothing in this filter.</p>}</CardContent></Card>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>How XP is earned</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
              {Object.entries(byCat).map(([cat, list]) => <div key={cat}><p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{CATEGORY_LABELS[cat] ?? cat}</p><ul className="divide-y divide-gray-100">{list.map((r) => <li key={r.eventType} className="flex justify-between gap-3 py-1"><span className="text-gray-800">{r.label}</span><span className="shrink-0 tabular-nums text-indigo-700 font-medium">+{r.points}{r.dailyCap ? <span className="text-[10px] text-gray-400 font-normal"> · max {r.dailyCap}/day</span> : null}</span></li>)}</ul></div>)}
              <p className="text-[11px] text-gray-500">Daily caps stop repeated trivial actions from inflating points. Points are only awarded once per activity; if the activity is undone the points are reversed. {profile.disclaimer}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="w-4 h-4" /> Points history</CardTitle></CardHeader><CardContent>
              {tx.length === 0 ? <p className="text-sm text-gray-500">No points yet. Complete a learning task or a mock interview to earn your first XP.</p> : <ul className="divide-y divide-gray-100 text-sm">{tx.map((t) => <li key={t.id} className="flex justify-between gap-3 py-1.5"><div className="min-w-0"><p className="text-gray-900 truncate">{t.title}</p><p className="text-[11px] text-gray-500">{formatDate(t.occurredAt)} · {t.kind}{t.cycle > 1 ? ` (cycle ${t.cycle})` : ""}</p></div><span className={cn("shrink-0 tabular-nums font-medium", t.points >= 0 ? "text-emerald-700" : "text-rose-700")}>{t.points >= 0 ? "+" : ""}{t.points}</span></li>)}</ul>}
              {tx.length < txTotal && <Button variant="outline" size="sm" className="mt-3" onClick={more}>Load more ({txTotal - tx.length} more)</Button>}
            </CardContent></Card>
          </div>
        </>
      )}
    </ProgressPageShell>
  );
}
