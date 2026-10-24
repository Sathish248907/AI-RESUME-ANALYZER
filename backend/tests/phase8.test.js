/**
 * Phase 8 tests: resume versions (create / edit / duplicate / delete / restore),
 * ownership, heuristic + AI structuring with grounding, AI improvement and
 * tailoring validation (fabrication guard, accept/reject/edit), quality checks,
 * version comparison, PDF export (text, multi-page, safety), autosave conflicts,
 * empty and oversized input.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pdfParse from "pdf-parse";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { ApiError } from "../src/utils/errors.js";
import { TEST_ENV, fakeLlm, fakePrisma, RESUME_TEXT, JOB_DESCRIPTION, validResumeStructure } from "./fixtures.js";
import * as fx from "./fixtures.js";
import { structureHeuristically, fromAiStructure, ungroundedFields } from "../src/services/resumeBuilder/resumeStructureService.js";
import { fabricationCheck, supportsKeyword, postProcess } from "../src/services/resumeBuilder/resumeImprovementService.js";
import { runQualityChecks } from "../src/services/resumeBuilder/resumeQualityService.js";
import { compareContents, describeChanges } from "../src/services/resumeBuilder/resumeDiffService.js";
import { renderResumePdf, safeFileName } from "../src/services/resumeBuilder/resumePdfService.js";
import { emptyContent, normaliseContent, listTextFields, applyTextField, contentToPlainText } from "../src/services/resumeBuilder/resumeContentSchema.js";

let server, baseUrl, prisma, llm, behaviour = null;
async function ensureServer() {
  if (server) return;
  prisma = fakePrisma();
  llm = fakeLlm((req) => (behaviour ? behaviour(req) : undefined) ?? defaultLlm(req));
  const app = createApp({ env: loadEnv(TEST_ENV), prisma, llm });
  await new Promise((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); server.unref(); });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));
function defaultLlm(req) {
  if (req.schemaName === "resume_structure") return validResumeStructure(req);
  if (req.schemaName === "resume_improvements") return fx.validImprovements(req);
  if (req.schemaName === "resume_tailoring") return fx.validTailoring(req);
  return fx.validAiOutput();
}
async function api(path, { method = "GET", token, body, raw = false } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function registerUser(email) { const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } }); assert.equal(r.status, 201); return r.body.token; }
async function createResume(token, name = "Frontend CV") {
  // Insert directly through the fake (the upload route needs a real DOCX; parsing is covered by phase5 tests).
  const user = prisma.tables.user.find((u) => u.email === tokenEmail.get(token));
  return prisma.resume.create({ data: { userId: user.id, name, originalFileName: "cv.docx", fileType: "docx", fileSize: 1000, charCount: RESUME_TEXT.length, extractedText: RESUME_TEXT } });
}
const tokenEmail = new Map();
async function user(email) { const t = await registerUser(email); tokenEmail.set(t, email); return t; }
const findSection = (c, type) => c.sections.find((s) => s.type === type);

// ─── Unit: structuring ──────────────────────────────────────────────────────

test("heuristic structuring extracts contact, sections, entries and bullets without altering text", () => {
  const c = structureHeuristically(RESUME_TEXT);
  assert.equal(c.personal.fullName, "Jane Doe");
  assert.equal(c.personal.email, "jane.doe@example.com");
  assert.ok(c.personal.linkedin.includes("linkedin.com/in/janedoe"));
  const exp = findSection(c, "experience");
  assert.equal(exp.entries.length, 1);
  assert.equal(exp.entries[0].role, "Frontend Developer");
  assert.equal(exp.entries[0].company, "Acme Corp");
  assert.equal(exp.entries[0].bullets.length, 3);
  assert.equal(exp.entries[0].bullets[0], "Built a React and TypeScript design system used by 12 product teams");
  assert.equal(findSection(c, "skills").groups[0].items.length, 8);
  assert.equal(findSection(c, "education").entries[0].degree, "B.Sc. Computer Science");
  assert.ok(findSection(c, "projects"), "standard sections always exist for the editor");
  assert.equal(ungroundedFields(c, RESUME_TEXT).length, 0);
  // Degenerate input
  const blank = structureHeuristically("");
  assert.equal(blank.sections.length, 5);
  const huge = structureHeuristically("x".repeat(100_000));
  assert.ok(JSON.stringify(huge).length < 130_000, "oversized text is capped");
});

test("AI structure is normalised and grounded; rephrased output is detected", () => {
  const c = fromAiStructure(validResumeStructure());
  assert.equal(findSection(c, "experience").entries[0].bullets.length, 3);
  assert.ok(findSection(c, "experience").entries[0].id.startsWith("e_"));
  assert.equal(ungroundedFields(c, RESUME_TEXT).length, 0);
  const tampered = validResumeStructure();
  tampered.sections[1].entries[0].bullets = ["Spearheaded a world-class design system adopted by 50 teams", "Boosted Lighthouse to 99", "Pioneered testing culture"];
  const bad = ungroundedFields(fromAiStructure(tampered), RESUME_TEXT);
  assert.equal(bad.length, 3);
});

// ─── Unit: improvement guard, quality, diff, pdf ─────────────────────────────

test("fabrication guard flags new numbers and technologies; keyword support is checked against the resume", () => {
  const text = contentToPlainText(structureHeuristically(RESUME_TEXT));
  assert.equal(fabricationCheck(text, "Built a React design system used by 12 product teams").ok, true);
  const bad = fabricationCheck(text, "Cut CI time by 45% using Kubernetes for 30 engineers");
  assert.equal(bad.ok, false);
  assert.ok(bad.newNumbers.some((n) => n.startsWith("45")));
  assert.ok(bad.newTechnologies.includes("kubernetes"));
  assert.equal(supportsKeyword(text.toLowerCase(), "TypeScript"), true);
  assert.equal(supportsKeyword(text.toLowerCase(), "Kubernetes"), false);
  // postProcess: unknown field dropped, unchanged text dropped, flagged suggestion kept with question
  const content = structureHeuristically(RESUME_TEXT);
  const exp = findSection(content, "experience");
  const out = postProcess({ suggestions: [
    { sectionId: exp.id, entryId: exp.entries[0].id, field: "bullet:0", category: "impact", suggestedText: "Built a React and TypeScript design system adopted by 12 product teams", rationale: "Stronger verb." },
    { sectionId: exp.id, entryId: exp.entries[0].id, field: "bullet:1", category: "impact", suggestedText: exp.entries[0].bullets[1], rationale: "unchanged" },
    { sectionId: "nope", entryId: null, field: "bullet:0", category: "impact", suggestedText: "x y z", rationale: "unknown field" },
    { sectionId: exp.id, entryId: exp.entries[0].id, field: "bullet:2", category: "impact", suggestedText: "Raised coverage to 95% with Jest", rationale: "number" },
  ], generalNotes: [] }, content, "improve");
  assert.equal(out.suggestions.length, 2);
  assert.equal(out.suggestions[0].needsConfirmation, false);
  assert.equal(out.suggestions[1].needsConfirmation, true);
  assert.match(out.suggestions[1].confirmationQuestion, /95%/);
  assert.throws(() => postProcess({ suggestions: [], generalNotes: [] }, content, "improve"), (e) => e.status === 502);
});

test("quality checks score categories, explain issues, keep job-match separate, and handle empty resumes", () => {
  const good = runQualityChecks(structureHeuristically(RESUME_TEXT), { jobKeywords: ["React", "GraphQL"] });
  assert.ok(good.overall >= 70 && good.overall <= 100, String(good.overall));
  assert.equal(good.categories.length, 8);
  assert.equal(good.keywordCoverage.percent, 50);
  assert.ok(good.issues.every((i) => i.message && i.suggestion && i.severity));
  assert.match(good.disclaimer, /not an ATS verdict/);
  const empty = runQualityChecks(emptyContent());
  assert.ok(empty.overall < 50, String(empty.overall));
  assert.ok(empty.issues.some((i) => i.category === "contact" && i.severity === "high"));
  assert.ok(empty.issues.some((i) => i.category === "summary"));
  const weak = structureHeuristically(RESUME_TEXT);
  findSection(weak, "summary").text = "I am a hard-working team player and fast learner who is passionate.";
  findSection(weak, "experience").entries[0].bullets = ["Responsible for various things", "Responsible for stuff", "Responsible for etc.", "Responsible for more"];
  findSection(weak, "experience").entries[0].startDate = "Jan 2021"; findSection(weak, "education").entries[0].startDate = "2017";
  const w = runQualityChecks(weak);
  assert.ok(w.overall < good.overall);
  assert.ok(w.issues.some((i) => /Generic phrases/.test(i.message)));
  assert.ok(w.issues.some((i) => /Weak opening/.test(i.message)));
  assert.ok(w.issues.some((i) => /Mixed date formats/.test(i.message)));
  assert.ok(w.issues.some((i) => /Repetitive openings/.test(i.message)));
});

test("diff reports section/entry/field changes and describes them", () => {
  const a = structureHeuristically(RESUME_TEXT);
  const b = JSON.parse(JSON.stringify(a));
  b.personal.phone = "+44 20 0000 0000";
  const exp = findSection(b, "experience");
  exp.entries[0].bullets[0] = "Built and maintained a React + TypeScript design system used by 12 product teams";
  exp.entries.push({ id: "e_new", role: "Intern", company: "Beta", location: "", startDate: "2020", endDate: "2021", current: false, bullets: ["Did things"] });
  b.sections = b.sections.filter((s) => s.type !== "projects");
  b.sections.push({ id: "c_1", type: "custom", title: "Volunteering", visible: true, items: ["Mentor at local code club"] });
  const d = compareContents(a, b);
  assert.equal(d.summary.sectionsAdded, 1);
  assert.equal(d.summary.sectionsRemoved, 1);
  assert.equal(d.summary.entriesAdded, 1);
  assert.ok(d.changes.some((c) => c.kind === "line_changed" && c.index === 0));
  assert.ok(d.summary.personalChanged.includes("phone"));
  assert.match(describeChanges(d), /1 section added, 1 section removed, 1 entry added/);
  assert.equal(compareContents(a, a).summary.totalChanges, 0);
  assert.equal(describeChanges(compareContents(a, a)), "No content differences.");
});

test("PDF: selectable text in all templates, multi-page with page numbers, no script interpretation, safe filenames", async () => {
  const c = structureHeuristically(RESUME_TEXT);
  for (const t of ["modern", "minimal_ats", "technical", "classic"]) {
    const { buffer, pages } = await renderResumePdf({ content: c, templateId: t, formatting: {} });
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    assert.equal(pages, 1);
    const parsed = await pdfParse(buffer);
    assert.match(parsed.text, /Jane Doe/);
    assert.match(parsed.text, /design system used by 12 product teams/);
    assert.match(parsed.text, t === "technical" ? /Skills/i : /SKILLS/);
  }
  const big = JSON.parse(JSON.stringify(c));
  const exp = findSection(big, "experience");
  for (let i = 0; i < 14; i++) exp.entries.push({ ...exp.entries[0], id: `e${i}`, bullets: [...exp.entries[0].bullets, "Another long bullet describing measurable outcomes delivered for the product and the team over a quarter."] });
  const multi = await renderResumePdf({ content: big, templateId: "classic", formatting: { fontFamily: "Times", margins: "wide", fontSize: 12 } });
  assert.ok(multi.pages >= 2, String(multi.pages));
  const parsed = await pdfParse(multi.buffer);
  assert.equal(parsed.numpages, multi.pages);
  assert.match(parsed.text, new RegExp(`page 1 of ${multi.pages}`));
  // Hostile content is rendered as text, never interpreted
  const hostile = JSON.parse(JSON.stringify(c));
  findSection(hostile, "summary").text = "<script>alert(1)</script> %PDF-1.7 \u0000 endobj << /JavaScript (app.alert(1)) >>";
  const h = await renderResumePdf({ content: hostile, templateId: "modern", formatting: {} });
  const ht = (await pdfParse(h.buffer)).text;
  assert.match(ht, /<script>alert\(1\)<\/script>/);
  assert.ok(!h.buffer.toString("latin1").includes("/JavaScript ("), "no JavaScript action objects");
  assert.equal(safeFileName("Jane's CV: Frontend/2026 ✨"), "Janes-CV-Frontend2026.pdf");
  assert.equal(safeFileName("   "), "resume.pdf");
});

test("content schema: text fields can be listed and replaced; invalid shapes are rejected", () => {
  const c = structureHeuristically(RESUME_TEXT);
  const fields = listTextFields(c);
  assert.ok(fields.some((f) => f.field === "summary") && fields.filter((f) => f.field.startsWith("bullet:")).length === 3);
  const exp = findSection(c, "experience");
  const next = applyTextField(c, { sectionId: exp.id, entryId: exp.entries[0].id, field: "bullet:1" }, "Improved Lighthouse performance score from 61 to 94 across the app");
  assert.equal(findSection(next, "experience").entries[0].bullets[1], "Improved Lighthouse performance score from 61 to 94 across the app");
  assert.equal(findSection(c, "experience").entries[0].bullets[1], "Improved Lighthouse performance score from 61 to 94", "original untouched");
  assert.equal(applyTextField(c, { sectionId: exp.id, entryId: "nope", field: "bullet:0" }, "x"), null);
  assert.throws(() => normaliseContent({ sections: [{ id: "a", type: "summary", title: "S", text: "x" }, { id: "a", type: "skills", title: "K" }] }), /unique/);
  assert.throws(() => normaliseContent({ sections: [{ id: "a", type: "wat", title: "S" }] }));
  assert.throws(() => normaliseContent({ sections: [{ id: "a", type: "summary", title: "S", text: "x".repeat(5000) }] }));
});

// ─── HTTP: versions ─────────────────────────────────────────────────────────

test("editable resume: original version is created once, read-only, and derived versions can be created, edited, duplicated, restored and deleted", async () => {
  const token = await user("p8-versions@example.com");
  const resume = await createResume(token);
  assert.equal((await api(`/api/resume-builder/${resume.id}`)).status, 401);
  const first = await api(`/api/resume-builder/${resume.id}`, { token });
  assert.equal(first.status, 200, JSON.stringify(first.body).slice(0, 300));
  assert.equal(first.body.createdOriginal, true);
  assert.equal(first.body.original.isOriginal, true);
  assert.equal(first.body.original.content.personal.fullName, "Jane Doe");
  assert.equal(first.body.versions.length, 1);
  const again = await api(`/api/resume-builder/${resume.id}`, { token });
  assert.equal(again.body.createdOriginal, false);
  assert.equal(again.body.versions.length, 1, "original is not recreated");
  const originalId = first.body.original.id;
  assert.equal(prisma.tables.resume[0].extractedText, RESUME_TEXT, "uploaded text never modified");

  // original is read-only for AI and restore
  assert.equal((await api(`/api/resume-builder/versions/${originalId}/improve`, { method: "POST", token, body: {} })).status, 409);

  // working version from the upload
  const v1 = await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { name: "Improved Resume" } });
  assert.equal(v1.status, 201, JSON.stringify(v1.body).slice(0, 300));
  assert.equal(v1.body.version.versionNumber, 2);
  assert.equal(v1.body.version.name, "Improved Resume");
  assert.equal(v1.body.structuring.source, "duplicate", "working copies reuse the original's structure so ids line up");
  assert.equal(v1.body.version.parentVersionId, originalId);
  const vid = v1.body.version.id;

  // edit (autosave) + concurrency
  const content = v1.body.version.content;
  content.personal.title = "Senior Frontend Developer";
  findSection(content, "summary").text = "Frontend developer with 4 years of experience building accessible React applications for fintech products.";
  const saved = await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: { content, expectedUpdatedAt: v1.body.version.updatedAt } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 300));
  assert.equal(saved.body.version.content.personal.title, "Senior Frontend Developer");
  assert.ok(typeof saved.body.version.lastQualityScore === "number");
  const stale = await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: { name: "x", expectedUpdatedAt: v1.body.version.updatedAt } });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "VERSION_CONFLICT");
  assert.equal((await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: {} })).status, 400);
  assert.equal((await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: { content: { sections: [{ id: "a", type: "wat" }] } } })).status, 400);
  assert.equal((await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: { formatting: { accentColor: "red" } } })).status, 400);
  const fmt = await api(`/api/resume-builder/versions/${vid}`, { method: "PATCH", token, body: { templateId: "classic", formatting: { fontSize: 11, margins: "wide" } } });
  assert.equal(fmt.body.version.templateId, "classic");
  assert.equal(fmt.body.version.formatting.fontFamily, "Times", "template defaults applied");
  assert.equal(fmt.body.version.formatting.margins, "wide");

  // original unchanged by edits
  const orig = await api(`/api/resume-builder/versions/${originalId}`, { token });
  assert.equal(orig.body.version.content.personal.title, "");

  // duplicate, restore, compare
  const dup = await api(`/api/resume-builder/versions/${vid}/duplicate`, { method: "POST", token, body: { name: "Backend Developer Resume" } });
  assert.equal(dup.status, 201);
  assert.equal(dup.body.version.parentVersionId, vid);
  assert.equal(dup.body.version.content.personal.title, "Senior Frontend Developer");
  const cmp = await api(`/api/resume-builder/versions/${vid}/compare`, { method: "POST", token, body: { otherVersionId: originalId } });
  assert.equal(cmp.status, 200);
  assert.ok(cmp.body.diff.summary.totalChanges >= 2);
  assert.ok(cmp.body.diff.summary.personalChanged.includes("title"));
  assert.ok(typeof cmp.body.quality.base === "number");
  const restore = await api(`/api/resume-builder/versions/${vid}/restore`, { method: "POST", token, body: { fromVersionId: originalId } });
  assert.equal(restore.status, 200, JSON.stringify(restore.body).slice(0, 300));
  assert.equal(restore.body.version.content.personal.title, "", "content restored from original");
  assert.ok(restore.body.backup && restore.body.backup.kind === "restored", "previous content kept as a backup version");
  assert.equal((await api(`/api/resume-builder/versions/${originalId}/restore`, { method: "POST", token, body: { fromVersionId: vid } })).status, 409);

  // list + delete rules
  const list = await api(`/api/resume-builder/${resume.id}/versions`, { token });
  assert.equal(list.body.versions.length, 4);
  assert.ok(list.body.versions.every((v) => !("content" in v)), "list rows omit content");
  const delOriginal = await api(`/api/resume-builder/versions/${originalId}`, { method: "DELETE", token });
  assert.equal(delOriginal.status, 409, "original cannot be deleted while derived versions exist");
  assert.equal((await api(`/api/resume-builder/versions/${dup.body.version.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api(`/api/resume-builder/versions/${dup.body.version.id}`, { token })).status, 404);

  // blank version without an upload
  const blank = await api("/api/resume-builder/versions", { method: "POST", token, body: { blank: true, name: "From scratch" } });
  assert.equal(blank.status, 201);
  assert.equal(blank.body.version.resumeId, null);
  assert.equal(blank.body.version.content.sections.length, 5);

  // template preference
  assert.equal((await api("/api/resume-builder/preferences", { method: "PUT", token, body: { templateId: "technical", formatting: { accentColor: "#0f766e" } } })).status, 200);
  const pref = await api("/api/resume-builder/preferences", { token });
  assert.equal(pref.body.preference.templateId, "technical");
  const fromPref = await api("/api/resume-builder/versions", { method: "POST", token, body: { blank: true } });
  assert.equal(fromPref.body.version.templateId, "technical");
  const tpls = (await api("/api/resume-builder/templates", { token })).body.templates;
  assert.equal(tpls.length, 6);
  assert.deepEqual(tpls.map((t) => t.id).sort(), ["classic", "experienced", "fresher", "minimal_ats", "modern", "technical"]);
  // Phase 8 templates must keep their ids so saved versions still resolve.
  for (const id of ["modern", "minimal_ats", "technical", "classic"]) assert.ok(tpls.some((t) => t.id === id), `${id} must survive`);
});

test("AI structuring: grounded output accepted, rephrased output rejected with nothing persisted", async () => {
  const token = await user("p8-ai-structure@example.com");
  const resume = await createResume(token);
  const ok = await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { structure: "ai" } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body).slice(0, 300));
  assert.equal(ok.body.structuring.source, "ai");
  assert.equal(ok.body.version.contentSource, "ai");
  assert.equal(findSection(ok.body.version.content, "experience").entries[0].bullets.length, 3);
  const before = prisma.tables.resumeVersion.length;
  try {
    behaviour = (req) => { if (req.schemaName !== "resume_structure") return undefined; const s = validResumeStructure(); s.sections[1].entries[0].bullets = ["Spearheaded an award-winning design system", "Boosted Lighthouse to 99", "Pioneered a testing culture"]; s.sections[0].text = "Visionary engineer with a decade of leadership."; return s; };
    const bad = await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { structure: "ai" } });
    assert.equal(bad.status, 502);
    assert.equal(bad.body.error.code, "LLM_INVALID_OUTPUT");
    behaviour = (req) => { if (req.schemaName === "resume_structure") throw new ApiError(504, "timeout", { code: "LLM_TIMEOUT", retryable: true }); };
    assert.equal((await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { structure: "ai" } })).status, 504);
  } finally { behaviour = null; }
  assert.equal(prisma.tables.resumeVersion.length, before);
});

// ─── HTTP: AI improvement & tailoring ────────────────────────────────────────

test("improve: suggestions stored separately, flagged when ungrounded, accept/edit/reject/reset update content correctly", async () => {
  const token = await user("p8-improve@example.com");
  const resume = await createResume(token);
  await api(`/api/resume-builder/${resume.id}`, { token });
  const v = (await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: { name: "Work" } })).body.version;
  const r = await api(`/api/resume-builder/versions/${v.id}/improve`, { method: "POST", token, body: {} });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 400));
  assert.equal(llm.lastRequest.schemaName, "resume_improvements");
  assert.match(llm.lastRequest.user, /<resume>/);
  assert.ok(!llm.lastRequest.user.includes("jane.doe@example.com"), "contact details are not sent to the provider");
  const sugg = r.body.suggestions;
  assert.equal(sugg.length, 4, "2 bullets + 1 flagged + summary");
  assert.ok(sugg.every((s) => s.status === "pending" && s.originalText && s.suggestedText && s.rationale));
  const flagged = sugg.find((s) => s.needsConfirmation);
  assert.ok(flagged && /45%|Kubernetes|CI time/i.test(flagged.confirmationQuestion), JSON.stringify(flagged));
  const unchanged = await api(`/api/resume-builder/versions/${v.id}`, { token });
  assert.deepEqual(unchanged.body.version.content, v.content, "nothing applied until accepted");
  assert.equal(unchanged.body.pendingSuggestions, 4);

  const plain = sugg.find((s) => !s.needsConfirmation && s.field === "bullet:0");
  const acc = await api(`/api/resume-builder/versions/${v.id}/improvements/${plain.id}`, { method: "POST", token, body: { action: "accept" } });
  assert.equal(acc.status, 200, JSON.stringify(acc.body).slice(0, 300));
  assert.equal(acc.body.suggestion.status, "accepted");
  assert.equal(findSection(acc.body.version.content, "experience").entries[0].bullets[0], plain.suggestedText);
  const edited = await api(`/api/resume-builder/versions/${v.id}/improvements/${flagged.id}`, { method: "POST", token, body: { action: "edit", text: "Reduced CI pipeline time by about a third by caching dependencies" } });
  assert.equal(edited.body.suggestion.status, "edited");
  assert.equal(findSection(edited.body.version.content, "experience").entries[0].bullets[2], "Reduced CI pipeline time by about a third by caching dependencies");
  const summary = sugg.find((s) => s.field === "summary");
  const rej = await api(`/api/resume-builder/versions/${v.id}/improvements/${summary.id}`, { method: "POST", token, body: { action: "reject" } });
  assert.equal(rej.body.suggestion.status, "rejected");
  assert.equal(findSection(rej.body.version.content, "summary").text, findSection(v.content, "summary").text);
  const reset = await api(`/api/resume-builder/versions/${v.id}/improvements/${plain.id}`, { method: "POST", token, body: { action: "reset" } });
  assert.equal(reset.body.suggestion.status, "pending");
  assert.equal(findSection(reset.body.version.content, "experience").entries[0].bullets[0], plain.originalText, "reset reverts the field");
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/improvements/${plain.id}`, { method: "POST", token, body: { action: "edit" } })).status, 400);
  const listed = await api(`/api/resume-builder/versions/${v.id}/improvements?status=pending`, { token });
  assert.equal(listed.body.suggestions.length, 2);

  // section-scoped regeneration replaces only pending suggestions
  const summarySection = findSection(v.content, "summary");
  const r2 = await api(`/api/resume-builder/versions/${v.id}/improve`, { method: "POST", token, body: { sectionIds: [summarySection.id] } });
  assert.equal(r2.status, 201);
  assert.ok(r2.body.suggestions.every((s) => s.sectionId === summarySection.id));
  const all = await api(`/api/resume-builder/versions/${v.id}/improvements`, { token });
  assert.ok(all.body.suggestions.some((s) => s.status === "edited") && all.body.suggestions.some((s) => s.status === "rejected"), "resolved history kept");
  assert.ok(!all.body.suggestions.some((s) => s.status === "pending" && s.batchId === r.body.batchId), "old pending suggestions replaced");

  // empty resume → 400; provider failure → nothing stored
  const blank = (await api("/api/resume-builder/versions", { method: "POST", token, body: { blank: true } })).body.version;
  const empty = await api(`/api/resume-builder/versions/${blank.id}/improve`, { method: "POST", token, body: {} });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, "EMPTY_RESUME");
  try {
    behaviour = (req) => (req.schemaName === "resume_improvements" ? { suggestions: [{ sectionId: "x" }] } : undefined);
    assert.ok((await api(`/api/resume-builder/versions/${v.id}/improve`, { method: "POST", token, body: {} })).status >= 500);
  } finally { behaviour = null; }
});

test("tailor: uses saved or pasted job description, keeps unsupported keywords as gaps, links the version to the job", async () => {
  const token = await user("p8-tailor@example.com");
  const resume = await createResume(token);
  await api(`/api/resume-builder/${resume.id}`, { token });
  const v = (await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token, body: {} })).body.version;
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/tailor`, { method: "POST", token, body: {} })).status, 400);
  const jd = (await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION, extractedRequirements: { skills: [{ name: "React", priority: "required" }, { name: "GraphQL", priority: "required" }], parserVersion: "demo-rules-1.0" } } })).body.jobDescription;
  const t = await api(`/api/resume-builder/versions/${v.id}/tailor`, { method: "POST", token, body: { jobDescriptionId: jd.id } });
  assert.equal(t.status, 201, JSON.stringify(t.body).slice(0, 400));
  assert.equal(llm.lastRequest.schemaName, "resume_tailoring");
  assert.match(llm.lastRequest.user, /<job_description>/);
  assert.match(llm.lastRequest.user, /GraphQL \(required\)/);
  assert.deepEqual(t.body.keywordsToAdd, ["TypeScript"], "GraphQL is not in the resume → not a keyword to add");
  assert.ok(t.body.genuineGaps.includes("GraphQL") && t.body.genuineGaps.includes("AWS"));
  assert.equal(t.body.target.jobTitle, "Senior Frontend Developer");
  assert.equal(t.body.version.jobDescriptionId, jd.id);
  assert.equal(t.body.version.kind, "tailored");
  assert.ok(t.body.suggestions.length >= 3);
  // pasted JD saved on request
  const pasted = await api(`/api/resume-builder/versions/${v.id}/tailor`, { method: "POST", token, body: { jobDescription: JOB_DESCRIPTION, jobTitle: "Frontend Engineer", companyName: "Beta", saveJobDescription: true } });
  assert.equal(pasted.status, 201);
  assert.ok(pasted.body.target.jobDescriptionId, "pasted JD was saved");
  assert.equal((await api("/api/job-descriptions", { token })).body.total, 2);
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/tailor`, { method: "POST", token, body: { jobDescription: "too short" } })).status, 400);
});

// ─── HTTP: quality, export, ownership ────────────────────────────────────────

test("quality-check endpoint, PDF export (headers, text, validation) and ownership isolation", async () => {
  const owner = await user("p8-owner@example.com");
  const other = await user("p8-other@example.com");
  const resume = await createResume(owner);
  const ed = await api(`/api/resume-builder/${resume.id}`, { token: owner });
  const v = (await api(`/api/resume-builder/${resume.id}/versions`, { method: "POST", token: owner, body: { name: "Export me" } })).body.version;
  const q = await api(`/api/resume-builder/versions/${v.id}/quality-check`, { token: owner });
  assert.equal(q.status, 200);
  assert.ok(q.body.quality.overall > 0 && q.body.quality.categories.length === 8);
  const pdf = await api(`/api/resume-builder/versions/${v.id}/export/pdf`, { method: "POST", token: owner, body: {}, raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(pdf.headers.get("content-disposition"), /attachment; filename="Export-me\.pdf"/);
  assert.equal(pdf.headers.get("x-resume-pages"), "1");
  assert.equal(pdf.buffer.subarray(0, 5).toString(), "%PDF-");
  assert.match((await pdfParse(pdf.buffer)).text, /Jane Doe/);
  const classic = await api(`/api/resume-builder/versions/${v.id}/export/pdf`, { method: "POST", token: owner, body: { templateId: "classic", formatting: { fontSize: 12 } }, raw: true });
  assert.equal(classic.status, 200);
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/export/pdf`, { method: "POST", token: owner, body: { templateId: "fancy" } })).status, 400);
  // incomplete content cannot be exported
  const blank = (await api("/api/resume-builder/versions", { method: "POST", token: owner, body: { blank: true } })).body.version;
  const inc = await api(`/api/resume-builder/versions/${blank.id}/export/pdf`, { method: "POST", token: owner, body: {} });
  assert.equal(inc.status, 422);
  assert.equal(inc.body.error.code, "EXPORT_INCOMPLETE");

  // ownership
  for (const [method, path, body] of [
    ["GET", `/api/resume-builder/${resume.id}`], ["POST", `/api/resume-builder/${resume.id}/versions`, {}], ["GET", `/api/resume-builder/versions/${v.id}`], ["PATCH", `/api/resume-builder/versions/${v.id}`, { name: "x" }],
    ["DELETE", `/api/resume-builder/versions/${v.id}`], ["POST", `/api/resume-builder/versions/${v.id}/duplicate`, {}], ["POST", `/api/resume-builder/versions/${v.id}/improve`, {}], ["POST", `/api/resume-builder/versions/${v.id}/tailor`, { jobDescription: JOB_DESCRIPTION }],
    ["GET", `/api/resume-builder/versions/${v.id}/quality-check`], ["POST", `/api/resume-builder/versions/${v.id}/export/pdf`, {}], ["POST", `/api/resume-builder/versions/${v.id}/compare`, { otherVersionId: ed.body.original.id }], ["GET", `/api/resume-builder/versions/${v.id}/improvements`],
  ]) {
    const r = await api(path, { method, token: other, body });
    assert.equal(r.status, 404, `${method} ${path} → ${r.status}`);
  }
  assert.deepEqual((await api("/api/resume-builder/versions", { token: other })).body.versions, []);
  // cross-user compare/restore with an id the other user owns
  const otherResume = await createResume(other, "Other CV");
  const otherV = (await api(`/api/resume-builder/${otherResume.id}`, { token: other })).body.original;
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/compare`, { method: "POST", token: owner, body: { otherVersionId: otherV.id } })).status, 404);
  assert.equal((await api(`/api/resume-builder/versions/${v.id}/restore`, { method: "POST", token: owner, body: { fromVersionId: otherV.id } })).status, 404);
  // deleting the upload keeps versions (resumeId nulled)
  assert.equal((await api(`/api/resumes/${resume.id}`, { method: "DELETE", token: owner })).status, 204);
  const after = await api(`/api/resume-builder/versions/${v.id}`, { token: owner });
  assert.equal(after.status, 200);
  assert.equal(after.body.version.resumeId, null);
});
