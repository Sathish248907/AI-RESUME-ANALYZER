/**
 * jobController.js — Phase 12 HTTP handlers: job discovery, matching, saved
 * jobs, preferences, alerts, and the hand-offs into resume tailoring and
 * interview preparation.
 *
 * Boundaries this controller keeps:
 *
 *   - **One application tracker.** Starting an application creates a Phase 5
 *     `JobApplication` through the existing repository and links it to the saved
 *     job. Status changes, follow-ups and deletion continue to go through
 *     `/api/applications`; nothing here duplicates them.
 *   - **One tailoring flow.** `tailor-resume` prepares the inputs (a saved job
 *     description, the recommended version, truthful keyword suggestions) and
 *     hands over to the Phase 8 endpoints, which already do grounded AI
 *     suggestions with accept/reject and PDF export.
 *   - **No fabrication.** A job id that is no longer cached is a 404 with an
 *     explanation; a provider failure is reported as a failure. No endpoint ever
 *     substitutes example data.
 */
import { ApiError, badRequest, conflict, notFound } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { sanitizeShortText } from "../utils/sanitize.js";
import { extractJobRequirements, matchResumeToJob } from "../services/jobs/jobMatchService.js";
import { buildJobPreparation } from "../services/jobs/jobPreparationService.js";
import { externalJobAsListing, jobDescriptionAsListing, missingFields } from "../services/jobs/jobDiscoveryService.js";
import { presentAlert } from "../services/jobs/jobAlertService.js";
import { DEFAULT_RANKING_WEIGHTS, RANKING_FACTOR_LABELS, rankJob } from "../services/jobs/jobRankingService.js";
import { MATCH_WEIGHTS, MATCH_DIMENSION_LABELS, MATCH_DISCLAIMER } from "../services/jobs/jobMatchService.js";

/**
 * @param {{ repo, careerRepo, applicationRepo, jobDescriptionRepo, progressRepo,
 *           registry, discovery, alerts }} deps
 */
