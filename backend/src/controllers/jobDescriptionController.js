import { serializeJobDescription } from "../models/jobDescriptionRepository.js";
import { pageMeta } from "../validators/common.js";

export function createJobDescriptionController({ repo }) {
  return {
    async create(req, res, next) {
      try {
        const row = await repo.create(req.user.id, req.body);
        res.status(201).json({ jobDescription: serializeJobDescription(row) });
      } catch (err) {
        next(err);
      }
    },
    async list(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await repo.listForUser(req.user.id, req.query);
        res.json({ jobDescriptions: items, ...pageMeta(page, limit, total) });
      } catch (err) {
        next(err);
      }
    },
    async getOne(req, res, next) {
      try {
        const row = await repo.findByIdForUser(req.params.id, req.user.id);
        res.json({ jobDescription: serializeJobDescription(row) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const row = await repo.update(req.params.id, req.user.id, req.body);
        res.json({ jobDescription: serializeJobDescription(row) });
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
