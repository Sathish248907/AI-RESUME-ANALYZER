import { pageMeta } from "../validators/common.js";

export function createInterviewController({ repo }) {
  return {
    /** POST /api/interviews — record a practice session (e.g. questions practised from an analysis). */
    async create(req, res, next) {
      try {
        const data = { ...req.body };
        if (data.status === "completed" && !data.completedAt) data.completedAt = new Date();
        const row = await repo.create(req.user.id, data);
        res.status(201).json({ session: row });
      } catch (err) {
        next(err);
      }
    },
    /** GET /api/interviews/history */
    async history(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await repo.listForUser(req.user.id, req.query);
        const completed = items.filter((s) => s.status === "completed");
        res.json({
          sessions: items,
          summary: {
            completed: completed.length,
            questionsPracticed: completed.reduce((s, i) => s + (i.completedQuestionCount ?? 0), 0),
          },
          ...pageMeta(page, limit, total),
        });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const data = { ...req.body };
        if (data.status === "completed") data.completedAt = new Date();
        const row = await repo.update(req.params.id, req.user.id, data);
        res.json({ session: row });
      } catch (err) {
        next(err);
      }
    },
    async remove(req, res, next) {
      try {
        await repo.deleteForUser(req.params.id, req.user.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
