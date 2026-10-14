import { ApiError, badRequest } from "../utils/errors.js";
import { analyzeResume } from "../services/resume/resumeAnalysisService.js";
import { serializeAnalysis } from "../models/analysisRepository.js";
import { pageMeta } from "../validators/common.js";

/**
 * @param {{ repo, resumeRepo, jobDescriptionRepo, getLlm: Function, storeResumeText: boolean, prisma }} deps
 */
export function createAnalysisController({ repo, resumeRepo, jobDescriptionRepo, getLlm, storeResumeText }) {
  /**
   * Resolve the texts for an analysis from the request body plus any linked records.
   * Ownership is enforced by the repositories (they filter by userId).
   */
  async function resolveInputs(userId, body) {
    let resumeId = null;
    let fileName = body.fileName;
    let resumeText = body.resumeText;
    if (body.resumeId) {
      const resume = await resumeRepo.findByIdForUser(body.resumeId, userId);
      resumeId = resume.id;
      resumeText = resume.extractedText;
      fileName = fileName ?? resume.name;
    }

    let jobDescriptionId = null;
    let jobTitle = body.jobTitle;
    let targetRole = body.targetRole;
    let jobDescription = body.jobDescription;
    let companyName = body.companyName || undefined;
    if (body.jobDescriptionId) {
      const jd = await jobDescriptionRepo.findByIdForUser(body.jobDescriptionId, userId);
      jobDescriptionId = jd.id;
      jobTitle = jobTitle ?? jd.jobTitle;
      targetRole = targetRole ?? jd.targetRole;
      jobDescription = jobDescription ?? jd.description;
      companyName = companyName ?? jd.companyName ?? undefined;
    } else if (body.saveJobDescription && jobDescription && jobTitle && targetRole) {
      const jd = await jobDescriptionRepo.create(userId, { jobTitle, targetRole, description: jobDescription, companyName: companyName ?? null, sourceUrl: null, extractedRequirements: null });
      jobDescriptionId = jd.id;
    }

    if (!resumeText) throw badRequest("Resume text is required.");
    if (!jobDescription || !jobTitle || !targetRole) throw badRequest("Job description, job title and target role are required.");

    return { resumeId, jobDescriptionId, input: { resumeText, jobTitle, targetRole, jobDescription, companyName, fileName } };
  }

  return {
    /** POST /api/analysis/resume */
    async analyze(req, res, next) {
      try {
        const llm = getLlm(); // throws 503 ApiError when the provider is not configured
        const { resumeId, jobDescriptionId, input } = await resolveInputs(req.user.id, req.body);
        const { payload, input: cleaned } = await analyzeResume(llm, input);
        const record = await repo.create({ userId: req.user.id, payload, input: cleaned, storeResumeText, resumeId, jobDescriptionId });
        res.status(201).json({ analysis: serializeAnalysis(record) });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/analysis */
    async list(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await repo.listForUser(req.user.id, req.query);
        res.json({ analyses: items, ...pageMeta(page, limit, total) });
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
     * Re-runs the analysis and stores it as a NEW history record (the original is kept).
     * Resume text comes from the linked Resume row, the stored copy (STORE_RESUME_TEXT),
     * or the request body — in that order.
     */
    async regenerate(req, res, next) {
      try {
        const existing = await repo.findByIdForUser(req.params.id, req.user.id);
        const resumeText = existing.resume?.extractedText ?? existing.resumeText ?? req.body?.resumeText;
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
        const record = await repo.create({
          userId: req.user.id,
          payload,
          input,
          storeResumeText,
          resumeId: existing.resumeId ?? null,
          jobDescriptionId: existing.jobDescriptionId ?? null,
        });
        res.status(201).json({ analysis: serializeAnalysis(record), previousId: existing.id });
      } catch (err) {
        next(err);
      }
    },
  };
}
