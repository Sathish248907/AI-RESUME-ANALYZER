/**
 * applicationWorkspaceController.js — Phase 13 HTTP handlers.
 *
 * Boundaries kept here:
 *   - **One application record.** Nothing in this file creates a JobApplication;
 *     the workspace hangs off applications the Phase 5 tracker owns, and status
 *     changes go through the existing `PATCH /api/applications/:id`.
 *   - **Events come from real operations.** An activity row is written after a
 *     write succeeds, never before and never for history that predates it.
 *   - **Nothing is sent anywhere.** No endpoint submits an application, emails
 *     an employer or creates a calendar invitation.
 */
import { ApiError, badRequest, conflict } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { sanitizeShortText } from "../utils/sanitize.js";
import {
  summarise, presentItem, deriveAutoCompletions, TEMPLATE_BY_KEY,
} from "../services/applications/applicationChecklistService.js";
import { draftCoverLetter, regenerateParagraph, countWords, TONES, LENGTHS } from "../services/applications/coverLetterService.js";
import { renderCoverLetterPdf } from "../services/applications/coverLetterPdfService.js";
import {
  validateDocumentFile, validateDocumentLink, assertStorageUsable, presentDocument, contentDisposition,
  DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES,
} from "../services/applications/applicationDocumentService.js";
import {
  groupReminders, present as presentReminder, dedupeKeyFor, schedulerContract, dueForNotification,
} from "../services/applications/applicationReminderService.js";
import { describeStage, nextAction, allowedNext, STATUS_LABELS } from "../services/applications/applicationStatusService.js";
import { reviewReadiness } from "../services/applications/applicationReadinessService.js";

/**
 * @param {{ repo, applicationRepo, progressRepo, storage, getLlm }} deps
 */
