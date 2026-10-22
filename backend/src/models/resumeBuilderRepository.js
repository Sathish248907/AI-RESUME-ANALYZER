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
        data: suggestions.map((s) => ({ versionId, batchId, mode: s.mode, sectionId: s.sectionId, entryId: s.entryId ?? null, field: s.field, category: s.category, originalText: s.originalText, suggestedText: s.suggestedText, rationale: s.rationale, needsConfirmation: Boolean(s.needsConfirmation), confirmationQuestion: s.confirmationQuestion ?? null })),
      });
      return prisma.resumeImprovement.findMany({ where: { versionId, batchId }, orderBy: { createdAt: "asc" } });
    },

    async listImprovements(versionId, userId, { status, batchId } = {}) {
      await load(versionId, userId);
      return prisma.resumeImprovement.findMany({ where: { versionId, ...(status ? { status } : {}), ...(batchId ? { batchId } : {}) }, orderBy: [{ createdAt: "desc" }] });
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
