/**
 * googleCalendarService.js — Google Calendar API v3 (`google-calendar-1.0`).
 *
 * Direct REST, no SDK. Three things make this safe to run repeatedly:
 *
 *   1. **Idempotency by record, not by guesswork.** Every synced item has one
 *      `ExternalCalendarEvent` row keyed on (integration, sourceKind, sourceId).
 *      A second sync of the same interview finds that row and patches the
 *      existing event; it never creates a duplicate. A `contentHash` means an
 *      unchanged item costs no API call at all.
 *   2. **No attendees, ever.** Events are created on the user's own calendar
 *      with no `attendees` field, so Google never emails anyone. This product
 *      does not contact interviewers.
 *   3. **The user's timezone.** Start and end are sent as `dateTime` plus an
 *      explicit `timeZone`, taken from the record the user entered, so a 3pm
 *      interview is 3pm where they are.
 *
 * `404` and `410` from Google mean the user deleted the event themselves; that
 * is treated as "gone, recreate if asked", never as an error worth failing on.
 */
import { createHash } from "node:crypto";
import { ApiError } from "../../utils/errors.js";

export const CALENDAR_METHOD = "google-calendar-1.0";
const API = "https://www.googleapis.com/calendar/v3";

/** What may be pushed to a calendar, and the default for each. */
export const SYNCABLE_EVENT_TYPES = Object.freeze([
  { key: "interviews", label: "Interview rounds", default: true, description: "Each interview round you record that has a date." },
  { key: "deadlines", label: "Application deadlines", default: true, description: "The deadline recorded on an application." },
  { key: "reminders", label: "Follow-up reminders", default: false, description: "Your follow-up and custom reminders." },
]);

export const DEFAULT_CALENDAR_PREFERENCES = Object.freeze({
  interviews: true,
  deadlines: true,
  reminders: false,
  calendarId: "primary",
});

/** Stable hash of the fields that would change the event. */
export function contentHashOf(event) {
  return createHash("sha256")
    .update(JSON.stringify([event.summary, event.description ?? "", event.start, event.end, event.timeZone, event.location ?? ""]))
    .digest("hex")
    .slice(0, 32);
}

/**
 * @param {{ oauth: object, repo: object, fetchImpl?: typeof fetch, logger?: object }} deps
 */