export function createApplicationWorkspaceController({ repo, applicationRepo, progressRepo, storage, getLlm }) {
  /** The job this application is about, from whichever source it came from. */
  function jobContext(application) {
    const saved = application.savedJobs?.[0] ?? null;
    const external = saved?.externalJob ?? null;
    const jd = application.jobDescription ?? null;
    return {
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      description: jd?.description ?? external?.description ?? "",
      jobDescriptionId: jd?.id ?? null,
      externalJobId: external?.id ?? null,
      listingUrl: application.jobUrl ?? external?.applyUrl ?? jd?.sourceUrl ?? null,
      sourceKind: external ? "provider" : jd ? "own" : "manual",
      providerName: external?.providerSlug ?? null,
    };
  }

  /** Surface reminders that have come due, reusing the Phase 10 notification table. */
  async function deliverDueReminders(userId, reminders) {
    if (!progressRepo) return 0;
    const candidates = dueForNotification(reminders, new Set());
    if (!candidates.length) return 0;
    const seen = await repo.notifiedKeys(userId, candidates.map((c) => c.dedupeKey));
    let created = 0;
    for (const c of candidates.filter((x) => !seen.has(x.dedupeKey))) {
      const row = await progressRepo.createNotification(userId, {
        type: "application_reminder",
        title: c.title,
        body: c.body,
        href: c.applicationId ? `/dashboard/applications/${c.applicationId}` : "/dashboard/applications/reminders",
        dedupeKey: c.dedupeKey,
      }).catch(() => null);
      if (row) created += 1;
    }
    return created;
  }

  return {
    // ── Workspace ────────────────────────────────────────────────────────────
    async workspace(req, res, next) {
      try {
        const userId = req.user.id;
        const data = await repo.loadWorkspace(req.params.applicationId, userId);
        const { application, checklist, coverLetters, documents, activity, reminders, interviews } = data;
        const job = jobContext(application);
        const tz = req.query?.tz ?? "UTC";

        const [resumeVersions, match, mockSessions] = await Promise.all([
          repo.listResumeVersions(userId),
          repo.findMatchReport(userId, { jobDescriptionId: job.jobDescriptionId, externalJobId: job.externalJobId }),
          repo.listMockSessions(userId),
        ]);

        const summary = summarise(checklist, application.status);
        const tailored = resumeVersions.find((v) => v.jobDescriptionId && v.jobDescriptionId === job.jobDescriptionId) ?? null;
        const selectedVersion = resumeVersions.find((v) => v.id === (coverLetters[0]?.resumeVersionId ?? null)) ?? tailored ?? null;

        const autoCompletions = deriveAutoCompletions({
          hasMatchReport: Boolean(match),
          hasResumeSelected: Boolean(application.resumeId || selectedVersion),
          hasTailoredVersion: Boolean(tailored),
          hasCoverLetter: coverLetters.length > 0,
          hasDocument: documents.length > 0,
          hasMockInterview: mockSessions.some((s) => s.status === "completed"),
        }).filter((a) => !checklist.find((i) => i.key === a.key)?.completedAt);

        const delivered = await deliverDueReminders(userId, reminders);

        res.json({
          application: {
            id: application.id,
            jobTitle: application.jobTitle,
            companyName: application.companyName,
            status: application.status,
            statusLabel: STATUS_LABELS[application.status],
            outcome: application.outcome ?? null,
            applicationDate: application.applicationDate,
            applicationDeadline: application.applicationDeadline ?? null,
            nextFollowUpDate: application.nextFollowUpDate,
            notes: application.notes,
            createdAt: application.createdAt,
            updatedAt: application.updatedAt,
          },
          job,
          stage: describeStage({ status: application.status, outcome: application.outcome }, summary.preparationStage),
          allowedTransitions: allowedNext(application.status),
          checklist: { items: checklist.map(presentItem), summary, autoCompletions },
          coverLetters: coverLetters.map((c) => ({
            id: c.id, title: c.title, versionNumber: c.versionNumber, status: c.status, source: c.source,
            tone: c.tone, lengthTarget: c.lengthTarget, wordCount: c.wordCount,
            resumeVersionId: c.resumeVersionId, groundingNotes: c.groundingNotes,
            updatedAt: c.updatedAt, preview: String(c.content ?? "").slice(0, 240),
          })),
          documents: documents.map(presentDocument),
          activity: activity.map(presentActivity),
          reminders: groupReminders(reminders, { tz }),
          interviews: interviews.map(presentInterview),
          resumeVersions,
          selectedResumeVersion: selectedVersion,
          match: match ? { id: match.id, matchScore: match.matchScore, label: match.label, scoringVersion: match.scoringVersion, updatedAt: match.updatedAt } : null,
          mockSessions,
          nextAction: nextAction({
            application, checklist: summary, reminders, interviews,
            hasCoverLetter: coverLetters.length > 0,
          }),
          storage: { enabled: Boolean(storage?.enabled), driver: storage?.name ?? "none" },
          scheduler: schedulerContract,
          notificationsCreated: delivered,
          notes: [
            "Nothing here submits an application or contacts an employer. Every status and submission is something you record.",
            storage?.enabled ? null : "File storage is not configured, so documents can only be attached as links until STORAGE_DRIVER is set.",
          ].filter(Boolean),
        });
      } catch (err) { next(err); }
    },

    // ── Checklist ────────────────────────────────────────────────────────────
    async listChecklist(req, res, next) {
      try {
        const application = await repo.assertApplication(req.params.applicationId, req.user.id);
        const items = await repo.ensureChecklist(application.id, req.user.id);
        res.json({ items: items.map(presentItem), summary: summarise(items, application.status) });
      } catch (err) { next(err); }
    },

    async addChecklistItem(req, res, next) {
      try {
        const application = await repo.assertApplication(req.params.applicationId, req.user.id);
        const row = await repo.addChecklistItem(application.id, req.user.id, {
          title: req.body.title,
          description: req.body.description ?? null,
          category: req.body.category,
          isRequired: req.body.isRequired,
        });
        const items = await repo.listChecklist(application.id, req.user.id);
        res.status(201).json({ item: presentItem(row), summary: summarise(items, application.status) });
      } catch (err) { next(err); }
    },

    async updateChecklistItem(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        const existing = await repo.findChecklistItem(req.params.itemId, userId);
        if (existing.applicationId !== application.id) throw badRequest("That checklist item belongs to a different application.");

        const data = {};
        if (req.body.title !== undefined) data.title = req.body.title;
        if (req.body.description !== undefined) data.description = req.body.description;
        if (req.body.isRequired !== undefined) data.isRequired = req.body.isRequired;
        if (req.body.completed !== undefined) {
          data.completedAt = req.body.completed ? new Date() : null;
          data.completionSource = req.body.completed ? req.body.completionSource : null;
        }

        const row = await repo.updateChecklistItem(existing.id, userId, data);

        // A completed step is a real event; reopening one is not an event worth recording.
        if (req.body.completed === true && !existing.completedAt) {
          await repo.recordActivity(application.id, userId, {
            type: "checklist_completed",
            title: `Checklist step completed: ${row.title}`,
            detail: row.completionSource === "external" ? "Marked as done outside this app." : "Completed in the app.",
            source: "user",
            dedupeKey: `checklist:${row.id}:${row.completedAt?.toISOString?.() ?? Date.now()}`,
          });
        }

        const items = await repo.listChecklist(application.id, userId);
        const summary = summarise(items, application.status);

        // The submission step is the one that means "I applied" — offer it, never do it.
        const submissionPrompt = row.key === "record_submission" && req.body.completed === true && application.status === "INTERESTED"
          ? { message: "You marked the submission recorded. Move this application to Applied?", endpoint: `/api/applications/${application.id}`, body: { status: "APPLIED" } }
          : null;

        res.json({ item: presentItem(row), summary, submissionPrompt });
      } catch (err) { next(err); }
    },

    async deleteChecklistItem(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        const existing = await repo.findChecklistItem(req.params.itemId, userId);
        if (existing.applicationId !== application.id) throw badRequest("That checklist item belongs to a different application.");
        if (!existing.isCustom) throw conflict("Template steps cannot be deleted. Mark the step not required instead if it does not apply.");
        await repo.deleteChecklistItem(existing.id, userId);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    // ── Cover letters ────────────────────────────────────────────────────────
    async listCoverLetters(req, res, next) {
      try {
        await repo.assertApplication(req.params.applicationId, req.user.id);
        const rows = await repo.listCoverLetters(req.params.applicationId, req.user.id);
        res.json({ coverLetters: rows, tones: TONES, lengths: LENGTHS });
      } catch (err) { next(err); }
    },

    async createCoverLetter(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        const full = await repo.loadWorkspace(application.id, userId);
        const job = jobContext(full.application);

        // A letter the user wrote themselves: store it, no model involved.
        if (req.body.content) {
          const row = await repo.createCoverLetter(application.id, userId, {
            resumeVersionId: req.body.resumeVersionId ?? null,
            jobDescriptionId: job.jobDescriptionId,
            title: req.body.title ?? `Cover letter — ${application.companyName}`,
            content: req.body.content,
            tone: req.body.tone,
            lengthTarget: req.body.lengthTarget,
            source: "manual",
            status: "draft",
            wordCount: countWords(req.body.content),
          });
          await repo.recordActivity(application.id, userId, {
            type: "cover_letter_created",
            title: `Cover letter added: ${row.title}`,
            detail: "Written by you.",
            source: "user",
            dedupeKey: `cover_letter:${row.id}`,
          });
          return res.status(201).json({ coverLetter: row, generated: false });
        }

        // Otherwise draft one, which needs a resume version to draw facts from.
        const versionId = req.body.resumeVersionId ?? full.coverLetters[0]?.resumeVersionId ?? null;
        const versions = await repo.listResumeVersions(userId);
        const chosen = versionId
          ? await repo.findResumeVersion(versionId, userId)
          : versions.length
            ? await repo.findResumeVersion((versions.find((v) => !v.isOriginal) ?? versions[0]).id, userId)
            : null;
        if (!chosen?.content) {
          throw new ApiError(409, "A cover letter is written from one of your resume versions. Create a version in the resume builder first.", { code: "NO_RESUME_VERSION" });
        }

        const match = await repo.findMatchReport(userId, { jobDescriptionId: job.jobDescriptionId, externalJobId: job.externalJobId });
        const focusSkills = match?.details?.skills?.requiredDemonstrated ?? [];

        const draft = await draftCoverLetter(getLlm(), {
          content: chosen.content,
          jobTitle: application.jobTitle,
          companyName: application.companyName,
          jobDescription: job.description,
          tone: req.body.tone,
          lengthTarget: req.body.lengthTarget,
          userNotes: req.body.userNotes ?? "",
          existingText: req.body.existingText ?? "",
          focusSkills,
        });

        const row = await repo.createCoverLetter(application.id, userId, {
          resumeVersionId: chosen.id,
          jobDescriptionId: job.jobDescriptionId,
          title: req.body.title ?? `Cover letter — ${application.companyName}`,
          content: draft.content,
          tone: draft.tone,
          lengthTarget: draft.lengthTarget,
          source: req.body.existingText ? "edited" : "ai",
          status: "draft",
          provider: draft.provider,
          model: draft.model,
          groundingNotes: draft.groundingNotes,
          wordCount: draft.wordCount,
        });

        await repo.recordActivity(application.id, userId, {
          type: "cover_letter_created",
          title: `Cover letter drafted: ${row.title}`,
          detail: `Draft v${row.versionNumber}, ${row.wordCount} words.`,
          source: "system",
          dedupeKey: `cover_letter:${row.id}`,
        });

        logger.info("cover letter drafted", { meta: { userId, applicationId: application.id, withheld: draft.withheldParagraphs.length } });

        res.status(201).json({
          coverLetter: row,
          generated: true,
          questions: draft.questions,
          highlighted: draft.highlighted,
          withheldParagraphs: draft.withheldParagraphs,
          note: draft.note,
        });
      } catch (err) { next(err); }
    },

    async updateCoverLetter(req, res, next) {
      try {
        const userId = req.user.id;
        const existing = await repo.findCoverLetter(req.params.coverLetterId, userId);
        const data = {};
        for (const key of ["title", "tone", "lengthTarget", "status"]) if (req.body[key] !== undefined) data[key] = req.body[key];
        if (req.body.content !== undefined) {
          data.content = req.body.content;
          data.wordCount = countWords(req.body.content);
          // Editing an AI draft makes it the user's text, not the model's.
          if (existing.source === "ai") data.source = "edited";
        }
        const row = await repo.updateCoverLetter(existing.id, userId, data);

        if (req.body.status === "approved" && existing.status !== "approved") {
          await repo.recordActivity(existing.applicationId, userId, {
            type: "cover_letter_created",
            title: `Cover letter approved: ${row.title}`,
            detail: `v${row.versionNumber}, ${row.wordCount} words.`,
            source: "user",
            dedupeKey: `cover_letter_approved:${row.id}`,
          });
        }
        res.json({ coverLetter: row });
      } catch (err) { next(err); }
    },

    async deleteCoverLetter(req, res, next) {
      try {
        await repo.deleteCoverLetter(req.params.coverLetterId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    /** Rewrite a single paragraph; nothing is saved until the user updates the letter. */
    async regenerateCoverLetterParagraph(req, res, next) {
      try {
        const userId = req.user.id;
        const letter = await repo.findCoverLetter(req.params.coverLetterId, userId);
        const application = await repo.assertApplication(letter.applicationId, userId);
        const full = await repo.loadWorkspace(application.id, userId);
        const job = jobContext(full.application);
        const version = letter.resumeVersionId ? await repo.findResumeVersion(letter.resumeVersionId, userId) : null;
        if (!version?.content) throw new ApiError(409, "The resume version this letter was written from is no longer available.", { code: "NO_RESUME_VERSION" });

        const result = await regenerateParagraph(getLlm(), {
          content: version.content,
          jobTitle: application.jobTitle,
          companyName: application.companyName,
          jobDescription: job.description,
          paragraphText: req.body.paragraphText,
          instruction: req.body.instruction ?? "",
          tone: letter.tone,
        });
        res.json({ ...result, saved: false, note: "This replacement is not saved yet. Update the letter to keep it." });
      } catch (err) { next(err); }
    },

    /** Render an approved (or draft) letter to PDF. */
    async exportCoverLetter(req, res, next) {
      try {
        const userId = req.user.id;
        const letter = await repo.findCoverLetter(req.params.coverLetterId, userId);
        const application = await repo.assertApplication(letter.applicationId, userId);
        const version = letter.resumeVersionId ? await repo.findResumeVersion(letter.resumeVersionId, userId).catch(() => null) : null;
        const personal = version?.content?.personal ?? {};

        const { buffer, pages } = await renderCoverLetterPdf({
          content: letter.content,
          sender: {
            fullName: personal.fullName,
            email: personal.email,
            phone: personal.phone,
            location: personal.location,
            linkedin: personal.linkedin,
          },
          jobTitle: application.jobTitle,
          companyName: application.companyName,
        });

        const fileName = `${(personal.fullName ?? "cover-letter").replace(/[^\w\- ]+/g, "")} — ${application.companyName}.pdf`.trim();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", contentDisposition(fileName));
        res.setHeader("X-Cover-Letter-Pages", String(pages));
        res.send(buffer);
      } catch (err) { next(err); }
    },

    // ── Documents ────────────────────────────────────────────────────────────
    async listDocuments(req, res, next) {
      try {
        await repo.assertApplication(req.params.applicationId, req.user.id);
        const rows = await repo.listDocuments(req.params.applicationId, req.user.id);
        res.json({
          documents: rows.map(presentDocument),
          categories: DOCUMENT_CATEGORIES,
          limits: { maxBytes: MAX_DOCUMENT_BYTES, formats: ["pdf", "docx", "doc", "png", "jpg", "txt"] },
          storage: { enabled: Boolean(storage?.enabled), driver: storage?.name ?? "none" },
        });
      } catch (err) { next(err); }
    },

    async addDocument(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);

        // Link-type: nothing is stored but the URL.
        if (!req.file) {
          if (!req.body.url) throw badRequest("Attach a file, or provide a link.");
          const url = validateDocumentLink(req.body.url);
          const row = await repo.createDocument(application.id, userId, {
            category: req.body.category,
            kind: "link",
            url,
            note: req.body.note ?? null,
          });
          await repo.recordActivity(application.id, userId, {
            type: "document_added", title: `Link added: ${row.category}`, detail: url, source: "user", dedupeKey: `document:${row.id}`,
          });
          return res.status(201).json({ document: presentDocument(row) });
        }

        // File-type: refuse rather than silently discard when storage is off.
        assertStorageUsable(storage);
        const meta = validateDocumentFile(req.file);

        const duplicate = await repo.findDocumentByChecksum(application.id, userId, meta.checksum);
        if (duplicate) {
          throw conflict(`“${duplicate.fileName}” is already attached to this application — the file contents are identical.`);
        }

        const storageKey = await storage.save(req.file.buffer, meta.mimeType);
        if (!storageKey) throw new ApiError(503, "The file could not be stored.", { code: "STORAGE_FAILED" });

        const row = await repo.createDocument(application.id, userId, {
          category: req.body.category,
          kind: "file",
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          fileSize: meta.fileSize,
          checksum: meta.checksum,
          storageKey,
          note: req.body.note ?? null,
        });
        await repo.recordActivity(application.id, userId, {
          type: "document_added", title: `Document added: ${meta.fileName}`, detail: `${row.category}, ${Math.round(meta.fileSize / 1024)} KB.`, source: "user", dedupeKey: `document:${row.id}`,
        });
        logger.info("application document stored", { meta: { userId, applicationId: application.id, category: row.category, bytes: meta.fileSize } });
        res.status(201).json({ document: presentDocument(row) });
      } catch (err) { next(err); }
    },

    /** Stream a document to its owner. The storage key never appears in a response body. */
    async downloadDocument(req, res, next) {
      try {
        const row = await repo.findDocument(req.params.documentId, req.user.id);
        if (row.kind !== "file" || !row.storageKey) throw new ApiError(400, "This attachment is a link, not a stored file.", { code: "NOT_A_FILE" });
        const { stream, size } = await storage.getStream(row.storageKey);
        res.setHeader("Content-Type", row.mimeType ?? "application/octet-stream");
        res.setHeader("Content-Length", String(size));
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", contentDisposition(row.fileName, { inline: req.query?.inline === true }));
        stream.on("error", next);
        stream.pipe(res);
      } catch (err) { next(err); }
    },

    async deleteDocument(req, res, next) {
      try {
        const userId = req.user.id;
        const row = await repo.deleteDocument(req.params.documentId, userId);
        // Remove the bytes only when no other row still points at them.
        if (row.storageKey && !(await repo.storageKeyInUse(row.storageKey, row.id))) {
          await storage.remove(row.storageKey).catch(() => null);
        }
        res.status(204).end();
      } catch (err) { next(err); }
    },

    // ── Activity ─────────────────────────────────────────────────────────────
    async listActivity(req, res, next) {
      try {
        await repo.assertApplication(req.params.applicationId, req.user.id);
        const rows = await repo.listActivity(req.params.applicationId, req.user.id, { limit: req.query?.limit ?? 100 });
        res.json({
          activity: rows.map(presentActivity),
          note: "Every entry was written when an operation actually succeeded. Nothing is reconstructed for records that predate this feature.",
        });
      } catch (err) { next(err); }
    },

    async addActivity(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        const row = await repo.recordActivity(application.id, userId, {
          type: req.body.type,
          title: sanitizeShortText(req.body.title, 200),
          detail: req.body.detail ?? null,
          source: "user",
          occurredAt: req.body.occurredAt ?? undefined,
        });
        res.status(201).json({ activity: presentActivity(row) });
      } catch (err) { next(err); }
    },

    // ── Reminders ────────────────────────────────────────────────────────────
    async listReminders(req, res, next) {
      try {
        const userId = req.user.id;
        const rows = await repo.listReminders(userId, { applicationId: req.query?.applicationId ?? null, status: req.query?.status ?? null });
        const delivered = await deliverDueReminders(userId, rows);
        res.json({ ...groupReminders(rows, { tz: req.query?.tz ?? "UTC" }), scheduler: schedulerContract, notificationsCreated: delivered });
      } catch (err) { next(err); }
    },

    async createReminder(req, res, next) {
      try {
        const userId = req.user.id;
        if (req.body.applicationId) await repo.assertApplication(req.body.applicationId, userId);
        if (req.body.interviewId) await repo.findInterview(req.body.interviewId, userId);

        const dedupeKey = dedupeKeyFor({
          type: req.body.type,
          applicationId: req.body.applicationId ?? null,
          interviewId: req.body.interviewId ?? null,
          dueAt: req.body.dueAt,
        });
        const { reminder, created } = await repo.createReminder(userId, {
          applicationId: req.body.applicationId ?? null,
          interviewId: req.body.interviewId ?? null,
          type: req.body.type,
          title: req.body.title,
          note: req.body.note ?? null,
          dueAt: req.body.dueAt,
          timezone: req.body.timezone,
          dedupeKey,
        });
        if (!created) {
          return res.status(200).json({
            reminder: presentReminder(reminder, req.body.timezone),
            created: false,
            note: "A reminder of this type already exists for that day, so nothing was duplicated.",
          });
        }
        res.status(201).json({ reminder: presentReminder(reminder, req.body.timezone), created: true, scheduler: schedulerContract });
      } catch (err) { next(err); }
    },

    async updateReminder(req, res, next) {
      try {
        const userId = req.user.id;
        const existing = await repo.findReminder(req.params.reminderId, userId);
        const data = {};
        for (const key of ["title", "note", "dueAt", "timezone", "status"]) if (req.body[key] !== undefined) data[key] = req.body[key];
        if (req.body.status === "done" && existing.status !== "done") data.completedAt = new Date();
        if (req.body.status === "pending") data.completedAt = null;
        const row = await repo.updateReminder(existing.id, userId, data);

        if (req.body.status === "done" && existing.status !== "done" && existing.applicationId) {
          await repo.recordActivity(existing.applicationId, userId, {
            type: "reminder_completed",
            title: `Reminder completed: ${row.title}`,
            source: "user",
            dedupeKey: `reminder_done:${row.id}`,
          });
        }
        res.json({ reminder: presentReminder(row, row.timezone) });
      } catch (err) { next(err); }
    },

    async deleteReminder(req, res, next) {
      try {
        await repo.deleteReminder(req.params.reminderId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    // ── Interview rounds ─────────────────────────────────────────────────────
    async listInterviews(req, res, next) {
      try {
        await repo.assertApplication(req.params.applicationId, req.user.id);
        const [rows, mockSessions] = await Promise.all([
          repo.listInterviews(req.params.applicationId, req.user.id),
          repo.listMockSessions(req.user.id),
        ]);
        res.json({ interviews: rows.map(presentInterview), mockSessions });
      } catch (err) { next(err); }
    },

    async createInterview(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        if (req.body.mockSessionId) {
          const sessions = await repo.listMockSessions(userId);
          if (!sessions.some((s) => s.id === req.body.mockSessionId)) throw badRequest("That mock interview session is not yours.");
        }

        const row = await repo.createInterview(application.id, userId, {
          stage: req.body.stage,
          scheduledAt: req.body.scheduledAt ?? null,
          timezone: req.body.timezone ?? null,
          durationMinutes: req.body.durationMinutes ?? null,
          mode: req.body.mode,
          location: req.body.location ?? null,
          interviewers: req.body.interviewers?.length ? req.body.interviewers : null,
          preparationNotes: req.body.preparationNotes ?? null,
          mockSessionId: req.body.mockSessionId ?? null,
        });

        await repo.recordActivity(application.id, userId, {
          type: "interview_scheduled",
          title: `${row.stage.replace(/_/g, " ")} interview recorded`,
          detail: row.scheduledAt ? `Scheduled for ${new Date(row.scheduledAt).toISOString()}.` : "No date yet.",
          source: "user",
          dedupeKey: `interview:${row.id}`,
        });

        let reminder = null;
        if (req.body.createReminder && row.scheduledAt) {
          const result = await repo.createReminder(userId, {
            applicationId: application.id,
            interviewId: row.id,
            type: "interview",
            title: `${row.stage.replace(/_/g, " ")} interview — ${application.companyName}`,
            dueAt: row.scheduledAt,
            timezone: req.body.timezone ?? "UTC",
            dedupeKey: dedupeKeyFor({ type: "interview", interviewId: row.id, dueAt: row.scheduledAt }),
          });
          reminder = presentReminder(result.reminder, req.body.timezone ?? "UTC");
        }

        res.status(201).json({
          interview: presentInterview(row),
          reminder,
          note: "Nothing was sent to anyone. Meeting details are stored for your reference only.",
        });
      } catch (err) { next(err); }
    },

    async updateInterview(req, res, next) {
      try {
        const userId = req.user.id;
        const existing = await repo.findInterview(req.params.interviewId, userId);
        const data = {};
        for (const key of ["stage", "scheduledAt", "timezone", "durationMinutes", "mode", "location", "preparationNotes", "mockSessionId", "outcome", "feedback"]) {
          if (req.body[key] !== undefined) data[key] = req.body[key];
        }
        if (req.body.interviewers !== undefined) data.interviewers = req.body.interviewers.length ? req.body.interviewers : null;
        const row = await repo.updateInterview(existing.id, userId, data);

        const finished = ["completed", "passed", "rejected"].includes(req.body.outcome ?? "");
        if (finished && existing.outcome !== req.body.outcome) {
          await repo.recordActivity(existing.applicationId, userId, {
            type: "interview_completed",
            title: `${row.stage.replace(/_/g, " ")} interview: ${req.body.outcome}`,
            detail: row.feedback ?? null,
            source: "user",
            dedupeKey: `interview_outcome:${row.id}:${req.body.outcome}`,
          });
        }
        res.json({ interview: presentInterview(row) });
      } catch (err) { next(err); }
    },

    async deleteInterview(req, res, next) {
      try {
        await repo.deleteInterview(req.params.interviewId, req.user.id);
        res.status(204).end();
      } catch (err) { next(err); }
    },

    // ── Readiness ────────────────────────────────────────────────────────────
    async readinessReview(req, res, next) {
      try {
        const userId = req.user.id;
        const application = await repo.assertApplication(req.params.applicationId, userId);
        const data = await repo.loadWorkspace(application.id, userId);
        const job = jobContext(data.application);

        const [match, resumeVersions, mockCount] = await Promise.all([
          repo.findMatchReport(userId, { jobDescriptionId: job.jobDescriptionId, externalJobId: job.externalJobId }),
          repo.listResumeVersions(userId),
          repo.countMockInterviews(userId, data.application.jobTitle),
        ]);

        const chosenId = req.body?.resumeVersionId ?? data.coverLetters[0]?.resumeVersionId ?? null;
        const resumeVersion = resumeVersions.find((v) => v.id === chosenId)
          ?? resumeVersions.find((v) => v.jobDescriptionId && v.jobDescriptionId === job.jobDescriptionId)
          ?? null;

        const review = reviewReadiness({
          application: data.application,
          checklist: summarise(data.checklist, data.application.status),
          match,
          coverLetters: data.coverLetters,
          documents: data.documents,
          interviews: data.interviews,
          resumeVersion,
          mockInterviewCount: mockCount,
        });

        await repo.recordActivity(application.id, userId, {
          type: "readiness_review",
          title: "Readiness review run",
          detail: review.verdict,
          source: "system",
          dedupeKey: `readiness:${new Date().toISOString().slice(0, 13)}`,
        });

        res.json({ review });
      } catch (err) { next(err); }
    },

    // ── Dashboard ────────────────────────────────────────────────────────────
    async dashboard(req, res, next) {
      try {
        const userId = req.user.id;
        const { applications, checklistItems, interviews, reminders, coverLetters } = await repo.listForDashboard(userId);
        const now = new Date();

        const byApp = (list, id) => list.filter((x) => x.applicationId === id);
        const items = applications.map((a) => {
          const appChecklist = byApp(checklistItems, a.id);
          const summary = summarise(appChecklist, a.status);
          const appInterviews = byApp(interviews, a.id);
          const appReminders = byApp(reminders, a.id);
          const upcoming = appInterviews
            .filter((i) => i.scheduledAt && new Date(i.scheduledAt) >= now && i.outcome === "scheduled")
            .sort((x, y) => new Date(x.scheduledAt) - new Date(y.scheduledAt))[0] ?? null;
          return {
            id: a.id,
            jobTitle: a.jobTitle,
            companyName: a.companyName,
            status: a.status,
            statusLabel: STATUS_LABELS[a.status],
            outcome: a.outcome ?? null,
            stage: describeStage({ status: a.status, outcome: a.outcome }, summary.preparationStage),
            applicationDate: a.applicationDate,
            applicationDeadline: a.applicationDeadline ?? null,
            nextFollowUpDate: a.nextFollowUpDate,
            updatedAt: a.updatedAt,
            checklistPercent: summary.percent,
            requiredRemaining: summary.remainingRequired.length,
            coverLetters: byApp(coverLetters, a.id).length,
            upcomingInterview: upcoming ? { id: upcoming.id, stage: upcoming.stage, scheduledAt: upcoming.scheduledAt } : null,
            overdueReminders: appReminders.filter((r) => new Date(r.dueAt) < now).length,
            pendingReminders: appReminders.length,
          };
        });

        const filters = {
          active: items.filter((i) => ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"].includes(i.status)).length,
          drafts: items.filter((i) => i.status === "INTERESTED").length,
          needsFollowUp: items.filter((i) => i.overdueReminders > 0 || (i.nextFollowUpDate && new Date(i.nextFollowUpDate) < now)).length,
          upcomingInterviews: items.filter((i) => i.upcomingInterview).length,
          offers: items.filter((i) => i.status === "OFFER").length,
          closed: items.filter((i) => ["REJECTED", "WITHDRAWN"].includes(i.status)).length,
          total: items.length,
        };

        res.json({ items, filters, scheduler: schedulerContract });
      } catch (err) { next(err); }
    },
  };
}

/** One activity row for the API. */
function presentActivity(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    detail: row.detail,
    source: row.source,
    sourceLabel: row.source === "user" ? "Recorded by you" : "Recorded automatically from an action in the app",
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    occurredAt: row.occurredAt,
  };
}

/** One interview round for the API. */
function presentInterview(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stage: row.stage,
    scheduledAt: row.scheduledAt,
    timezone: row.timezone,
    durationMinutes: row.durationMinutes,
    mode: row.mode,
    location: row.location,
    interviewers: Array.isArray(row.interviewers) ? row.interviewers : [],
    preparationNotes: row.preparationNotes,
    mockSessionId: row.mockSessionId,
    outcome: row.outcome,
    feedback: row.feedback,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
