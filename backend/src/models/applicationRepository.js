import { notFound, badRequest } from "../utils/errors.js";

export const APPLICATION_STATUSES = ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
/** Statuses that count as "active" (still in play). */
export const ACTIVE_STATUSES = ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"];

const INCLUDE = {
  jobDescription: { select: { id: true, jobTitle: true, companyName: true, targetRole: true } },
  resume: { select: { id: true, name: true } },
  analysis: { select: { id: true, matchScore: true, analysisMode: true, jobTitle: true } },
};

const SORTS = {
  newest: { applicationDate: "desc" },
  oldest: { applicationDate: "asc" },
  company: { companyName: "asc" },
  followUp: { nextFollowUpDate: "asc" },
  updated: { updatedAt: "desc" },
};

export function createApplicationRepository(prisma) {
  /** Verify that optional linked records belong to the same user. */
  async function assertLinksOwned(userId, { jobDescriptionId, resumeId, analysisId }) {
    const checks = [];
    if (jobDescriptionId) checks.push(prisma.jobDescription.findFirst({ where: { id: jobDescriptionId, userId }, select: { id: true } }).then((r) => [r, "jobDescriptionId"]));
    if (resumeId) checks.push(prisma.resume.findFirst({ where: { id: resumeId, userId }, select: { id: true } }).then((r) => [r, "resumeId"]));
    if (analysisId) checks.push(prisma.analysis.findFirst({ where: { id: analysisId, userId }, select: { id: true } }).then((r) => [r, "analysisId"]));
    for (const [row, field] of await Promise.all(checks)) {
      if (!row) throw badRequest(`Linked record for ${field} was not found.`, [{ field, message: "Not found or not owned by you." }]);
    }
  }

  return {
    async create(userId, data) {
      await assertLinksOwned(userId, data);
      return prisma.jobApplication.create({ data: { userId, ...data }, include: INCLUDE });
    },

    async listForUser(userId, { q, status, targetRole, from, to, sort = "newest", page = 1, limit = 20 } = {}) {
      const where = {
        userId,
        ...(status ? { status: Array.isArray(status) ? { in: status } : status } : {}),
        ...(targetRole ? { jobDescription: { targetRole } } : {}),
        ...(from || to ? { applicationDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(q ? { OR: [{ companyName: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }] } : {}),
      };
      const scoreSort = sort === "score";
      const [total, rows] = await Promise.all([
        prisma.jobApplication.count({ where }),
        prisma.jobApplication.findMany({
          where,
          include: INCLUDE,
          orderBy: scoreSort ? SORTS.newest : SORTS[sort] ?? SORTS.newest,
          ...(scoreSort ? {} : { skip: (page - 1) * limit, take: limit }),
        }),
      ]);
      let items = rows;
      if (scoreSort) {
        items = [...rows].sort((a, b) => (b.analysis?.matchScore ?? -1) - (a.analysis?.matchScore ?? -1)).slice((page - 1) * limit, page * limit);
      }
      return { total, items: items.map(serializeApplication) };
    },

    async findByIdForUser(id, userId) {
      const row = await prisma.jobApplication.findFirst({ where: { id, userId }, include: INCLUDE });
      if (!row) throw notFound("Application not found.");
      return row;
    },

    async update(id, userId, data) {
      await assertLinksOwned(userId, data);
      const result = await prisma.jobApplication.updateMany({ where: { id, userId }, data });
      if (result.count === 0) throw notFound("Application not found.");
      return prisma.jobApplication.findFirst({ where: { id, userId }, include: INCLUDE });
    },

    async deleteForUser(id, userId) {
      const result = await prisma.jobApplication.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Application not found.");
    },

    /** Counts per status for the pipeline view. */
    async pipelineForUser(userId) {
      const rows = await prisma.jobApplication.findMany({ where: { userId }, select: { status: true } });
      const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
      for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
      return { total: rows.length, active: ACTIVE_STATUSES.reduce((s, k) => s + counts[k], 0), counts };
    },
  };
}

export function serializeApplication(row) {
  return {
    id: row.id,
    companyName: row.companyName,
    jobTitle: row.jobTitle,
    jobUrl: row.jobUrl,
    applicationDate: row.applicationDate,
    status: row.status,
    nextFollowUpDate: row.nextFollowUpDate,
    notes: row.notes,
    jobDescriptionId: row.jobDescriptionId,
    resumeId: row.resumeId,
    analysisId: row.analysisId,
    jobDescription: row.jobDescription ?? null,
    resume: row.resume ?? null,
    analysis: row.analysis ?? null,
    matchScore: row.analysis?.matchScore ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
