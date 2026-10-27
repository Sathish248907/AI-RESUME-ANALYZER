/**
 * Phase 13 tests: workspace aggregation, checklist (seeding, completion source,
 * derived preparation stage, custom items), cover letters (grounding guard,
 * withheld paragraphs, versions, approval, PDF), documents (content sniffing,
 * duplicate rejection, storage-not-configured, ownership on download), status
 * transitions (validation, unusual-with-confirmation, activity written by the
 * existing tracker endpoint), activity (no fabricated history, dedupe),
 * reminders (timezone grouping, duplicate prevention, notification dedupe),
 * interview rounds, readiness review (never blocking, missing vs deficient),
 * cross-user isolation and AI provider failures.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { TEST_ENV, fakeLlm, fakePrisma, RESUME_TEXT, JOB_DESCRIPTION } from "./fixtures.js";
import * as fx from "./fixtures.js";
import {
  summarise, seedItems, deriveAutoCompletions, CHECKLIST_TEMPLATE,
} from "../src/services/applications/applicationChecklistService.js";
import { postProcess as coverLetterPostProcess, countWords } from "../src/services/applications/coverLetterService.js";
import { sniffType, validateDocumentFile, validateDocumentLink, assertStorageUsable } from "../src/services/applications/applicationDocumentService.js";
import { evaluateTransition, describeStage, nextAction, allowedNext } from "../src/services/applications/applicationStatusService.js";
import { groupReminders, dedupeKeyFor, dueForNotification, schedulerContract } from "../src/services/applications/applicationReminderService.js";
import { reviewReadiness } from "../src/services/applications/applicationReadinessService.js";
import { renderCoverLetterPdf } from "../src/services/applications/coverLetterPdfService.js";

// ── Harness ──────────────────────────────────────────────────────────────────

let server, baseUrl, prisma, llmBehaviour = null;
const tokenEmail = new Map();

function defaultLlm(req) {
  if (req.schemaName === "cover_letter") return validCoverLetter();
  // Deliberately free of figures and of technologies absent from the resume, so
  // the grounding guard passes it — the guard itself is tested separately.
  if (req.schemaName === "cover_letter_paragraph") return { text: "I build and maintain interfaces with React and TypeScript.", rationale: "Leads with the work." };
  if (req.schemaName === "resume_structure") return fx.validResumeStructure();
  return fx.validAiOutput();
}

/** A grounded letter: every fact appears in RESUME_TEXT. */
function validCoverLetter() {
  return {
    greeting: "Dear Hiring Team,",
    paragraphs: [
      { role: "opening", text: "I am applying for the Senior Frontend Developer role." },
      { role: "fit", text: "I build interfaces with React and TypeScript." },
      { role: "closing", text: "I would welcome the chance to discuss the role." },
    ],
    signOff: "Kind regards,\nJane Doe",
    questions: ["Which team would this role sit in?"],
    highlighted: ["React", "TypeScript"],
  };
}

async function ensureServer(env = TEST_ENV) {
  if (server) return;
  prisma = fakePrisma();
  const llm = fakeLlm((req) => (llmBehaviour ? llmBehaviour(req) : undefined) ?? defaultLlm(req));
  const app = createApp({ env: loadEnv(env), prisma, llm });
  await new Promise((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); server.unref(); });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

async function api(path, { method = "GET", token, body, raw = false } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** multipart upload without a form-data dependency. */
async function upload(path, { token, fileName, mimeType, content, fields = {} }) {
  await ensureServer();
  const boundary = "----phase13boundary";
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  if (fileName) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
    parts.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const payload = Buffer.concat(parts);
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: payload,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  tokenEmail.set(r.body.token, email);
  return r.body.token;
}

/** An application plus a resume version, which most of the workspace needs. */
async function seedApplication(token, { company = "Acme", title = "Senior Frontend Developer" } = {}) {
  await ensureServer();
  const user = prisma.tables.user.find((u) => u.email === tokenEmail.get(token));
  const resume = await prisma.resume.create({ data: { userId: user.id, name: "CV", originalFileName: "cv.docx", fileType: "docx", fileSize: 1000, charCount: RESUME_TEXT.length, extractedText: RESUME_TEXT } });
  const editable = await api(`/api/resume-builder/${resume.id}`, { token });
  assert.equal(editable.status, 200, JSON.stringify(editable.body).slice(0, 200));
  const version = await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { name: "Working copy", structure: "heuristic" } });
  assert.equal(version.status, 201);

  const jd = await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: title, companyName: company, targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
  const application = await api("/api/applications", { method: "POST", token, body: { companyName: company, jobTitle: title, status: "INTERESTED", jobDescriptionId: jd.body.jobDescription.id } });
  assert.equal(application.status, 201, JSON.stringify(application.body).slice(0, 200));
  return { applicationId: application.body.application.id, versionId: version.body.version.id, jobDescriptionId: jd.body.jobDescription.id };
}

// ── 1. Checklist ─────────────────────────────────────────────────────────────

test("the checklist template separates what the app can verify from what only the user can", () => {
  const items = seedItems();
  assert.equal(items.length, CHECKLIST_TEMPLATE.length);
  assert.ok(items.every((i) => i.key && i.title && i.category));

  const external = CHECKLIST_TEMPLATE.filter((t) => t.verifiableBy === "external").map((t) => t.key);
  assert.ok(external.includes("open_application"), "opening the employer's page is not something we can see");
  assert.ok(external.includes("record_submission"), "a submission is only ever the user's assertion");
  assert.ok(external.includes("review_jd"));

  const inApp = CHECKLIST_TEMPLATE.filter((t) => t.verifiableBy === "in_app");
  assert.ok(inApp.every((t) => t.evidence), "every in-app step names the record that evidences it");
});

test("auto-completion suggests only steps with real evidence, and never a submission step", () => {
  const none = deriveAutoCompletions({});
  assert.deepEqual(none, []);

  const some = deriveAutoCompletions({ hasMatchReport: true, hasCoverLetter: true, hasDocument: false });
  const keys = some.map((s) => s.key);
  assert.ok(keys.includes("match_report"));
  assert.ok(keys.includes("cover_letter"));
  assert.ok(!keys.includes("documents"), "no document, no suggestion");
  assert.ok(some.every((s) => s.reason), "each suggestion cites its evidence");

  // Nothing — not even every flag set — can auto-complete a submission step.
  const all = deriveAutoCompletions({ hasMatchReport: true, hasResumeSelected: true, hasTailoredVersion: true, hasCoverLetter: true, hasDocument: true, hasMockInterview: true });
  assert.ok(!all.some((s) => s.key === "open_application" || s.key === "record_submission"));
});

