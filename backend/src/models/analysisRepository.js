/**
 * analysisRepository.js — persistence for analyses, scoped to the owning user.
 * Every read/write takes the userId so ownership is enforced at the data layer,
 * not only in the controller.
 */
import { notFound } from "../utils/errors.js";

const LIST_SELECT = {
  id: true,
  jobTitle: true,
  targetRole: true,
  companyName: true,
  fileName: true,
  analysisMode: true,
  matchScore: true,
  provider: true,
  model: true,
  createdAt: true,
  updatedAt: true,
};

/** @param {import("@prisma/client").PrismaClient} prisma */
export function createAnalysisRepository(prisma) {
  return {
    async create({ userId, payload, input, storeResumeText }) {
      return prisma.analysis.create({
        data: {
          userId,
          jobTitle: input.jobTitle,
          targetRole: input.targetRole,
          companyName: input.companyName ?? null,
          fileName: input.fileName ?? null,
          analysisMode: payload.analysisMode,
          matchScore: payload.matchScore ?? 0,
          provider: payload.provider ?? null,
          model: payload.model ?? null,
          result: payload,
          jobDescription: input.jobDescription,
          resumeText: storeResumeText ? input.resumeText : null,
        },
      });
    },

    async findByIdForUser(id, userId) {
      const record = await prisma.analysis.findFirst({ where: { id, userId } });
      if (!record) throw notFound("Analysis not found.");
      return record;
    },

    async listForUser(userId, { limit = 50, cursor } = {}) {
      const rows = await prisma.analysis.findMany({
        where: { userId },
        select: LIST_SELECT,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
    },

    async deleteForUser(id, userId) {
      const result = await prisma.analysis.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Analysis not found.");
    },

    async replaceResult(id, userId, { payload, storeResumeText, input }) {
      const result = await prisma.analysis.updateMany({
        where: { id, userId },
        data: {
          analysisMode: payload.analysisMode,
          matchScore: payload.matchScore ?? 0,
          provider: payload.provider ?? null,
          model: payload.model ?? null,
          result: payload,
          ...(input ? { jobDescription: input.jobDescription, resumeText: storeResumeText ? input.resumeText : null } : {}),
        },
      });
      if (result.count === 0) throw notFound("Analysis not found.");
      return prisma.analysis.findFirst({ where: { id, userId } });
    },

    async countForUser(userId) {
      return prisma.analysis.count({ where: { userId } });
    },
  };
}

/** Shape a DB row for API responses (never leak resumeText). */
export function serializeAnalysis(record, { includeInputs = false } = {}) {
  return {
    id: record.id,
    jobTitle: record.jobTitle,
    targetRole: record.targetRole,
    companyName: record.companyName,
    fileName: record.fileName,
    analysisMode: record.analysisMode,
    matchScore: record.matchScore,
    provider: record.provider,
    model: record.model,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    result: record.result,
    canRegenerate: Boolean(record.resumeText),
    ...(includeInputs ? { jobDescription: record.jobDescription } : {}),
  };
}
