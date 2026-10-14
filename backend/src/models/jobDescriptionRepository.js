import { notFound } from "../utils/errors.js";

const SORTS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  title: { jobTitle: "asc" },
  company: { companyName: "asc" },
};

export function createJobDescriptionRepository(prisma) {
  return {
    async create(userId, data) {
      return prisma.jobDescription.create({ data: { userId, ...data } });
    },

    async listForUser(userId, { q, targetRole, sort = "newest", page = 1, limit = 20 } = {}) {
      const where = {
        userId,
        ...(targetRole ? { targetRole } : {}),
        ...(q
          ? { OR: [{ jobTitle: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { targetRole: { contains: q, mode: "insensitive" } }] }
          : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.jobDescription.count({ where }),
        prisma.jobDescription.findMany({
          where,
          select: {
            id: true, jobTitle: true, companyName: true, targetRole: true, sourceUrl: true, createdAt: true, updatedAt: true,
            description: true,
            extractedRequirements: true,
            _count: { select: { analyses: true, applications: true } },
          },
          orderBy: SORTS[sort] ?? SORTS.newest,
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return { total, items: rows.map(serializeJobDescription) };
    },

    async findByIdForUser(id, userId) {
      const row = await prisma.jobDescription.findFirst({
        where: { id, userId },
        include: {
          _count: { select: { analyses: true, applications: true } },
          analyses: {
            select: { id: true, matchScore: true, analysisMode: true, createdAt: true, resumeId: true, fileName: true, resume: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      });
      if (!row) throw notFound("Job description not found.");
      return row;
    },

    async update(id, userId, data) {
      const result = await prisma.jobDescription.updateMany({ where: { id, userId }, data });
      if (result.count === 0) throw notFound("Job description not found.");
      return prisma.jobDescription.findFirst({ where: { id, userId } });
    },

    /** Linked analyses and applications keep working with jobDescriptionId = null (SetNull). */
    async deleteForUser(id, userId) {
      const result = await prisma.jobDescription.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Job description not found.");
    },

    async countForUser(userId) {
      return prisma.jobDescription.count({ where: { userId } });
    },
  };
}

export function serializeJobDescription(row, { includeDescription = true } = {}) {
  const skills = Array.isArray(row.extractedRequirements?.skills) ? row.extractedRequirements.skills : [];
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    companyName: row.companyName,
    targetRole: row.targetRole,
    sourceUrl: row.sourceUrl,
    ...(includeDescription ? { description: row.description } : {}),
    descriptionPreview: (row.description ?? "").slice(0, 240),
    extractedRequirements: row.extractedRequirements ?? null,
    skillCount: skills.length,
    analysisCount: row._count?.analyses ?? 0,
    applicationCount: row._count?.applications ?? 0,
    analyses: Array.isArray(row.analyses)
      ? row.analyses.map((a) => ({ id: a.id, matchScore: a.matchScore, analysisMode: a.analysisMode, createdAt: a.createdAt, resumeId: a.resumeId, resumeName: a.resume?.name ?? a.fileName ?? null }))
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