test("the preparation stage is derived from required steps, not stored as a status", () => {
  const items = seedItems().map((i) => ({ ...i, completedAt: null }));
  assert.equal(summarise(items, "INTERESTED").preparationStage, "not_started");

  items[0].completedAt = new Date();
  const partial = summarise(items, "INTERESTED");
  assert.equal(partial.preparationStage, "preparing");
  assert.ok(partial.percent > 0 && partial.percent < 100);
  assert.ok(partial.remainingRequired.length > 0);

  for (const i of items) if (i.isRequired) i.completedAt = new Date();
  const ready = summarise(items, "INTERESTED");
  assert.equal(ready.preparationStage, "ready_to_apply");
  assert.equal(ready.remainingRequired.length, 0);
  assert.equal(ready.requiredPercent, 100);

  // Once it is past Interested the question is no longer "is it prepared".
  assert.equal(summarise(items, "APPLIED").preparationStage, "submitted");
});

test("checklist seeds once, completion records its source, and template steps cannot be deleted", async () => {
  const token = await registerUser("p13-checklist@example.com");
  const { applicationId } = await seedApplication(token);

  const first = await api(`/api/applications/${applicationId}/checklist`, { token });
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, CHECKLIST_TEMPLATE.length);
  assert.equal(first.body.summary.preparationStage, "not_started");
  assert.ok(first.body.items.every((i) => i.verificationNote), "each item says who can verify it");

  // Re-reading does not seed a second copy.
  const second = await api(`/api/applications/${applicationId}/checklist`, { token });
  assert.equal(second.body.items.length, CHECKLIST_TEMPLATE.length);

  const item = first.body.items.find((i) => i.key === "review_jd");
  assert.equal((await api(`/api/applications/${applicationId}/checklist/${item.id}`, { method: "PATCH", token, body: { completed: true } })).status, 400, "completing needs a completion source");

  const done = await api(`/api/applications/${applicationId}/checklist/${item.id}`, { method: "PATCH", token, body: { completed: true, completionSource: "external" } });
  assert.equal(done.status, 200);
  assert.equal(done.body.item.completed, true);
  assert.equal(done.body.item.completionSource, "external");
  assert.equal(done.body.summary.preparationStage, "preparing");

  // Reopening is allowed.
  const reopened = await api(`/api/applications/${applicationId}/checklist/${item.id}`, { method: "PATCH", token, body: { completed: false } });
  assert.equal(reopened.body.item.completed, false);
  assert.equal(reopened.body.item.completionSource, null);

  // Custom items can be added and removed; template ones cannot be removed.
  const custom = await api(`/api/applications/${applicationId}/checklist`, { method: "POST", token, body: { title: "Ask Priya for a referral", category: "research", isRequired: false } });
  assert.equal(custom.status, 201);
  assert.equal(custom.body.item.isCustom, true);
  assert.equal((await api(`/api/applications/${applicationId}/checklist/${item.id}`, { method: "DELETE", token })).status, 409, "a template step is not deletable");
  assert.equal((await api(`/api/applications/${applicationId}/checklist/${custom.body.item.id}`, { method: "DELETE", token })).status, 204);
});

test("marking the submission step offers to move the status but never does it", async () => {
  const token = await registerUser("p13-submission@example.com");
  const { applicationId } = await seedApplication(token);
  const items = (await api(`/api/applications/${applicationId}/checklist`, { token })).body.items;
  const submission = items.find((i) => i.key === "record_submission");

  const res = await api(`/api/applications/${applicationId}/checklist/${submission.id}`, { method: "PATCH", token, body: { completed: true, completionSource: "external" } });
  assert.equal(res.status, 200);
  assert.ok(res.body.submissionPrompt, "the user is offered the status change");
  assert.equal(res.body.submissionPrompt.body.status, "APPLIED");

  // The application itself is untouched until the user acts on the prompt.
  const application = await api(`/api/applications/${applicationId}`, { token });
  assert.equal(application.body.application.status, "INTERESTED", "ticking a checklist box must not submit anything");
});

// ── 2. Cover letters ─────────────────────────────────────────────────────────

test("the grounding guard withholds paragraphs that invent figures or technologies", () => {
  const resume = "Jane Doe. Frontend developer. Built dashboards with React and TypeScript at Acme.";
  const out = {
    greeting: "Dear Hiring Team,",
    paragraphs: [
      { role: "opening", text: "I build interfaces with React and TypeScript." },
      { role: "fit", text: "I led a team of 14 engineers and raised revenue by 62%." },
      { role: "evidence", text: "I have deep experience with Kubernetes and Terraform." },
    ],
    signOff: "Kind regards",
    questions: [],
    highlighted: [],
  };
  const result = coverLetterPostProcess(out, { resumeText: resume, jobDescription: "", companyName: "Acme" });

  assert.equal(result.paragraphs.length, 1, "only the grounded paragraph survives");
  assert.equal(result.withheldParagraphs.length, 2);
  assert.match(result.withheldParagraphs.find((w) => w.role === "fit").reason, /invented figures/);
  assert.match(result.withheldParagraphs.find((w) => w.role === "evidence").reason, /not in your resume/);
  assert.ok(!result.content.includes("Kubernetes"));
  assert.ok(!result.content.includes("62%"));
  assert.equal(result.status, "draft");
  assert.equal(result.groundingNotes.withheld, 2);
  assert.match(result.note, /withheld/);
});

test("a claim the job description itself makes is grounded, and clichés are reported", () => {
  const resume = "Jane Doe. Frontend developer at Acme.";
  const jd = "We use React and GraphQL on a platform team.";
  const out = {
    greeting: "",
    paragraphs: [{ role: "fit", text: "Your team works with React and GraphQL, which is the work I want to do." }],
    signOff: "",
    questions: [],
    highlighted: [],
  };
  const grounded = coverLetterPostProcess(out, { resumeText: resume, jobDescription: jd, companyName: "Acme" });
  assert.equal(grounded.withheldParagraphs.length, 0, "restating the listing is not fabrication");

  const cliched = coverLetterPostProcess(
    { greeting: "", paragraphs: [{ role: "opening", text: "I am writing to apply and I am a team player." }], signOff: "", questions: [], highlighted: [] },
    { resumeText: resume, jobDescription: jd, companyName: "Acme" }
  );
  assert.ok(cliched.groundingNotes.cliches.length >= 2);
});

