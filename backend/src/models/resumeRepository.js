/**
 * resumeRepository.js — resumes scoped to their owner. `extractedText` is only
 * returned by `findByIdForUser` (detail view / reanalysis), never in lists.
 */
import { notFound } from "../utils/errors.js";

const LIST_SELECT = {
  id: true,
  name: true,
  originalFileName: true,
  fileType: true,
  fileSize: true,
  charCount: true,
  targetRole: true,
  storageKey: true,
  createdAt: true,
  updatedAt: true,
};

const SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  name: { name: "asc" },
  role: { targetRole: "asc" },
};

export function createResumeRepository(prisma) {
  return {
    async create({ userId, name, originalFileName, fileType, fileSize, charCount, extractedText, targetRole, storageKey }) {
      return prisma.resume.create({
        data: { userId, name, originalFileName, fileType, fileSize, charCount, extractedText, targetRole: targetRole ?? null, storageKey: storageKey ?? null },
      });
    },

    async listForUser(userId, { q, targetRole, sort = "newest", page = 1, limit = 20 } = {}) {
      const where = {
        userId,
        ...(targetRole ? { targetRole } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { originalFileName: { contains: q, mode: "insensitive" } }] } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.resume.count({ where }),
        prisma.resume.findMany({
          where,
          select: {
            ...LIST_SELECT,
            analyses: { select: { id: true, matchScore: true, analysisMode: true, jobTitle: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
            _count: { select: { analyses: true, applications: true } },
          },
          orderBy: SORTS[sort] ?? SORTS.newest,
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { total, items: rows.map(serializeResumeListRow) };
    },

    async findByIdForUser(id, userId) {
      const row = await prisma.resume.findFirst({ where: { id, userId } });
      if (!row) throw notFound("Resume not found.");
      return row;
    },

    async update(id, userId, data) {
      const result = await prisma.resume.updateMany({ where: { id, userId }, data });
      if (result.count === 0) throw notFound("Resume not found.");
      return prisma.resume.findFirst({ where: { id, userId } });
    },

    /** Deletes the row; linked analyses/applications keep their history with resumeId = null (SetNull). */
    async deleteForUser(id, userId) {
      const row = await prisma.resume.findFirst({ where: { id, userId }, select: { id: true, storageKey: true } });
      if (!row) throw notFound("Resume not found.");
      await prisma.resume.delete({ where: { id: row.id } });
      return row;
    },

    async countForUser(userId) {
      return prisma.resume.count({ where: { userId } });
    },
  };
}

export function serializeResumeListRow(row) {
  const latest = Array.isArray(row.analyses) && row.analyses.length ? row.analyses[0] : null;
  return {
    id: row.id,
    name: row.name,
    originalFileName: row.originalFileName,
    fileType: row.fileType,
    fileSize: row.fileSize,
    charCount: row.charCount,
    targetRole: row.targetRole,
    hasStoredFile: Boolean(row.storageKey),
    analysisCount: row._count?.analyses ?? 0,
    applicationCount: row._count?.applications ?? 0,
    latestAnalysis: latest ? { id: latest.id, matchScore: latest.matchScore, analysisMode: latest.analysisMode, jobTitle: latest.jobTitle, createdAt: latest.createdAt } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Detail view: includes a short preview of the text, never the full text. */
export function serializeResumeDetail(row) {
  return {
    id: row.id,
    name: row.name,
    originalFileName: row.originalFileName,
    fileType: row.fileType,
    fileSize: row.fileSize,
    charCount: row.charCount,
    targetRole: row.targetRole,
    hasStoredFile: Boolean(row.storageKey),
    textPreview: (row.extractedText ?? "").slice(0, 600),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
