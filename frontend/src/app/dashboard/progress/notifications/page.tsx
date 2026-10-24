"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import ActivityTimeline from "@/components/progress/ActivityTimeline";
import { listNotifications, markAllNotificationsRead, markNotificationRead, getNotificationPreferences, updateNotificationPreferences, getActivity, type Notification, type ActivityItem, NOTIFICATION_PREF_LABELS, CATEGORY_LABELS } from "@/services/progressService";
import { cn } from "@/lib/utils";

export default function NotificationCenterPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [actPage, setActPage] = useState(1);
  const [actTotal, setActTotal] = useState(0);
  const [category, setCategory] = useState<string>("");

  const load = useCallback(async (unreadOnly = onlyUnread, cat = category) => {
    if (!user) return;
    setLoading(true); setError(null);
    try { const [n, p, a] = await Promise.all([listNotifications({ page: 1, limit: 20, unread: unreadOnly }), getNotificationPreferences(), getActivity({ page: 1, limit: 20, category: cat || undefined })]); setItems(n.notifications); setUnread(n.unread); setTotal(n.total); setPage(1); setPrefs(p); setActivity(a.activity); setActTotal(a.total); setActPage(1); }
    catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, onlyUnread, category]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  async function moreNotes() { const n = await listNotifications({ page: page + 1, limit: 20, unread: onlyUnread }); setItems((all) => [...all, ...n.notifications]); setPage(page + 1); }
  async function moreActivity() { const a = await getActivity({ page: actPage + 1, limit: 20, category: category || undefined }); setActivity((all) => [...all, ...a.activity]); setActPage(actPage + 1); }
  async function onRead(n: Notification) { if (n.readAt) return; try { const u = await markNotificationRead(n.id); setItems((all) => all.map((x) => (x.id === u.id ? u : x))); setUnread((c) => Math.max(0, c - 1)); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function onReadAll() { try { await markAllNotificationsRead(); setItems((all) => all.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))); setUnread(0); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function onPref(key: string, value: boolean) { try { setPrefs(await updateNotificationPreferences({ [key]: value })); } catch (err) { toast.error(toApiClientError(err).message); } }

  return (
    <ProgressPageShell current="/dashboard/progress/notifications" title="Notifications & activity" description="In-app notifications for achievements, levels, milestones, assessments, reports and goals, plus your full activity history. No email or push." icon={Bell} loading={loading} error={error} onRetry={() => load()}>
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center justify-between flex-wrap gap-2"><span>Notifications {unread > 0 && <Badge variant="info">{unread} unread</Badge>}</span>
          <span className="flex items-center gap-2 text-xs font-normal"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Unread only</label>{unread > 0 && <Button size="sm" variant="outline" onClick={onReadAll}><CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read</Button>}</span></CardTitle></CardHeader>
          <CardContent>
            {items.length === 0 ? <p className="text-sm text-gray-500">No notifications{onlyUnread ? " unread" : " yet"}. They appear when you unlock achievements, reach levels, complete milestones or generate reports.</p> : (
              <ul className="divide-y divide-gray-100">{items.map((n) => <li key={n.id} className={cn("py-2.5 flex items-start justify-between gap-3", !n.readAt && "bg-indigo-50/40 -mx-2 px-2 rounded-lg")}>
                <div className="min-w-0"><p className="text-sm font-medium text-gray-900">{n.title}</p><p className="text-xs text-gray-600">{n.body}</p><p className="text-[11px] text-gray-400 mt-0.5"><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time> · {n.type}{n.href && <> · <Link href={n.href} onClick={() => onRead(n)} className="text-indigo-700 hover:underline">Open</Link></>}</p></div>
                {!n.readAt && <Button size="sm" variant="ghost" onClick={() => onRead(n)}>Mark read</Button>}
              </li>)}</ul>
            )}
            {items.length < total && <Button variant="outline" size="sm" className="mt-3" onClick={moreNotes}>Load more</Button>}
          </CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> Preferences</CardTitle></CardHeader><CardContent>
          <ul className="space-y-2 text-sm">{Object.entries(NOTIFICATION_PREF_LABELS).map(([k, label]) => <li key={k} className="flex items-center justify-between gap-3"><span className="text-gray-800">{label}</span><input type="checkbox" role="switch" aria-checked={prefs[k] !== false} checked={prefs[k] !== false} onChange={(e) => onPref(k, e.target.checked)} /></li>)}</ul>
          <p className="text-[11px] text-gray-500 mt-3">Notifications are in-app only. Turning a category off stops new notifications of that kind; existing ones stay.</p>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="flex items-center justify-between flex-wrap gap-2"><span>Career activity history</span>
        <select className="text-xs font-normal border border-gray-300 rounded-lg px-2 py-1" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CardTitle></CardHeader>
        <CardContent><ActivityTimeline items={activity} />{activity.length < actTotal && <Button variant="outline" size="sm" className="mt-4" onClick={moreActivity}>Load more ({actTotal - activity.length} more)</Button>}</CardContent></Card>
    </ProgressPageShell>
  );
}