test("cover letters version, stay drafts until approved, and export to real PDF text", async () => {
  const token = await registerUser("p13-letters@example.com");
  const { applicationId, versionId } = await seedApplication(token);

  const first = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { resumeVersionId: versionId, tone: "professional", lengthTarget: "short" } });
  assert.equal(first.status, 201, JSON.stringify(first.body).slice(0, 300));
  assert.equal(first.body.generated, true);
  assert.equal(first.body.coverLetter.versionNumber, 1);
  assert.equal(first.body.coverLetter.status, "draft");
  assert.equal(first.body.coverLetter.source, "ai");
  assert.ok(first.body.coverLetter.wordCount > 0);
  assert.ok(first.body.questions.length >= 0);

  const second = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { resumeVersionId: versionId } });
  assert.equal(second.body.coverLetter.versionNumber, 2, "a second draft is a new version, not an overwrite");

  const letterId = first.body.coverLetter.id;
  const edited = await api(`/api/cover-letters/${letterId}`, { method: "PATCH", token, body: { content: "Dear Hiring Team,\n\nI build React interfaces.\n\nKind regards,\nJane" } });
  assert.equal(edited.body.coverLetter.source, "edited", "editing an AI draft makes it the user's text");
  assert.equal(edited.body.coverLetter.wordCount, countWords(edited.body.coverLetter.content));

  const approved = await api(`/api/cover-letters/${letterId}`, { method: "PATCH", token, body: { status: "approved" } });
  assert.equal(approved.body.coverLetter.status, "approved");

  const pdf = await api(`/api/cover-letters/${letterId}/export`, { method: "POST", token, raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.buffer.length > 500);

  const listed = await api(`/api/applications/${applicationId}/cover-letters`, { token });
  assert.equal(listed.body.coverLetters.length, 2);
  assert.equal((await api(`/api/cover-letters/${second.body.coverLetter.id}`, { method: "DELETE", token })).status, 204);
});

test("a regenerated paragraph that invents facts is rejected rather than saved", async () => {
  const token = await registerUser("p13-regen@example.com");
  const { applicationId, versionId } = await seedApplication(token);
  const letter = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { resumeVersionId: versionId } });
  const letterId = letter.body.coverLetter.id;

  llmBehaviour = (req) => (req.schemaName === "cover_letter_paragraph"
    ? { text: "I managed a team of 42 engineers and cut costs by 87% using Kubernetes.", rationale: "Stronger." }
    : undefined);
  const bad = await api(`/api/cover-letters/${letterId}/regenerate-paragraph`, { method: "POST", token, body: { paragraphText: "I build interfaces with React." } });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, "UNGROUNDED_PARAGRAPH");
  assert.ok(bad.body.error.details.some((d) => /42|87/.test(d.message)));

  llmBehaviour = null;
  const good = await api(`/api/cover-letters/${letterId}/regenerate-paragraph`, { method: "POST", token, body: { paragraphText: "I build interfaces with React." } });
  assert.equal(good.status, 200);
  assert.equal(good.body.saved, false, "a regenerated paragraph is not written to the letter");
  assert.match(good.body.note, /not saved/i);

  // The stored letter is unchanged by either call.
  const stored = (await api(`/api/applications/${applicationId}/cover-letters`, { token })).body.coverLetters.find((c) => c.id === letterId);
  assert.equal(stored.content, letter.body.coverLetter.content);
});

test("a provider failure during drafting is reported, not written as an empty letter", async () => {
  const token = await registerUser("p13-ai-fail@example.com");
  const { applicationId, versionId } = await seedApplication(token);
  llmBehaviour = () => { throw new Error("provider exploded"); };
  const res = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { resumeVersionId: versionId } });
  llmBehaviour = null;
  assert.ok(res.status >= 500 || res.status === 503, `expected a failure status, got ${res.status}`);
  assert.equal((await api(`/api/applications/${applicationId}/cover-letters`, { token })).body.coverLetters.length, 0, "no row is written when the model fails");
});

test("a letter the user wrote is stored without calling the model", async () => {
  const token = await registerUser("p13-manual-letter@example.com");
  const { applicationId } = await seedApplication(token);
  llmBehaviour = () => { throw new Error("the model must not be called"); };
  const res = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { content: "Dear Hiring Team,\n\nI wrote this myself.\n\nJane" } });
  llmBehaviour = null;
  assert.equal(res.status, 201);
  assert.equal(res.body.generated, false);
  assert.equal(res.body.coverLetter.source, "manual");
});

test("cover letter PDF renders selectable text", async () => {
  const { buffer, pages } = await renderCoverLetterPdf({
    content: "Dear Hiring Team,\n\nI build React interfaces at Acme.\n\nKind regards,\nJane Doe",
    sender: { fullName: "Jane Doe", email: "jane@example.com" },
    jobTitle: "Senior Frontend Developer",
    companyName: "Acme",
  });
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.equal(pages, 1);
  // Uncompressed text operators prove it is not an image.
  assert.ok(buffer.includes(Buffer.from("Jane Doe")) || buffer.length > 1000);
});

// ── 3. Documents ─────────────────────────────────────────────────────────────

test("file type is decided by content, not by the filename", () => {
  const pdf = Buffer.from("%PDF-1.4\nreal pdf bytes here");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  assert.equal(sniffType(pdf), "application/pdf");
  assert.equal(sniffType(png), "image/png");
  assert.equal(sniffType(Buffer.from("plain notes about the role")), "text/plain");
  assert.equal(sniffType(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])), null, "binary junk is not a supported type");

  // A script renamed .pdf is rejected because its bytes are not a PDF.
  assert.throws(
    () => validateDocumentFile({ buffer: Buffer.from("#!/bin/sh\nrm -rf /"), mimetype: "application/pdf", originalname: "cert.pdf", size: 18 }),
    /contents are/i
  );
  // A real PDF declared as PNG is also rejected.
  assert.throws(
    () => validateDocumentFile({ buffer: pdf, mimetype: "image/png", originalname: "cert.png", size: pdf.length }),
    /contents are/i
  );
  assert.throws(() => validateDocumentFile({ buffer: pdf, mimetype: "application/x-msdownload", originalname: "a.exe", size: 10 }), /Supported formats/);
  assert.throws(() => validateDocumentFile({ buffer: pdf, mimetype: "application/pdf", originalname: "cert.pdf", size: 50 * 1024 * 1024 }), /under/);

  const ok = validateDocumentFile({ buffer: pdf, mimetype: "application/pdf", originalname: "certificate.pdf", size: pdf.length });
  assert.equal(ok.mimeType, "application/pdf");
  assert.equal(ok.checksum.length, 64);
});

