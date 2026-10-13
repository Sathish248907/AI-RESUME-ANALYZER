import { ApiError } from "../utils/errors.js";
import { analyzeResume } from "../services/resumeAnalysisService.js";
import { serializeAnalysis } from "../services/analysisRepository.js";

/**
 * @param {{ repo: ReturnType<import("../services/analysisRepository.js").createAnalysisRepository>,
 *           getLlm: () => { generateStructured: Function, name: string, model: string },
 *           storeResumeText: boolean }} deps
 */
export function createAnalysisController({ repo, getLlm, storeResumeText }) {
  return {
    /** POST /api/analysis/resume */
    async analyze(req, res, next) {
      try {
        const llm = getLlm(); // throws 503 ApiError when the provider is not configured
        const { payload, input } = await analyzeResume(llm, req.body);
        const record = await repo.create({ userId: req.user.id, payload, input, storeResumeText });
        res.status(201).json({ analysis: serializeAnalysis(record) });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/analysis */
    async list(req, res, next) {
      try {
        const { items, nextCursor } = await repo.listForUser(req.user.id, req.query);
        res.json({ analyses: items, nextCursor });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/analysis/:id */
    async getOne(req, res, next) {
      try {
        const record = await repo.findByIdForUser(req.params.id, req.user.id);
        res.json({ analysis: serializeAnalysis(record, { includeInputs: true }) });
      } catch (err) {
        next(err);
      }
    },

    /** DELETE /api/analysis/:id */
    async remove(req, res, next) {
      try {
        await repo.deleteForUser(req.params.id, req.user.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    /**
     * POST /api/analysis/:id/regenerate
     * Re-runs the analysis. Resume text is only retained when STORE_RESUME_TEXT=true,
     * so the client may re-supply it in the body; otherwise the stored copy is used.
     */
    async regenerate(req, res, next) {
      try {
        const existing = await repo.findByIdForUser(req.params.id, req.user.id);
        const resumeText = req.body?.resumeText ?? existing.resumeText;
        if (!resumeText) {
          throw new ApiError(422, "This analysis cannot be regenerated because the resume text was not stored. Re-upload the resume and run a new analysis.", {
            code: "RESUME_TEXT_UNAVAILABLE",
          });
        }
        const llm = getLlm();
        const { payload, input } = await analyzeResume(llm, {
          resumeText,
          jobTitle: existing.jobTitle,
          targetRole: existing.targetRole,
          jobDescription: existing.jobDescription,
          companyName: existing.companyName ?? undefined,
          fileName: existing.fileName ?? undefined,
        });
        const record = await repo.replaceResult(existing.id, req.user.id, { payload, storeResumeText, input });
        res.json({ analysis: serializeAnalysis(record) });
      } catch (err) {
        next(err);
      }
    },
  };
}
