"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Trophy, Flame, Flag, ArrowRight, Sparkles, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import ProgressScoreCard from "@/components/progress/ProgressScoreCard";
import XpProgressBar from "@/components/progress/XpProgressBar";
import AchievementBadge from "@/components/progress/AchievementBadge";
import ActivityTimeline from "@/components/progress/ActivityTimeline";
import StreakCalendar from "@/components/progress/StreakCalendar";
import MetricCard from "@/components/progress/MetricCard";
import { getCareerProgress, getGamificationProfile, getAchievements, getActivity, getStreaks, listGoals, type ProgressScore, type ProgressComparison, type GamificationProfile, type Achievement, type ActivityItem, type StreakDetail, type Goal } from "@/services/progressService";

export default function ProgressHubPage() {
  const { user, ready } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ score: ProgressScore; comparison: ProgressComparison | null } | null>(null);
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [streaks, setStreaks] = useState<StreakDetail | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [cp, gp, ach, act, st, gl] = await Promise.all([getCareerProgress(), getGamificationProfile(), getAchievements(), getActivity({ limit: 10 }), getStreaks(), listGoals("active")]);
      setProgress({ score: cp.progress, comparison: cp.comparison }); setProfile(gp.profile); setAchievements(ach.achievements); setActivity(act.activity); setStreaks(st); setGoals(gl.goals);
    } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  const recentUnlocks = achievements.filter((a) => a.unlocked).sort((a, b) => new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime()).slice(0, 3);
  const nextUp = achievements.filter((a) => !a.unlocked).sort((a, b) => b.percent - a.percent).slice(0, 3);

  return (
    <ProgressPageShell current="/dashboard/progress" title="Career progress" description="Your development over time, measured from what you have actually done in this app — not a prediction of job outcomes." icon={Activity} loading={loading} error={error} onRetry={load}>
      {progress && profile && streaks && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Progress score" value={progress.score.overallScore} unit="/100" definition="Weighted average of the six dimensions that have evidence." unavailable={progress.score.label} icon={Activity} />
            <MetricCard label="Experience points" value={profile.totalPoints} unit=" XP" definition="Points awarded for persisted learning and preparation activities. See “How XP is earned” below." icon={Sparkles} tone="amber" />
            <MetricCard label="Learning streak" value={streaks.currentStreak} unit=" days" definition="Consecutive learning days ending today or yesterday, in your timezone." icon={Flame} tone="rose" unavailable="No learning days yet" />
            <MetricCard label="Achievements" value={`${profile.achievementsUnlocked}/${profile.achievementsTotal}`} definition="Badges unlocked from real persisted activity." icon={Trophy} tone="emerald" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2"><CardHeader><CardTitle>Career progress score</CardTitle></CardHeader><CardContent><ProgressScoreCard progress={progress.score} comparison={progress.comparison} /></CardContent></Card>
            <div className="space-y-6">
              <Card><CardHeader><CardTitle>Level &amp; XP</CardTitle></CardHeader><CardContent className="space-y-3"><XpProgressBar level={profile.level} /><Link href="/dashboard/progress/achievements" className="text-sm text-indigo-700 inline-flex items-center gap-1 hover:underline">How XP is earned <ArrowRight className="w-3.5 h-3.5" /></Link></CardContent></Card>
              <Card><CardHeader><CardTitle>Learning consistency</CardTitle></CardHeader><CardContent><StreakCalendar streaks={streaks} /></CardContent></Card>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card><CardHeader><CardTitle className="flex items-center justify-between">Achievements <Link href="/dashboard/progress/achievements" className="text-xs font-normal text-indigo-700 hover:underline">All badges</Link></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {recentUnlocks.length === 0 && nextUp.length === 0 && <p className="text-sm text-gray-500">Nothing yet.</p>}
                {recentUnlocks.map((a) => <AchievementBadge key={a.key} achievement={a} size="sm" />)}
                {nextUp.length > 0 && <p className="text-[11px] text-gray-500 pt-1">Closest to unlocking</p>}
                {nextUp.map((a) => <AchievementBadge key={a.key} achievement={a} size="sm" />)}
              </CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center justify-between"><span className="inline-flex items-center gap-1"><Flag className="w-4 h-4" /> Active goals</span><Link href="/dashboard/progress/goals" className="text-xs font-normal text-indigo-700 hover:underline">Manage</Link></CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {goals.length === 0 && <p className="text-sm text-gray-500">No active goals. <Link href="/dashboard/progress/goals" className="text-indigo-700 hover:underline">Set one</Link> — e.g. “finish five mock interviews”.</p>}
                {goals.slice(0, 4).map((g) => <div key={g.id}><div className="flex justify-between text-sm"><span className="text-gray-900 truncate">{g.title}</span><span className="tabular-nums text-gray-600">{g.progress.currentValue}/{g.targetValue}</span></div><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${g.progress.percent}%` }} /></div></div>)}
              </CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center justify-between">Recent activity <Link href="/dashboard/progress/notifications" className="text-xs font-normal text-indigo-700 hover:underline">History</Link></CardTitle></CardHeader><CardContent><ActivityTimeline items={activity} /></CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/dashboard/progress/analytics" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><Activity className="w-4 h-4" /> Advanced analytics</Link>
            <Link href="/dashboard/progress/reports" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><FileBarChart className="w-4 h-4" /> Weekly / monthly reports</Link>
            <Link href="/dashboard/career" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl hover:bg-indigo-100">Career coach <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </>
      )}
    </ProgressPageShell>
  );
}
