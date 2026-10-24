/**
 * progressRepository.js — Phase 10 persistence: progress snapshot loader (owner-scoped,
 * no resume / JD text), point ledger, gamification profile, achievements, goals, activity
 * events, progress reports and notifications. Unique constraints in the schema back every
 * "create if missing" below; P2002 races are swallowed as "already there".
 */
import { notFound } from "../utils/errors.js";

const ignoreDuplicate = (err) => { if (err?.code === "P2002") return null; throw err; };

export function createProgressRepository(prisma) {
  return {
    /** Everything the progress engines derive from. */
    async loadProgressSnapshot(userId) {
      const [profile, resumes, analyses, jobDescriptions, applications, interviews, skillGaps, roadmaps, versions, assessments, plans, gamification, transactions, achievements, goals, progressSnapshots] = await Promise.all([
        prisma.careerProfile.findFirst({ where: { userId } }),
        prisma.resume.findMany({ where: { userId }, select: { id: true, name: true, targetRole: true, createdAt: true } }),
        prisma.analysis.findMany({ where: { userId }, select: { id: true, jobTitle: true, companyName: true, targetRole: true, analysisMode: true, matchScore: true, resumeId: true, jobDescriptionId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.jobDescription.findMany({ where: { userId }, select: { id: true, jobTitle: true, companyName: true, targetRole: true } }),
        prisma.jobApplication.findMany({ where: { userId }, select: { id: true, companyName: true, jobTitle: true, status: true, applicationDate: true, nextFollowUpDate: true, jobDescriptionId: true, resumeId: true, analysisId: true, createdAt: true, updatedAt: true } }),
        prisma.interviewSession.findMany({ where: { userId }, select: { id: true, targetRole: true, interviewType: true, difficulty: true, status: true, score: true, source: true, questionCount: true, completedQuestionCount: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true, answers: { select: { id: true, questionId: true, status: true, score: true, evaluatedAt: true, evaluationResult: true } }, questions: { select: { id: true, topic: true, difficulty: true, questionType: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.skillGap.findMany({ where: { userId }, orderBy: [{ priorityScore: "desc" }] }),
        prisma.learningRoadmap.findMany({ where: { userId }, select: { id: true, title: true, targetRole: true, status: true, weeklyStudyHours: true, createdAt: true, milestones: { orderBy: { sequenceNumber: "asc" }, select: { id: true, sequenceNumber: true, title: true, status: true, prerequisiteSequences: true, completedAt: true, tasks: { orderBy: { sequenceNumber: "asc" }, select: { id: true, sequenceNumber: true, title: true, skillName: true, taskType: true, isRequired: true, estimatedMinutes: true, actualStudyMinutes: true, status: true, checkpoint: true, checkpointAttempts: true, completedAt: true, startedAt: true } } } } }, orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.resumeVersion.findMany({ where: { userId }, select: { id: true, name: true, resumeId: true, parentVersionId: true, kind: true, isOriginal: true, versionNumber: true, lastQualityScore: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
        prisma.careerAssessment.findMany({ where: { userId }, select: { id: true, targetRole: true, overallScore: true, readinessLabel: true, skills: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 60 }),
        prisma.careerActionPlan.findMany({ where: { userId }, select: { id: true, weekStart: true, weekEnd: true, status: true, tasks: { select: { id: true, title: true, category: true, isOptional: true, status: true, completedAt: true, sourceKey: true } } }, orderBy: { weekStart: "desc" }, take: 30 }),
        prisma.gamificationProfile.findFirst({ where: { userId } }),
        prisma.pointTransaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
        prisma.userAchievement.findMany({ where: { userId } }),
        prisma.userGoal.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
        prisma.careerProgressSnapshot.findMany({ where: { userId }, orderBy: { dayKey: "desc" }, take: 120 }),
      ]);
      return { profile, resumes, analyses, jobDescriptions, applications, interviews, skillGaps, roadmaps, versions, assessments, plans, gamification, transactions, achievements, goals, progressSnapshots };
    },

    // ── Gamification profile & ledger ───────────────────────────────────────
    async ensureProfile(userId, data = {}) {
      const existing = await prisma.gamificationProfile.findFirst({ where: { userId } });
      if (existing) return existing;
      return prisma.gamificationProfile.create({ data: { userId, ...data } }).catch(async (err) => { ignoreDuplicate(err); return prisma.gamificationProfile.findFirst({ where: { userId } }); });
    },
    async updateProfile(userId, data) {
      const p = await this.ensureProfile(userId);
      return prisma.gamificationProfile.update({ where: { id: p.id }, data });
    },
    async listTransactions(userId, { page = 1, limit = 20, eventType } = {}) {
      const where = { userId, ...(eventType ? { eventType } : {}) };
      const [total, items] = await Promise.all([prisma.pointTransaction.count({ where }), prisma.pointTransaction.findMany({ where, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit })]);
      return { total, items };
    },
    /** Apply planned transactions + achievement unlocks + activity rows + notifications atomically. */
    async applyLedger(userId, { transactions = [], achievements = [], activity = [], removeActivityKeys = [], notifications = [], profile = {} }) {
      const run = async (tx) => {
        for (const t of transactions) await tx.pointTransaction.create({ data: { userId, ...t } }).catch(ignoreDuplicate);
        for (const a of achievements) await tx.userAchievement.create({ data: { userId, ...a } }).catch(ignoreDuplicate);
        if (activity.length) {
          const existing = await tx.activityEvent.findMany({ where: { userId }, select: { eventKey: true, points: true, id: true } });
          const byKey = new Map(existing.map((e) => [e.eventKey, e]));
          for (const e of activity) {
            const row = byKey.get(e.eventKey);
            if (!row) await tx.activityEvent.create({ data: { userId, ...e } }).catch(ignoreDuplicate);
            else if (row.points !== e.points) await tx.activityEvent.update({ where: { id: row.id }, data: { points: e.points } });
          }
        }
        if (removeActivityKeys.length) await tx.activityEvent.deleteMany({ where: { userId, eventKey: { in: removeActivityKeys } } });
        for (const n of notifications) await tx.userNotification.create({ data: { userId, ...n } }).catch(ignoreDuplicate);
        const p = await tx.gamificationProfile.findFirst({ where: { userId } });
        if (p) await tx.gamificationProfile.update({ where: { id: p.id }, data: profile });
        else await tx.gamificationProfile.create({ data: { userId, ...profile } }).catch(ignoreDuplicate);
      };
      return prisma.$transaction(run, { maxWait: 15_000, timeout: 60_000 });
    },
    async listAchievements(userId) { return prisma.userAchievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" } }); },
    async listActivity(userId, { page = 1, limit = 20, category } = {}) {
      const where = { userId, ...(category ? { category } : {}) };
      const [total, items] = await Promise.all([prisma.activityEvent.count({ where }), prisma.activityEvent.findMany({ where, orderBy: [{ occurredAt: "desc" }], skip: (page - 1) * limit, take: limit })]);
      return { total, items };
    },

    // ── Progress snapshots ──────────────────────────────────────────────────
    async upsertProgressSnapshot(userId, dayKey, data) {
      const existing = await prisma.careerProgressSnapshot.findFirst({ where: { userId, dayKey } });
      if (existing) return prisma.careerProgressSnapshot.update({ where: { id: existing.id }, data });
      return prisma.careerProgressSnapshot.create({ data: { userId, dayKey, ...data } }).catch(async (err) => { ignoreDuplicate(err); return prisma.careerProgressSnapshot.findFirst({ where: { userId, dayKey } }); });
    },
    async listProgressSnapshots(userId, { limit = 90 } = {}) { return prisma.careerProgressSnapshot.findMany({ where: { userId }, orderBy: { dayKey: "desc" }, take: limit }); },

    // ── Goals ───────────────────────────────────────────────────────────────
    async listGoals(userId, { status } = {}) { return prisma.userGoal.findMany({ where: { userId, ...(status ? { status } : {}) }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }); },
    async createGoal(userId, data) { return prisma.userGoal.create({ data: { userId, ...data } }); },
    async findGoal(id, userId) { const g = await prisma.userGoal.findFirst({ where: { id, userId } }); if (!g) throw notFound("Goal not found."); return g; },
    async updateGoal(id, userId, data) { await this.findGoal(id, userId); return prisma.userGoal.update({ where: { id }, data }); },
    async deleteGoal(id, userId) { const r = await prisma.userGoal.deleteMany({ where: { id, userId } }); if (r.count === 0) throw notFound("Goal not found."); },

    // ── Reports ─────────────────────────────────────────────────────────────
    async findReportForPeriod(userId, periodType, periodStart) { return prisma.progressReport.findFirst({ where: { userId, periodType, periodStart } }); },
    async saveReport(userId, data) {
      const existing = await this.findReportForPeriod(userId, data.periodType, data.periodStart);
      if (existing) return prisma.progressReport.update({ where: { id: existing.id }, data });
      return prisma.progressReport.create({ data: { userId, ...data } }).catch(async (err) => { ignoreDuplicate(err); return prisma.progressReport.update({ where: { id: (await this.findReportForPeriod(userId, data.periodType, data.periodStart)).id }, data }); });
    },
    async listReports(userId, { page = 1, limit = 20, periodType } = {}) {
      const where = { userId, ...(periodType ? { periodType } : {}) };
      const [total, items] = await Promise.all([prisma.progressReport.count({ where }), prisma.progressReport.findMany({ where, orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit, select: { id: true, periodType: true, periodStart: true, periodEnd: true, aiUsed: true, method: true, createdAt: true, updatedAt: true, narrative: true } })]);
      return { total, items };
    },
    async findReport(id, userId) { const r = await prisma.progressReport.findFirst({ where: { id, userId } }); if (!r) throw notFound("Report not found."); return r; },

    // ── Notifications ───────────────────────────────────────────────────────
    async createNotification(userId, data) { return prisma.userNotification.create({ data: { userId, ...data } }).catch(ignoreDuplicate); },
    async listNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
      const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
      const [total, unread, items] = await Promise.all([prisma.userNotification.count({ where }), prisma.userNotification.count({ where: { userId, readAt: null } }), prisma.userNotification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit })]);
      return { total, unread, items };
    },
    async markRead(id, userId) { const r = await prisma.userNotification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } }); const row = await prisma.userNotification.findFirst({ where: { id, userId } }); if (!row) throw notFound("Notification not found."); return { row, changed: r.count }; },
    async markAllRead(userId) { return (await prisma.userNotification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count; },
  };
}