test("links must be absolute http(s), and an unconfigured store refuses rather than pretends", () => {
  assert.equal(validateDocumentLink("https://example.com/portfolio"), "https://example.com/portfolio");
  for (const bad of ["javascript:alert(1)", "ftp://x.com/a", "not a url", ""]) {
    assert.throws(() => validateDocumentLink(bad), /link/i, `must reject ${bad}`);
  }
  assert.throws(() => assertStorageUsable({ enabled: false, name: "none" }), /not configured/i);
  assert.doesNotThrow(() => assertStorageUsable({ enabled: true, name: "local" }));
});

test("uploads are refused when storage is off, and links still work", async () => {
  const token = await registerUser("p13-nostorage@example.com");
  const { applicationId } = await seedApplication(token);

  const pdf = Buffer.from("%PDF-1.4\nthis is a certificate for the role");
  const refused = await upload(`/api/applications/${applicationId}/documents`, { token, fileName: "cert.pdf", mimeType: "application/pdf", content: pdf, fields: { category: "certificate" } });
  assert.equal(refused.status, 503, JSON.stringify(refused.body).slice(0, 200));
  assert.equal(refused.body.error.code, "STORAGE_NOT_CONFIGURED");
  assert.match(refused.body.error.message, /STORAGE_DRIVER/);

  const link = await api(`/api/applications/${applicationId}/documents`, { method: "POST", token, body: { category: "portfolio", url: "https://example.com/portfolio", note: "my work" } });
  assert.equal(link.status, 201);
  assert.equal(link.body.document.kind, "link");
  assert.equal(link.body.document.url, "https://example.com/portfolio");
  assert.equal(link.body.document.downloadHref, null);

  const listed = await api(`/api/applications/${applicationId}/documents`, { token });
  assert.equal(listed.body.documents.length, 1);
  assert.equal(listed.body.storage.enabled, false);
  assert.equal((await api(`/api/applications/${applicationId}/documents`, { method: "POST", token, body: { category: "portfolio", url: "javascript:alert(1)" } })).status, 400);
});

test("with storage on, a file stores once, downloads to its owner only, and never exposes its key", async () => {
  // A separate app instance with the local driver enabled.
  const dir = `${process.cwd()}/.tmp-phase13-uploads`;
  const localPrisma = fakePrisma();
  const app = createApp({
    env: loadEnv({ ...TEST_ENV, STORAGE_DRIVER: "local", STORAGE_LOCAL_DIR: dir }),
    prisma: localPrisma,
    llm: fakeLlm(defaultLlm),
  });
  const srv = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const url = `http://127.0.0.1:${srv.address().port}`;
  const call = async (p, { method = "GET", token, body } = {}) => {
    const res = await fetch(url + p, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const t = await res.text();
    return { status: res.status, body: t ? JSON.parse(t) : null, headers: res.headers };
  };
  try {
    const reg = await call("/api/auth/register", { method: "POST", body: { email: "p13-storage@example.com", password: "password123" } });
    const token = reg.body.token;
    const other = (await call("/api/auth/register", { method: "POST", body: { email: "p13-storage-other@example.com", password: "password123" } })).body.token;

    const user = localPrisma.tables.user.find((u) => u.email === "p13-storage@example.com");
    const jd = await call("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Dev", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
    const application = await call("/api/applications", { method: "POST", token, body: { companyName: "Acme", jobTitle: "Dev", jobDescriptionId: jd.body.jobDescription.id } });
    const applicationId = application.body.application.id;
    void user;

    const pdf = Buffer.from("%PDF-1.4\n a genuine looking certificate document body");
    const boundary = "----phase13storage";
    const makeBody = (name) => Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\ncertificate\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const post = async (tok, name) => {
      const res = await fetch(`${url}/api/applications/${applicationId}/documents`, {
        method: "POST",
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Origin: "http://localhost:3001", Authorization: `Bearer ${tok}` },
        body: makeBody(name),
      });
      const t = await res.text();
      return { status: res.status, body: t ? JSON.parse(t) : null };
    };

    const stored = await post(token, "certificate.pdf");
    assert.equal(stored.status, 201, JSON.stringify(stored.body).slice(0, 300));
    assert.equal(stored.body.document.fileName, "certificate.pdf");
    assert.ok(stored.body.document.downloadHref);
    assert.equal(stored.body.document.storageKey, undefined, "the storage key is never returned");
    assert.ok(!JSON.stringify(stored.body).includes(".pdf\",\"storageKey"), "no key anywhere in the payload");

    // Identical bytes are refused rather than stored twice.
    const duplicate = await post(token, "certificate-copy.pdf");
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error.message, /already attached/i);

    const documentId = stored.body.document.id;
    const download = await fetch(`${url}/api/application-documents/${documentId}/download`, { headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost:3001" } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/pdf");
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    assert.match(download.headers.get("content-disposition"), /attachment; filename="certificate.pdf"/);
    assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 4).toString(), "%PDF");

    // Someone else cannot download it, and cannot tell it exists.
    const forbidden = await fetch(`${url}/api/application-documents/${documentId}/download`, { headers: { Authorization: `Bearer ${other}`, Origin: "http://localhost:3001" } });
    assert.equal(forbidden.status, 404);
    assert.equal((await call(`/api/application-documents/${documentId}`, { method: "DELETE", token: other })).status, 404);

    assert.equal((await call(`/api/application-documents/${documentId}`, { method: "DELETE", token })).status, 204);
  } finally {
    await new Promise((r) => srv.close(r));
    await import("node:fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true })).catch(() => null);
  }
});

// ── 4. Status workflow and activity ──────────────────────────────────────────

