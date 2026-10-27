/**
 * jobRepository.js — Phase 12 persistence: the provider-listing cache, saved
 * jobs, search preferences, match reports and alerts.
 *
 * Two boundaries are enforced here rather than left to callers:
 *
 *   - **Ownership.** Every read and write of a saved job, preference, match
 *     report or alert is filtered by `userId`; a miss is a 404, so one user
 *     cannot discover that another user's row exists.
 *   - **Provider data vs. user data.** `externalJob` rows are a shared cache of
 *     third-party listings and carry nothing a user typed. A user's state about
 *     a listing lives on `savedJob`, and jobs the user enters by hand are
 *     `jobDescription` rows (the Phase 5 model), never cache rows.
 *
 * `upsertJobs` is idempotent on (providerSlug, externalId): refetching the same
 * search updates listings in place instead of multiplying them.
 */
import { notFound } from "../utils/errors.js";

const ignoreDuplicate = (err) => { if (err?.code === "P2002") return null; throw err; };

/** Columns a listing card needs — deliberately without the description body. */
const JOB_CARD_SELECT = {
  id: true, providerSlug: true, externalId: true, fingerprint: true, title: true, companyName: true,
  companyLogoUrl: true, location: true, isRemote: true, workArrangement: true, employmentType: true,
  experienceLevel: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true,
  salaryIsEstimate: true, isSponsored: true, postedAt: true, postedAtReliable: true, sourceUrl: true,
  applyUrl: true, tags: true, listingStatus: true, fetchedAt: true, lastCheckedAt: true,
};

