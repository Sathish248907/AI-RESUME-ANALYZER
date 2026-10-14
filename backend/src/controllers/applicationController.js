import { serializeApplication } from "../models/applicationRepository.js";
import { pageMeta } from "../validators/common.js";

export function createApplicationController({ repo }) {
  return {
    async create(req, res, next) {
      try {
        const row = await repo.create(req.user.id, req.body);
        res.status(201).json({ application: serializeApplication(row) });
      } catch (err) {
        next(err);
      }
    },
    async list(req, res, next) {
      try {
        const { page, limit } = req.query;
        const [{ total, items }, pipeline] = await Promise.all([repo.listForUser(req.user.id, req.query), repo.pipelineForUser(req.user.id)]);
        res.json({ applications: items, pipeline, ...pageMeta(page, limit, total) });
      } catch (err) {
        next(err);
      }
    },
    async pipeline(req, res, next) {
      try {
        res.json({ pipeline: await repo.pipelineForUser(req.user.id) });
      } catch (err) {
        next(err);
      }
    },
    async getOne(req, res, next) {
      try {
        const row = await repo.findByIdForUser(req.params.id, req.user.id);
        res.json({ application: serializeApplication(row) });
      } catch (err) {
        next(err);
      }
    },
    async update(req, res, next) {
      try {
        const row = await repo.update(req.params.id, req.user.id, req.body);
        res.json({ application: serializeApplication(row) });
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
