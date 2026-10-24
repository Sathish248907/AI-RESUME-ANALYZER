"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { listNotifications, markAllNotificationsRead, markNotificationRead, type Notification } from "@/services/progressService";

const POLL_MS = 90_000;

/** Navbar bell: unread count, last few notifications, mark-as-read. Polls lightly; never blocks the page. */
export default function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    try { const r = await listNotifications({ limit: 6 }); setItems(r.notifications); setUnread(r.unread); } catch { /* keep last known state */ }
  }, [enabled]);
  useEffect(() => { load(); if (!enabled) return; const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load, enabled]);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  if (!enabled) return null;
  async function onRead(n: Notification) { if (n.readAt) return; try { await markNotificationRead(n.id); setItems((all) => all.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))); setUnread((u) => Math.max(0, u - 1)); } catch { /* ignore */ } }
  async function onReadAll() { try { await markAllNotificationsRead(); setItems((all) => all.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))); setUnread(0); } catch { /* ignore */ } }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100">
        <Bell className="w-5 h-5" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-semibold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100"><p className="text-sm font-semibold text-gray-900">Notifications</p>{unread > 0 && <button type="button" onClick={onReadAll} className="text-xs text-indigo-700 inline-flex items-center gap-1 hover:underline"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>}</div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-gray-500">Nothing yet. Achievements, levels, milestones and reports will appear here.</li>}
            {items.map((n) => (
              <li key={n.id} className={cn("px-3 py-2 text-sm", !n.readAt && "bg-indigo-50/50")}>
                <Link href={n.href ?? "/dashboard/progress/notifications"} onClick={() => { onRead(n); setOpen(false); }} className="block">
                  <p className="font-medium text-gray-900 truncate">{n.title}</p>
                  <p className="text-xs text-gray-600 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/progress/notifications" onClick={() => setOpen(false)} className="block text-center text-xs text-indigo-700 py-2 border-t border-gray-100 hover:bg-gray-50">View all notifications</Link>
        </div>
      )}
    </div>
  );
}