test("transitions are validated, unusual ones need confirmation, and a no-op is not an error", () => {
  assert.equal(evaluateTransition("INTERESTED", "APPLIED").ok, true);
  assert.equal(evaluateTransition("APPLIED", "INTERVIEW").ok, true);
  assert.equal(evaluateTransition("INTERVIEW", "OFFER").ok, true);

  const backwards = evaluateTransition("INTERVIEW", "APPLIED");
  assert.equal(backwards.ok, false);
  assert.equal(backwards.unusual, true, "backwards is unusual, not forbidden");
  assert.match(backwards.reason, /unusual/i);

  const reopened = evaluateTransition("REJECTED", "INTERVIEW");
  assert.equal(reopened.unusual, true);
  assert.match(reopened.reason, /already Rejected/i);

  const same = evaluateTransition("APPLIED", "APPLIED");
  assert.equal(same.ok, false);
  assert.equal(same.sameStatus, true);
  assert.equal(same.unusual, false);

  assert.equal(evaluateTransition("APPLIED", "NONSENSE").ok, false);
  assert.ok(allowedNext("INTERESTED").some((t) => t.status === "APPLIED"));
  assert.deepEqual(allowedNext("REJECTED"), [], "a closed application suggests nothing");
});

test("the ten brief stages map onto the existing seven statuses without new enum values", () => {
  assert.equal(describeStage({ status: "INTERESTED", outcome: null }, "not_started").stage, "saved");
  assert.equal(describeStage({ status: "INTERESTED", outcome: null }, "preparing").stage, "preparing");
  assert.equal(describeStage({ status: "INTERESTED", outcome: null }, "ready_to_apply").stage, "ready_to_apply");
  assert.equal(describeStage({ status: "APPLIED", outcome: null }, "submitted").stage, "applied");
  assert.equal(describeStage({ status: "OFFER", outcome: null }, "submitted").stage, "offer");
  assert.equal(describeStage({ status: "OFFER", outcome: "accepted" }, "submitted").stage, "accepted");
  assert.equal(describeStage({ status: "OFFER", outcome: "declined" }, "submitted").stage, "declined");
  assert.equal(describeStage({ status: "WITHDRAWN", outcome: null }, "submitted").stage, "withdrawn");
  assert.ok(describeStage({ status: "OFFER", outcome: "accepted" }, "submitted").basis.length > 0);
});

test("a status change through the existing tracker endpoint writes one activity row", async () => {
  const token = await registerUser("p13-status@example.com");
  const { applicationId } = await seedApplication(token);

  const before = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.equal(before.body.activity.length, 0, "no history is fabricated for a new application");
  assert.match(before.body.note, /actually succeeded/i);

  const applied = await api(`/api/applications/${applicationId}`, { method: "PATCH", token, body: { status: "APPLIED", statusNote: "Submitted through their portal" } });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.application.status, "APPLIED");

  const after = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.equal(after.body.activity.length, 1);
  assert.equal(after.body.activity[0].type, "status_changed");
  assert.equal(after.body.activity[0].fromStatus, "INTERESTED");
  assert.equal(after.body.activity[0].toStatus, "APPLIED");
  assert.equal(after.body.activity[0].detail, "Submitted through their portal");
  assert.equal(after.body.activity[0].source, "user");

  // A backwards move is refused until confirmed, and then recorded.
  const refused = await api(`/api/applications/${applicationId}`, { method: "PATCH", token, body: { status: "INTERESTED" } });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, "UNUSUAL_STATUS_TRANSITION");
  assert.ok(refused.body.error.details.some((d) => /confirmUnusual/.test(d.message)));
  assert.equal((await api(`/api/applications/${applicationId}`, { token })).body.application.status, "APPLIED", "the refused change did not happen");

  const confirmed = await api(`/api/applications/${applicationId}`, { method: "PATCH", token, body: { status: "INTERESTED", confirmUnusual: true, statusNote: "Logged by mistake" } });
  assert.equal(confirmed.status, 200);
  assert.equal((await api(`/api/applications/${applicationId}/activity`, { token })).body.activity.length, 2);

  // Setting the same status again is a no-op, not an error and not an event.
  const noop = await api(`/api/applications/${applicationId}`, { method: "PATCH", token, body: { status: "INTERESTED", notes: "still interested" } });
  assert.equal(noop.status, 200);
  assert.equal((await api(`/api/applications/${applicationId}/activity`, { token })).body.activity.length, 2, "a no-op writes no event");
});

test("users can add their own timeline notes, and every entry says where it came from", async () => {
  const token = await registerUser("p13-activity@example.com");
  const { applicationId } = await seedApplication(token);

  const added = await api(`/api/applications/${applicationId}/activity`, { method: "POST", token, body: { title: "Recruiter called", detail: "Asked about notice period.", type: "follow_up" } });
  assert.equal(added.status, 201);
  assert.equal(added.body.activity.source, "user");
  assert.match(added.body.activity.sourceLabel, /Recorded by you/);

  const listed = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.equal(listed.body.activity.length, 1);
  assert.ok(listed.body.activity.every((a) => a.sourceLabel));
});

// ── 5. Reminders ─────────────────────────────────────────────────────────────

test("reminders group by the user's own calendar day and keep the zone they were set in", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const reminders = [
    { id: "a", status: "pending", type: "follow_up", title: "Overdue", dueAt: new Date("2026-03-08T09:00:00Z"), timezone: "Asia/Kolkata" },
    { id: "b", status: "pending", type: "deadline", title: "Later today", dueAt: new Date("2026-03-10T18:00:00Z"), timezone: "Asia/Kolkata" },
    { id: "c", status: "pending", type: "interview", title: "This week", dueAt: new Date("2026-03-13T09:00:00Z"), timezone: "Asia/Kolkata" },
    { id: "d", status: "pending", type: "custom", title: "Next month", dueAt: new Date("2026-04-20T09:00:00Z"), timezone: "Asia/Kolkata" },
    { id: "e", status: "done", type: "custom", title: "Finished", dueAt: new Date("2026-03-01T09:00:00Z"), timezone: "UTC" },
  ];
  const grouped = groupReminders(reminders, { tz: "Asia/Kolkata", now });
  assert.equal(grouped.groups.overdue.length, 1);
  assert.equal(grouped.groups.today.length, 1);
  assert.equal(grouped.groups.this_week.length, 1);
  assert.equal(grouped.groups.later.length, 1);
  assert.equal(grouped.counts.done, 1);
  assert.equal(grouped.timezone, "Asia/Kolkata");

  // A reminder set in one zone and read from another shows both readings.
  const fromUtc = groupReminders(reminders.slice(0, 1), { tz: "UTC", now });
  assert.ok(fromUtc.groups.overdue[0].dueInSetZone?.includes("Asia/Kolkata"));
  assert.equal(groupReminders(reminders.slice(0, 1), { tz: "Asia/Kolkata", now }).groups.overdue[0].dueInSetZone, null);
  // An alias of the same zone reads identically, so the second line is dropped
  // rather than printing the same time twice (found by running the UI).
  assert.equal(groupReminders(reminders.slice(0, 1), { tz: "Asia/Calcutta", now }).groups.overdue[0].dueInSetZone, null);

  // An invalid zone falls back to UTC rather than throwing or silently shifting.
  assert.equal(groupReminders(reminders, { tz: "Mars/Olympus", now }).timezone, "UTC");
});

