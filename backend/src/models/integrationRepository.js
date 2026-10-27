/**
 * integrationRepository.js — Phase 14 persistence: connected integrations,
 * pending OAuth authorizations, sync logs, external resource links, automation
 * rules and executions, and the email delivery log.
 *
 * It also supplies the automation engine with the *reads* it needs from earlier
 * phases — upcoming interviews, active applications, weekly activity, resume
 * review material — so the engine stays pure and every query here is scoped by
 * `userId`.
 *
 * `credentials` is written and read only as the sealed blob produced by
 * tokenVault; nothing in this file ever sees a plaintext token.
 */
import { notFound } from "../utils/errors.js";

const ignoreDuplicate = (err) => { if (err?.code === "P2002") return null; throw err; };

export function createIntegrationRepository(prisma) {
  const repo = {
    // ── Integrations ────────────────────────────────────────────────────────
    async listIntegrations(userId) {
      return prisma.externalIntegration.findMany({ where: { userId }, orderBy: { provider: "asc" } });
    },
    async findIntegration(userId, provider) {
      return prisma.externalIntegration.findFirst({ where: { userId, provider } });
    },
    async isConnected(userId, provider) {
      const row = await prisma.externalIntegration.findFirst({ where: { userId, provider, status: "connected" }, select: { id: true } });
      return Boolean(row);
    },
    async upsertIntegration(userId, provider, data) {
      const existing = await prisma.externalIntegration.findFirst({ where: { userId, provider } });
      if (existing) return prisma.externalIntegration.update({ where: { id: existing.id }, data });
      return prisma.externalIntegration.create({ data: { userId, provider, ...data } });
    },
    async updateIntegration(id, data) {
      return prisma.externalIntegration.update({ where: { id }, data });
    },
    /** Disconnect: the sealed blob is removed, not just the status flipped. */
    async deleteIntegrationCredentials(id) {
      return prisma.externalIntegration.update({
        where: { id },
        data: { credentials: null, hasRefreshToken: false, status: "disconnected", expiresAt: null, connectedAt: null, scopes: [], externalAccountLabel: null },
      });
    },
    async setPreferences(userId, provider, preferences) {
      const existing = await prisma.externalIntegration.findFirst({ where: { userId, provider } });
      if (existing) return prisma.externalIntegration.update({ where: { id: existing.id }, data: { preferences } });
      // Email has no OAuth step, so its preferences create the row.
      return prisma.externalIntegration.create({ data: { userId, provider, status: "configured", preferences } });
    },

    // ── Pending OAuth authorizations ────────────────────────────────────────
    async createPendingAuthorization(data) {
      // Clear anything stale for this user+provider so one flow is in play.
      await prisma.pendingAuthorization.deleteMany({ where: { userId: data.userId, provider: data.provider } });
      return prisma.pendingAuthorization.create({ data });
    },
    async findPendingAuthorization(state) {
      return prisma.pendingAuthorization.findFirst({ where: { state } });
    },
    /** Single use: consuming removes it, so a replayed callback finds nothing. */
    async consumePendingAuthorization(id) {
      return prisma.pendingAuthorization.delete({ where: { id } }).catch(() => null);
    },
    async purgeExpiredAuthorizations(now = new Date()) {
      const { count } = await prisma.pendingAuthorization.deleteMany({ where: { expiresAt: { lt: now } } });
      return count;
    },

    // ── Sync log ────────────────────────────────────────────────────────────
    async logSync(integrationId, userId, entry) {
      return prisma.integrationSyncLog.create({
        data: { integrationId, userId, action: entry.action, status: entry.status, detail: entry.detail ?? null, externalId: entry.externalId ?? null },
      }).catch(() => null);
    },
    async listSyncLogs(userId, provider, { limit = 50 } = {}) {
      const integration = await repo.findIntegration(userId, provider);
      if (!integration) return [];
      return prisma.integrationSyncLog.findMany({ where: { integrationId: integration.id, userId }, orderBy: { createdAt: "desc" }, take: limit });
    },

    // ── Calendar links ──────────────────────────────────────────────────────
    async findCalendarEvent(integrationId, sourceKind, sourceId) {
      return prisma.externalCalendarEvent.findFirst({ where: { integrationId, sourceKind, sourceId } });
    },
    async upsertCalendarEvent(integrationId, userId, data) {
      const existing = await prisma.externalCalendarEvent.findFirst({ where: { integrationId, sourceKind: data.kind, sourceId: data.id } });
      const payload = {
        externalEventId: data.externalEventId,
        contentHash: data.contentHash,
        status: data.status ?? "synced",
        calendarId: data.calendarId ?? "primary",
        lastSyncedAt: new Date(),
      };
      if (existing) return prisma.externalCalendarEvent.update({ where: { id: existing.id }, data: payload });
      return prisma.externalCalendarEvent.create({
        data: { integrationId, userId, sourceKind: data.kind, sourceId: data.id, ...payload },
      }).catch(ignoreDuplicate);
    },
    async markCalendarEventRemoved(id) {
      return prisma.externalCalendarEvent.update({ where: { id }, data: { status: "removed", externalEventId: null, contentHash: null } });
    },

    // ── Drive exports ───────────────────────────────────────────────────────
    async findDriveExport(integrationId, sourceKind, sourceId) {
      return prisma.externalFileExport.findFirst({ where: { integrationId, sourceKind, sourceId } });
    },
    async recordDriveExport(integrationId, userId, data) {
      const existing = await prisma.externalFileExport.findFirst({ where: { integrationId, sourceKind: data.sourceKind, sourceId: data.sourceId } });
      const payload = { externalFileId: data.externalFileId, name: data.name, webViewLink: data.webViewLink ?? null };
      if (existing) return prisma.externalFileExport.update({ where: { id: existing.id }, data: payload });
      return prisma.externalFileExport.create({ data: { integrationId, userId, sourceKind: data.sourceKind, sourceId: data.sourceId, ...payload } }).catch(ignoreDuplicate);
    },

    // ── Automation rules & executions ───────────────────────────────────────
    async listRules(userId) {
      return prisma.automationRule.findMany({ where: { userId }, orderBy: { workflowKey: "asc" } });
    },
    async findRule(ruleId, userId) {
      const row = await prisma.automationRule.findFirst({ where: { id: ruleId, userId } });
      if (!row) throw notFound("Automation rule not found.");
      return row;
    },
    async findRuleByWorkflow(userId, workflowKey) {
      return prisma.automationRule.findFirst({ where: { userId, workflowKey } });
    },
    async upsertRule(userId, workflowKey, data) {
      const existing = await prisma.automationRule.findFirst({ where: { userId, workflowKey } });
      if (existing) return prisma.automationRule.update({ where: { id: existing.id }, data });
      return prisma.automationRule.create({ data: { userId, workflowKey, ...data } });
    },
    async updateRule(ruleId, userId, data) {
      await repo.findRule(ruleId, userId);
      return prisma.automationRule.update({ where: { id: ruleId }, data });
    },
    async deleteRule(ruleId, userId) {
      await repo.findRule(ruleId, userId);
      await prisma.automationRule.delete({ where: { id: ruleId } });
    },
    async touchRule(ruleId, data) {
      return prisma.automationRule.update({ where: { id: ruleId }, data }).catch(() => null);
    },
    /** Pause everything at once, for when automation is doing too much. */
    async pauseAllRules(userId) {
      const { count } = await prisma.automationRule.updateMany({ where: { userId, isEnabled: true }, data: { isEnabled: false } });
      return count;
    },

    async createExecution(userId, ruleId, data) {
      return prisma.automationExecution.create({ data: { userId, ruleId, ...data } });
    },
    async listExecutions(userId, { ruleId = null, limit = 50 } = {}) {
      const where = { userId };
      if (ruleId) where.ruleId = ruleId;
      return prisma.automationExecution.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
    },
    async findExecution(executionId, userId) {
      const row = await prisma.automationExecution.findFirst({ where: { id: executionId, userId } });
      if (!row) throw notFound("Automation run not found.");
      return row;
    },

    // ── Email ───────────────────────────────────────────────────────────────
    /**
     * Has this exact notification already been created? The unique constraint
     * on (userId, dedupeKey) is the backstop; checking first lets the engine
     * report "already notified" instead of relying on a swallowed violation.
     */
    async notificationExists(userId, dedupeKey) {
      if (!dedupeKey) return false;
      const row = await prisma.userNotification.findFirst({ where: { userId, dedupeKey }, select: { id: true } });
      return Boolean(row);
    },

    async userEmail(userId) {
      const user = await prisma.user.findFirst({ where: { id: userId }, select: { email: true } });
      return user?.email ?? null;
    },
    async emailPreferences(userId) {
      const row = await prisma.externalIntegration.findFirst({ where: { userId, provider: "email" }, select: { preferences: true } });
      return row?.preferences ?? {};
    },
    async findEmailDelivery(userId, dedupeKey) {
      if (!dedupeKey) return null;
      return prisma.emailDelivery.findFirst({ where: { userId, dedupeKey } });
    },
    async recordEmailDelivery(userId, data) {
      return prisma.emailDelivery.create({ data: { userId, ...data } }).catch(async (err) => {
        ignoreDuplicate(err);
        return prisma.emailDelivery.findFirst({ where: { userId, dedupeKey: data.dedupeKey } });
      });
    },
    async listEmailDeliveries(userId, { limit = 50 } = {}) {
      return prisma.emailDelivery.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
    },

    // ── Reads the automation engine needs from earlier phases ───────────────
    async upcomingInterviews(userId) {
      return prisma.applicationInterview.findMany({
        where: { userId, scheduledAt: { not: null } },
        orderBy: { scheduledAt: "asc" },
        take: 50,
      });
    },
    async applicationFor(applicationId, userId) {
      if (!applicationId) return null;
      return prisma.jobApplication.findFirst({ where: { id: applicationId, userId } });
    },
    async activeApplications(userId) {
      return prisma.jobApplication.findMany({
        where: { userId, status: { in: ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"] } },
        orderBy: { nextFollowUpDate: "asc" },
      });
    },
    async pendingReminders(userId) {
      return prisma.applicationReminder.findMany({ where: { userId, status: "pending" }, orderBy: { dueAt: "asc" } });
    },

    /** Counts for the weekly summary. Nothing is estimated: these are rows. */
    async weeklyActivity(userId, since) {
      const [learningTasks, interviews, resumeEdits, applications, statusChanges] = await Promise.all([
        prisma.learningTask.count({ where: { milestone: { roadmap: { userId } }, status: "completed", completedAt: { gte: since } } }),
        prisma.interviewSession.count({ where: { userId, status: "completed", completedAt: { gte: since } } }),
        prisma.resumeVersion.count({ where: { userId, updatedAt: { gte: since }, isOriginal: false } }),
        prisma.jobApplication.count({ where: { userId, createdAt: { gte: since } } }),
        prisma.applicationActivity.count({ where: { userId, type: "status_changed", occurredAt: { gte: since } } }),
      ]);
      return { learningTasks, interviews, resumeEdits, applications, statusChanges, since };
    },

    /** Material for the resume improvement review. */
    async resumeReviewMaterial(userId) {
      const version = await prisma.resumeVersion.findFirst({
        where: { userId, isOriginal: false },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, lastQualityScore: true },
      });
      if (!version) return { version: null, pendingSuggestions: 0, atsFindings: 0 };
      const [pendingSuggestions, assessment] = await Promise.all([
        prisma.resumeImprovement.count({ where: { versionId: version.id, status: "pending" } }),
        prisma.resumeAtsAssessment.findFirst({ where: { userId, versionId: version.id }, orderBy: { createdAt: "desc" }, select: { findings: true, overallScore: true } }),
      ]);
      const findings = Array.isArray(assessment?.findings) ? assessment.findings : [];
      return { version, pendingSuggestions, atsFindings: findings.length, atsScore: assessment?.overallScore ?? null, findings };
    },

    async buildResumeReview(userId, versionId) {
      const [suggestions, assessment, version] = await Promise.all([
        prisma.resumeImprovement.findMany({ where: { versionId, status: "pending" }, take: 20, select: { id: true, category: true, title: true, suggestedText: true, rationale: true } }),
        prisma.resumeAtsAssessment.findFirst({ where: { userId, versionId }, orderBy: { createdAt: "desc" }, select: { findings: true, overallScore: true } }),
        prisma.resumeVersion.findFirst({ where: { id: versionId, userId }, select: { id: true, name: true } }),
      ]);
      const findings = Array.isArray(assessment?.findings) ? assessment.findings : [];
      return {
        version,
        atsScore: assessment?.overallScore ?? null,
        items: [
          ...suggestions.map((s) => ({ kind: "suggestion", id: s.id, title: s.title ?? s.category, detail: s.rationale ?? "", href: `/dashboard/resume-builder/${versionId}?tab=improve` })),
          ...findings.slice(0, 20).map((f) => ({ kind: "ats", id: f.id, title: f.title, detail: f.action ?? f.issue ?? "", href: `/dashboard/resume-builder/${versionId}?tab=ats` })),
        ],
        note: "Nothing here has been applied. Every item is yours to accept or reject in the resume builder.",
      };
    },

    /** A follow-up draft built from the user's own record — never sent. */
    async buildFollowUpDraft(userId, applicationId, tone = "polite") {
      const application = await prisma.jobApplication.findFirst({ where: { id: applicationId, userId } });
      if (!application) return null;
      const applied = application.applicationDate ? new Date(application.applicationDate).toLocaleDateString() : null;
      const openers = {
        polite: `I hope you're well. I applied for the ${application.jobTitle} role${applied ? ` on ${applied}` : ""} and wanted to check in on the status of my application.`,
        brief: `Following up on my application for the ${application.jobTitle} role${applied ? ` submitted on ${applied}` : ""}.`,
        warm: `I hope things are going well at ${application.companyName}. I applied for the ${application.jobTitle} role${applied ? ` on ${applied}` : ""} and I'm still very interested.`,
      };
      return {
        subject: `Following up — ${application.jobTitle}`,
        body: [
          `Hello,`,
          ``,
          openers[tone] ?? openers.polite,
          ``,
          `I'd be glad to provide anything else that would help.`,
          ``,
          `Thank you for your time.`,
        ].join("\n"),
        note: "This draft is for you to send yourself. This product does not contact employers.",
      };
    },

    async buildWeeklySummary(userId, activity, empty) {
      const lines = empty
        ? ["Nothing was recorded in the last seven days.", "", "That is simply what the records show — no activity has been inferred."]
        : [
            `In the last seven days you:`,
            activity.learningTasks ? `· completed ${activity.learningTasks} learning task(s)` : null,
            activity.interviews ? `· finished ${activity.interviews} mock interview(s)` : null,
            activity.resumeEdits ? `· edited ${activity.resumeEdits} resume version(s)` : null,
            activity.applications ? `· started tracking ${activity.applications} application(s)` : null,
            activity.statusChanges ? `· moved ${activity.statusChanges} application(s) to a new status` : null,
          ].filter(Boolean);
      return { text: lines.join("\n"), activity, empty, generatedAt: new Date().toISOString() };
    },

    /** Preparation steps the interview workflow adds. Idempotent by title. */
    async addPreparationSteps(userId, applicationId, stage) {
      const titles = [
        `Review the job description before the ${String(stage).replace(/_/g, " ")} round`,
        `Re-read your own resume as the interviewer will see it`,
        `Prepare one example for each required skill`,
      ];
      const existing = await prisma.applicationChecklistItem.findMany({ where: { applicationId, userId }, select: { title: true } });
      const have = new Set(existing.map((e) => e.title));
      let count = await prisma.applicationChecklistItem.count({ where: { applicationId, userId } });
      let added = 0;
      for (const title of titles.filter((t) => !have.has(t))) {
        await prisma.applicationChecklistItem.create({
          data: { applicationId, userId, key: null, title, description: "Added by the interview preparation workflow.", category: "interview", isRequired: false, isCustom: true, sortOrder: count++ },
        }).catch(ignoreDuplicate);
        added += 1;
      }
      return added;
    },

    /** One record shaped for the calendar service. */
    async calendarSourceFor(userId, kind, id) {
      if (kind === "interview") {
        const round = await prisma.applicationInterview.findFirst({ where: { id, userId } });
        if (!round?.scheduledAt) return null;
        const application = await prisma.jobApplication.findFirst({ where: { id: round.applicationId, userId }, select: { jobTitle: true, companyName: true } });
        return {
          kind: "interview", id: round.id,
          summary: `${String(round.stage).replace(/_/g, " ")} interview — ${application?.companyName ?? "application"}`,
          description: [application?.jobTitle, round.preparationNotes].filter(Boolean).join("\n"),
          startsAt: round.scheduledAt, durationMinutes: round.durationMinutes ?? 60,
          timeZone: round.timezone ?? "UTC", location: round.location ?? null,
        };
      }
      if (kind === "deadline") {
        const application = await prisma.jobApplication.findFirst({ where: { id, userId } });
        if (!application?.applicationDeadline) return null;
        return {
          kind: "deadline", id: application.id,
          summary: `Application deadline — ${application.companyName}`,
          description: application.jobTitle, startsAt: application.applicationDeadline,
          durationMinutes: 30, timeZone: "UTC", location: null,
        };
      }
      if (kind === "reminder") {
        const reminder = await prisma.applicationReminder.findFirst({ where: { id, userId } });
        if (!reminder) return null;
        return {
          kind: "reminder", id: reminder.id, summary: reminder.title,
          description: reminder.note ?? "", startsAt: reminder.dueAt,
          durationMinutes: 15, timeZone: reminder.timezone ?? "UTC", location: null,
        };
      }
      return null;
    },

    /** Everything eligible for calendar sync, honouring the user's choices. */
    async collectCalendarSources(userId, preferences) {
      const sources = [];
      if (preferences.interviews !== false) {
        const rounds = await prisma.applicationInterview.findMany({ where: { userId, scheduledAt: { gte: new Date() }, outcome: "scheduled" }, orderBy: { scheduledAt: "asc" }, take: 50 });
        for (const r of rounds) {
          const source = await repo.calendarSourceFor(userId, "interview", r.id);
          if (source) sources.push(source);
        }
      }
      if (preferences.deadlines !== false) {
        const apps = await prisma.jobApplication.findMany({ where: { userId, applicationDeadline: { gte: new Date() } }, take: 50 });
        for (const a of apps) {
          const source = await repo.calendarSourceFor(userId, "deadline", a.id);
          if (source) sources.push(source);
        }
      }
      if (preferences.reminders === true) {
        const reminders = await prisma.applicationReminder.findMany({ where: { userId, status: "pending", dueAt: { gte: new Date() } }, take: 50 });
        for (const r of reminders) {
          const source = await repo.calendarSourceFor(userId, "reminder", r.id);
          if (source) sources.push(source);
        }
      }
      return sources;
    },

    /** A resume version or cover letter, for export to cloud storage. */
    async exportableDocument(userId, kind, id) {
      if (kind === "resume_version") {
        return prisma.resumeVersion.findFirst({ where: { id, userId } });
      }
      if (kind === "cover_letter") {
        return prisma.coverLetter.findFirst({ where: { id, userId } });
      }
      return null;
    },
  };

  return repo;
}
