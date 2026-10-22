import { randomBytes } from "node:crypto";
import { ApiError, badRequest } from "../utils/errors.js";
import { pageMeta } from "../validators/common.js";
import { logger } from "../utils/logger.js";
import { sanitizeShortText } from "../utils/sanitize.js";
import { TEMPLATES, DEFAULT_FORMATTING, emptyContent, normaliseContent, normaliseFormatting, applyTextField, readTextField, contentToPlainText } from "../services/resumeBuilder/resumeContentSchema.js";
import { structureHeuristically, structureWithAi } from "../services/resumeBuilder/resumeStructureService.js";
import { generateImprovements, generateTailoring } from "../services/resumeBuilder/resumeImprovementService.js";
import { runQualityChecks, keywordsFromText } from "../services/resumeBuilder/resumeQualityService.js";
import { compareContents, describeChanges } from "../services/resumeBuilder/resumeDiffService.js";
import { renderResumePdf, safeFileName } from "../services/resumeBuilder/resumePdfService.js";

/**
 * @param {{ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm: Function }} deps
 */
export function createResumeBuilderController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm }) {
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

  return {
    templates(_req, res) {
      res.json({ templates: TEMPLATES, defaultFormatting: DEFAULT_FORMATTING });
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
      try { res.json({ suggestions: await repo.listImprovements(req.params.versionId, req.user.id, req.query) }); } catch (err) { next(err); }
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

    /** Plain-text rendering (used by the preview for page estimates and by tests). */
    async plainText(req, res, next) {
      try { const v = await repo.findVersion(req.params.versionId, req.user.id); res.type("text/plain").send(contentToPlainText(normaliseContent(v.content))); } catch (err) { next(err); }
    },
  };
}