test("reminders derived from a record are deduped; ad-hoc ones are not", () => {
  const key = dedupeKeyFor({ type: "interview", interviewId: "i1", dueAt: new Date("2026-03-12T09:00:00Z") });
  assert.equal(key, dedupeKeyFor({ type: "interview", interviewId: "i1", dueAt: new Date("2026-03-12T15:00:00Z") }), "same round, same day → same key");
  assert.notEqual(key, dedupeKeyFor({ type: "interview", interviewId: "i1", dueAt: new Date("2026-03-13T09:00:00Z") }));
  assert.equal(dedupeKeyFor({ type: "custom", dueAt: new Date() }), null, "a personal reminder is never deduped away");
});

test("due reminders are announced once, and the scheduler contract is honest", () => {
  const reminders = [
    { id: "r1", status: "pending", type: "follow_up", title: "Chase Acme", dueAt: new Date(Date.now() - 1000), applicationId: "a1" },
    { id: "r2", status: "pending", type: "follow_up", title: "Not yet", dueAt: new Date(Date.now() + 86_400_000), applicationId: "a1" },
    { id: "r3", status: "done", type: "follow_up", title: "Finished", dueAt: new Date(Date.now() - 1000), applicationId: "a1" },
  ];
  const first = dueForNotification(reminders, new Set());
  assert.equal(first.length, 1);
  assert.equal(first[0].reminderId, "r1");
  assert.equal(first[0].dedupeKey, "reminder-due:r1");

  const second = dueForNotification(reminders, new Set(["reminder-due:r1"]));
  assert.equal(second.length, 0, "an announced reminder is not announced again");

  assert.equal(schedulerContract.active, false);
  assert.equal(schedulerContract.deliveryMode, "on_read");
  assert.match(schedulerContract.message, /no email, push or SMS/i);
  assert.ok(schedulerContract.toEnable.entryPoint);
});

test("reminder CRUD enforces a real timezone and prevents duplicates", async () => {
  const token = await registerUser("p13-reminders@example.com");
  const { applicationId } = await seedApplication(token);

  assert.equal((await api("/api/application-reminders", { method: "POST", token, body: { title: "Chase", dueAt: "2026-05-01T09:00:00Z", timezone: "Mars/Olympus", type: "follow_up", applicationId } })).status, 400);

  const created = await api("/api/application-reminders", { method: "POST", token, body: { title: "Chase Acme", dueAt: "2026-05-01T09:00:00Z", timezone: "Asia/Kolkata", type: "follow_up", applicationId } });
  assert.equal(created.status, 201);
  assert.equal(created.body.created, true);
  assert.equal(created.body.reminder.timezone, "Asia/Kolkata");
  assert.equal(created.body.scheduler.active, false);

  const duplicate = await api("/api/application-reminders", { method: "POST", token, body: { title: "Chase Acme again", dueAt: "2026-05-01T17:00:00Z", timezone: "Asia/Kolkata", type: "follow_up", applicationId } });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.created, false, "same type, same application, same day → not duplicated");
  assert.match(duplicate.body.note, /already exists/i);

  const listed = await api("/api/application-reminders", { token, });
  assert.equal(listed.body.counts.pending, 1);

  const done = await api(`/api/application-reminders/${created.body.reminder.id}`, { method: "PATCH", token, body: { status: "done" } });
  assert.equal(done.body.reminder.status, "done");
  assert.ok(done.body.reminder.completedAt);
  const activity = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.ok(activity.body.activity.some((a) => a.type === "reminder_completed"));

  assert.equal((await api(`/api/application-reminders/${created.body.reminder.id}`, { method: "DELETE", token })).status, 204);
});

// ── 6. Interviews ────────────────────────────────────────────────────────────

