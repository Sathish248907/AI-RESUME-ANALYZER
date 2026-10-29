/**
 * applicationWorkspaceRepository.js — Phase 13 persistence: checklist items,
 * cover letters, documents, activity, reminders and interview rounds.
 *
 * Every method takes `userId` and filters by it, so a row belonging to someone
 * else is indistinguishable from one that does not exist (404, never 403 with a
 * hint). `assertApplication` is the single gate: each entity hangs off a
 * JobApplication, and that application's ownership is checked before anything
 * is read or written.
 *
 * Activity rows are idempotent through `(applicationId, dedupeKey)`; a repeated
 * real event updates nothing and creates nothing.
 */
import { notFound } from "../utils/errors.js";
import { seedItems } from "../services/applications/applicationChecklistService.js";

const ignoreDuplicate = (err) => { if (err?.code === "P2002") return null; throw err; };

export function createApplicationWorkspaceRepository(prisma) {
  const repo = {
    /** Ownership gate for everything in this phase. */
    async assertApplication(applicationId, userId) {
      const row = await prisma.jobApplication.findFirst({ where: { id: applicationId, userId } });
      if (!row) throw notFound("Application not found.");
      return row;
    },

    // ── Checklist ──────────────────────────────────────────────────────────
    /** Seed the template once; returns the full list either way. */
    async ensureChecklist(applicationId, userId) {
      const existing = await prisma.applicationChecklistItem.findMany({
        where: { applicationId, userId },
        orderBy: { sortOrder: "asc" },
      });
      if (existing.length) return existing;
      // One statement rather than one round trip per template row. The
      // (applicationId, key) unique constraint makes `skipDuplicates` do what
      // the previous per-row `.catch(ignoreDuplicate)` did, so two requests
      // racing to seed the same application still end up with one copy.
      await prisma.applicationChecklistItem.createMany({
        data: seedItems().map((item) => ({ ...item, applicationId, userId })),
        skipDuplicates: true,
      });
      return prisma.applicationChecklistItem.findMany({ where: { applicationId, userId }, orderBy: { sortOrder: "asc" } });
    },
    async listChecklist(applicationId, userId) {
      return prisma.applicationChecklistItem.findMany({ where: { applicationId, userId }, orderBy: { sortOrder: "asc" } });
    },
    async addChecklistItem(applicationId, userId, data) {
      const count = await prisma.applicationChecklistItem.count({ where: { applicationId, userId } });
      return prisma.applicationChecklistItem.create({
        data: { applicationId, userId, key: null, isCustom: true, sortOrder: count, ...data },
      });
    },
    async findChecklistItem(itemId, userId) {
      const row = await prisma.applicationChecklistItem.findFirst({ where: { id: itemId, userId } });
      if (!row) throw notFound("Checklist item not found.");
      return row;
    },
    async updateChecklistItem(itemId, userId, data) {
      await repo.findChecklistItem(itemId, userId);
      return prisma.applicationChecklistItem.update({ where: { id: itemId }, data });
    },
    async deleteChecklistItem(itemId, userId) {
      const row = await repo.findChecklistItem(itemId, userId);
      await prisma.applicationChecklistItem.delete({ where: { id: itemId } });
      return row;
    },

    // ── Cover letters ──────────────────────────────────────────────────────
    async listCoverLetters(applicationId, userId) {
      return prisma.coverLetter.findMany({ where: { applicationId, userId }, orderBy: { versionNumber: "desc" } });
    },
    async nextCoverLetterVersion(applicationId, userId) {
      const rows = await prisma.coverLetter.findMany({ where: { applicationId, userId }, orderBy: { versionNumber: "desc" }, take: 1 });
      return (rows[0]?.versionNumber ?? 0) + 1;
    },
    async createCoverLetter(applicationId, userId, data) {
      const versionNumber = await repo.nextCoverLetterVersion(applicationId, userId);
      return prisma.coverLetter.create({ data: { applicationId, userId, versionNumber, ...data } });
    },
    async findCoverLetter(coverLetterId, userId) {
      const row = await prisma.coverLetter.findFirst({ where: { id: coverLetterId, userId } });
      if (!row) throw notFound("Cover letter not found.");
      return row;
    },
    async updateCoverLetter(coverLetterId, userId, data) {
      await repo.findCoverLetter(coverLetterId, userId);
      return prisma.coverLetter.update({ where: { id: coverLetterId }, data });
    },
    async deleteCoverLetter(coverLetterId, userId) {
      const row = await repo.findCoverLetter(coverLetterId, userId);
      await prisma.coverLetter.delete({ where: { id: coverLetterId } });
      return row;
    },

    // ── Documents ──────────────────────────────────────────────────────────
    async listDocuments(applicationId, userId) {
      return prisma.applicationDocument.findMany({ where: { applicationId, userId }, orderBy: { createdAt: "desc" } });
    },
    async findDocumentByChecksum(applicationId, userId, checksum) {
      if (!checksum) return null;
      return prisma.applicationDocument.findFirst({ where: { applicationId, userId, checksum } });
    },
    async createDocument(applicationId, userId, data) {
      return prisma.applicationDocument.create({ data: { applicationId, userId, ...data } });
    },
    async findDocument(documentId, userId) {
      const row = await prisma.applicationDocument.findFirst({ where: { id: documentId, userId } });
      if (!row) throw notFound("Document not found.");
      return row;
    },
    async deleteDocument(documentId, userId) {
      const row = await repo.findDocument(documentId, userId);
      await prisma.applicationDocument.delete({ where: { id: documentId } });
      return row;
    },
    /** Is this stored file referenced by any other document row? */
    async storageKeyInUse(storageKey, exceptId) {
      if (!storageKey) return false;
      const rows = await prisma.applicationDocument.findMany({ where: { storageKey }, select: { id: true } });
      return rows.some((r) => r.id !== exceptId);
    },

    // ── Activity ───────────────────────────────────────────────────────────
    async listActivity(applicationId, userId, { limit = 200 } = {}) {
      return prisma.applicationActivity.findMany({
        where: { applicationId, userId },
        orderBy: { occurredAt: "desc" },
        take: limit,
      });
    },
    /**
     * Record one event. Returns null when a row with the same dedupeKey already
     * exists, so callers can tell a real new event from a repeat.
     */
    async recordActivity(applicationId, userId, event) {
      if (event.dedupeKey) {
        const existing = await prisma.applicationActivity.findFirst({ where: { applicationId, dedupeKey: event.dedupeKey } });
        if (existing) return null;
      }
      return prisma.applicationActivity.create({
        data: {
          applicationId,
          userId,
          type: event.type,
          title: event.title,
          detail: event.detail ?? null,
          source: event.source ?? "system",
          fromStatus: event.fromStatus ?? null,
          toStatus: event.toStatus ?? null,
          dedupeKey: event.dedupeKey ?? null,
          ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
        },
      }).catch(ignoreDuplicate);
    },

    // ── Reminders ──────────────────────────────────────────────────────────
    async listReminders(userId, { applicationId = null, status = null } = {}) {
      const where = { userId };
      if (applicationId) where.applicationId = applicationId;
      if (status) where.status = status;
      return prisma.applicationReminder.findMany({ where, orderBy: { dueAt: "asc" } });
    },
    async createReminder(userId, data) {
      if (data.dedupeKey) {
        const existing = await prisma.applicationReminder.findFirst({ where: { userId, dedupeKey: data.dedupeKey } });
        if (existing) return { reminder: existing, created: false };
      }
      const row = await prisma.applicationReminder.create({ data: { userId, ...data } }).catch(async (err) => {
        ignoreDuplicate(err);
        return prisma.applicationReminder.findFirst({ where: { userId, dedupeKey: data.dedupeKey } });
      });
      return { reminder: row, created: true };
    },
    async findReminder(reminderId, userId) {
      const row = await prisma.applicationReminder.findFirst({ where: { id: reminderId, userId } });
      if (!row) throw notFound("Reminder not found.");
      return row;
    },
    async updateReminder(reminderId, userId, data) {
      await repo.findReminder(reminderId, userId);
      return prisma.applicationReminder.update({ where: { id: reminderId }, data });
    },
    async deleteReminder(reminderId, userId) {
      const row = await repo.findReminder(reminderId, userId);
      await prisma.applicationReminder.delete({ where: { id: reminderId } });
      return row;
    },

    // ── Interview rounds ───────────────────────────────────────────────────
    async listInterviews(applicationId, userId) {
      return prisma.applicationInterview.findMany({ where: { applicationId, userId }, orderBy: { scheduledAt: "asc" } });
    },
    async listInterviewsForUser(userId) {
      return prisma.applicationInterview.findMany({ where: { userId }, orderBy: { scheduledAt: "asc" } });
    },
    async createInterview(applicationId, userId, data) {
      return prisma.applicationInterview.create({ data: { applicationId, userId, ...data } });
    },
    async findInterview(interviewId, userId) {
      const row = await prisma.applicationInterview.findFirst({ where: { id: interviewId, userId } });
      if (!row) throw notFound("Interview not found.");
      return row;
    },
    async updateInterview(interviewId, userId, data) {
      await repo.findInterview(interviewId, userId);
      return prisma.applicationInterview.update({ where: { id: interviewId }, data });
    },
    async deleteInterview(interviewId, userId) {
      const row = await repo.findInterview(interviewId, userId);
      await prisma.applicationInterview.delete({ where: { id: interviewId } });
      return row;
    },

    // ── Cross-phase reads for the workspace ────────────────────────────────
    /** Everything the workspace shows, in one owner-scoped read. */
    async loadWorkspace(applicationId, userId) {
      const application = await prisma.jobApplication.findFirst({
        where: { id: applicationId, userId },
        include: {
          jobDescription: { select: { id: true, jobTitle: true, companyName: true, targetRole: true, description: true, sourceUrl: true, extractedRequirements: true } },
          resume: { select: { id: true, name: true, originalFileName: true } },
          analysis: { select: { id: true, matchScore: true, targetRole: true, createdAt: true } },
          savedJobs: { select: { id: true, externalJobId: true, jobDescriptionId: true, state: true, externalJob: true } },
        },
      });
      if (!application) throw notFound("Application not found.");

      const [checklist, coverLetters, documents, activity, reminders, interviews] = await Promise.all([
        repo.ensureChecklist(applicationId, userId),
        repo.listCoverLetters(applicationId, userId),
        repo.listDocuments(applicationId, userId),
        repo.listActivity(applicationId, userId, { limit: 100 }),
        repo.listReminders(userId, { applicationId }),
        repo.listInterviews(applicationId, userId),
      ]);

      return { application, checklist, coverLetters, documents, activity, reminders, interviews };
    },

    /** Resume versions the user can attach, newest first. */
    async listResumeVersions(userId) {
      return prisma.resumeVersion.findMany({
        where: { userId },
        orderBy: [{ isOriginal: "asc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, kind: true, isOriginal: true, jobDescriptionId: true, lastQualityScore: true, updatedAt: true },
      });
    },
    async findResumeVersion(versionId, userId) {
      const row = await prisma.resumeVersion.findFirst({ where: { id: versionId, userId } });
      if (!row) throw notFound("Resume version not found.");
      return row;
    },
    /** The stored Phase 12 match report for this job, if one exists. */
    async findMatchReport(userId, { jobDescriptionId = null, externalJobId = null }) {
      if (!jobDescriptionId && !externalJobId) return null;
      return prisma.jobMatchReport.findFirst({
        where: { userId, ...(externalJobId ? { externalJobId } : { jobDescriptionId }) },
        orderBy: { updatedAt: "desc" },
      });
    },
    /** Completed mock interviews for a role, for the readiness review. */
    async countMockInterviews(userId, targetRole) {
      const where = { userId, status: "completed" };
      if (targetRole) where.targetRole = { contains: targetRole, mode: "insensitive" };
      return prisma.interviewSession.count({ where });
    },
    async listMockSessions(userId) {
      return prisma.interviewSession.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, targetRole: true, interviewType: true, status: true, score: true, createdAt: true },
      });
    },
    /** Dedupe keys of notifications already created, for reminder delivery. */
    async notifiedKeys(userId, keys) {
      if (!keys.length) return new Set();
      const rows = await prisma.userNotification.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } });
      return new Set(rows.map((r) => r.dedupeKey));
    },

    /** Applications for the workspace dashboard, with the counts it filters on. */
    async listForDashboard(userId) {
      const applications = await prisma.jobApplication.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: {
          jobDescription: { select: { id: true, jobTitle: true, companyName: true } },
        },
      });
      const ids = applications.map((a) => a.id);
      if (!ids.length) return { applications, checklistItems: [], interviews: [], reminders: [], coverLetters: [] };
      const [checklistItems, interviews, reminders, coverLetters] = await Promise.all([
        prisma.applicationChecklistItem.findMany({ where: { userId, applicationId: { in: ids } }, select: { applicationId: true, isRequired: true, completedAt: true } }),
        prisma.applicationInterview.findMany({ where: { userId, applicationId: { in: ids } } }),
        prisma.applicationReminder.findMany({ where: { userId, status: "pending" } }),
        prisma.coverLetter.findMany({ where: { userId, applicationId: { in: ids } }, select: { id: true, applicationId: true, status: true } }),
      ]);
      return { applications, checklistItems, interviews, reminders, coverLetters };
    },
  };

  return repo;
}
