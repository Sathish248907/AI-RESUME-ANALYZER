import { randomBytes } from "node:crypto";
import { ApiError, badRequest } from "../utils/errors.js";
import { pageMeta } from "../validators/common.js";
import { logger } from "../utils/logger.js";
import { sanitizeShortText } from "../utils/sanitize.js";
import { TEMPLATES, TEMPLATE_SECTION_ORDER, DEFAULT_FORMATTING, emptyContent, normaliseContent, normaliseFormatting, orderSectionsForTemplate, applyTextField, readTextField, contentToPlainText } from "../services/resumeBuilder/resumeContentSchema.js";
import { structureHeuristically, structureWithAi } from "../services/resumeBuilder/resumeStructureService.js";
import { generateImprovements, generateTailoring, regenerateSuggestion, suggestionGroup } from "../services/resumeBuilder/resumeImprovementService.js";
import { runQualityChecks, keywordsFromText } from "../services/resumeBuilder/resumeQualityService.js";
import { compareContents, describeChanges } from "../services/resumeBuilder/resumeDiffService.js";
import { renderResumePdf, safeFileName } from "../services/resumeBuilder/resumePdfService.js";
import { scoreAtsReadiness } from "../services/resumeBuilder/atsScoringService.js";
import { runValidation, applyAutoFix, AUTO_FIXES } from "../services/resumeBuilder/resumeValidationService.js";
import { recommendRoles, findRole } from "../services/resumeBuilder/roleRecommendationService.js";
import { askAssistant, ASSISTANT_INTENTS } from "../services/resumeBuilder/resumeAssistantService.js";

/**
 * @param {{ repo, resumeRepo, jobDescriptionRepo, analysisRepo, careerRepo, learningRepo, getLlm: Function }} deps
 */
