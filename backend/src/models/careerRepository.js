/**
 * careerRepository.js — career profile, assessments, recommendations, weekly
 * action plans/tasks and coach conversations, plus `loadSnapshot`, the single
 * owner-scoped read of every record the career engines derive from.
 * Resume text and job-description text are never loaded into the snapshot.
 */
import { notFound } from "../utils/errors.js";

export function createCareerRepository(prisma) {
  return {
    // ── Snapshot ────────────────────────────────────────────────────────────
    async loadSnapshot(userId) {
      const [profile, resumes, analyses, jobDescriptions, applications, interviews, skillGaps, roadmap, versions, assessments] = await Promise.all([
        prisma.careerProfile.findFirst({ where: { userId } }),
        prisma.resume.findMany({ where: { userId }, select: { id: true, name: true, targetRole: true, createdAt: true } }),
        prisma.analysis.findMany({ where: { userId }, select: { id: true, jobTitle: true, companyName: true, targetRole: true, analysisMode: true, matchScore: true, resumeId: true, jobDescriptionId: true, createdAt: true, result: true }, orderBy: { createdAt: "desc" }, take: 50 }),
        prisma.jobDescription.findMany({ where: { userId }, select: { id: true, jobTitle: true, companyName: true, targetRole: true, extractedRequirements: true, createdAt: true, updatedAt: true } }),
        prisma.jobApplication.findMany({ where: { userId }, select: { id: true, companyName: true, jobTitle: true, status: true, applicationDate: true, nextFollowUpDate: true, jobDescriptionId: true, resumeId: true, analysisId: true, notes: true, updatedAt: true, createdAt: true } }),
        prisma.interviewSession.findMany({ where: { userId, source: "mock_interview" }, include: { answers: { where: { status: { in: ["evaluated", "insufficient"] } }, select: { id: true, questionId: true, status: true, score: true, evaluationResult: true, evaluatedAt: true, updatedAt: true } }, questions: { select: { id: true, topic: true, difficulty: true, questionType: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
        prisma.skillGap.findMany({ where: { userId }, orderBy: [{ priorityScore: "desc" }] }),
        prisma.learningRoadmap.findFirst({ where: { userId, status: "active" }, orderBy: { createdAt: "desc" }, include: { milestones: { orderBy: { sequenceNumber: "asc" }, include: { tasks: { orderBy: { sequenceNumber: "asc" } } } } } }),
        prisma.resumeVersion.findMany({ where: { userId }, select: { id: true, name: true, resumeId: true, jobDescriptionId: true, kind: true, isOriginal: true, targetJobTitle: true, lastQualityScore: true, content: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
        prisma.careerAssessment.findMany({ where: { userId }, select: { id: true, targetRole: true, overallScore: true, readinessLabel: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 }),
      ]);
      return { profile, resumes, analyses, jobDescriptions, applications, interviews, skillGaps, roadmap, versions, assessments };
    },

    // ── Profile ─────────────────────────────────────────────────────────────
    async getProfile(userId) { return prisma.careerProfile.findFirst({ where: { userId } }); },
    async upsertProfile(userId, data) {
      const existing = await prisma.careerProfile.findFirst({ where: { userId } });
      if (existing) return prisma.careerProfile.update({ where: { id: existing.id }, data });
      return prisma.careerProfile.create({ data: { userId, ...data } });
    },

    // ── Assessments ─────────────────────────────────────────────────────────
    async createAssessment(userId, data) { return prisma.careerAssessment.create({ data: { userId, ...data } }); },
    async listAssessments(userId, { targetRole, limit = 30 } = {}) {
      return prisma.careerAssessment.findMany({ where: { userId, ...(targetRole ? { targetRole } : {}) }, select: { id: true, targetRole: true, overallScore: true, readinessLabel: true, method: true, createdAt: true, components: true }, orderBy: { createdAt: "desc" }, take: limit });
    },
    async findAssessment(id, userId) {
      const row = await prisma.careerAssessment.findFirst({ where: { id, userId } });
      if (!row) throw notFound("Assessment not found.");
      return row;
    },
    async latestAssessment(userId, targetRole) {
      return prisma.careerAssessment.findFirst({ where: { userId, ...(targetRole ? { targetRole } : {}) }, orderBy: { createdAt: "desc" } });
    },

    // ── Recommendations (upsert by key, keep completion state) ──────────────
    /**
     * Writes the current recommendation set in two round trips, not 1+N+M.
     *
     * The previous version awaited one update or create per recommendation and
     * then one more per item being closed. Against a remote database that is a
     * separate network round trip each time - roughly 200ms apiece on a Neon
     * endpoint in another region - so a twelve-item refresh spent seconds
     * almost entirely in transit. Building the operations first and handing
     * them to `$transaction` sends them as one batch, and makes the write
     * atomic: a failure midway no longer leaves half the set rewritten.
     */
    async syncRecommendations(userId, assessmentId, recs) {
      const existing = await prisma.careerRecommendation.findMany({ where: { userId } });
      const byKey = new Map(existing.map((r) => [r.key, r]));
      const keep = recs.map((r) => r.key);

      const ops = recs.map((r) => {
        const prev = byKey.get(r.key);
        const data = { assessmentId: assessmentId ?? prev?.assessmentId ?? null, type: r.type, title: r.title, explanation: r.explanation, reason: r.reason, evidence: r.evidence, priority: r.priority, effortMinutes: r.effortMinutes ?? null, href: r.href };
        return prev
          ? prisma.careerRecommendation.update({ where: { id: prev.id }, data })
          : prisma.careerRecommendation.create({ data: { userId, key: r.key, ...data } });
      });

      // Open recommendations that no longer apply are closed in one statement
      // (done/dismissed history is kept). An empty `recs` closes every open
      // item, which is what "nothing applies any more" should mean.
      const stale = existing.filter((r) => r.status === "open" && !keep.includes(r.key));
      if (stale.length > 0) {
        ops.push(prisma.careerRecommendation.updateMany({
          where: { userId, id: { in: stale.map((r) => r.id) } },
          data: { status: "done", completedAt: new Date() },
        }));
      }

      const results = await prisma.$transaction(ops);
      return results.slice(0, recs.length);
    },
    /** Reopen several recommendations at once; one round trip, not one each. */
    async reopenRecommendations(userId, ids) {
      if (!ids || ids.length === 0) return 0;
      const r = await prisma.careerRecommendation.updateMany({
        where: { userId, id: { in: ids } },
        data: { status: "open", completedAt: null },
      });
      return r.count;
    },
    async listRecommendations(userId, { status } = {}) {
      return prisma.careerRecommendation.findMany({ where: { userId, ...(status ? { status } : {}) }, orderBy: [{ status: "asc" }, { priority: "asc" }, { updatedAt: "desc" }] });
    },
    async updateRecommendation(id, userId, data) {
      const r = await prisma.careerRecommendation.updateMany({ where: { id, userId }, data });
      if (r.count === 0) throw notFound("Recommendation not found.");
      return prisma.careerRecommendation.findFirst({ where: { id, userId } });
    },

    // ── Action plans ────────────────────────────────────────────────────────
    async currentPlan(userId) {
      return prisma.careerActionPlan.findFirst({ where: { userId, status: "active" }, orderBy: { weekStart: "desc" }, include: { tasks: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] } } });
    },
    async listPlans(userId, { limit = 12 } = {}) {
      return prisma.careerActionPlan.findMany({ where: { userId }, orderBy: { weekStart: "desc" }, take: limit, include: { tasks: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] } } });
    },
    async createPlan(userId, meta, tasks) {
      const plan = await prisma.careerActionPlan.create({ data: { userId, ...meta } });
      if (tasks.length) await prisma.careerActionTask.createMany({ data: tasks.map((t) => ({ planId: plan.id, userId, ...t })) });
      return prisma.careerActionPlan.findFirst({ where: { id: plan.id }, include: { tasks: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] } } });
    },
    async archivePlans(userId, exceptId) {
      await prisma.careerActionPlan.updateMany({ where: { userId, status: "active", ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { status: "archived" } });
    },
    async getTask(id, userId) {
      const t = await prisma.careerActionTask.findFirst({ where: { id, userId } });
      if (!t) throw notFound("Task not found.");
      return t;
    },
    async updateTask(id, userId, data) {
      await this.getTask(id, userId);
      return prisma.careerActionTask.update({ where: { id }, data });
    },
    async addTask(planId, userId, data) {
      const plan = await prisma.careerActionPlan.findFirst({ where: { id: planId, userId } });
      if (!plan) throw notFound("Plan not found.");
      return prisma.careerActionTask.create({ data: { planId, userId, ...data } });
    },
    async deleteTask(id, userId) {
      const r = await prisma.careerActionTask.deleteMany({ where: { id, userId } });
      if (r.count === 0) throw notFound("Task not found.");
    },
    async tasksInRange(userId, from, to) {
      return prisma.careerActionTask.findMany({ where: { userId, dueDate: { gte: from, lte: to } }, orderBy: { dueDate: "asc" } });
    },

    // ── Coach conversations ─────────────────────────────────────────────────
    async createConversation(userId, title) { return prisma.careerCoachConversation.create({ data: { userId, title } }); },
    async listConversations(userId) {
      return prisma.careerCoachConversation.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50, include: { _count: { select: { messages: true } } } });
    },
    async findConversation(id, userId) {
      const c = await prisma.careerCoachConversation.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
      if (!c) throw notFound("Conversation not found.");
      return c;
    },
    async addMessage(conversationId, data) {
      const m = await prisma.careerCoachMessage.create({ data: { conversationId, ...data } });
      await prisma.careerCoachConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      return m;
    },
    async renameConversation(id, userId, title) {
      const r = await prisma.careerCoachConversation.updateMany({ where: { id, userId }, data: { title } });
      if (r.count === 0) throw notFound("Conversation not found.");
    },
    async deleteConversation(id, userId) {
      const r = await prisma.careerCoachConversation.deleteMany({ where: { id, userId } });
      if (r.count === 0) throw notFound("Conversation not found.");
    },
  };
}