export function createGoogleCalendarService({ oauth, repo, fetchImpl, logger = { info() {}, warn() {} } }) {
  const doFetch = fetchImpl ?? globalThis.fetch;

  async function call(userId, path, { method = "GET", body = null } = {}) {
    const { accessToken } = await oauth.accessTokenFor(userId, "google_calendar");
    let res;
    try {
      res = await doFetch(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json", accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(502, "Google Calendar could not be reached.", { code: "CALENDAR_UNREACHABLE" });
    }

    if (res.status === 204) return { ok: true, data: null, status: 204 };
    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (res.status === 401) {
      throw new ApiError(409, "Google Calendar rejected the stored access. Reconnect the account.", { code: "REAUTH_REQUIRED" });
    }
    if (res.status === 403) {
      const reason = data?.error?.errors?.[0]?.reason ?? "";
      if (reason.includes("rateLimit") || reason === "userRateLimitExceeded") {
        throw new ApiError(429, "Google Calendar is rate limiting this account. Try again shortly.", { code: "CALENDAR_RATE_LIMITED" });
      }
      throw new ApiError(403, `Google Calendar refused the request${reason ? ` (${reason})` : ""}. The granted permissions may be too narrow.`, { code: "CALENDAR_FORBIDDEN" });
    }
    if (res.status === 429) {
      throw new ApiError(429, "Google Calendar is rate limiting this account. Try again shortly.", { code: "CALENDAR_RATE_LIMITED" });
    }
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new ApiError(502, `Google Calendar returned HTTP ${res.status}${data?.error?.message ? `: ${data.error.message}` : ""}.`, { code: "CALENDAR_ERROR" });
    }
    return { ok: res.ok, data, status: res.status };
  }

  /** Shape one of our records as a calendar event. */
  function buildEvent(source) {
    const start = new Date(source.startsAt);
    const end = new Date(start.getTime() + (source.durationMinutes ?? 60) * 60_000);
    return {
      summary: source.summary,
      description: [source.description, "", "Added by AI Resume Analyzer. Edits you make here are not read back."].filter((x) => x !== undefined).join("\n"),
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: source.timeZone ?? "UTC",
      location: source.location ?? null,
    };
  }

  /** Google's event body. No attendees: nothing is sent to anyone. */
  function toGoogleEvent(event) {
    return {
      summary: event.summary,
      description: event.description,
      location: event.location ?? undefined,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
      // Explicitly no `attendees` — see the module comment.
      reminders: { useDefault: true },
      source: { title: "AI Resume Analyzer", url: "https://localhost" },
    };
  }

  /**
   * Push one record to the calendar, creating or updating as needed.
   *
   * @param {string} userId
   * @param {object} source { kind, id, summary, description, startsAt, durationMinutes, timeZone, location }
   * @param {{ calendarId?: string, dryRun?: boolean }} [opts]
   */
  async function syncOne(userId, source, { calendarId = "primary", dryRun = false } = {}) {
    const integration = await repo.findIntegration(userId, "google_calendar");
    if (!integration || integration.status !== "connected") {
      throw new ApiError(409, "Google Calendar is not connected.", { code: "NOT_CONNECTED" });
    }

    const event = buildEvent(source);
    const hash = contentHashOf(event);
    const existing = await repo.findCalendarEvent(integration.id, source.kind, source.id);

    if (existing && existing.contentHash === hash && existing.status === "synced") {
      return { action: "unchanged", externalEventId: existing.externalEventId, event };
    }
    if (dryRun) {
      return { action: existing ? "would_update" : "would_create", externalEventId: existing?.externalEventId ?? null, event };
    }

    // Update the event we already created, unless the user deleted it there.
    if (existing?.externalEventId) {
      const res = await call(userId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.externalEventId)}`, {
        method: "PATCH",
        body: toGoogleEvent(event),
      });
      if (res.ok) {
        await repo.upsertCalendarEvent(integration.id, userId, { ...source, externalEventId: existing.externalEventId, contentHash: hash, status: "synced", calendarId });
        await repo.logSync(integration.id, userId, { action: "event_update", status: "ok", detail: event.summary, externalId: existing.externalEventId });
        return { action: "updated", externalEventId: existing.externalEventId, event };
      }
      // 404/410: it is gone at Google, so fall through and create a new one.
      logger.info?.("calendar event missing at provider, recreating", { meta: { userId, sourceId: source.id } });
    }

    const created = await call(userId, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: toGoogleEvent(event) });
    if (!created.ok || !created.data?.id) {
      throw new ApiError(502, "Google Calendar did not return an event id.", { code: "CALENDAR_CREATE_FAILED" });
    }
    await repo.upsertCalendarEvent(integration.id, userId, { ...source, externalEventId: created.data.id, contentHash: hash, status: "synced", calendarId });
    await repo.logSync(integration.id, userId, { action: "event_create", status: "ok", detail: event.summary, externalId: created.data.id });
    return { action: "created", externalEventId: created.data.id, event, htmlLink: created.data.htmlLink ?? null };
  }

  /**
   * Remove an event we created, because the user cancelled the underlying
   * thing. Deleting something already gone is a success, not an error.
   */
  async function removeOne(userId, kind, sourceId, { calendarId = "primary" } = {}) {
    const integration = await repo.findIntegration(userId, "google_calendar");
    if (!integration) return { action: "not_connected" };
    const existing = await repo.findCalendarEvent(integration.id, kind, sourceId);
    if (!existing?.externalEventId) return { action: "nothing_to_remove" };

    const res = await call(userId, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.externalEventId)}`, { method: "DELETE" });
    await repo.markCalendarEventRemoved(existing.id);
    await repo.logSync(integration.id, userId, {
      action: "event_delete",
      status: "ok",
      detail: res.status === 404 || res.status === 410 ? "Already removed at Google." : "Event cancelled.",
      externalId: existing.externalEventId,
    });
    return { action: "removed", externalEventId: existing.externalEventId, alreadyGone: res.status === 404 || res.status === 410 };
  }

  /**
   * Collect everything eligible and sync it. `dryRun` returns the plan without
   * touching Google, which is what the preview in the UI shows.
   */
  async function syncAll(userId, { dryRun = false } = {}) {
    const integration = await repo.findIntegration(userId, "google_calendar");
    if (!integration || integration.status !== "connected") {
      throw new ApiError(409, "Google Calendar is not connected.", { code: "NOT_CONNECTED" });
    }
    const preferences = { ...DEFAULT_CALENDAR_PREFERENCES, ...(integration.preferences ?? {}) };
    const sources = await repo.collectCalendarSources(userId, preferences);

    const results = [];
    let failed = 0;
    for (const source of sources) {
      try {
        results.push({ source: { kind: source.kind, id: source.id, summary: source.summary }, ...(await syncOne(userId, source, { calendarId: preferences.calendarId, dryRun })) });
      } catch (err) {
        // A revoked or expired grant is an account problem, not an item
        // problem: every item would fail the same way, and the user needs to
        // be told to reconnect rather than handed a success to inspect.
        if (err.code === "REAUTH_REQUIRED" || err.code === "NOT_CONNECTED") {
          await repo.updateIntegration(integration.id, { lastSyncAt: new Date(), lastError: err.message });
          throw err;
        }
        failed += 1;
        results.push({ source: { kind: source.kind, id: source.id, summary: source.summary }, action: "failed", error: err.message });
        // A rate limit hits every item too, but it is transient: report what
        // happened so far rather than failing the whole request.
        if (err.code === "CALENDAR_RATE_LIMITED") break;
      }
    }

    if (!dryRun) {
      await repo.updateIntegration(integration.id, {
        lastSyncAt: new Date(),
        lastError: failed ? `${failed} item${failed === 1 ? "" : "s"} failed to sync.` : null,
      });
    }

    return {
      method: CALENDAR_METHOD,
      dryRun,
      calendarId: preferences.calendarId,
      preferences,
      considered: sources.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      unchanged: results.filter((r) => r.action === "unchanged").length,
      failed,
      results,
      note: dryRun
        ? "Nothing was sent to Google. This is what would happen."
        : "Events are created on your own calendar with no attendees, so nobody is invited or emailed.",
    };
  }

  return { method: CALENDAR_METHOD, syncOne, removeOne, syncAll, buildEvent, contentHashOf };
}