export function createResumeBuilderController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, careerRepo, learningRepo, getLlm }) {
  const view = (v) => ({
    id: v.id, resumeId: v.resumeId, resume: v.resume ?? null, jobDescriptionId: v.jobDescriptionId, jobDescription: v.jobDescription ?? null, parentVersionId: v.parentVersionId,
    name: v.name, versionNumber: v.versionNumber, kind: v.kind, isOriginal: v.isOriginal, templateId: v.templateId, content: v.content, formatting: v.formatting, contentSource: v.contentSource,
    targetJobTitle: v.targetJobTitle, targetCompany: v.targetCompany, lastQualityScore: v.lastQualityScore, createdAt: v.createdAt, updatedAt: v.updatedAt,
  });
  const listView = (v) => { const { content, formatting, ...rest } = view(v); return rest; };

  async function defaultFormatting(userId, templateId) {
    const pref = await repo.getPreference(userId);
    const tpl = templateId ?? pref?.templateId ?? "modern";
    return { templateId: tpl, formatting: normaliseFormatting(pref?.formatting ?? {}, tpl) };
  }

  async function jobContext(userId, { jobDescriptionId, jobDescription, jobTitle, companyName, analysisId, saveJobDescription }) {
    let jd = null;
    if (jobDescriptionId) jd = await jobDescriptionRepo.findByIdForUser(jobDescriptionId, userId);
    else if (jobDescription && saveJobDescription) {
      jd = await jobDescriptionRepo.create(userId, { jobTitle: sanitizeShortText(jobTitle || "Pasted job description", 120), targetRole: sanitizeShortText(jobTitle || "Unspecified", 80), description: jobDescription, companyName: companyName ? sanitizeShortText(companyName, 120) : null, sourceUrl: null, extractedRequirements: null });
    }
    const text = jd?.description ?? jobDescription;
    const skills = (jd?.extractedRequirements?.skills ?? []).map((s) => ({ name: s.name, priority: s.priority }));
    if (!skills.length && text) skills.push(...keywordsFromText(text).map((name) => ({ name, priority: undefined })));
    let analysis = null;
    if (analysisId) {
      const a = await analysisRepo.findByIdForUser(analysisId, userId);
      const r = a.result ?? {};
      analysis = { matched: (r.matchedSkills ?? []).map((s) => s.name), partial: (r.partiallyMatchedSkills ?? []).map((s) => s.name), missing: (r.missingOrUnverifiedSkills ?? []).map((s) => s.name) };
      if (!skills.length) skills.push(...[...(r.matchedSkills ?? []), ...(r.partiallyMatchedSkills ?? []), ...(r.missingOrUnverifiedSkills ?? [])].map((s) => ({ name: s.name, priority: s.priority })));
    }
    return { jd, text, skills, analysis, jobTitle: jd?.jobTitle ?? jobTitle ?? null, companyName: jd?.companyName ?? companyName ?? null };
  }

  /**
   * Build the options for scoreAtsReadiness: job context when the request (or
   * the version) has one, the user's target role otherwise, plus this version's
   * formatting so the parsing checks reflect what would actually be exported.
   */
  async function atsOptions(userId, version, body = {}) {
    const hasJobInput = Boolean(body.jobDescriptionId || body.jobDescription || body.analysisId);
    const ctx = hasJobInput || version.jobDescriptionId
      ? await jobContext(userId, hasJobInput ? body : { jobDescriptionId: version.jobDescriptionId })
      : { jd: null, text: undefined, skills: [], jobTitle: null };

    let targetRole = body.targetRole ?? null;
    if (!targetRole && !ctx.text && careerRepo) {
      targetRole = (await careerRepo.getProfile(userId).catch(() => null))?.targetRoles?.[0] ?? null;
    }
    return {
      jd: ctx.jd,
      options: {
        jobSkills: ctx.skills ?? [],
        jobDescriptionText: ctx.text ?? "",
        jobTitle: ctx.jobTitle ?? version.targetJobTitle ?? null,
        targetRole,
        formatting: version.formatting ?? {},
        templateId: version.templateId,
        weights: body.weights ?? {},
      },
    };
  }

  return {
    templates(_req, res) {
      res.json({
        templates: TEMPLATES.map((t) => ({ ...t, sectionOrder: TEMPLATE_SECTION_ORDER[t.id] ?? null })),
        defaultFormatting: DEFAULT_FORMATTING,
        atsNote: "Every template is single-column, text-only and uses standard PDF fonts, so all of them are parseable. The ones marked ATS-safe additionally drop colour and decorative rules. Applicant tracking systems differ and none publish their parsers, so no template can be guaranteed to work with all of them.",
      });
    },

    async preference(req, res, next) {
      try { const p = await repo.getPreference(req.user.id); res.json({ preference: p ? { templateId: p.templateId, formatting: p.formatting } : null }); } catch (err) { next(err); }
    },
    async savePreference(req, res, next) {
      try { const p = await repo.savePreference(req.user.id, { templateId: req.body.templateId, formatting: normaliseFormatting(req.body.formatting, req.body.templateId) }); res.json({ preference: { templateId: p.templateId, formatting: p.formatting } }); } catch (err) { next(err); }
    },

    /** GET /:resumeId — the editable resume: original version (created on first access) + its versions. */
    async getEditable(req, res, next) {
      try {
        const resume = await resumeRepo.findByIdForUser(req.params.resumeId, req.user.id);
        let original = await repo.findOriginalForResume(req.user.id, resume.id);
        let created = false;
        if (!original) {
          const { templateId, formatting } = await defaultFormatting(req.user.id);
          original = await repo.createVersion(req.user.id, { resumeId: resume.id, name: `${resume.name} — Original`, kind: "original", isOriginal: true, templateId, formatting, content: structureHeuristically(resume.extractedText), contentSource: "heuristic" });
          created = true;
        }
        const { items } = await repo.listVersions(req.user.id, { resumeId: resume.id, limit: 100 });
        res.json({ resume: { id: resume.id, name: resume.name, originalFileName: resume.originalFileName, charCount: resume.charCount, targetRole: resume.targetRole }, original: view(original), versions: items.map(listView), createdOriginal: created });
      } catch (err) { next(err); }
    },

    /** POST /:resumeId/versions — new version from the upload (heuristic or AI structure), from another version, or blank. */
    async createVersion(req, res, next) {
      try {
        const userId = req.user.id;
        const body = req.body;
        const resume = req.params.resumeId ? await resumeRepo.findByIdForUser(req.params.resumeId, userId) : null;
        const { templateId, formatting } = await defaultFormatting(userId, body.templateId);
        let content, contentSource = "heuristic", kind = "custom", parentVersionId = null, provider = null, model = null, ungrounded = [];
        if (body.fromVersionId) {
          const src = await repo.findVersion(body.fromVersionId, userId);
          content = src.content; contentSource = "duplicate"; parentVersionId = src.id;
        } else if (body.blank || !resume) {
          content = emptyContent(); contentSource = "manual";
        } else if (body.structure === "ai") {
          const out = await structureWithAi(getLlm(), resume.extractedText);
          content = out.content; contentSource = "ai"; provider = out.provider; model = out.model; ungrounded = out.ungrounded;
          kind = "improved";
        } else {
          // Reuse the original version's structure when it exists so section/entry ids line up for comparisons.
          const original = await repo.findOriginalForResume(userId, resume.id);
          content = original?.content ?? structureHeuristically(resume.extractedText);
          if (original) { contentSource = "duplicate"; parentVersionId = original.id; }
        }
        const jd = body.jobDescriptionId ? await jobDescriptionRepo.findByIdForUser(body.jobDescriptionId, userId) : null;
        const n = await repo.nextVersionNumber(userId, resume?.id ?? null);
        const version = await repo.createVersion(userId, {
          resumeId: resume?.id ?? null, jobDescriptionId: jd?.id ?? null, parentVersionId, name: body.name ?? (jd ? `${resume?.name ?? "Resume"} — ${jd.jobTitle}` : `${resume?.name ?? "Resume"} v${n}`), kind: jd ? "tailored" : kind,
          templateId, formatting, content, contentSource, targetJobTitle: jd?.jobTitle ?? null, targetCompany: jd?.companyName ?? null,
        });
        res.status(201).json({ version: view(version), structuring: { source: contentSource, provider, model, ungroundedCount: ungrounded.length } });
      } catch (err) { next(err); }
    },

    async listVersions(req, res, next) {
      try {
        const { page, limit, resumeId } = req.query;
        const { total, items } = await repo.listVersions(req.user.id, { resumeId, page, limit });
        res.json({ versions: items.map(listView), ...pageMeta(page, limit, total) });
      } catch (err) { next(err); }
    },

    async getVersion(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const pending = await repo.listImprovements(v.id, req.user.id, { status: "pending" });
        res.json({ version: view(v), pendingSuggestions: pending.length, templates: TEMPLATES });
      } catch (err) { next(err); }
    },

    /** PATCH /versions/:id — autosave content/formatting with optional optimistic concurrency. */
    async updateVersion(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        if (req.body.expectedUpdatedAt && new Date(req.body.expectedUpdatedAt).getTime() !== new Date(v.updatedAt).getTime()) {
          throw new ApiError(409, "This version was changed elsewhere since you loaded it. Reload to get the latest content.", { code: "VERSION_CONFLICT", details: { updatedAt: v.updatedAt } });
        }
        const data = {};
        if (req.body.name !== undefined) data.name = req.body.name;
        if (req.body.content !== undefined) data.content = normaliseContent(req.body.content);
        if (req.body.templateId !== undefined) data.templateId = req.body.templateId;
        if (req.body.formatting !== undefined || req.body.templateId !== undefined) {
          // Switching template re-applies that template's look (accent, heading style, font) but keeps
          // size/margins/spacing; explicit formatting in the request always wins.
          const templateChanged = req.body.templateId && req.body.templateId !== v.templateId;
          const tplDefaults = templateChanged ? (TEMPLATES.find((t) => t.id === req.body.templateId)?.defaults ?? {}) : {};
          data.formatting = normaliseFormatting({ ...(v.formatting ?? {}), ...tplDefaults, ...(req.body.formatting ?? {}) }, req.body.templateId ?? v.templateId);
        }
        if (req.body.jobDescriptionId !== undefined) {
          if (req.body.jobDescriptionId) { const jd = await jobDescriptionRepo.findByIdForUser(req.body.jobDescriptionId, req.user.id); data.jobDescriptionId = jd.id; data.targetJobTitle = jd.jobTitle; data.targetCompany = jd.companyName; }
          else data.jobDescriptionId = null;
        }
        if (req.body.targetJobTitle !== undefined) data.targetJobTitle = req.body.targetJobTitle;
        if (req.body.targetCompany !== undefined) data.targetCompany = req.body.targetCompany;
        if (data.content) data.lastQualityScore = runQualityChecks(data.content).overall;
        res.json({ version: view(await repo.updateVersion(v.id, req.user.id, data)) });
      } catch (err) { next(err); }
    },

    async duplicateVersion(req, res, next) {
      try {
        const src = await repo.findVersion(req.params.versionId, req.user.id);
        const jd = req.body.jobDescriptionId ? await jobDescriptionRepo.findByIdForUser(req.body.jobDescriptionId, req.user.id) : null;
        const copy = await repo.createVersion(req.user.id, { resumeId: src.resumeId, jobDescriptionId: jd?.id ?? src.jobDescriptionId, parentVersionId: src.id, name: req.body.name ?? `${src.name} (copy)`, kind: jd ? "tailored" : "custom", templateId: src.templateId, formatting: src.formatting, content: src.content, contentSource: "duplicate", targetJobTitle: jd?.jobTitle ?? src.targetJobTitle, targetCompany: jd?.companyName ?? src.targetCompany, lastQualityScore: src.lastQualityScore });
        res.status(201).json({ version: view(copy) });
      } catch (err) { next(err); }
    },

    async deleteVersion(req, res, next) {
      try { await repo.deleteVersion(req.params.versionId, req.user.id); res.status(204).end(); } catch (err) { next(err); }
    },

    /** POST /versions/:id/restore — copy another version's content into this one (previous content is kept as a new "backup" version). */
    async restoreVersion(req, res, next) {
      try {
        const target = await repo.findVersion(req.params.versionId, req.user.id);
        const source = await repo.findVersion(req.body.fromVersionId, req.user.id);
        if (target.isOriginal) throw new ApiError(409, "The original version is read-only. Duplicate it or restore into another version.", { code: "ORIGINAL_READONLY" });
        const diff = compareContents(target.content, source.content);
        if (diff.summary.totalChanges === 0) return res.json({ version: view(target), backup: null, changes: diff.summary, description: describeChanges(diff) });
        const backup = await repo.createVersion(req.user.id, { resumeId: target.resumeId, jobDescriptionId: target.jobDescriptionId, parentVersionId: target.id, name: `${target.name} (before restore ${new Date().toISOString().slice(0, 10)})`, kind: "restored", templateId: target.templateId, formatting: target.formatting, content: target.content, contentSource: "restore", targetJobTitle: target.targetJobTitle, targetCompany: target.targetCompany, lastQualityScore: target.lastQualityScore });
        const updated = await repo.updateVersion(target.id, req.user.id, { content: source.content, templateId: source.templateId, formatting: source.formatting, lastQualityScore: runQualityChecks(source.content).overall });
        res.json({ version: view(updated), backup: listView(backup), changes: diff.summary, description: describeChanges(diff) });
      } catch (err) { next(err); }
    },

    // ── AI ──────────────────────────────────────────────────────────────────
    async improve(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        if (v.isOriginal) throw new ApiError(409, "Create a working version first; the original is kept unchanged.", { code: "ORIGINAL_READONLY" });
        const out = await generateImprovements(getLlm(), { content: v.content, sectionIds: req.body.sectionIds, userNotes: req.body.userNotes });
        await repo.clearPending(v.id, "improve");
        const batchId = `b_${randomBytes(6).toString("hex")}`;
        const rows = await repo.createImprovements(v.id, batchId, out.suggestions);
        logger.info("resume improvements generated", { versionId: v.id, count: rows.length, provider: out.provider });
        res.status(201).json({ batchId, suggestions: rows, generalNotes: out.generalNotes, method: out.method, provider: out.provider, model: out.model });
      } catch (err) { next(err); }
    },

    async tailor(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        if (v.isOriginal) throw new ApiError(409, "Create a working version first; the original is kept unchanged.", { code: "ORIGINAL_READONLY" });
        const ctx = await jobContext(req.user.id, req.body);
        const out = await generateTailoring(getLlm(), { content: v.content, jobDescription: ctx.text, jobTitle: ctx.jobTitle, companyName: ctx.companyName, jobSkills: ctx.skills, analysis: ctx.analysis });
        await repo.clearPending(v.id, "tailor");
        const batchId = `b_${randomBytes(6).toString("hex")}`;
        const rows = await repo.createImprovements(v.id, batchId, out.suggestions);
        const data = {};
        if (ctx.jd) { data.jobDescriptionId = ctx.jd.id; data.targetJobTitle = ctx.jd.jobTitle; data.targetCompany = ctx.jd.companyName; if (v.kind === "custom") data.kind = "tailored"; }
        else if (ctx.jobTitle) { data.targetJobTitle = sanitizeShortText(ctx.jobTitle, 120); data.targetCompany = ctx.companyName ? sanitizeShortText(ctx.companyName, 120) : null; }
        const updated = Object.keys(data).length ? await repo.updateVersion(v.id, req.user.id, data) : v;
        res.status(201).json({ batchId, suggestions: rows, generalNotes: out.generalNotes, keywordsToAdd: out.keywordsToAdd, genuineGaps: out.genuineGaps, emphasise: out.emphasise, target: { jobTitle: ctx.jobTitle, companyName: ctx.companyName, jobDescriptionId: ctx.jd?.id ?? null }, version: view(updated), method: out.method, provider: out.provider, model: out.model });
      } catch (err) { next(err); }
    },

    async listImprovements(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const rows = await repo.listImprovements(v.id, req.user.id, req.query);
        // Rows written before the presentation columns existed get their group and
        // priority derived here, so every card renders the same way.
        const content = normaliseContent(v.content);
        const suggestions = rows.map((s) => ({
          ...s,
          suggestionGroup: s.suggestionGroup ?? suggestionGroup(content, { sectionId: s.sectionId, category: s.category }),
          priority: s.priority ?? "medium",
        }));
        const counts = {};
        for (const s of suggestions) if (s.status === "pending") counts[s.suggestionGroup] = (counts[s.suggestionGroup] ?? 0) + 1;
        res.json({ suggestions, pendingByGroup: counts });
      } catch (err) { next(err); }
    },

    /** POST /versions/:id/improvements/:improvementId — accept / reject / edit / reset one suggestion. Accepting writes into the content. */
    async resolveImprovement(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const imp = await repo.getImprovement(req.params.improvementId, req.user.id);
        if (imp.versionId !== v.id) throw badRequest("This suggestion belongs to another version.");
        const target = { sectionId: imp.sectionId, entryId: imp.entryId, field: imp.field };
        const { action } = req.body;
        if (action === "reject") {
          const row = await repo.updateImprovement(imp.id, { status: "rejected", resolvedAt: new Date() });
          return res.json({ suggestion: row, version: view(v) });
        }
        if (action === "reset") {
          if (imp.status === "pending") return res.json({ suggestion: imp, version: view(v) });
          const reverted = applyTextField(v.content, target, imp.originalText);
          const updatedV = reverted ? await repo.updateVersion(v.id, req.user.id, { content: reverted, lastQualityScore: runQualityChecks(reverted).overall }) : v;
          const row = await repo.updateImprovement(imp.id, { status: "pending", acceptedText: null, resolvedAt: null });
          return res.json({ suggestion: row, version: view(updatedV), reverted: Boolean(reverted) });
        }
        const text = (action === "edit" ? req.body.text : req.body.text ?? imp.suggestedText).trim();
        const current = readTextField(v.content, target);
        if (current === null) throw new ApiError(409, "The field this suggestion targets no longer exists in the resume.", { code: "FIELD_MISSING" });
        const next_ = applyTextField(v.content, target, text);
        const updatedV = await repo.updateVersion(v.id, req.user.id, { content: next_, lastQualityScore: runQualityChecks(next_).overall });
        const row = await repo.updateImprovement(imp.id, { status: action === "edit" || text !== imp.suggestedText ? "edited" : "accepted", acceptedText: text, resolvedAt: new Date() });
        res.json({ suggestion: row, version: view(updatedV) });
      } catch (err) { next(err); }
    },

    // ── Quality, compare, export ─────────────────────────────────────────────
    async qualityCheck(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const jdId = req.query.jobDescriptionId ?? v.jobDescriptionId;
        let jobKeywords = [], jobTitle = v.targetJobTitle;
        if (jdId) { const jd = await jobDescriptionRepo.findByIdForUser(jdId, req.user.id); jobKeywords = (jd.extractedRequirements?.skills ?? []).map((s) => s.name); if (!jobKeywords.length) jobKeywords = keywordsFromText(jd.description); jobTitle = jd.jobTitle; }
        const report = runQualityChecks(v.content, { jobKeywords, jobTitle });
        if (report.overall !== v.lastQualityScore) await repo.updateVersion(v.id, req.user.id, { lastQualityScore: report.overall });
        res.json({ quality: report, versionId: v.id, jobDescriptionId: jdId ?? null });
      } catch (err) { next(err); }
    },

    async compare(req, res, next) {
      try {
        const a = await repo.findVersion(req.params.versionId, req.user.id);
        const b = await repo.findVersion(req.body.otherVersionId, req.user.id);
        const diff = compareContents(a.content, b.content);
        res.json({ base: listView(a), other: listView(b), diff, description: describeChanges(diff), quality: { base: runQualityChecks(a.content).overall, other: runQualityChecks(b.content).overall } });
      } catch (err) { next(err); }
    },

    async exportPdf(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const content = normaliseContent(v.content);
        const missing = [];
        if (!content.personal.fullName) missing.push("full name");
        if (!content.personal.email && !content.personal.phone) missing.push("email or phone");
        if (!content.sections.some((s) => s.visible !== false && (s.type === "summary" ? s.text : (s.entries ?? s.groups ?? s.items ?? []).length))) missing.push("at least one filled section");
        if (missing.length) throw new ApiError(422, `Add ${missing.join(", ")} before exporting.`, { code: "EXPORT_INCOMPLETE", details: missing });
        const templateId = req.body.templateId ?? v.templateId;
        const { buffer, pages } = await renderResumePdf({ content, templateId, formatting: { ...(v.formatting ?? {}), ...(req.body.formatting ?? {}) } });
        const fileName = safeFileName(v.name);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Content-Length", String(buffer.length));
        res.setHeader("X-Resume-Pages", String(pages));
        res.setHeader("Cache-Control", "no-store");
        res.end(buffer);
      } catch (err) { next(err); }
    },

    // ── Phase 11: ATS readiness ──────────────────────────────────────────────
    /**
     * POST /versions/:id/ats-check — deterministic ATS-readiness score.
     * With a job description the result is job-specific; without one it is
     * general readiness and the keyword category is dropped, not guessed.
     */
    async atsCheck(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const { options, jd } = await atsOptions(req.user.id, v, req.body);
        const assessment = scoreAtsReadiness(normaliseContent(v.content), options);
        const previous = (await repo.listAtsAssessments(req.user.id, { versionId: v.id, mode: assessment.mode, limit: 1 }))[0] ?? null;
        let saved = null;
        if (req.body.save !== false) {
          saved = await repo.createAtsAssessment(req.user.id, v.id, assessment, { jobDescriptionId: jd?.id ?? null });
        }
        // Keep the Phase 8 quality score fresh too, so the two panels never disagree.
        const quality = runQualityChecks(normaliseContent(v.content));
        if (quality.overall !== v.lastQualityScore) await repo.updateVersion(v.id, req.user.id, { lastQualityScore: quality.overall });
        res.json({
          ats: assessment,
          assessmentId: saved?.id ?? null,
          previous: previous ? { id: previous.id, overallScore: previous.overallScore, label: previous.label, createdAt: previous.createdAt } : null,
          delta: previous ? assessment.overall - previous.overallScore : null,
          quality: { overall: quality.overall, label: quality.label, method: quality.method },
          scoreGuide: "ATS readiness and the Phase 8 quality score measure different things: readiness is about completeness, structure and job alignment, quality is about how the document is written. Neither is a job-match percentage.",
          versionId: v.id,
          jobDescriptionId: jd?.id ?? null,
        });
      } catch (err) { next(err); }
    },

    /** GET /versions/:id/ats-history — past assessments, newest first, by mode. */
    async atsHistory(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const items = await repo.listAtsAssessments(req.user.id, { versionId: v.id, mode: req.query.mode, limit: req.query.limit });
        const series = (mode) => items.filter((i) => i.mode === mode).map((i) => ({ at: i.createdAt, score: i.overallScore })).reverse();
        res.json({
          versionId: v.id,
          assessments: items,
          trend: { general: series("general"), job: series("job") },
          note: "General and job-specific runs are separate series — a job-specific score is not comparable with a general one, or with a score for a different job.",
        });
      } catch (err) { next(err); }
    },

    // ── Phase 11: validation and safe fixes ──────────────────────────────────
    /** POST /versions/:id/validate — document checks, inline-addressable. */
    async validate(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const content = normaliseContent(v.content);
        const jdId = req.body.jobDescriptionId ?? v.jobDescriptionId;
        let jobKeywords = [];
        if (jdId) {
          const jd = await jobDescriptionRepo.findByIdForUser(jdId, req.user.id);
          jobKeywords = (jd.extractedRequirements?.skills ?? []).map((s) => s.name);
          if (!jobKeywords.length) jobKeywords = keywordsFromText(jd.description);
        }
        res.json({ validation: runValidation(content, { jobKeywords, targetRole: req.body.targetRole, formatting: v.formatting, templateId: v.templateId }), versionId: v.id, jobDescriptionId: jdId ?? null });
      } catch (err) { next(err); }
    },

    /**
     * POST /versions/:id/apply-fix — apply one safe, mechanical fix and report
     * the real score change. A fix that turns out to be a no-op writes nothing.
     */
    async applyFix(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        if (v.isOriginal) throw new ApiError(409, "The original version is read-only. Duplicate it first.", { code: "ORIGINAL_READONLY" });
        const { options } = await atsOptions(req.user.id, v, {});
        const result = applyAutoFix(normaliseContent(v.content), req.body.kind, { sectionId: req.body.sectionId, value: req.body.value }, options);
        if (!result.ok) throw badRequest(result.reason);
        if (!result.changed) {
          return res.json({ changed: false, summary: result.summary, version: view(v), scoreBefore: null, scoreAfter: null, fix: { kind: req.body.kind, label: AUTO_FIXES[req.body.kind].label, description: AUTO_FIXES[req.body.kind].description } });
        }
        const updated = await repo.updateVersion(v.id, req.user.id, { content: result.content, lastQualityScore: runQualityChecks(result.content).overall });
        logger.info("resume auto-fix applied", { versionId: v.id, kind: req.body.kind, scoreBefore: result.scoreBefore, scoreAfter: result.scoreAfter });
        res.json({
          changed: true, summary: result.summary, version: view(updated),
          scoreBefore: result.scoreBefore, scoreAfter: result.scoreAfter,
          fix: { kind: req.body.kind, label: AUTO_FIXES[req.body.kind].label, description: AUTO_FIXES[req.body.kind].description },
        });
      } catch (err) { next(err); }
    },

    // ── Phase 11: role recommendations ───────────────────────────────────────
    /** POST /versions/:id/role-recommendations — evidence-based role suitability. */
    async roleRecommendations(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const [profile, skillGaps] = await Promise.all([
          careerRepo?.getProfile(req.user.id).catch(() => null) ?? null,
          learningRepo?.listSkillGaps(req.user.id).catch(() => []) ?? [],
        ]);
        const learningSkills = (skillGaps ?? [])
          .filter((g) => ["learning_in_progress", "needs_improvement"].includes(g.proficiencyStatus))
          .map((g) => ({ skillName: g.skillName, proficiencyStatus: g.proficiencyStatus }));
        const result = recommendRoles(normaliseContent(v.content), { profile, learningSkills, limit: req.body.limit });
        let saved = null;
        if (req.body.save !== false) saved = await repo.createRoleRecommendation(req.user.id, v.id, result);
        res.json({
          ...result,
          recommendationId: saved?.id ?? null,
          versionId: v.id,
          currentTargetRoles: profile?.targetRoles ?? [],
          inputsUsed: {
            resumeContent: true,
            careerProfile: Boolean(profile),
            learningProgress: learningSkills.length > 0,
            note: learningSkills.length
              ? `${learningSkills.length} skill${learningSkills.length === 1 ? "" : "s"} you are currently learning are shown as in progress and are not counted as demonstrated experience.`
              : "No in-progress learning found, so scores rest on the resume alone.",
          },
        });
      } catch (err) { next(err); }
    },

    /**
     * POST /versions/:id/target-role — adopt a recommended role.
     * Adds it to the career profile's target roles (the authoritative list) and
     * optionally applies the role's template and section order to this version.
     */
    async selectTargetRole(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const role = findRole(req.body.role);
        if (!role) throw badRequest(`“${req.body.role}” is not one of the recommended roles.`);
        if (!careerRepo) throw new ApiError(503, "The career profile service is unavailable.", { code: "CAREER_UNAVAILABLE" });

        const profile = await careerRepo.getProfile(req.user.id);
        const existing = Array.isArray(profile?.targetRoles) ? profile.targetRoles : [];
        const targetRoles = existing.some((r) => String(r).toLowerCase() === role.title.toLowerCase())
          ? [role.title, ...existing.filter((r) => String(r).toLowerCase() !== role.title.toLowerCase())]
          : [role.title, ...existing].slice(0, 5);
        const saved = await careerRepo.upsertProfile(req.user.id, profile
          ? { targetRoles }
          : { targetRoles, careerLevel: "fresher", industries: [], skills: [], locations: [], learningInterests: [] });

        if (req.body.recommendationId) await repo.setSelectedRole(req.body.recommendationId, req.user.id, role.title).catch(() => null);

        let version = v;
        if ((req.body.applyTemplate || req.body.applySectionOrder) && !v.isOriginal) {
          const data = {};
          if (req.body.applyTemplate) {
            data.templateId = role.templateId;
            data.formatting = normaliseFormatting({ ...(v.formatting ?? {}), ...(TEMPLATES.find((t) => t.id === role.templateId)?.defaults ?? {}) }, role.templateId);
          }
          if (req.body.applySectionOrder) {
            const content = normaliseContent(v.content);
            const rank = (s) => { const i = role.sectionOrder.indexOf(s.type); return i === -1 ? role.sectionOrder.length : i; };
            data.content = { ...content, sections: [...content.sections].map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s) };
          }
          version = await repo.updateVersion(v.id, req.user.id, data);
        }
        res.json({
          targetRole: role.title,
          targetRoles: saved.targetRoles,
          version: view(version),
          applied: { template: Boolean(req.body.applyTemplate) && !v.isOriginal, sectionOrder: Boolean(req.body.applySectionOrder) && !v.isOriginal },
          readOnlySkipped: v.isOriginal && (req.body.applyTemplate || req.body.applySectionOrder)
            ? "The original version is read-only, so the template and section order were not changed. Duplicate it to apply them."
            : null,
        });
      } catch (err) { next(err); }
    },

    // ── Phase 11: writing assistant ──────────────────────────────────────────
    /**
     * POST /versions/:id/assistant — scoped writing help. Returns drafts the
     * user may insert; nothing is written to the resume by this endpoint.
     */
    async assistant(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        let jobDescription = null, jobTitle = null;
        const jdId = req.body.jobDescriptionId ?? v.jobDescriptionId;
        if (jdId) { const jd = await jobDescriptionRepo.findByIdForUser(jdId, req.user.id); jobDescription = jd.description; jobTitle = jd.jobTitle; }
        let targetRole = req.body.targetRole ?? v.targetJobTitle ?? null;
        if (!targetRole && careerRepo) targetRole = (await careerRepo.getProfile(req.user.id).catch(() => null))?.targetRoles?.[0] ?? null;

        const out = await askAssistant(getLlm(), {
          content: normaliseContent(v.content),
          intent: req.body.intent,
          question: req.body.question,
          sectionId: req.body.sectionId,
          entryId: req.body.entryId,
          field: req.body.field,
          targetRole,
          jobDescription,
          jobTitle,
          history: req.body.history,
        });
        logger.info("resume assistant answered", { versionId: v.id, intent: req.body.intent, drafts: out.drafts.length });
        res.json({ ...out, versionId: v.id, intents: Object.entries(ASSISTANT_INTENTS).map(([key, s]) => ({ key, label: s.label, sectionTypes: s.sectionTypes })) });
      } catch (err) { next(err); }
    },

    /**
     * POST /versions/:id/improvements/:improvementId/regenerate — a different
     * take on the same field. The old suggestion is replaced in place and its
     * regeneration count goes up, so the user can see they have asked twice.
     */
    async regenerate(req, res, next) {
      try {
        const v = await repo.findVersion(req.params.versionId, req.user.id);
        const imp = await repo.getImprovement(req.params.improvementId, req.user.id);
        if (imp.versionId !== v.id) throw badRequest("This suggestion belongs to another version.");
        if (imp.status !== "pending") throw new ApiError(409, "That suggestion has already been resolved. Reset it first if you want another take.", { code: "ALREADY_RESOLVED" });

        let jobDescription = null, jobTitle = null;
        if (imp.mode === "tailor" && v.jobDescriptionId) {
          const jd = await jobDescriptionRepo.findByIdForUser(v.jobDescriptionId, req.user.id);
          jobDescription = jd.description; jobTitle = jd.jobTitle;
        }
        const content = normaliseContent(v.content);
        const out = await regenerateSuggestion(getLlm(), {
          content,
          target: { sectionId: imp.sectionId, entryId: imp.entryId, field: imp.field },
          previousSuggestion: imp.suggestedText,
          userInstruction: req.body.instruction,
          mode: imp.mode,
          jobDescription, jobTitle,
        });
        const s = out.suggestion;
        const row = await repo.updateImprovement(imp.id, {
          category: s.category, suggestionGroup: s.group, priority: s.priority, title: s.title, issue: s.issue, benefit: s.benefit,
          originalText: s.originalText, suggestedText: s.suggestedText, rationale: s.rationale,
          needsConfirmation: s.needsConfirmation, confirmationQuestion: s.confirmationQuestion,
          regenerationCount: (imp.regenerationCount ?? 0) + 1,
        });
        res.json({ suggestion: row, previousSuggestedText: imp.suggestedText, provider: out.provider, model: out.model });
      } catch (err) { next(err); }
    },

    /** Plain-text rendering (used by the preview for page estimates and by tests). */
    async plainText(req, res, next) {
      try { const v = await repo.findVersion(req.params.versionId, req.user.id); res.type("text/plain").send(contentToPlainText(normaliseContent(v.content))); } catch (err) { next(err); }
    },
  };
}
