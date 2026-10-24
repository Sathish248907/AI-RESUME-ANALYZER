/**
 * resumeBuilderRepository.js — resume versions, AI improvement records and
 * template preferences. Every access is scoped by userId; the original
 * `Resume` row (file + extracted text) is only ever read here, never written.
 */
import { notFound, ApiError } from "../utils/errors.js";

const VERSION_LIST_SELECT = { id: true, userId: true, resumeId: true, jobDescriptionId: true, parentVersionId: true, name: true, versionNumber: true, kind: true, isOriginal: true, templateId: true, contentSource: true, targetJobTitle: true, targetCompany: true, lastQualityScore: true, createdAt: true, updatedAt: true };
const VERSION_INCLUDE = { resume: { select: { id: true, name: true, originalFileName: true } }, jobDescription: { select: { id: true, jobTitle: true, companyName: true } } };

export function createResumeBuilderRepository(prisma) {
  async function load(id, userId) {
    const row = await prisma.resumeVersion.findFirst({ where: { id, userId }, include: VERSION_INCLUDE });
    if (!row) throw notFound("Resume version not found.");
    return row;
  }

  return {
    findVersion: load,

    async nextVersionNumber(userId, resumeId) {
      const last = await prisma.resumeVersion.findFirst({ where: { userId, ...(resumeId ? { resumeId } : { resumeId: null }) }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      return (last?.versionNumber ?? 0) + 1;
    },

    async createVersion(userId, data) {
      const versionNumber = await this.nextVersionNumber(userId, data.resumeId ?? null);
      const created = await prisma.resumeVersion.create({ data: { userId, versionNumber, ...data } });
      return load(created.id, userId);
    },

    async listVersions(userId, { resumeId, page = 1, limit = 50 } = {}) {
      const where = { userId, ...(resumeId !== undefined ? { resumeId } : {}) };
      const [total, items] = await Promise.all([
        prisma.resumeVersion.count({ where }),
        prisma.resumeVersion.findMany({ where, select: { ...VERSION_LIST_SELECT, ...VERSION_INCLUDE }, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * limit, take: limit }),
      ]);
      return { total, items };
    },

    async updateVersion(id, userId, data) {
      const r = await prisma.resumeVersion.updateMany({ where: { id, userId }, data });
      if (r.count === 0) throw notFound("Resume version not found.");
      return load(id, userId);
    },

    async deleteVersion(id, userId) {
      const row = await load(id, userId);
      if (row.isOriginal) {
        const others = await prisma.resumeVersion.count({ where: { userId, resumeId: row.resumeId, id: { not: id } } });
        if (others > 0) throw new ApiError(409, "Delete the derived versions first; the original version is kept as the reference copy.", { code: "ORIGINAL_HAS_DERIVED" });
      }
      await prisma.resumeVersion.deleteMany({ where: { id, userId } });
    },

    /** The "original" version for an uploaded resume, if one has been created. */
    async findOriginalForResume(userId, resumeId) {
      return prisma.resumeVersion.findFirst({ where: { userId, resumeId, isOriginal: true }, include: VERSION_INCLUDE });
    },

    // ── Improvements ────────────────────────────────────────────────────────
    async createImprovements(versionId, batchId, suggestions) {
      if (!suggestions.length) return [];
      await prisma.resumeImprovement.createMany({
        data: suggestions.map((s) => ({
          versionId, batchId, mode: s.mode, sectionId: s.sectionId, entryId: s.entryId ?? null, field: s.field, category: s.category,
          suggestionGroup: s.group ?? null, priority: s.priority ?? "medium", title: s.title ?? null, issue: s.issue ?? null, benefit: s.benefit ?? null,
          originalText: s.originalText, suggestedText: s.suggestedText, rationale: s.rationale,
          needsConfirmation: Boolean(s.needsConfirmation), confirmationQuestion: s.confirmationQuestion ?? null,
        })),
      });
      return prisma.resumeImprovement.findMany({ where: { versionId, batchId }, orderBy: { createdAt: "asc" } });
    },

    async listImprovements(versionId, userId, { status, batchId, group, priority } = {}) {
      await load(versionId, userId);
      return prisma.resumeImprovement.findMany({
        where: { versionId, ...(status ? { status } : {}), ...(batchId ? { batchId } : {}), ...(group ? { suggestionGroup: group } : {}), ...(priority ? { priority } : {}) },
        orderBy: [{ createdAt: "desc" }],
      });
    },

    async getImprovement(id, userId) {
      const row = await prisma.resumeImprovement.findFirst({ where: { id }, include: { version: { select: { id: true, userId: true } } } });
      if (!row || row.version.userId !== userId) throw notFound("Suggestion not found.");
      return row;
    },

    async updateImprovement(id, data) {
      return prisma.resumeImprovement.update({ where: { id }, data });
    },

    /** Drop pending suggestions from older batches when a new batch is generated. */
    async clearPending(versionId, mode) {
      await prisma.resumeImprovement.deleteMany({ where: { versionId, mode, status: "pending" } });
    },

    // ── ATS assessments ─────────────────────────────────────────────────────
    /**
     * Store one assessment. The breakdown is stored with the score so a
     * historical number stays explainable by the weights that produced it.
     */
    async createAtsAssessment(userId, versionId, assessment, { jobDescriptionId = null } = {}) {
      await load(versionId, userId);
      return prisma.resumeAtsAssessment.create({
        data: {
          userId, versionId, jobDescriptionId,
          mode: assessment.mode, overallScore: assessment.overall, label: assessment.label,
          jobTitle: assessment.jobTitle ?? null, targetRole: assessment.targetRole ?? null, templateId: assessment.templateId ?? null,
          categories: assessment.categories, findings: assessment.actionPlan ?? assessment.findings ?? [],
          keywordCoverage: assessment.keywordCoverage ?? null, skills: assessment.skills ?? null,
          weights: assessment.weights, method: assessment.method,
        },
      });
    },

    /** Newest first. `mode` keeps general and job-specific runs as separate series. */
    async listAtsAssessments(userId, { versionId, mode, limit = 30 } = {}) {
      if (versionId) await load(versionId, userId);
      return prisma.resumeAtsAssessment.findMany({
        where: { userId, ...(versionId ? { versionId } : {}), ...(mode ? { mode } : {}) },
        select: { id: true, versionId: true, jobDescriptionId: true, mode: true, overallScore: true, label: true, jobTitle: true, targetRole: true, templateId: true, categories: true, keywordCoverage: true, method: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    },

    async findAtsAssessment(id, userId) {
      const row = await prisma.resumeAtsAssessment.findFirst({ where: { id, userId } });
      if (!row) throw notFound("ATS assessment not found.");
      return row;
    },

    // ── Role recommendations ────────────────────────────────────────────────
    async createRoleRecommendation(userId, versionId, result) {
      await load(versionId, userId);
      return prisma.resumeRoleRecommendation.create({
        data: { userId, versionId, roles: result.roles, careerLevel: result.careerLevel ?? null, method: result.method },
      });
    },

    async latestRoleRecommendation(userId, versionId) {
      await load(versionId, userId);
      return prisma.resumeRoleRecommendation.findFirst({ where: { userId, versionId }, orderBy: { createdAt: "desc" } });
    },

    async setSelectedRole(id, userId, selectedRole) {
      const r = await prisma.resumeRoleRecommendation.updateMany({ where: { id, userId }, data: { selectedRole } });
      if (r.count === 0) throw notFound("Role recommendation not found.");
      return prisma.resumeRoleRecommendation.findFirst({ where: { id, userId } });
    },

    // ── Template preference ─────────────────────────────────────────────────
    async getPreference(userId) {
      return prisma.resumeTemplatePreference.findFirst({ where: { userId } });
    },
    async savePreference(userId, { templateId, formatting }) {
      const existing = await prisma.resumeTemplatePreference.findFirst({ where: { userId } });
      if (existing) return prisma.resumeTemplatePreference.update({ where: { id: existing.id }, data: { templateId, formatting } });
      return prisma.resumeTemplatePreference.create({ data: { userId, templateId, formatting } });
    },
  };
}