export function createJobController({ repo, careerRepo, applicationRepo, jobDescriptionRepo, progressRepo, registry, discovery, alerts }) {
  /**
   * Resolve either id shape to a listing plus the column it is stored under.
   * Ownership is enforced for `jd:` ids; provider listings are a shared cache,
   * so there is nothing user-specific to check beyond existence.
   */
  async function resolveJob(jobId, userId) {
    if (String(jobId).startsWith("jd:")) {
      const id = String(jobId).slice(3);
      const jd = await repo.findJobDescription(id, userId);
      return { kind: "own", listing: jobDescriptionAsListing(jd), externalJobId: null, jobDescriptionId: jd.id, row: jd };
    }
    const row = await repo.findJob(jobId);
    if (!row) {
      throw new ApiError(404, "That listing is no longer in the cache. It may have expired under the provider's retention period — run a refresh to fetch current listings.", { code: "LISTING_EXPIRED" });
    }
    return { kind: "provider", listing: externalJobAsListing(row), externalJobId: row.id, jobDescriptionId: null, row };
  }

  /** Load one resume version's content, or null when the user has none. */
  async function loadVersionContent(userId, requestedId) {
    const { version, versions } = await discovery.pickResumeVersion(userId, requestedId);
    if (!version) return { version: null, versions, content: null };
    const full = await repo.findResumeVersion(version.id, userId);
    return { version, versions, content: full?.content ?? null };
  }

  return {
    // ── Discovery ────────────────────────────────────────────────────────────
    async discover(req, res, next) {
      try {
        const result = await discovery.discover(req.user.id, req.query);
        // Opportunistic retention sweep; never blocks the response path.
        discovery.purgeExpired().catch(() => null);
        res.json(result);
      } catch (err) { next(err); }
    },

    /** Provider configuration and status, for the setup screen. */
    async providers(req, res, next) {
      try {
        const [rows, list] = await Promise.all([repo.listProviderRows(), Promise.resolve(registry.listProviders())]);
        const bySlug = new Map(rows.map((r) => [r.slug, r]));
        res.json({
          configured: registry.activeProviders().length > 0,
          enabled: list.filter((p) => p.enabled).map((p) => p.slug),
          providers: list.map((p) => ({
            ...p,
            lastFetchedAt: bySlug.get(p.slug)?.lastFetchedAt ?? null,
            lastStatus: bySlug.get(p.slug)?.lastStatus ?? null,
            lastError: bySlug.get(p.slug)?.lastError ?? null,
            lastJobCount: bySlug.get(p.slug)?.lastJobCount ?? 0,
          })),
          setup: registry.activeProviders().length > 0 ? null : discovery.setupGuide(list),
          retentionDays: Number(process.env.JOB_RETENTION_DAYS ?? 30),
        });
      } catch (err) { next(err); }
    },

    /** Force a provider round. Rate-limited per provider inside the registry. */
    async refresh(req, res, next) {
      try {
        if (registry.activeProviders().length === 0) {
          throw new ApiError(503, "No job provider is configured, so there is nothing to refresh. Set JOB_PROVIDERS in the backend environment.", { code: "NO_PROVIDER" });
        }
        const result = await discovery.refreshFromProviders({ q: req.body?.q, location: req.body?.location, page: 1, limit: 50 });
        res.json({
          fetched: result.jobs.length,
          created: result.created,
          updated: result.updated,
          providers: result.providers,
          partial: result.partial,
          note: result.partial
            ? "At least one provider failed; the listings from that provider are missing rather than substituted."
            : "All configured providers responded.",
        });
      } catch (err) { next(err); }
    },

    /** One job: the full description plus match, ranking and preparation. */
    async detail(req, res, next) {
      try {
        const userId = req.user.id;
        const { kind, listing, externalJobId, jobDescriptionId } = await resolveJob(req.params.jobId, userId);
        const [preference, saved, versionInfo, careerSnapshot] = await Promise.all([
          repo.getPreference(userId),
          repo.findSavedByJob(userId, { externalJobId, jobDescriptionId }),
          loadVersionContent(userId, req.query?.resumeVersionId),
          careerRepo ? careerRepo.loadSnapshot(userId).catch(() => ({})) : Promise.resolve({}),
        ]);

        const requirements = extractJobRequirements(listing);
        const match = versionInfo.content
          ? matchResumeToJob({ content: versionInfo.content, job: listing, requirements, preferences: preference ?? {} })
          : null;
        const ranking = rankJob({ job: listing, match, preferences: preference ?? {} });
        const preparation = match
          ? buildJobPreparation({ job: listing, match, careerSnapshot, targetRole: listing.targetRole })
          : null;

        const application = saved?.applicationId
          ? await applicationRepo.findByIdForUser?.(saved.applicationId, userId).catch(() => null)
          : await repo.findApplicationForJob(userId, { jobDescriptionId, companyName: listing.companyName, jobTitle: listing.title });

        res.json({
          job: { ...listing, missingFields: missingFields(listing), providerName: registry.listProviders().find((p) => p.slug === listing.providerSlug)?.displayName ?? listing.providerName ?? listing.providerSlug, sourceKind: kind },
          requirements,
          match,
          ranking,
          preparation,
          savedJob: saved ? { id: saved.id, state: saved.state, notes: saved.notes, applicationId: saved.applicationId } : null,
          application: application ? { id: application.id, status: application.status, applicationDate: application.applicationDate, nextFollowUpDate: application.nextFollowUpDate } : null,
          resumeVersion: versionInfo.version,
          availableResumeVersions: versionInfo.versions,
          attribution: registry.listProviders().find((p) => p.slug === listing.providerSlug)?.attribution ?? null,
          notes: [
            kind === "own" ? "You entered this job description yourself, so salary, posting date and work arrangement are unknown unless you added them." : null,
            versionInfo.content ? null : "You have no resume version yet, so no match could be computed.",
            "Company and location details are shown exactly as the source supplied them; nothing has been added or verified.",
          ].filter(Boolean),
        });
      } catch (err) { next(err); }
    },

    /** Compute (and by default persist) the match for one job. */
    async match(req, res, next) {
      try {
        const userId = req.user.id;
        const { listing, externalJobId, jobDescriptionId } = await resolveJob(req.params.jobId, userId);
        const preference = await repo.getPreference(userId);
        const requirements = extractJobRequirements(listing);

        const versions = await repo.listResumeVersions(userId);
        if (!versions.length) {
          throw new ApiError(409, "You have no resume version yet. Create one in the resume builder, then a match can be computed.", { code: "NO_RESUME_VERSION" });
        }

        // Either match one version, or compare every version to recommend one.
        const toScore = req.body?.compareAllVersions
          ? versions
          : [(await discovery.pickResumeVersion(userId, req.body?.resumeVersionId)).version];

        const scored = [];
        for (const v of toScore) {
          if (!v) continue;
          const full = await repo.findResumeVersion(v.id, userId);
          if (!full?.content) continue;
          const report = matchResumeToJob({ content: full.content, job: listing, requirements, preferences: preference ?? {} });
          scored.push({ version: { id: v.id, name: v.name, kind: v.kind, isOriginal: v.isOriginal, lastQualityScore: v.lastQualityScore }, report });
        }
        if (!scored.length) throw new ApiError(409, "That resume version has no content to compare.", { code: "EMPTY_VERSION" });

        scored.sort((a, b) => (b.report.matchScore ?? -1) - (a.report.matchScore ?? -1));
        const best = scored[0];

        if (req.body?.save !== false && best.report.matchScore !== null) {
          await repo.saveMatchReport(userId, {
            externalJobId, jobDescriptionId,
            resumeVersionId: best.version.id,
            matchScore: best.report.matchScore,
            label: best.report.label,
            scoringVersion: best.report.method,
            details: {
              dimensions: best.report.dimensions,
              skills: best.report.skills,
              keywordCoverage: best.report.keywordCoverage,
              mismatches: best.report.mismatches,
              weightsUsed: best.report.weightsUsed,
            },
          });
        }

        res.json({
          jobId: req.params.jobId,
          match: best.report,
          resumeVersion: best.version,
          recommendedVersion: best.version,
          comparison: scored.map((s) => ({ version: s.version, matchScore: s.report.matchScore, label: s.report.label })),
          saved: req.body?.save !== false && best.report.matchScore !== null,
          scale: best.report.evidenceScale,
          weights: MATCH_WEIGHTS,
          dimensionLabels: MATCH_DIMENSION_LABELS,
          disclaimer: MATCH_DISCLAIMER,
        });
      } catch (err) { next(err); }
    },

    /** The stored report, or a freshly computed one when none exists yet. */
    async matchReport(req, res, next) {
      try {
        const userId = req.user.id;
        const { listing, externalJobId, jobDescriptionId } = await resolveJob(req.params.jobId, userId);
        const stored = await repo.findMatchReport(userId, { externalJobId, jobDescriptionId, resumeVersionId: req.query?.resumeVersionId });
        if (stored) {
          return res.json({
            jobId: req.params.jobId,
            stored: true,
            report: stored,
            staleNote: "This is the stored result from when it was last computed. Re-run the match after editing your resume.",
            disclaimer: MATCH_DISCLAIMER,
          });
        }
        const { content, version } = await loadVersionContent(userId, req.query?.resumeVersionId);
        if (!content) {
          return res.json({ jobId: req.params.jobId, stored: false, report: null, note: "No resume version is available, so no match can be computed.", disclaimer: MATCH_DISCLAIMER });
        }
        const preference = await repo.getPreference(userId);
        const report = matchResumeToJob({ content, job: listing, requirements: extractJobRequirements(listing), preferences: preference ?? {} });
        res.json({ jobId: req.params.jobId, stored: false, report, resumeVersion: version, disclaimer: MATCH_DISCLAIMER });
      } catch (err) { next(err); }
    },

    /** Interview preparation for one job (Phase 6 + 7 + 9 engines). */
    async interviewPreparation(req, res, next) {
      try {
        const userId = req.user.id;
        const { listing } = await resolveJob(req.params.jobId, userId);
        const [{ content, version }, careerSnapshot, preference] = await Promise.all([
          loadVersionContent(userId, req.query?.resumeVersionId),
          careerRepo ? careerRepo.loadSnapshot(userId).catch(() => ({})) : Promise.resolve({}),
          repo.getPreference(userId),
        ]);
        const requirements = extractJobRequirements(listing);
        const match = content ? matchResumeToJob({ content, job: listing, requirements, preferences: preference ?? {} }) : null;
        if (!match) {
          return res.json({
            jobId: req.params.jobId,
            preparation: null,
            note: "Interview preparation is built from the gap between this listing and a resume version. Create a resume version first.",
          });
        }
        res.json({
          jobId: req.params.jobId,
          job: { id: listing.id, title: listing.title, companyName: listing.companyName },
          resumeVersion: version,
          preparation: buildJobPreparation({ job: listing, match, careerSnapshot, targetRole: listing.targetRole }),
        });
      } catch (err) { next(err); }
    },

    /**
     * Prepare job-specific resume tailoring and hand over to Phase 8.
     * Creates (once) a JobDescription for the listing so the existing grounded
     * tailoring endpoint can be called with a jobDescriptionId.
     */
    async tailorResume(req, res, next) {
      try {
        const userId = req.user.id;
        const { listing, externalJobId, jobDescriptionId } = await resolveJob(req.params.jobId, userId);

        const versions = await repo.listResumeVersions(userId);
        if (!versions.length) {
          throw new ApiError(409, "Create a resume version in the resume builder first; tailoring edits a version, never your uploaded file.", { code: "NO_RESUME_VERSION" });
        }

        // Score every version so the recommendation is evidence-based.
        const preference = await repo.getPreference(userId);
        const requirements = extractJobRequirements(listing);
        const scored = [];
        for (const v of versions) {
          const full = await repo.findResumeVersion(v.id, userId);
          if (!full?.content) continue;
          const report = matchResumeToJob({ content: full.content, job: listing, requirements, preferences: preference ?? {} });
          scored.push({ version: v, report });
        }
        scored.sort((a, b) => (b.report.matchScore ?? -1) - (a.report.matchScore ?? -1));
        // Never recommend editing the read-only original.
        const editable = scored.filter((s) => !s.version.isOriginal);
        const recommended = (editable[0] ?? scored[0]) ?? null;
        if (!recommended) throw new ApiError(409, "No resume version has any content to tailor.", { code: "EMPTY_VERSION" });

        // Reuse the user's own saved description when this job already is one.
        let targetJobDescriptionId = jobDescriptionId;
        if (!targetJobDescriptionId && req.body?.saveJobDescription !== false) {
          const existing = (await repo.listJobDescriptions(userId)).find(
            (jd) => jd.sourceUrl && listing.applyUrl && jd.sourceUrl === listing.applyUrl
          );
          if (existing) targetJobDescriptionId = existing.id;
          else {
            const created = await jobDescriptionRepo.create(userId, {
              jobTitle: sanitizeShortText(listing.title, 120),
              targetRole: sanitizeShortText(listing.title, 80),
              companyName: listing.companyName ? sanitizeShortText(listing.companyName, 120) : null,
              description: listing.description,
              sourceUrl: listing.applyUrl ?? listing.sourceUrl ?? null,
              // Requirements read by the deterministic extractor, so the Phase 8
              // flow sees the same skills this match was computed from.
              extractedRequirements: { skills: requirements.skills.map((s) => ({ name: s.name, priority: s.priority })), method: requirements.method },
            });
            targetJobDescriptionId = created.id;
          }
        }

        const report = recommended.report;
        res.json({
          jobId: req.params.jobId,
          recommendedVersion: { ...recommended.version, matchScore: report.matchScore, label: report.label },
          comparison: scored.map((s) => ({ version: { id: s.version.id, name: s.version.name, isOriginal: s.version.isOriginal }, matchScore: s.report.matchScore, label: s.report.label })),
          jobDescriptionId: targetJobDescriptionId,
          /** Keyword suggestions that are truthful by construction. */
          keywordSuggestions: {
            addWhereTrue: report.skills.requiredNotFound,
            evidenceNeeded: report.skills.needingEvidence,
            alreadyStrong: report.skills.requiredDemonstrated,
            rule: "Add a keyword only where you genuinely have the skill, and show where you used it. Nothing is added to your resume by this request.",
          },
          highlight: {
            projects: report.relevantProjects,
            experience: report.relevantExperience,
          },
          experienceGaps: report.mismatches,
          /** The existing Phase 8 flow does the AI suggestions, preview and PDF. */
          next: {
            message: "Tailoring runs in the resume builder, where every suggestion is previewed and accepted or rejected individually and the original upload is never modified.",
            tailorEndpoint: `/api/resume-builder/versions/${recommended.version.id}/tailor`,
            tailorBody: { jobDescriptionId: targetJobDescriptionId },
            href: `/dashboard/resume-builder/${recommended.version.id}?tab=tailor&jobDescriptionId=${encodeURIComponent(targetJobDescriptionId ?? "")}`,
            exportNote: "Export the tailored version with the existing PDF export on that page.",
          },
          externalJobId,
        });
      } catch (err) { next(err); }
    },

    // ── Saved jobs ───────────────────────────────────────────────────────────
    async listSaved(req, res, next) {
      try {
        const userId = req.user.id;
        const rows = await repo.listSavedJobs(userId, { state: req.query?.state });
        const preference = await repo.getPreference(userId);
        const { content } = await loadVersionContent(userId, req.query?.resumeVersionId);
        const reportMap = await repo.matchReportMap(userId);

        const items = rows.map((row) => {
          const listing = row.externalJob
            ? externalJobAsListing(row.externalJob)
            : row.jobDescription
              ? jobDescriptionAsListing(row.jobDescription)
              : null;
          if (!listing) return null;
          const match = content ? matchResumeToJob({ content, job: listing, preferences: preference ?? {} }) : null;
          return {
            savedJobId: row.id,
            state: row.state,
            notes: row.notes,
            savedAt: row.createdAt,
            updatedAt: row.updatedAt,
            job: { ...listing, missingFields: missingFields(listing) },
            match: match ? { matchScore: match.matchScore, label: match.label, requiredNotFound: match.skills.requiredNotFound, mismatchCount: match.mismatches.length } : null,
            storedMatch: reportMap.get(listing.id) ?? null,
            application: row.application ?? null,
            ranking: rankJob({ job: listing, match, preferences: preference ?? {} }),
          };
        }).filter(Boolean);

        res.json({
          items,
          counts: {
            total: items.length,
            saved: items.filter((i) => i.state === "saved").length,
            interested: items.filter((i) => i.state === "interested").length,
            hidden: items.filter((i) => i.state === "hidden").length,
            withApplication: items.filter((i) => i.application).length,
          },
          note: items.some((i) => !i.match) ? "Match scores need a resume version; create one in the resume builder." : null,
        });
      } catch (err) { next(err); }
    },

    async save(req, res, next) {
      try {
        const userId = req.user.id;
        const { externalJobId, jobDescriptionId, listing } = await resolveJob(req.body.jobId, userId);
        const row = await repo.saveJob(userId, { externalJobId, jobDescriptionId, state: req.body.state, notes: req.body.notes ?? null });
        logger.info("job saved", { meta: { userId, jobId: req.body.jobId, state: row.state } });
        res.status(201).json({ savedJob: { id: row.id, state: row.state, notes: row.notes }, job: { id: listing.id, title: listing.title, companyName: listing.companyName } });
      } catch (err) { next(err); }
    },

    async updateSaved(req, res, next) {
      try {
        const data = {};
        if (req.body.state !== undefined) data.state = req.body.state;
        if (req.body.notes !== undefined) data.notes = req.body.notes;
        const row = await repo.updateSavedJob(req.params.savedJobId, req.user.id, data);
        res.json({ savedJob: { id: row.id, state: row.state, notes: row.notes, applicationId: row.applicationId } });
      } catch (err) { next(err); }
    },

    async deleteSaved(req, res, next) {
      try {
        await repo.deleteSavedJob(req.params.savedJobId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    /**
     * Start an application record for a saved job. This creates one Phase 5
     * `JobApplication` and links it; every later change goes through
     * `/api/applications/:id`. A second record for the same job is refused
     * unless the caller explicitly asks for one.
     */
    async startApplication(req, res, next) {
      try {
        const userId = req.user.id;
        const saved = await repo.findSavedJob(req.params.savedJobId, userId);
        const listing = saved.externalJob ? externalJobAsListing(saved.externalJob) : jobDescriptionAsListing(saved.jobDescription);

        if (saved.applicationId && !req.body.allowDuplicate) {
          throw conflict("This job already has an application record. Open it from the application tracker, or pass allowDuplicate to create a second one deliberately.");
        }
        const existing = await repo.findApplicationForJob(userId, {
          jobDescriptionId: saved.jobDescriptionId,
          companyName: listing.companyName,
          jobTitle: listing.title,
        });
        if (existing && !req.body.allowDuplicate) {
          throw conflict(`You already track an application for “${listing.title}” at ${listing.companyName}. Pass allowDuplicate to create a second record.`);
        }

        const application = await applicationRepo.create(userId, {
          jobDescriptionId: saved.jobDescriptionId ?? null,
          companyName: listing.companyName,
          jobTitle: listing.title,
          jobUrl: listing.applyUrl ?? listing.sourceUrl ?? null,
          status: req.body.status,
          ...(req.body.applicationDate ? { applicationDate: req.body.applicationDate } : {}),
          ...(req.body.nextFollowUpDate ? { nextFollowUpDate: req.body.nextFollowUpDate } : {}),
          notes: req.body.notes ?? null,
        });
        const updated = await repo.updateSavedJob(saved.id, userId, { applicationId: application.id, state: saved.state === "hidden" ? "saved" : saved.state });

        logger.info("application started from job discovery", { meta: { userId, applicationId: application.id, savedJobId: saved.id } });
        res.status(201).json({
          application,
          savedJob: { id: updated.id, state: updated.state, applicationId: updated.applicationId },
          note: "Status changes, follow-up dates and interview dates are managed in the application tracker — this phase does not duplicate it.",
          href: "/dashboard/applications",
        });
      } catch (err) { next(err); }
    },

    // ── Search preferences ───────────────────────────────────────────────────
    async getPreferences(req, res, next) {
      try {
        const row = await repo.getPreference(req.user.id);
        res.json({
          preference: row,
          defaults: { rankingWeights: DEFAULT_RANKING_WEIGHTS },
          factorLabels: RANKING_FACTOR_LABELS,
          note: "Weights change only the order of results, never the match score.",
        });
      } catch (err) { next(err); }
    },

    async putPreferences(req, res, next) {
      try {
        const row = await repo.upsertPreference(req.user.id, {
          titles: req.body.titles,
          skills: req.body.skills,
          locations: req.body.locations,
          workArrangements: req.body.workArrangements,
          employmentTypes: req.body.employmentTypes,
          experienceLevel: req.body.experienceLevel ?? null,
          minSalary: req.body.minSalary ?? null,
          salaryCurrency: req.body.salaryCurrency ?? null,
          excludedCompanies: req.body.excludedCompanies,
          keywords: req.body.keywords ?? null,
          rankingWeights: req.body.rankingWeights ?? null,
        });
        res.json({ preference: row, defaults: { rankingWeights: DEFAULT_RANKING_WEIGHTS } });
      } catch (err) { next(err); }
    },

    // ── Alerts ───────────────────────────────────────────────────────────────
    async listAlerts(req, res, next) {
      try {
        const rows = await repo.listAlerts(req.user.id);
        res.json({
          alerts: rows.map((a) => presentAlert(a, req.env ?? {})),
          scheduler: {
            available: false,
            message: "This deployment has no background job runner, so alerts run when you press “Run now”. Nothing is delivered automatically and no email or push notification is sent.",
            toEnable: "Add a scheduled process that calls the alert runner for each active alert; see backend/src/jobs/README.md.",
          },
        });
      } catch (err) { next(err); }
    },

    async createAlert(req, res, next) {
      try {
        const existing = await repo.listAlerts(req.user.id);
        if (existing.length >= 20) throw badRequest("You already have 20 alerts. Delete one before adding another.");
        if (existing.some((a) => a.name.toLowerCase() === req.body.name.toLowerCase())) {
          throw conflict(`You already have an alert called “${req.body.name}”.`);
        }
        const row = await repo.createAlert(req.user.id, {
          name: req.body.name,
          query: req.body.query,
          frequency: req.body.frequency,
          isActive: req.body.isActive,
        });
        res.status(201).json({ alert: presentAlert(row, req.env ?? {}) });
      } catch (err) { next(err); }
    },

    async updateAlert(req, res, next) {
      try {
        const data = {};
        for (const key of ["name", "query", "frequency", "isActive"]) if (req.body[key] !== undefined) data[key] = req.body[key];
        const row = await repo.updateAlert(req.params.alertId, req.user.id, data);
        res.json({ alert: presentAlert(row, req.env ?? {}) });
      } catch (err) { next(err); }
    },

    async deleteAlert(req, res, next) {
      try {
        await repo.deleteAlert(req.params.alertId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    /** Run one alert now: search, notify about genuinely new matches, record it. */
    async runAlert(req, res, next) {
      try {
        const alert = await repo.findAlert(req.params.alertId, req.user.id);
        const result = await alerts.runAlert(req.user.id, alert);
        res.json(result);
      } catch (err) { next(err); }
    },
  };
}
