/**
 * analysisRepository.js — persistence for analyses (ResumeAnalysis), scoped to
 * the owning user. Every read/write takes the userId so ownership is enforced
 * at the data layer, not only in the controller. History is append-only:
 * regeneration creates a new row.
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
  resumeId: true,
  jobDescriptionId: true,
  createdAt: true,
  updatedAt: true,
  result: true, // needed for skill counts; stripped in serializeAnalysisListRow
  resume: { select: { id: true, name: true } },
  jobDescriptionRef: { select: { id: true, jobTitle: true, companyName: true } },
};

const SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  score_desc: { matchScore: "desc" },
  score_asc: { matchScore: "asc" },
};

/** @param {import("@prisma/client").PrismaClient} prisma */
export function createAnalysisRepository(prisma) {
  return {
    async create({ userId, payload, input, storeResumeText, resumeId = null, jobDescriptionId = null }) {
      return prisma.analysis.create({
        data: {
          userId,
          resumeId,
          jobDescriptionId,
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
          // When a Resume row is linked, its text is the source of truth; don't duplicate it.
          resumeText: storeResumeText && !resumeId ? input.resumeText : null,
        },
        include: { resume: { select: { id: true, name: true, extractedText: true } }, jobDescriptionRef: { select: { id: true, jobTitle: true, companyName: true } } },
      });
    },

    async findByIdForUser(id, userId) {
      const record = await prisma.analysis.findFirst({
        where: { id, userId },
        include: { resume: { select: { id: true, name: true, extractedText: true } }, jobDescriptionRef: { select: { id: true, jobTitle: true, companyName: true } } },
      });
      if (!record) throw notFound("Analysis not found.");
      return record;
    },

    async listForUser(userId, { targetRole, resumeId, jobDescriptionId, from, to, sort = "newest", page = 1, limit = 20, mode } = {}) {
      const where = {
        userId,
        ...(targetRole ? { targetRole } : {}),
        ...(resumeId ? { resumeId } : {}),
        ...(jobDescriptionId ? { jobDescriptionId } : {}),
        ...(mode ? { analysisMode: mode } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.analysis.count({ where }),
        prisma.analysis.findMany({ where, select: LIST_SELECT, orderBy: SORTS[sort] ?? SORTS.newest, skip: (page - 1) * limit, take: limit }),
      ]);
      return { total, items: rows.map(serializeAnalysisListRow) };
    },

    async deleteForUser(id, userId) {
      const result = await prisma.analysis.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Analysis not found.");
    },

    async countForUser(userId) {
      return prisma.analysis.count({ where: { userId } });
    },
  };
}

function skillCounts(result) {
  const r = result ?? {};
  return {
    matched: Array.isArray(r.matchedSkills) ? r.matchedSkills.length : 0,
    partial: Array.isArray(r.partiallyMatchedSkills) ? r.partiallyMatchedSkills.length : 0,
    missing: Array.isArray(r.missingOrUnverifiedSkills) ? r.missingOrUnverifiedSkills.length : 0,
  };
}

/** List row: metadata + skill counts, never the full result. */
export function serializeAnalysisListRow(row) {
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    targetRole: row.targetRole,
    companyName: row.companyName,
    fileName: row.fileName,
    resumeId: row.resumeId,
    resumeName: row.resume?.name ?? row.fileName ?? null,
    jobDescriptionId: row.jobDescriptionId,
    analysisMode: row.analysisMode,
    matchScore: row.matchScore,
    scoreAvailable: row.result?.matchScore !== null && row.result?.matchScore !== undefined,
    provider: row.provider,
    model: row.model,
    skillCounts: skillCounts(row.result),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Shape a DB row for API responses (never leak resumeText / extractedText). */
export function serializeAnalysis(record, { includeInputs = false } = {}) {
  return {
    id: record.id,
    jobTitle: record.jobTitle,
    targetRole: record.targetRole,
    companyName: record.companyName,
    fileName: record.fileName,
    resumeId: record.resumeId ?? null,
    resumeName: record.resume?.name ?? null,
    jobDescriptionId: record.jobDescriptionId ?? null,
    analysisMode: record.analysisMode,
    matchScore: record.matchScore,
    provider: record.provider,
    model: record.model,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    result: record.result,
    canRegenerate: Boolean(record.resumeText || record.resume?.extractedText),
    ...(includeInputs ? { jobDescription: record.jobDescription } : {}),
  };
}
