/**
 * jobAlertService.js — saved searches and their in-app notifications
 * (`job-alert-1.0`).
 *
 * There is no scheduler in this deployment (see `src/jobs/README.md`), so an
 * alert is delivered when it is run: by the user from the alerts page, or by a
 * future job runner calling `runAlert` on a cron. `frequency` is therefore
 * stored as the user's *intent* and reported as "not yet automatic" rather than
 * promised as real-time. `deliveryMode` in the response says exactly which of
 * the two is true, so the UI never claims more than the infrastructure does.
 *
 * De-duplication is structural, not best-effort: each notification's dedupeKey
 * is `job-alert:<alertId>:<jobId>` and `UserNotification` has a unique
 * constraint on (userId, dedupeKey), so re-running an alert — however often —
 * can never notify twice about the same listing.
 */
export const JOB_ALERT_METHOD = "job-alert-1.0";

export const ALERT_FREQUENCIES = ["manual", "daily", "weekly"];

/** Per-run cap, so one run cannot flood the notification list. */
const MAX_NOTIFICATIONS_PER_RUN = 5;
/** Only listings at or above this match score are worth interrupting someone for. */
const NOTIFY_MIN_MATCH = 55;

/**
 * Turn a stored alert query into a discovery query.
 * @param {object} query the alert's saved filters
 */
export function alertQueryToDiscoverQuery(query = {}) {
  return {
    q: query.keywords || (Array.isArray(query.titles) && query.titles.length ? query.titles[0] : undefined),
    location: Array.isArray(query.locations) && query.locations.length ? query.locations[0] : undefined,
    workArrangement: Array.isArray(query.workArrangements) && query.workArrangements.length === 1 ? query.workArrangements[0] : undefined,
    employmentType: Array.isArray(query.employmentTypes) && query.employmentTypes.length === 1 ? query.employmentTypes[0] : undefined,
    experienceLevel: query.experienceLevel || undefined,
    minSalary: query.minSalary || undefined,
    sort: "match",
    page: 1,
    limit: 50,
    refresh: true,
  };
}

/**
 * @param {{ repo: object, discovery: object, progressRepo: object|null, env: object, logger?: object }} deps
 */
export function createJobAlertService({ repo, discovery, progressRepo, env, logger = { info() {}, warn() {} } }) {
  /**
   * Run one alert: search, keep the listings that are both new to this alert and
   * a reasonable match, notify, and record what happened.
   *
   * @param {string} userId
   * @param {object} alert the stored JobAlert row
   * @param {{ now?: Date }} [opts]
   */
  async function runAlert(userId, alert, { now = new Date() } = {}) {
    const query = alertQueryToDiscoverQuery(alert.query ?? {});
    const result = await discovery.discover(userId, query);

    // "New" is decided by the notification dedupe key, not by a timestamp, so a
    // listing that was already announced stays quiet even if it was refetched.
    const candidates = result.items
      .filter((item) => item.savedState !== "hidden")
      .filter((item) => item.match.matchScore === null || item.match.matchScore >= NOTIFY_MIN_MATCH)
      .slice(0, MAX_NOTIFICATIONS_PER_RUN * 3);

    // Already-announced listings are filtered out before anything is created,
    // so a repeat run reports "nothing new" rather than relying on a constraint
    // violation being swallowed somewhere below.
    const alreadySeen = await repo.existingNotificationKeys(
      userId,
      candidates.map((item) => `job-alert:${alert.id}:${item.job.id}`)
    );
    const fresh = candidates.filter((item) => !alreadySeen.has(`job-alert:${alert.id}:${item.job.id}`));

    const notified = [];
    if (progressRepo) {
      for (const item of fresh) {
        if (notified.length >= MAX_NOTIFICATIONS_PER_RUN) break;
        const dedupeKey = `job-alert:${alert.id}:${item.job.id}`;
        const created = await progressRepo.createNotification(userId, {
          type: "job_alert",
          title: `${item.job.title} — ${item.job.companyName}`,
          body: item.match.matchScore === null
            ? `New match for your “${alert.name}” alert. No resume match was computed.`
            : `New match for your “${alert.name}” alert · resume match ${item.match.matchScore}% (${item.match.label}).`,
          href: `/dashboard/jobs/${encodeURIComponent(item.job.id)}`,
          dedupeKey,
        }).catch(() => null);
        // createNotification swallows the duplicate constraint and returns null,
        // which is exactly how we know this listing was already announced.
        if (created) notified.push({ jobId: item.job.id, title: item.job.title, companyName: item.job.companyName, matchScore: item.match.matchScore });
      }
    }

    const updated = await repo.updateAlert(alert.id, userId, {
      lastRunAt: now,
      lastResultCount: result.total,
      lastNewCount: notified.length,
    });

    logger.info?.("job alert run", { meta: { alertId: alert.id, results: result.total, notified: notified.length } });

    return {
      method: JOB_ALERT_METHOD,
      alert: presentAlert(updated, env),
      resultCount: result.total,
      newCount: notified.length,
      notified,
      providerStatus: result.providerStatus,
      notes: [
        ...(result.notes ?? []),
        notified.length === 0 && candidates.length > 0
          ? "Every match in this run had already been announced for this alert, so no new notification was created."
          : null,
        fresh.length > MAX_NOTIFICATIONS_PER_RUN
          ? `${fresh.length - MAX_NOTIFICATIONS_PER_RUN} further new matches were not announced in this run (at most ${MAX_NOTIFICATIONS_PER_RUN} notifications per run); they appear in the results and will be announced on the next run.`
          : null,
        progressRepo ? null : "Notifications are unavailable, so this run only counted results.",
      ].filter(Boolean),
    };
  }

  /** Run every active alert for one user (what a scheduler would call). */
  async function runAllAlerts(userId, { now = new Date() } = {}) {
    const alerts = (await repo.listAlerts(userId)).filter((a) => a.isActive);
    const runs = [];
    for (const alert of alerts) runs.push(await runAlert(userId, alert, { now }));
    return { runs, total: runs.reduce((s, r) => s + r.newCount, 0) };
  }

  return { method: JOB_ALERT_METHOD, runAlert, runAllAlerts };
}

/**
 * Add the honest delivery description to a stored alert. `frequency` is the
 * user's intent; `deliveryMode` is what actually happens.
 */
export function presentAlert(alert, env) {
  const automatic = false; // no scheduler exists in this deployment
  return {
    id: alert.id,
    name: alert.name,
    query: alert.query,
    frequency: alert.frequency,
    isActive: alert.isActive,
    lastRunAt: alert.lastRunAt,
    lastResultCount: alert.lastResultCount,
    lastNewCount: alert.lastNewCount,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    deliveryMode: automatic ? "scheduled" : "manual",
    deliveryNote: alert.frequency === "manual"
      ? "Runs when you press “Run now”. Results appear here and in your notifications."
      : `You asked for ${alert.frequency} delivery. This deployment has no background job runner, so the alert still only runs when you press “Run now”. Nothing is delivered in the background and no email or push is sent.`,
    requiresForAutomatic: alert.frequency === "manual" ? null : {
      needs: "A background job runner (for example a cron process or a queue worker) calling the alert runner on a schedule.",
      where: "backend/src/jobs/ — nothing runs there yet.",
      providerNote: `Provider calls would also need to stay inside the per-provider rate limit (currently ${env?.JOB_PROVIDER_RATE_LIMIT_PER_MIN ?? 20}/minute).`,
    },
  };
}