export function createJobRepository(prisma) {
  return {
    // ── Providers (bookkeeping only; credentials live in env) ───────────────
    async upsertProvider(slug, data) {
      const existing = await prisma.jobProvider.findFirst({ where: { slug } });
      if (existing) return prisma.jobProvider.update({ where: { slug }, data });
      return prisma.jobProvider.create({ data: { slug, ...data } }).catch(async (err) => { ignoreDuplicate(err); return prisma.jobProvider.findFirst({ where: { slug } }); });
    },
    async listProviderRows() {
      return prisma.jobProvider.findMany({ orderBy: { slug: "asc" } });
    },
    /**
     * Record the outcome of one provider call. Read-then-write rather than an
     * upsert with `increment`, so the request counter stays a plain column and a
     * concurrent first write just loses the race (P2002 → re-read).
     */
    async recordProviderResult(slug, { displayName, attribution, termsUrl, status, error, jobCount }) {
      const existing = await prisma.jobProvider.findFirst({ where: { slug } });
      const data = {
        displayName: displayName ?? slug,
        attribution: attribution ?? null,
        termsUrl: termsUrl ?? null,
        lastFetchedAt: new Date(),
        lastStatus: status,
        lastError: error ?? null,
        lastJobCount: jobCount ?? 0,
        requestCount: (existing?.requestCount ?? 0) + 1,
      };
      if (existing) return prisma.jobProvider.update({ where: { slug }, data });
      return prisma.jobProvider.create({ data: { slug, ...data } }).catch(async (err) => { ignoreDuplicate(err); return prisma.jobProvider.findFirst({ where: { slug } }); });
    },

    // ── Provider listing cache ─────────────────────────────────────────────
    /**
     * Insert or refresh normalized listings. Returns the stored rows plus how
     * many were new, so the caller can tell the user what a refresh actually did
     * and so alerts can notify only on genuinely new listings.
     * @param {object[]} jobs normalized jobs
     */
    async upsertJobs(jobs) {
      const stored = [];
      let created = 0;
      let updated = 0;
      for (const job of jobs) {
        const { duplicateOf: _duplicateOf, ...data } = job;
        const existing = await prisma.externalJob.findFirst({
          where: { providerSlug: data.providerSlug, externalId: data.externalId },
          select: { id: true },
        });
        if (existing) {
          stored.push(await prisma.externalJob.update({
            where: { id: existing.id },
            // fetchedAt is left alone so retention measures first sight, not last touch.
            data: { ...data, lastCheckedAt: new Date() },
          }));
          updated += 1;
        } else {
          const row = await prisma.externalJob.create({ data: { ...data, fetchedAt: new Date(), lastCheckedAt: new Date() } }).catch(ignoreDuplicate);
          if (row) { stored.push(row); created += 1; }
        }
      }
      return { jobs: stored, created, updated };
    },

    /** Cached listings for a search, with filtering done in SQL where possible. */
    async searchCachedJobs({ providerSlugs = [], text = null, location = null, workArrangements = [], employmentTypes = [], experienceLevels = [], minSalary = null, postedWithinDays = null, excludeCompanies = [], excludeJobIds = [], freshOnly = null } = {}) {
      const where = { listingStatus: "open" };
      if (providerSlugs.length) where.providerSlug = { in: providerSlugs };
      if (workArrangements.length) where.workArrangement = { in: workArrangements };
      if (employmentTypes.length) where.employmentType = { in: employmentTypes };
      if (experienceLevels.length) where.experienceLevel = { in: experienceLevels };
      if (excludeJobIds.length) where.id = { notIn: excludeJobIds };
      if (freshOnly instanceof Date) where.fetchedAt = { gte: freshOnly };
      if (minSalary) where.OR = [{ salaryMax: { gte: minSalary } }, { salaryMin: { gte: minSalary } }];
      if (postedWithinDays) {
        // Only listings with a trustworthy timestamp can honour a date filter.
        where.postedAtReliable = true;
        where.postedAt = { gte: new Date(Date.now() - postedWithinDays * 86_400_000) };
      }
      const AND = [];
      if (text) {
        AND.push({ OR: [
          { title: { contains: text, mode: "insensitive" } },
          { companyName: { contains: text, mode: "insensitive" } },
          { description: { contains: text, mode: "insensitive" } },
        ] });
      }
      if (location) AND.push({ OR: [{ location: { contains: location, mode: "insensitive" } }, { workArrangement: "remote" }] });
      for (const c of excludeCompanies) AND.push({ NOT: { companyName: { contains: c, mode: "insensitive" } } });
      if (AND.length) where.AND = AND;

      return prisma.externalJob.findMany({ where, orderBy: { fetchedAt: "desc" }, take: 400 });
    },

    async findJob(id) {
      return prisma.externalJob.findFirst({ where: { id } });
    },
    async findJobOrThrow(id) {
      const row = await prisma.externalJob.findFirst({ where: { id } });
      if (!row) throw notFound("That job listing is no longer available.");
      return row;
    },
    async markListingStatus(id, listingStatus) {
      return prisma.externalJob.update({ where: { id }, data: { listingStatus, lastCheckedAt: new Date() } }).catch(() => null);
    },
    /**
     * Provider retention: delete cached listings first seen before the cutoff.
     * A listing someone saved is kept, because their saved row would otherwise
     * cascade away and the job would vanish from their list without warning.
     */
    async purgeExpiredJobs(cutoff) {
      const stale = await prisma.externalJob.findMany({ where: { fetchedAt: { lt: cutoff } }, select: { id: true } });
      if (!stale.length) return 0;
      const staleIds = stale.map((r) => r.id);
      const saved = await prisma.savedJob.findMany({ where: { externalJobId: { in: staleIds } }, select: { externalJobId: true } });
      const keep = new Set(saved.map((r) => r.externalJobId));
      const deletable = staleIds.filter((id) => !keep.has(id));
      if (!deletable.length) return 0;
      const { count } = await prisma.externalJob.deleteMany({ where: { id: { in: deletable } } });
      return count;
    },

    // ── Saved jobs (user-owned) ────────────────────────────────────────────
    async listSavedJobs(userId, { state = null } = {}) {
      const where = { userId };
      if (state) where.state = state;
      return prisma.savedJob.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          externalJob: true,
          jobDescription: { select: { id: true, jobTitle: true, companyName: true, targetRole: true, sourceUrl: true, extractedRequirements: true, description: true, createdAt: true } },
          application: { select: { id: true, status: true, applicationDate: true, nextFollowUpDate: true, jobUrl: true, notes: true } },
        },
      });
    },
    async findSavedJob(savedJobId, userId) {
      const row = await prisma.savedJob.findFirst({
        where: { id: savedJobId, userId },
        include: { externalJob: true, jobDescription: true, application: { select: { id: true, status: true } } },
      });
      if (!row) throw notFound("Saved job not found.");
      return row;
    },
    async findSavedByJob(userId, { externalJobId = null, jobDescriptionId = null }) {
      if (!externalJobId && !jobDescriptionId) return null;
      return prisma.savedJob.findFirst({ where: { userId, ...(externalJobId ? { externalJobId } : { jobDescriptionId }) } });
    },
    async saveJob(userId, { externalJobId = null, jobDescriptionId = null, state = "saved", notes = null }) {
      const existing = await this.findSavedByJob(userId, { externalJobId, jobDescriptionId });
      if (existing) {
        return prisma.savedJob.update({ where: { id: existing.id }, data: { state, ...(notes === null ? {} : { notes }) } });
      }
      return prisma.savedJob.create({ data: { userId, externalJobId, jobDescriptionId, state, notes } });
    },
    async updateSavedJob(savedJobId, userId, data) {
      await this.findSavedJob(savedJobId, userId);
      return prisma.savedJob.update({ where: { id: savedJobId }, data });
    },
    async deleteSavedJob(savedJobId, userId) {
      await this.findSavedJob(savedJobId, userId);
      await prisma.savedJob.delete({ where: { id: savedJobId } });
    },
    /** Ids the user has hidden, so discovery can drop them before ranking. */
    async hiddenJobIds(userId) {
      const rows = await prisma.savedJob.findMany({ where: { userId, state: "hidden" }, select: { externalJobId: true } });
      return rows.map((r) => r.externalJobId).filter(Boolean);
    },
    async savedStateMap(userId) {
      const rows = await prisma.savedJob.findMany({
        where: { userId },
        select: { id: true, externalJobId: true, jobDescriptionId: true, state: true, notes: true, applicationId: true },
      });
      return new Map(rows.map((r) => [r.externalJobId ?? `jd:${r.jobDescriptionId}`, r]));
    },

    // ── Search preferences ─────────────────────────────────────────────────
    async getPreference(userId) {
      return prisma.jobSearchPreference.findFirst({ where: { userId } });
    },
    async upsertPreference(userId, data) {
      const existing = await prisma.jobSearchPreference.findFirst({ where: { userId } });
      if (existing) return prisma.jobSearchPreference.update({ where: { id: existing.id }, data });
      return prisma.jobSearchPreference.create({ data: { userId, ...data } });
    },

    // ── Match reports ──────────────────────────────────────────────────────
    async saveMatchReport(userId, { externalJobId = null, jobDescriptionId = null, resumeVersionId, matchScore, label, scoringVersion, details }) {
      const where = { userId, resumeVersionId, ...(externalJobId ? { externalJobId } : { jobDescriptionId }) };
      const existing = await prisma.jobMatchReport.findFirst({ where });
      const data = { matchScore, label, scoringVersion, details };
      if (existing) return prisma.jobMatchReport.update({ where: { id: existing.id }, data });
      return prisma.jobMatchReport.create({ data: { userId, externalJobId, jobDescriptionId, resumeVersionId, ...data } });
    },
    async findMatchReport(userId, { externalJobId = null, jobDescriptionId = null, resumeVersionId = null } = {}) {
      const where = { userId, ...(externalJobId ? { externalJobId } : {}), ...(jobDescriptionId ? { jobDescriptionId } : {}), ...(resumeVersionId ? { resumeVersionId } : {}) };
      return prisma.jobMatchReport.findFirst({ where, orderBy: { updatedAt: "desc" } });
    },
    /** Latest report per job for a list view, so cards show a score without recomputing. */
    async matchReportMap(userId) {
      const rows = await prisma.jobMatchReport.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, externalJobId: true, jobDescriptionId: true, resumeVersionId: true, matchScore: true, label: true, scoringVersion: true, updatedAt: true },
      });
      const map = new Map();
      for (const r of rows) {
        const key = r.externalJobId ?? `jd:${r.jobDescriptionId}`;
        if (!map.has(key)) map.set(key, r);
      }
      return map;
    },

    // ── Alerts ─────────────────────────────────────────────────────────────
    async listAlerts(userId) {
      return prisma.jobAlert.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    },
    async findAlert(alertId, userId) {
      const row = await prisma.jobAlert.findFirst({ where: { id: alertId, userId } });
      if (!row) throw notFound("Job alert not found.");
      return row;
    },
    async createAlert(userId, data) {
      return prisma.jobAlert.create({ data: { userId, ...data } });
    },
    async updateAlert(alertId, userId, data) {
      await this.findAlert(alertId, userId);
      return prisma.jobAlert.update({ where: { id: alertId }, data });
    },
    async deleteAlert(alertId, userId) {
      await this.findAlert(alertId, userId);
      await prisma.jobAlert.delete({ where: { id: alertId } });
    },

    /**
     * Which of these notification keys this user already has. Alert
     * de-duplication checks this before creating, so "already announced" is a
     * decision the service can see and report rather than a swallowed unique
     * violation; the `(userId, dedupeKey)` constraint remains the final guard.
     */
    async existingNotificationKeys(userId, keys) {
      if (!keys.length) return new Set();
      const rows = await prisma.userNotification.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } });
      return new Set(rows.map((r) => r.dedupeKey));
    },

    // ── Cross-phase reads (owner-scoped, no resume or JD text) ─────────────
    /** Resume versions usable for matching, newest first. */
    async listResumeVersions(userId) {
      return prisma.resumeVersion.findMany({
        where: { userId },
        orderBy: [{ isOriginal: "asc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, kind: true, isOriginal: true, templateId: true, lastQualityScore: true, targetJobTitle: true, updatedAt: true },
      });
    },
    async findResumeVersion(versionId, userId) {
      const row = await prisma.resumeVersion.findFirst({ where: { id: versionId, userId } });
      if (!row) throw notFound("Resume version not found.");
      return row;
    },
    /** The user's own saved job descriptions, offered beside provider listings. */
    async listJobDescriptions(userId) {
      return prisma.jobDescription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, jobTitle: true, companyName: true, targetRole: true, description: true, sourceUrl: true, extractedRequirements: true, createdAt: true },
      });
    },
    async findJobDescription(jobDescriptionId, userId) {
      const row = await prisma.jobDescription.findFirst({ where: { id: jobDescriptionId, userId } });
      if (!row) throw notFound("Job description not found.");
      return row;
    },
    /** Existing applications, used to prevent a duplicate tracker record. */
    async findApplicationForJob(userId, { jobDescriptionId = null, companyName = null, jobTitle = null }) {
      if (jobDescriptionId) {
        const byJd = await prisma.jobApplication.findFirst({ where: { userId, jobDescriptionId } });
        if (byJd) return byJd;
      }
      if (companyName && jobTitle) {
        return prisma.jobApplication.findFirst({
          where: { userId, companyName: { equals: companyName, mode: "insensitive" }, jobTitle: { equals: jobTitle, mode: "insensitive" } },
        });
      }
      return null;
    },
    JOB_CARD_SELECT,
  };
}
