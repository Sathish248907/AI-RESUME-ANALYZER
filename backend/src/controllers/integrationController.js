/**
 * integrationController.js — Phase 14 HTTP handlers.
 *
 * Two things here are unlike the rest of the API:
 *
 *   1. **The OAuth callback is not an authenticated business action.** The
 *      provider redirects the browser to it, so there is no Bearer token. The
 *      `state` value *is* the authentication: it was issued to one user, stored
 *      server-side, matched in constant time and consumed on first use. The
 *      handler therefore never trusts anything else in the query string, and it
 *      redirects back into the app rather than rendering a page.
 *   2. **Nothing external happens without approval.** Calendar sync offers a
 *      dry run, Drive export is always an explicit request for one document,
 *      and an automation run executes external actions only when `approved` is
 *      true for that run.
 */
import { ApiError, badRequest } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { describeIntegrations, findOAuthIntegration, redirectUriFor } from "../services/integrations/integrationRegistry.js";
import { SYNCABLE_EVENT_TYPES, DEFAULT_CALENDAR_PREFERENCES } from "../services/integrations/googleCalendarService.js";
import { DEFAULT_EMAIL_PREFERENCES, EMAIL_CATEGORIES } from "../services/integrations/emailService.js";
import { WORKFLOWS, WORKFLOW_BY_KEY, describeWorkflow, resolveConfig } from "../services/automation/automationCatalog.js";

/**
 * @param {{ repo, env, vault, oauth, calendar, drive, email, engine, jobRegistry, resumeBuilderRepo, renderResumePdf, renderCoverLetterPdf }} deps
 */
