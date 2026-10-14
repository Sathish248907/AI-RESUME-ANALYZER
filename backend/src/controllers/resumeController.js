import { extractResumeText } from "../services/resume/resumeParserService.js";
import { serializeResumeDetail } from "../models/resumeRepository.js";
import { pageMeta } from "../validators/common.js";
import { logger } from "../utils/logger.js";

/**
 * @param {{ resumeRepo, analysisRepo, storage }} deps
 */
export function createResumeController({ resumeRepo, analysisRepo, storage }) {
  return {
    /** POST /api/resume/parse — stateless parse (no account needed; used by demo mode). */
    async parse(req, res, next) {
      try {
        const { text, charCount, mimeType } = await extractResumeText(req.file);
        res.json({ text, charCount, mimeType, fileName: req.file.originalname, fileSize: req.file.size });
      } catch (err) {
        next(err);
      }
    },

    /** POST /api/resumes — upload, parse and store a resume for the signed-in user. */
    async upload(req, res, next) {
      let storageKey = null;
      try {
        const { text, charCount, mimeType } = await extractResumeText(req.file);
        storageKey = await storage.save(req.file.buffer, mimeType);
        const name = (req.body?.name || req.file.originalname.replace(/\.(pdf|docx|doc)$/i, "")).slice(0, 120);
        const record = await resumeRepo.create({
          userId: req.user.id,
          name,
          originalFileName: req.file.originalname.slice(0, 255),
          fileType: mimeType,
          fileSize: req.file.size,
          charCount,
          extractedText: text,
          targetRole: req.body?.targetRole || null,
          storageKey,
        });
        res.status(201).json({ resume: serializeResumeDetail(record) });
      } catch (err) {
        if (storageKey) await storage.remove(storageKey).catch(() => {});
        next(err);
      }
    },

    /** GET /api/resumes */
    async list(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await resumeRepo.listForUser(req.user.id, req.query);
        res.json({ resumes: items, ...pageMeta(page, limit, total) });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/resumes/:id — detail + its analysis history. */
    async getOne(req, res, next) {
      try {
        const row = await resumeRepo.findByIdForUser(req.params.id, req.user.id);
        const { items } = await analysisRepo.listForUser(req.user.id, { resumeId: row.id, limit: 50, page: 1, sort: "newest" });
        res.json({ resume: serializeResumeDetail(row), analyses: items });
      } catch (err) {
        next(err);
      }
    },

    /** PATCH /api/resumes/:id — rename / set target role. */
    async update(req, res, next) {
      try {
        const row = await resumeRepo.update(req.params.id, req.user.id, req.body);
        res.json({ resume: serializeResumeDetail(row) });
      } catch (err) {
        next(err);
      }
    },

    /** DELETE /api/resumes/:id — removes the row (history keeps resumeId = null) and the stored file. */
    async remove(req, res, next) {
      try {
        const row = await resumeRepo.deleteForUser(req.params.id, req.user.id);
        if (row.storageKey) {
          storage.remove(row.storageKey).catch((e) => logger.warn("stored file cleanup failed", { message: e?.message }));
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/resumes/:id/download — original file, owner only, only when a storage driver retains files. */
    async download(req, res, next) {
      try {
        const row = await resumeRepo.findByIdForUser(req.params.id, req.user.id);
        const { stream, size } = await storage.getStream(row.storageKey);
        res.setHeader("Content-Type", row.fileType);
        res.setHeader("Content-Length", size);
        res.setHeader("Content-Disposition", `attachment; filename="${row.originalFileName.replace(/[^\w.\- ]/g, "_")}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        stream.pipe(res);
      } catch (err) {
        next(err);
      }
    },
  };
}
