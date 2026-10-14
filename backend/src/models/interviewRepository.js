import { notFound } from "../utils/errors.js";

export const INTERVIEW_TYPES = ["technical", "behavioral", "project", "mixed"];
export const INTERVIEW_STATUSES = ["in_progress", "completed", "abandoned"];

export function createInterviewRepository(prisma) {
  return {
    async create(userId, data) {
      return prisma.interviewSession.create({ data: { userId, ...data } });
    },

    async listForUser(userId, { status, from, to, page = 1, limit = 20 } = {}) {
      const where = {
        userId,
        ...(status ? { status } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.interviewSession.count({ where }),
        prisma.interviewSession.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      ]);
      return { total, items };
    },

    async findByIdForUser(id, userId) {
      const row = await prisma.interviewSession.findFirst({ where: { id, userId } });
      if (!row) throw notFound("Interview session not found.");
      return row;
    },

    async update(id, userId, data) {
      const result = await prisma.interviewSession.updateMany({ where: { id, userId }, data });
      if (result.count === 0) throw notFound("Interview session not found.");
      return prisma.interviewSession.findFirst({ where: { id, userId } });
    },

    async deleteForUser(id, userId) {
      const result = await prisma.interviewSession.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Interview session not found.");
    },
  };
}