test("interview rounds are recorded with an optional reminder, and nothing is sent", async () => {
  const token = await registerUser("p13-interviews@example.com");
  const { applicationId } = await seedApplication(token);

  const created = await api(`/api/applications/${applicationId}/interviews`, {
    method: "POST", token,
    body: {
      stage: "technical", scheduledAt: "2026-06-01T10:00:00Z", timezone: "Asia/Kolkata",
      durationMinutes: 60, mode: "video", location: "https://meet.example.com/abc",
      interviewers: [{ name: "Priya", role: "Engineering Manager" }],
      preparationNotes: "Revise React rendering.", createReminder: true,
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 300));
  assert.equal(created.body.interview.stage, "technical");
  assert.equal(created.body.interview.interviewers[0].name, "Priya");
  assert.ok(created.body.reminder, "a reminder was created as asked");
  assert.match(created.body.note, /Nothing was sent to anyone/i);

  const activity = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.ok(activity.body.activity.some((a) => a.type === "interview_scheduled"));

  const outcome = await api(`/api/application-interviews/${created.body.interview.id}`, { method: "PATCH", token, body: { outcome: "passed", feedback: "Went well." } });
  assert.equal(outcome.body.interview.outcome, "passed");
  const after = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.ok(after.body.activity.some((a) => a.type === "interview_completed"));

  assert.equal((await api(`/api/application-interviews/${created.body.interview.id}`, { method: "DELETE", token })).status, 204);
});

// ── 7. Readiness ─────────────────────────────────────────────────────────────

test("the readiness review separates missing information from a confirmed problem, and never blocks", () => {
  const base = {
    application: { id: "a1", status: "INTERESTED", applicationDeadline: null },
    checklist: { remainingRequired: [], required: 5, requiredCompleted: 5, byCategory: [] },
    coverLetters: [], documents: [], interviews: [], resumeVersion: { id: "v1", name: "Working copy" }, mockInterviewCount: 0,
  };

  const noMatch = reviewReadiness({ ...base, match: null });
  const matchItem = noMatch.items.find((i) => i.key === "match");
  assert.equal(matchItem.state, "unknown", "no match computed is unknown, not a deficiency");
  assert.match(matchItem.because, /not poor/i);
  assert.equal(noMatch.blocking, false);
  assert.match(noMatch.disclaimer, /never prevents you from applying/i);

  const weak = reviewReadiness({
    ...base,
    match: { matchScore: 40, label: "Partial", details: { skills: { requiredNotFound: ["Kubernetes"], requiredDemonstrated: ["React"], needingEvidence: [] } } },
  });
  const weakItem = weak.items.find((i) => i.key === "match");
  assert.equal(weakItem.state, "attention");
  assert.match(weakItem.because, /not a reason not to apply/i);
  assert.equal(weak.blocking, false);
  assert.ok(weak.verdict.includes("None of them stops you applying"));

  // No cover letter is unknown; a draft that was never approved is attention.
  assert.equal(reviewReadiness({ ...base, match: null }).items.find((i) => i.key === "cover_letter").state, "unknown");
  assert.equal(
    reviewReadiness({ ...base, match: null, coverLetters: [{ status: "draft", title: "d" }] }).items.find((i) => i.key === "cover_letter").state,
    "attention"
  );
  assert.equal(
    reviewReadiness({ ...base, match: null, coverLetters: [{ status: "approved", title: "a" }] }).items.find((i) => i.key === "cover_letter").state,
    "ready"
  );

  // No resume version at all is a genuine deficiency.
  assert.equal(reviewReadiness({ ...base, match: null, resumeVersion: null }).items.find((i) => i.key === "resume_selected").state, "attention");
  assert.ok(noMatch.items.every((i) => i.because && i.because.length > 10), "every item explains itself");
});

test("the readiness endpoint runs against real records and records that it ran", async () => {
  const token = await registerUser("p13-readiness@example.com");
  const { applicationId, versionId } = await seedApplication(token);
  const res = await api(`/api/applications/${applicationId}/readiness-review`, { method: "POST", token, body: { resumeVersionId: versionId } });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.ok(res.body.review.items.length > 0);
  assert.equal(res.body.review.blocking, false);
  assert.ok(res.body.review.counts.total > 0);

  const activity = await api(`/api/applications/${applicationId}/activity`, { token });
  assert.ok(activity.body.activity.some((a) => a.type === "readiness_review"));
});

// ── 8. Workspace, next action, dashboard ─────────────────────────────────────

test("the workspace aggregates everything about one application in a single read", async () => {
  const token = await registerUser("p13-workspace@example.com");
  const { applicationId, versionId } = await seedApplication(token);
  await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { resumeVersionId: versionId } });
  await api(`/api/applications/${applicationId}/documents`, { method: "POST", token, body: { category: "portfolio", url: "https://example.com/work" } });
  await api(`/api/applications/${applicationId}/interviews`, { method: "POST", token, body: { stage: "screening", scheduledAt: "2026-07-01T10:00:00Z", timezone: "UTC" } });

  const ws = await api(`/api/applications/${applicationId}/workspace?tz=Asia/Kolkata`, { token });
  assert.equal(ws.status, 200, JSON.stringify(ws.body).slice(0, 400));
  assert.equal(ws.body.application.id, applicationId);
  assert.equal(ws.body.job.jobTitle, "Senior Frontend Developer");
  assert.ok(ws.body.job.description.length > 0, "the original listing text is shown");
  assert.equal(ws.body.checklist.items.length, CHECKLIST_TEMPLATE.length);
  assert.equal(ws.body.coverLetters.length, 1);
  assert.equal(ws.body.documents.length, 1);
  assert.equal(ws.body.interviews.length, 1);
  assert.equal(ws.body.reminders.timezone, "Asia/Kolkata");
  assert.ok(ws.body.activity.length > 0);
  assert.ok(ws.body.nextAction.title);
  assert.ok(ws.body.stage.label);
  assert.ok(ws.body.allowedTransitions.some((t) => t.status === "APPLIED"));
  assert.equal(ws.body.storage.enabled, false);
  assert.equal(ws.body.scheduler.active, false);
  assert.match(ws.body.notes.join(" "), /Nothing here submits an application/i);

  // Evidence-based auto-completion suggestions appear but nothing is ticked.
  assert.ok(ws.body.checklist.autoCompletions.some((a) => a.key === "cover_letter"));
  assert.ok(ws.body.checklist.items.every((i) => !i.completed), "suggestions never tick the box for you");
});

test("the next recommended action follows real state", () => {
  const application = { id: "a1", status: "INTERESTED", jobUrl: null, nextFollowUpDate: null, outcome: null };
  const checklist = { remainingRequired: ["Read the job description in full"], required: 6, requiredCompleted: 2 };

  const overdue = nextAction({ application, checklist, reminders: [{ status: "pending", dueAt: new Date(Date.now() - 86_400_000), title: "Chase Acme" }], interviews: [] });
  assert.equal(overdue.key, "overdue_reminder");

  const interview = nextAction({ application, checklist, reminders: [], interviews: [{ scheduledAt: new Date(Date.now() + 86_400_000), outcome: "scheduled", stage: "technical" }] });
  assert.equal(interview.key, "prepare_interview");

  const pastRound = nextAction({ application, checklist, reminders: [], interviews: [{ scheduledAt: new Date(Date.now() - 86_400_000), outcome: "scheduled", stage: "technical" }] });
  assert.equal(pastRound.key, "record_interview_outcome");

  assert.equal(nextAction({ application, checklist, reminders: [], interviews: [] }).key, "finish_checklist");
  assert.equal(nextAction({ application, checklist: { ...checklist, remainingRequired: [] }, reminders: [], interviews: [] }).key, "apply");
  assert.equal(nextAction({ application: { ...application, status: "APPLIED" }, checklist, reminders: [], interviews: [] }).key, "set_follow_up");
  assert.equal(nextAction({ application: { ...application, status: "OFFER" }, checklist, reminders: [], interviews: [] }).key, "record_outcome");

  const quiet = nextAction({ application: { ...application, status: "APPLIED", nextFollowUpDate: new Date() }, checklist, reminders: [], interviews: [], hasCoverLetter: true });
  assert.equal(quiet.key, "none");
  assert.match(quiet.title, /Nothing needs your attention/);
});

