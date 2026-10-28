import { serializeApplication } from "../models/applicationRepository.js";
import { pageMeta } from "../validators/common.js";
import { ApiError } from "../utils/errors.js";
import { evaluateTransition, statusActivity, allowedNext } from "../services/applications/applicationStatusService.js";

/**
 * @param {{ repo, workspaceRepo?: object }} deps `workspaceRepo` is the Phase 13
 * repository. When it is present this endpoint also validates status
 * transitions and writes the activity row for a status change — the tracker
 * stays the single place a status is changed, rather than Phase 13 adding a
 * competing one.
 */
export function createApplicationController({ repo, workspaceRepo = null }) {
  return {
    async create(req, res, next) {
      try {
        // Phase 16: the job-discovery path already refused to create a second
        // record for the same listing; adding one by hand did not, so the same
        // job tracked twice produced two pipelines that drifted apart. Same
        // rule, same escape hatch, same 409 — because sometimes a second
        // application really is deliberate.
        const { allowDuplicate, ...data } = req.body;
        if (!allowDuplicate) {
          const existing = await repo.findDuplicate(req.user.id, data);
          if (existing) {
            throw new ApiError(
              409,
              `You already track an application for “${existing.jobTitle}” at ${existing.companyName}. Open it from the tracker, or send allowDuplicate to add a second record deliberately.`,
              { code: "DUPLICATE_APPLICATION", details: { applicationId: existing.id, status: existing.status } }
            );
          }
        }
        const row = await repo.create(req.user.id, data);
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
        const { statusNote, confirmUnusual, ...patch } = req.body;
        const userId = req.user.id;

        // A status change is validated against the workflow before it is written.
        let transition = null;
        let before = null;
        if (patch.status !== undefined) {
          before = await repo.findByIdForUser(req.params.id, userId);
          transition = evaluateTransition(before.status, patch.status);
          if (!transition.ok && transition.sameStatus) {
            // Not an error worth failing on: drop the no-op and keep any other edits.
            delete patch.status;
            transition = null;
          } else if (!transition.ok && !(transition.unusual && confirmUnusual === true)) {
            throw new ApiError(409, transition.reason, {
              code: transition.unusual ? "UNUSUAL_STATUS_TRANSITION" : "INVALID_STATUS_TRANSITION",
              details: [
                { message: transition.unusual ? "Send confirmUnusual: true to record it anyway." : "" },
                { message: `Usual next steps: ${allowedNext(before.status).map((t) => t.label).join(", ") || "none — this application is closed."}` },
              ].filter((d) => d.message),
            });
          }
        }

        const row = await repo.update(req.params.id, userId, patch);

        if (before && patch.status !== undefined && workspaceRepo) {
          await workspaceRepo.recordActivity(row.id, userId, {
            ...statusActivity(before.status, patch.status, { note: statusNote, source: "user" }),
            dedupeKey: `status:${before.status}->${patch.status}:${Date.now()}`,
          }).catch(() => null);
        }

        res.json({
          application: serializeApplication(row),
          ...(transition?.unusual ? { note: "Recorded as an unusual transition, as you confirmed." } : {}),
        });
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
