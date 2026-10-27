/**
 * applicationReminderService.js — deadlines, follow-ups and custom reminders
 * (`application-reminder-1.0`). Pure.
 *
 * Timezones are the whole difficulty here. A reminder is stored as an absolute
 * instant (`dueAt`) plus the IANA zone the user entered it in (`timezone`), so
 * "Friday 09:00" stays Friday 09:00 in their calendar wherever the server runs
 * and whatever DST does in between. Grouping into overdue / today / this week
 * is done on *their* calendar days, reusing the Phase 10 day-key helpers rather
 * than a second date implementation.
 *
 * Delivery is in-app. There is no scheduler in this deployment (see
 * `backend/src/jobs/README.md`), so `deliveryMode` is `"on_read"`: reminders
 * surface when the user loads the workspace or the reminder list, and
 * `schedulerContract` documents exactly what a background runner would call.
 * Nothing here claims a notification was sent.
 */
import { isValidTimeZone, localDayKey, addDays } from "../progress/streakService.js";

export const REMINDER_METHOD = "application-reminder-1.0";

export const REMINDER_TYPES = ["deadline", "follow_up", "interview", "assessment", "custom"];
export const REMINDER_STATUSES = ["pending", "done", "dismissed"];

export const REMINDER_TYPE_LABELS = Object.freeze({
  deadline: "Application deadline",
  follow_up: "Follow-up",
  interview: "Interview",
  assessment: "Assessment deadline",
  custom: "Reminder",
});

/**
 * A stable key so the same real reminder is not created twice. Callers that
 * create reminders from another record (a deadline, an interview) pass the
 * source id; a user's own ad-hoc reminder gets no key and is never deduped.
 */
export function dedupeKeyFor({ type, applicationId = null, interviewId = null, dueAt }) {
  if (!applicationId && !interviewId) return null;
  const day = new Date(dueAt).toISOString().slice(0, 10);
  return `reminder:${type}:${interviewId ?? applicationId}:${day}`;
}

/**
 * Group reminders the way someone actually reads them, in their own timezone.
 * @param {Array} reminders
 * @param {{ tz?: string, now?: Date }} [opts]
 */
export function groupReminders(reminders, { tz = "UTC", now = new Date() } = {}) {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const todayKey = localDayKey(now, zone);
  const weekEndKey = addDays(todayKey, 7);

  const pending = reminders.filter((r) => r.status === "pending");
  const bucket = (r) => {
    const key = localDayKey(r.dueAt, zone);
    if (new Date(r.dueAt) < now && key < todayKey) return "overdue";
    if (key === todayKey) return new Date(r.dueAt) < now ? "overdue" : "today";
    if (key <= weekEndKey) return "this_week";
    return "later";
  };

  const groups = { overdue: [], today: [], this_week: [], later: [] };
  for (const r of pending.sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))) groups[bucket(r)].push(present(r, zone));

  return {
    method: REMINDER_METHOD,
    timezone: zone,
    today: todayKey,
    groups,
    counts: {
      overdue: groups.overdue.length,
      today: groups.today.length,
      thisWeek: groups.this_week.length,
      later: groups.later.length,
      pending: pending.length,
      done: reminders.filter((r) => r.status === "done").length,
      dismissed: reminders.filter((r) => r.status === "dismissed").length,
    },
    completed: reminders.filter((r) => r.status !== "pending").sort((a, b) => new Date(b.dueAt) - new Date(a.dueAt)).slice(0, 30).map((r) => present(r, zone)),
  };
}

/** One reminder, with its due moment rendered in the zone it was set in. */
export function present(row, viewerZone = "UTC") {
  const setZone = isValidTimeZone(row.timezone) ? row.timezone : "UTC";
  const zone = isValidTimeZone(viewerZone) ? viewerZone : setZone;
  const due = new Date(row.dueAt);
  const fmt = (z) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: z, dateStyle: "medium", timeStyle: "short" }).format(due);
  // Compare the rendered times, not the zone names: "Asia/Calcutta" and
  // "Asia/Kolkata" are the same zone, and two zones sharing an offset show the
  // same moment anyway — in both cases a second reading is noise.
  const inViewer = fmt(zone);
  const inSetZone = fmt(setZone);
  return {
    id: row.id,
    applicationId: row.applicationId,
    interviewId: row.interviewId,
    type: row.type,
    typeLabel: REMINDER_TYPE_LABELS[row.type] ?? row.type,
    title: row.title,
    note: row.note,
    dueAt: row.dueAt,
    timezone: setZone,
    dueLocal: inViewer,
    /** Shown only when the viewer's clock would read a different time. */
    dueInSetZone: inViewer === inSetZone ? null : `${inSetZone} (${setZone})`,
    status: row.status,
    completedAt: row.completedAt,
    overdue: row.status === "pending" && due < new Date(),
    daysUntil: Math.round((due.getTime() - Date.now()) / 86_400_000),
  };
}

/**
 * What a background runner would have to do, stated so nobody has to guess.
 * This deployment has no such runner, which is why `active` is false.
 */
export const schedulerContract = Object.freeze({
  active: false,
  deliveryMode: "on_read",
  message: "Reminders appear when you open the workspace or the reminder list. Nothing runs in the background, and no email, push or SMS is sent.",
  toEnable: {
    needs: "A scheduled process (cron, queue worker or hosted scheduler) running at least hourly.",
    entryPoint: "jobRepository-style call: list reminders where status = 'pending' and dueAt <= now, then create one UserNotification per reminder using dedupeKey `reminder-due:<reminderId>`.",
    where: "backend/src/jobs/ — nothing runs there yet.",
    idempotency: "UserNotification is unique on (userId, dedupeKey), so a runner that fires twice cannot notify twice.",
  },
});

/**
 * Reminders that are due and have not been announced yet. The workspace and the
 * reminder list call this on read; a scheduler would call the same function.
 * @param {Array} reminders
 * @param {Set<string>} alreadyNotified dedupe keys already present as notifications
 * @param {Date} [now]
 */
export function dueForNotification(reminders, alreadyNotified = new Set(), now = new Date()) {
  return reminders
    .filter((r) => r.status === "pending" && new Date(r.dueAt) <= now)
    .filter((r) => !alreadyNotified.has(`reminder-due:${r.id}`))
    .map((r) => ({
      reminderId: r.id,
      applicationId: r.applicationId,
      dedupeKey: `reminder-due:${r.id}`,
      title: r.title,
      type: r.type,
      body: `${REMINDER_TYPE_LABELS[r.type] ?? "Reminder"} due ${new Date(r.dueAt).toLocaleDateString()}.`,
    }));
}