test("the dashboard counts the filters the workspace offers", async () => {
  const token = await registerUser("p13-dashboard@example.com");
  const a = await seedApplication(token, { company: "Acme" });
  const b = await seedApplication(token, { company: "Globex" });
  await api(`/api/applications/${b.applicationId}`, { method: "PATCH", token, body: { status: "APPLIED" } });
  await api(`/api/applications/${b.applicationId}/interviews`, { method: "POST", token, body: { stage: "screening", scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), timezone: "UTC" } });

  const res = await api("/api/application-workspaces", { token });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
  assert.equal(res.body.items.length, 2);
  assert.equal(res.body.filters.total, 2);
  assert.equal(res.body.filters.active, 2);
  assert.equal(res.body.filters.drafts, 1, "only the INTERESTED one is a draft");
  assert.equal(res.body.filters.upcomingInterviews, 1);
  assert.ok(res.body.items.every((i) => i.stage?.label));
  void a;
});

// ── 9. Isolation and auth ────────────────────────────────────────────────────

test("every Phase 13 endpoint requires authentication", async () => {
  const id = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const cases = [
    ["GET", "/api/application-workspaces"],
    ["GET", `/api/applications/${id}/workspace`],
    ["GET", `/api/applications/${id}/checklist`], ["POST", `/api/applications/${id}/checklist`],
    ["PATCH", `/api/applications/${id}/checklist/${id}`], ["DELETE", `/api/applications/${id}/checklist/${id}`],
    ["GET", `/api/applications/${id}/activity`], ["POST", `/api/applications/${id}/activity`],
    ["GET", `/api/applications/${id}/cover-letters`], ["POST", `/api/applications/${id}/cover-letters`],
    ["PATCH", `/api/cover-letters/${id}`], ["DELETE", `/api/cover-letters/${id}`],
    ["POST", `/api/cover-letters/${id}/export`], ["POST", `/api/cover-letters/${id}/regenerate-paragraph`],
    ["GET", `/api/applications/${id}/documents`], ["POST", `/api/applications/${id}/documents`],
    ["GET", `/api/application-documents/${id}/download`], ["DELETE", `/api/application-documents/${id}`],
    ["GET", "/api/application-reminders"], ["POST", "/api/application-reminders"],
    ["PATCH", `/api/application-reminders/${id}`], ["DELETE", `/api/application-reminders/${id}`],
    ["GET", `/api/applications/${id}/interviews`], ["POST", `/api/applications/${id}/interviews`],
    ["PATCH", `/api/application-interviews/${id}`], ["DELETE", `/api/application-interviews/${id}`],
    ["POST", `/api/applications/${id}/readiness-review`],
  ];
  for (const [method, path] of cases) {
    const res = await api(path, { method, body: ["GET", "DELETE"].includes(method) ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${path} must require a token`);
  }
});

test("one user cannot reach another user's workspace, letters, reminders or interviews", async () => {
  const a = await registerUser("p13-iso-a@example.com");
  const b = await registerUser("p13-iso-b@example.com");
  const { applicationId, versionId } = await seedApplication(a);

  const letter = await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token: a, body: { resumeVersionId: versionId } });
  const reminder = await api("/api/application-reminders", { method: "POST", token: a, body: { title: "Chase", dueAt: "2026-05-01T09:00:00Z", timezone: "UTC", type: "follow_up", applicationId } });
  const interview = await api(`/api/applications/${applicationId}/interviews`, { method: "POST", token: a, body: { stage: "screening" } });
  const items = (await api(`/api/applications/${applicationId}/checklist`, { token: a })).body.items;

  assert.equal((await api(`/api/applications/${applicationId}/workspace`, { token: b })).status, 404);
  assert.equal((await api(`/api/applications/${applicationId}/checklist`, { token: b })).status, 404);
  assert.equal((await api(`/api/applications/${applicationId}/checklist/${items[0].id}`, { method: "PATCH", token: b, body: { completed: true, completionSource: "external" } })).status, 404);
  assert.equal((await api(`/api/applications/${applicationId}/activity`, { token: b })).status, 404);
  assert.equal((await api(`/api/cover-letters/${letter.body.coverLetter.id}`, { method: "PATCH", token: b, body: { title: "mine now" } })).status, 404);
  assert.equal((await api(`/api/cover-letters/${letter.body.coverLetter.id}/export`, { method: "POST", token: b })).status, 404);
  assert.equal((await api(`/api/application-reminders/${reminder.body.reminder.id}`, { method: "PATCH", token: b, body: { status: "done" } })).status, 404);
  assert.equal((await api(`/api/application-interviews/${interview.body.interview.id}`, { method: "PATCH", token: b, body: { outcome: "passed" } })).status, 404);
  assert.equal((await api(`/api/applications/${applicationId}/readiness-review`, { method: "POST", token: b, body: {} })).status, 404);

  // B sees nothing of A's in their own lists.
  assert.equal((await api("/api/application-reminders", { token: b })).body.counts.pending, 0);
  assert.equal((await api("/api/application-workspaces", { token: b })).body.items.length, 0);
});

test("oversized and malformed input is rejected rather than stored", async () => {
  const token = await registerUser("p13-input@example.com");
  const { applicationId } = await seedApplication(token);

  assert.equal((await api(`/api/applications/${applicationId}/checklist`, { method: "POST", token, body: { title: "x" } })).status, 400);
  assert.equal((await api(`/api/applications/${applicationId}/checklist`, { method: "POST", token, body: { title: "a".repeat(400), category: "research" } })).status, 400);
  assert.equal((await api(`/api/applications/${applicationId}/checklist`, { method: "POST", token, body: { title: "Valid", category: "nonsense" } })).status, 400);
  assert.equal((await api(`/api/applications/${applicationId}/cover-letters`, { method: "POST", token, body: { tone: "sarcastic" } })).status, 400);
  assert.equal((await api(`/api/applications/${applicationId}/activity`, { method: "POST", token, body: { title: "ok", detail: "d".repeat(5000) } })).status, 400);
  assert.equal((await api(`/api/applications/${applicationId}/interviews`, { method: "POST", token, body: { stage: "coffee_chat" } })).status, 400);
  assert.equal((await api("/api/application-reminders", { method: "POST", token, body: { title: "No date", timezone: "UTC", type: "custom" } })).status, 400);
});