export function createIntegrationController({
  repo, env, vault, oauth, calendar, drive, email, engine, jobRegistry,
  resumeBuilderRepo, renderResumePdf, renderCoverLetterPdf,
}) {
  /** Stored connections keyed by provider, for the registry description. */
  async function connectionMap(userId) {
    const rows = await repo.listIntegrations(userId);
    return new Map(rows.map((r) => [r.provider, r]));
  }

  return {
    // ── Dashboard ────────────────────────────────────────────────────────────
    async list(req, res, next) {
      try {
        const [connections, jobProviders] = await Promise.all([
          connectionMap(req.user.id),
          Promise.resolve(jobRegistry ? jobRegistry.listProviders() : []),
        ]);
        const described = describeIntegrations(env, { jobProviders, connections });
        res.json({
          ...described,
          email: email.status(),
          calendarEventTypes: SYNCABLE_EVENT_TYPES,
          emailCategories: EMAIL_CATEGORIES,
          note: "An integration is shown as connectable only when this server could actually complete the flow. Nothing here is a placeholder button.",
        });
      } catch (err) { next(err); }
    },

    async status(req, res, next) {
      try {
        const userId = req.user.id;
        const provider = req.params.provider;
        const integration = await repo.findIntegration(userId, provider);
        const spec = findOAuthIntegration(provider);

        if (provider === "email") {
          return res.json({
            provider,
            ...email.status(),
            preferences: { ...DEFAULT_EMAIL_PREFERENCES, ...(integration?.preferences ?? {}) },
          });
        }
        if (!spec) throw new ApiError(404, `“${provider}” is not an integration this build supports.`, { code: "UNKNOWN_PROVIDER" });

        res.json({
          provider,
          displayName: spec.displayName,
          connected: integration?.status === "connected",
          status: integration?.status ?? "disconnected",
          scopes: integration?.scopes ?? [],
          scopeExplanations: spec.scopeExplanations,
          connectedAt: integration?.connectedAt ?? null,
          expiresAt: integration?.expiresAt ?? null,
          lastSyncAt: integration?.lastSyncAt ?? null,
          lastError: integration?.lastError ?? null,
          preferences: provider === "google_calendar"
            ? { ...DEFAULT_CALENDAR_PREFERENCES, ...(integration?.preferences ?? {}) }
            : (integration?.preferences ?? {}),
          credential: integration ? vault.describe(integration) : null,
          redirectUri: redirectUriFor(env),
        });
      } catch (err) { next(err); }
    },

    // ── OAuth ────────────────────────────────────────────────────────────────
    async connect(req, res, next) {
      try {
        const result = await oauth.startAuthorization(req.user.id, req.params.provider, { returnTo: req.body?.returnTo ?? null });
        res.json(result);
      } catch (err) { next(err); }
    },

    /**
     * The provider's redirect lands here. Unauthenticated by necessity; the
     * single-use `state` is what ties it to a user. Always redirects back to
     * the app so the browser never sits on an API response.
     */
    async callback(req, res) {
      const frontend = (env.FRONTEND_ORIGINS?.[0] ?? "http://localhost:3001").replace(/\/+$/, "");
      const back = (params) => `${frontend}/dashboard/integrations?${new URLSearchParams(params).toString()}`;
      try {
        const result = await oauth.completeAuthorization({
          state: req.query.state,
          code: req.query.code,
          error: req.query.error,
          errorDescription: req.query.error_description,
        });
        logger.info("oauth callback ok", { meta: { provider: result.provider } });
        const target = result.returnTo && result.returnTo.startsWith("/") ? `${frontend}${result.returnTo}` : null;
        const params = { connected: result.provider, ...(result.missingScopes.length ? { partialScopes: "1" } : {}) };
        return res.redirect(target ? `${target}?${new URLSearchParams(params).toString()}` : back(params));
      } catch (err) {
        const code = err?.code ?? "OAUTH_FAILED";
        logger.warn("oauth callback failed", { meta: { code } });
        return res.redirect(back({ error: code, message: err?.message?.slice(0, 200) ?? "The connection could not be completed." }));
      }
    },

    async disconnect(req, res, next) {
      try {
        const result = await oauth.disconnect(req.user.id, req.params.provider);
        res.json(result);
      } catch (err) { next(err); }
    },

    // ── Sync ─────────────────────────────────────────────────────────────────
    async sync(req, res, next) {
      try {
        const userId = req.user.id;
        const provider = req.params.provider;
        if (provider !== "google_calendar") {
          throw badRequest(`“${provider}” has nothing to synchronise. Drive exports are made one document at a time.`);
        }
        const result = await calendar.syncAll(userId, { dryRun: req.body?.dryRun === true });
        res.json(result);
      } catch (err) { next(err); }
    },

    async syncHistory(req, res, next) {
      try {
        const rows = await repo.listSyncLogs(req.user.id, req.params.provider, { limit: req.query?.limit ?? 50 });
        res.json({
          provider: req.params.provider,
          entries: rows.map((r) => ({
            id: r.id, action: r.action, status: r.status, detail: r.detail,
            externalId: r.externalId, createdAt: r.createdAt,
          })),
          note: "Every consequential external action this product took on your behalf is listed here.",
        });
      } catch (err) { next(err); }
    },

    async updatePreferences(req, res, next) {
      try {
        const userId = req.user.id;
        const provider = req.params.provider;
        const existing = await repo.findIntegration(userId, provider);
        const base = provider === "google_calendar"
          ? DEFAULT_CALENDAR_PREFERENCES
          : provider === "email"
            ? DEFAULT_EMAIL_PREFERENCES
            : {};
        const merged = { ...base, ...(existing?.preferences ?? {}), ...req.body };
        const row = await repo.setPreferences(userId, provider, merged);
        res.json({ provider, preferences: row.preferences });
      } catch (err) { next(err); }
    },

    // ── Drive export ─────────────────────────────────────────────────────────
    async driveExport(req, res, next) {
      try {
        const userId = req.user.id;
        const { sourceKind, sourceId, folderId, folderName } = req.body;

        const document = await repo.exportableDocument(userId, sourceKind, sourceId);
        if (!document) throw new ApiError(404, "That document was not found.", { code: "DOCUMENT_NOT_FOUND" });

        // Only finished work is exported, so a half-written draft does not end
        // up in someone's Drive looking final.
        if (sourceKind === "cover_letter" && document.status !== "approved") {
          throw new ApiError(409, "Approve this cover letter before exporting it.", { code: "NOT_APPROVED" });
        }

        let target = folderId ?? null;
        if (!target && folderName) target = (await drive.createFolder(userId, folderName)).id;

        const { buffer, name } = sourceKind === "resume_version"
          ? { buffer: (await renderResumePdf(document)).buffer, name: `${document.name || "Resume"}.pdf` }
          : { buffer: (await renderCoverLetterPdf({ content: document.content, jobTitle: "", companyName: "" })).buffer, name: `${document.title || "Cover letter"}.pdf` };

        const result = await drive.exportFile(userId, { name, buffer, mimeType: "application/pdf", sourceKind, sourceId }, { folderId: target });
        res.json(result);
      } catch (err) { next(err); }
    },

    async driveFolders(req, res, next) {
      try {
        res.json(await drive.listFolders(req.user.id));
      } catch (err) { next(err); }
    },

    // ── Email ────────────────────────────────────────────────────────────────
    async emailHistory(req, res, next) {
      try {
        res.json(await email.history(req.user.id, { limit: req.query?.limit ?? 50 }));
      } catch (err) { next(err); }
    },

    // ── Automation ───────────────────────────────────────────────────────────
    async listRules(req, res, next) {
      try {
        const userId = req.user.id;
        const [rules, calendarConnected] = await Promise.all([
          repo.listRules(userId),
          repo.isConnected(userId, "google_calendar"),
        ]);
        const byKey = new Map(rules.map((r) => [r.workflowKey, r]));

        res.json({
          workflows: WORKFLOWS.map((spec) => {
            const rule = byKey.get(spec.key) ?? null;
            const described = describeWorkflow(spec);
            // Say up front which options cannot work yet, so a switch the user
            // flips does not quietly do nothing.
            const unavailable = (spec.configSchema ?? [])
              .filter((f) => f.requires === "google_calendar" && !calendarConnected)
              .map((f) => ({ field: f.key, reason: "Google Calendar is not connected." }))
              .concat((spec.configSchema ?? [])
                .filter((f) => f.requires === "email" && !email.status().delivers)
                .map((f) => ({ field: f.key, reason: email.status().note })));
            return {
              ...described,
              rule: rule
                ? { id: rule.id, isEnabled: rule.isEnabled, config: resolveConfig(spec, rule.config), lastRunAt: rule.lastRunAt, lastStatus: rule.lastStatus }
                : { id: null, isEnabled: false, config: spec.defaultConfig, lastRunAt: null, lastStatus: null },
              unavailableOptions: unavailable,
            };
          }),
          anyEnabled: rules.some((r) => r.isEnabled),
          safety: {
            message: "Automation never sends a message to an employer, submits an application, or edits your resume. Actions that leave this app ask for your approval every time.",
            externalActionsRequireApproval: true,
          },
        });
      } catch (err) { next(err); }
    },

    async upsertRule(req, res, next) {
      try {
        const spec = WORKFLOW_BY_KEY[req.body.workflowKey];
        if (!spec) throw badRequest("Unknown workflow.");
        const row = await repo.upsertRule(req.user.id, req.body.workflowKey, {
          isEnabled: req.body.isEnabled,
          config: { ...spec.defaultConfig, ...req.body.config },
        });
        res.status(201).json({ rule: { id: row.id, workflowKey: row.workflowKey, isEnabled: row.isEnabled, config: row.config } });
      } catch (err) { next(err); }
    },

    async updateRule(req, res, next) {
      try {
        const existing = await repo.findRule(req.params.ruleId, req.user.id);
        const spec = WORKFLOW_BY_KEY[existing.workflowKey];
        const data = {};
        if (req.body.isEnabled !== undefined) data.isEnabled = req.body.isEnabled;
        if (req.body.config !== undefined) data.config = { ...spec.defaultConfig, ...existing.config, ...req.body.config };
        const row = await repo.updateRule(existing.id, req.user.id, data);
        res.json({ rule: { id: row.id, workflowKey: row.workflowKey, isEnabled: row.isEnabled, config: row.config } });
      } catch (err) { next(err); }
    },

    async deleteRule(req, res, next) {
      try {
        await repo.deleteRule(req.params.ruleId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    /** Pause everything at once. */
    async pauseAll(req, res, next) {
      try {
        const paused = await repo.pauseAllRules(req.user.id);
        res.json({ paused, note: `${paused} workflow${paused === 1 ? "" : "s"} paused. Nothing will run until you switch them back on.` });
      } catch (err) { next(err); }
    },

    /** Dry run: evaluate and show the plan, change nothing. */
    async previewRule(req, res, next) {
      try {
        const rule = await repo.findRule(req.params.ruleId, req.user.id);
        res.json(await engine.preview(req.user.id, rule));
      } catch (err) { next(err); }
    },

    async runRule(req, res, next) {
      try {
        const rule = await repo.findRule(req.params.ruleId, req.user.id);
        const result = await engine.run(req.user.id, rule, { approved: req.body?.approved === true });
        res.json({
          execution: presentExecution(result.execution),
          plan: result.plan,
          ran: result.ran,
          counts: result.counts ?? null,
        });
      } catch (err) { next(err); }
    },

    async listExecutions(req, res, next) {
      try {
        const rows = await repo.listExecutions(req.user.id, { ruleId: req.query?.ruleId ?? null, limit: req.query?.limit ?? 50 });
        res.json({
          executions: rows.map(presentExecution),
          note: "Each run records what it planned, what you approved and what every step actually did.",
        });
      } catch (err) { next(err); }
    },

    async retryExecution(req, res, next) {
      try {
        const result = await engine.retry(req.user.id, req.params.executionId);
        res.json({ execution: presentExecution(result.execution), counts: result.counts ?? null, note: "Steps that already succeeded were not repeated." });
      } catch (err) { next(err); }
    },
  };
}

/** One execution for the API. */
function presentExecution(row) {
  const results = Array.isArray(row.results) ? row.results : [];
  return {
    id: row.id,
    ruleId: row.ruleId,
    status: row.status,
    statusLabel: {
      succeeded: "Completed", partial: "Partly completed", failed: "Failed",
      skipped: "Nothing to do", awaiting_approval: "Waiting for your approval", planned: "Planned",
    }[row.status] ?? row.status,
    trigger: row.trigger,
    plannedActions: Array.isArray(row.plannedActions) ? row.plannedActions : [],
    results,
    approved: row.approved,
    retryCount: row.retryCount,
    nextRetryAt: row.nextRetryAt,
    errorCategory: row.errorCategory,
    retryable: ["failed", "partial"].includes(row.status),
    createdAt: row.createdAt,
  };
}
