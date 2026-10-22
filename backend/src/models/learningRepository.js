/**
 * learningRepository.js — roadmaps, milestones, tasks, resources, skill gaps and
 * recommendation dismissals. Ownership flows through LearningRoadmap.userId; every
 * task/milestone access resolves the owning roadmap first.
 */
import { notFound, ApiError } from "../utils/errors.js";

const ROADMAP_INCLUDE = {
  milestones: {
    orderBy: { sequenceNumber: "asc" },
    include: { tasks: { orderBy: { sequenceNumber: "asc" }, include: { resources: { orderBy: { createdAt: "asc" } } } } },
  },
};

/** Interactive-transaction budget: generation inserts ~50 rows against a remote database. */
const TX_OPTIONS = { maxWait: 15_000, timeout: 120_000 };

export function createLearningRepository(prisma) {
  async function loadRoadmap(id, userId) {
    const row = await prisma.learningRoadmap.findFirst({ where: { id, userId }, include: ROADMAP_INCLUDE });
    if (!row) throw notFound("Roadmap not found.");
    return row;
  }

  /**
   * Persist a generated roadmap (milestones → tasks → resources) in one transaction.
   * Rows are batched per milestone (createMany) so a hosted database with ~100 ms
   * round trips stays well inside the transaction timeout.
   */
  async function createRoadmap(userId, meta, generated) {
    return prisma.$transaction(async (tx) => {
      const roadmap = await tx.learningRoadmap.create({
        data: { userId, ...meta, title: generated.title, estimatedHours: generated.estimatedHours, estimatedWeeks: generated.estimatedWeeks, skillGapSummary: { summary: generated.skillGapSummary, overview: generated.summary, notes: generated.notes } },
      });
      for (const m of generated.milestones) {
        const milestone = await tx.roadmapMilestone.create({
          data: {
            roadmapId: roadmap.id, sequenceNumber: m.sequenceNumber, title: m.title, description: m.description, requiredSkills: m.requiredSkills, learningObjectives: m.learningObjectives,
            estimatedHours: m.estimatedHours, prerequisiteSequences: m.prerequisiteSequences, completionCriteria: m.completionCriteria,
          },
        });
        await tx.learningTask.createMany({
          data: m.tasks.map((t) => ({
            milestoneId: milestone.id, sequenceNumber: t.sequenceNumber, title: t.title, description: t.description, skillName: t.skillName, taskType: t.taskType, difficulty: t.difficulty,
            estimatedMinutes: t.estimatedMinutes, isRequired: t.isRequired, completionCriteria: t.completionCriteria, checkpoint: t.checkpoint ?? null,
            status: t.status ?? "not_started", completedAt: t.completedAt ?? null, notes: t.notes ?? null, actualStudyMinutes: t.actualStudyMinutes ?? 0,
          })),
        });
        const tasks = await tx.learningTask.findMany({ where: { milestoneId: milestone.id }, select: { id: true, sequenceNumber: true } });
        const idBySeq = new Map(tasks.map((t) => [t.sequenceNumber, t.id]));
        const resources = m.tasks.flatMap((t) => (t.resources ?? []).map((r) => ({ taskId: idBySeq.get(t.sequenceNumber), title: r.title, resourceType: r.resourceType, url: r.urlVerified ? r.url : null, urlVerified: Boolean(r.urlVerified && r.url), provider: r.provider, description: r.description, difficulty: r.difficulty })));
        if (resources.length) await tx.learningResource.createMany({ data: resources });
      }
      return tx.learningRoadmap.findFirst({ where: { id: roadmap.id }, include: ROADMAP_INCLUDE });
    }, TX_OPTIONS);
  }

  return {
    createRoadmap,
    findRoadmap: loadRoadmap,

    async listRoadmaps(userId, { status, page = 1, limit = 20 } = {}) {
      const where = { userId, ...(status ? { status } : {}) };
      const [total, items] = await Promise.all([
        prisma.learningRoadmap.count({ where }),
        prisma.learningRoadmap.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit, include: { milestones: { select: { id: true, status: true, sequenceNumber: true, prerequisiteSequences: true, tasks: { select: { id: true, status: true, isRequired: true, estimatedMinutes: true, actualStudyMinutes: true, completedAt: true } } } } } }),
      ]);
      return { total, items };
    },

    async activeRoadmap(userId) {
      return prisma.learningRoadmap.findFirst({ where: { userId, status: "active" }, orderBy: { createdAt: "desc" }, include: ROADMAP_INCLUDE });
    },

    async updateRoadmap(id, userId, data) {
      const r = await prisma.learningRoadmap.updateMany({ where: { id, userId }, data });
      if (r.count === 0) throw notFound("Roadmap not found.");
      return loadRoadmap(id, userId);
    },

    /** Mark previous active roadmaps superseded (keeps history) — used when a new version is created. */
    async supersedeActive(userId, exceptId) {
      await prisma.learningRoadmap.updateMany({ where: { userId, status: "active", ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { status: "superseded" } });
    },

    async deleteRoadmap(id, userId) {
      const r = await prisma.learningRoadmap.deleteMany({ where: { id, userId } });
      if (r.count === 0) throw notFound("Roadmap not found.");
    },

    /** Resolve a task with its milestone and (ownership-checked) roadmap. */
    async getTask(taskId, userId) {
      const task = await prisma.learningTask.findFirst({ where: { id: taskId }, include: { resources: true, milestone: { include: { roadmap: { select: { id: true, userId: true, status: true } } } } } });
      if (!task || task.milestone.roadmap.userId !== userId) throw notFound("Task not found.");
      return task;
    },

    async updateTask(taskId, userId, data) {
      const task = await this.getTask(taskId, userId);
      if (task.milestone.roadmap.status !== "active") throw new ApiError(409, "This roadmap is no longer active.", { code: "ROADMAP_INACTIVE" });
      const updated = await prisma.learningTask.update({ where: { id: task.id }, data, include: { resources: true } });
      await this.refreshMilestoneStatus(task.milestoneId);
      return updated;
    },

    /** Recompute a milestone's stored status from its tasks (prerequisite locking is derived at read time). */
    async refreshMilestoneStatus(milestoneId) {
      const tasks = await prisma.learningTask.findMany({ where: { milestoneId }, select: { status: true, isRequired: true } });
      const required = tasks.filter((t) => t.isRequired);
      const done = required.length > 0 && required.every((t) => t.status === "completed");
      const any = tasks.some((t) => t.status === "completed" || t.status === "in_progress" || t.status === "paused");
      await prisma.roadmapMilestone.updateMany({ where: { id: milestoneId }, data: done ? { status: "completed", completedAt: new Date() } : { status: any ? "in_progress" : "not_started", completedAt: null } });
    },

    async listTasks(roadmapId, userId, { status, milestoneId } = {}) {
      await loadRoadmap(roadmapId, userId);
      const rows = await prisma.learningTask.findMany({
        where: { milestone: { roadmapId }, ...(status ? { status } : {}), ...(milestoneId ? { milestoneId } : {}) },
        include: { resources: true, milestone: { select: { id: true, title: true, sequenceNumber: true } } },
      });
      return rows.sort((a, b) => a.milestone.sequenceNumber - b.milestone.sequenceNumber || a.sequenceNumber - b.sequenceNumber);
    },

    // ── Skill gaps ─────────────────────────────────────────────────────────
    /** Upsert the classified skills for a user; user-confirmed rows keep their status. */
    async replaceSkillGaps(userId, roadmapId, skills) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.skillGap.findMany({ where: { userId } });
        const byName = new Map(existing.map((e) => [e.skillName.toLowerCase(), e]));
        const out = [];
        for (const s of skills) {
          const prev = byName.get(s.skillName.toLowerCase());
          const data = {
            category: s.category, priority: s.priority, priorityScore: s.priorityScore, evidenceSources: s.evidenceSources, explanation: s.explanation, whyItMatters: s.whyItMatters,
            targetProficiency: s.targetProficiency, relatedTopics: s.relatedTopics, lastAssessedAt: new Date(), roadmapId,
            ...(prev?.userConfirmed ? {} : { proficiencyStatus: s.proficiencyStatus }),
          };
          out.push(prev ? await tx.skillGap.update({ where: { id: prev.id }, data }) : await tx.skillGap.create({ data: { userId, skillName: s.skillName, proficiencyStatus: s.proficiencyStatus, ...data } }));
        }
        return out;
      }, TX_OPTIONS);
    },

    async listSkillGaps(userId) {
      return prisma.skillGap.findMany({ where: { userId }, orderBy: [{ priorityScore: "desc" }, { skillName: "asc" }] });
    },

    async updateSkillGap(id, userId, data) {
      const r = await prisma.skillGap.updateMany({ where: { id, userId }, data });
      if (r.count === 0) throw notFound("Skill not found.");
      return prisma.skillGap.findFirst({ where: { id, userId } });
    },

    // ── Dismissals ─────────────────────────────────────────────────────────
    async dismissedKeys(userId) {
      const rows = await prisma.recommendationDismissal.findMany({ where: { userId }, select: { recommendationKey: true } });
      return rows.map((r) => r.recommendationKey);
    },

    async dismiss(userId, key) {
      const existing = await prisma.recommendationDismissal.findFirst({ where: { userId, recommendationKey: key } });
      if (existing) return existing;
      return prisma.recommendationDismissal.create({ data: { userId, recommendationKey: key } });
    },
  };
}
