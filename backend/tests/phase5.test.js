/**
 * Phase 5 HTTP tests: resumes, saved job descriptions, applications, interview
 * history, dashboard metrics, filters, ownership and linked-record deletion.
 * Uses the in-memory Prisma fake, a fake LLM and the "none" storage driver.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { JOB_DESCRIPTION, RESUME_TEXT, TEST_ENV, fakeLlm, fakePrisma } from "./fixtures.js";

let server;
let baseUrl;
let prisma;
let llm;

async function ensureServer() {
  if (server) return;
  prisma = fakePrisma();
  llm = fakeLlm();
  const app = createApp({ env: loadEnv(TEST_ENV), prisma, llm });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.unref();
  });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

async function api(path, { method = "GET", token, body, form } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, {
    method,
    headers: { Origin: "http://localhost:3001", ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } });
  assert.equal(r.status, 201);
  return r.body.token;
}

/** Minimal DOCX built in memory (same approach as resume-parse.test.js). */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStored(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name), data = Buffer.from(content), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); centrals.push(central, nameBuf); offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}
function makeDocx(paragraphs) {
  return zipStored({
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("") + "</w:body></w:document>",
  });
}
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function uploadResume(token, name, paragraphs = RESUME_TEXT.split("\n")) {
  const form = new FormData();
  form.append("resume", new Blob([makeDocx(paragraphs)], { type: DOCX }), `${name}.docx`);
  form.append("name", name);
  form.append("targetRole", "Frontend Developer");
  const r = await api("/api/resumes", { method: "POST", token, form });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.resume;
}

const jdBody = { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION, sourceUrl: "https://acme.example/jobs/1", extractedRequirements: { skills: [{ name: "React", priority: "required" }], parserVersion: "demo-rules-1.0" } };

// ─── Resumes ────────────────────────────────────────────────────────────────

test("resumes: upload, list (no text), detail (preview + history), rename, search/sort, delete keeps analysis history", async () => {
  const token = await registerUser("r1@example.com");
  assert.equal((await api("/api/resumes")).status, 401);

  const a = await uploadResume(token, "Frontend CV");
  const b = await uploadResume(token, "Backend CV");
  assert.equal(a.hasStoredFile, false, "storage driver 'none' keeps no originals");
  assert.ok(a.charCount > 50);
  assert.equal("extractedText" in a, false);

  const list = await api("/api/resumes?sort=name", { token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.resumes.map((r) => r.name), ["Backend CV", "Frontend CV"]);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.resumes.every((r) => !("extractedText" in r)), true);

  const search = await api("/api/resumes?q=front", { token });
  assert.equal(search.body.resumes.length, 1);

  const renamed = await api(`/api/resumes/${a.id}`, { method: "PATCH", token, body: { name: "Frontend CV v2", targetRole: "Full Stack Developer" } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.resume.name, "Frontend CV v2");
  assert.equal((await api(`/api/resumes/${a.id}`, { method: "PATCH", token, body: {} })).status, 400);

  // analysis from a stored resume (no resumeText in body)
  const an = await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: a.id, jobTitle: "FE", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } });
  assert.equal(an.status, 201, JSON.stringify(an.body).slice(0, 300));
  assert.equal(an.body.analysis.resumeId, a.id);
  assert.equal(an.body.analysis.canRegenerate, true, "linked resume text enables regeneration");

  const detail = await api(`/api/resumes/${a.id}`, { token });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.resume.textPreview.length > 0 && detail.body.resume.textPreview.length <= 600);
  assert.equal(detail.body.analyses.length, 1);
  assert.deepEqual(detail.body.analyses[0].skillCounts, { matched: 4, partial: 1, missing: 2 });

  const listWithLatest = await api("/api/resumes", { token });
  const aRow = listWithLatest.body.resumes.find((r) => r.id === a.id);
  assert.equal(aRow.analysisCount, 1);
  assert.equal(aRow.latestAnalysis.matchScore, 67);

  // downloads are refused when nothing is stored
  assert.equal((await api(`/api/resumes/${a.id}/download`, { token })).status, 404);

  // delete resume → analysis survives with resumeId null
  assert.equal((await api(`/api/resumes/${a.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api(`/api/resumes/${a.id}`, { token })).status, 404);
  const survivor = await api(`/api/analysis/${an.body.analysis.id}`, { token });
  assert.equal(survivor.status, 200);
  assert.equal(survivor.body.analysis.resumeId, null);
  assert.equal(survivor.body.analysis.canRegenerate, false);
});

test("resumes: upload validation (bad type) and ownership", async () => {
  const owner = await registerUser("r2@example.com");
  const other = await registerUser("r3@example.com");
  const form = new FormData();
  form.append("resume", new Blob([Buffer.from("plain text")], { type: "text/plain" }), "x.txt");
  assert.equal((await api("/api/resumes", { method: "POST", token: owner, form })).status, 415);

  const r = await uploadResume(owner, "Mine");
  assert.equal((await api(`/api/resumes/${r.id}`, { token: other })).status, 404);
  assert.equal((await api(`/api/resumes/${r.id}`, { method: "PATCH", token: other, body: { name: "stolen" } })).status, 404);
  assert.equal((await api(`/api/resumes/${r.id}`, { method: "DELETE", token: other })).status, 404);
  assert.equal((await api("/api/analysis/resume", { method: "POST", token: other, body: { resumeId: r.id, jobTitle: "Some job", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } })).status, 404, "cannot analyse someone else's resume");
});

// ─── Job descriptions ────────────────────────────────────────────────────────

test("job descriptions: CRUD, validation, search/filter, reuse in analysis, compare resumes, safe delete", async () => {
  const token = await registerUser("j1@example.com");
  const bad = await api("/api/job-descriptions", { method: "POST", token, body: { ...jdBody, sourceUrl: "javascript:alert(1)", description: "short" } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.details.some((d) => d.field === "sourceUrl"));
  assert.ok(bad.body.error.details.some((d) => d.field === "description"));

  const created = await api("/api/job-descriptions", { method: "POST", token, body: jdBody });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const jd = created.body.jobDescription;
  assert.equal(jd.skillCount, 1);
  await api("/api/job-descriptions", { method: "POST", token, body: { ...jdBody, jobTitle: "Data Analyst", companyName: "Globex", targetRole: "Data Analyst" } });

  assert.equal((await api("/api/job-descriptions?q=globex", { token })).body.jobDescriptions.length, 1);
  assert.equal((await api("/api/job-descriptions?targetRole=Frontend%20Developer", { token })).body.jobDescriptions.length, 1);
  assert.equal((await api("/api/job-descriptions?sort=title", { token })).body.jobDescriptions[0].jobTitle, "Data Analyst");

  const upd = await api(`/api/job-descriptions/${jd.id}`, { method: "PATCH", token, body: { companyName: "Acme Inc", sourceUrl: "" } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.jobDescription.companyName, "Acme Inc");
  assert.equal(upd.body.jobDescription.sourceUrl, null);

  // Reuse: analysis with jobDescriptionId only + two resumes → compare view lists both
  const r1 = await uploadResume(token, "CV one");
  const r2 = await uploadResume(token, "CV two");
  const a1 = await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: r1.id, jobDescriptionId: jd.id } });
  assert.equal(a1.status, 201, JSON.stringify(a1.body).slice(0, 300));
  assert.equal(a1.body.analysis.jobTitle, "Senior Frontend Developer");
  assert.equal(a1.body.analysis.companyName, "Acme Inc");
  assert.equal(a1.body.analysis.jobDescriptionId, jd.id);
  const a2 = await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: r2.id, jobDescriptionId: jd.id } });
  assert.equal(a2.status, 201);

  const detail = await api(`/api/job-descriptions/${jd.id}`, { token });
  assert.equal(detail.body.jobDescription.analyses.length, 2);
  assert.deepEqual(detail.body.jobDescription.analyses.map((a) => a.resumeName).sort(), ["CV one", "CV two"]);
  assert.equal(detail.body.jobDescription.analysisCount, 2);

  // saveJobDescription flag creates and links a JD from a pasted description
  const saved = await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: r1.id, jobTitle: "Pasted role", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION, saveJobDescription: true } });
  assert.equal(saved.status, 201);
  assert.ok(saved.body.analysis.jobDescriptionId);
  assert.equal((await api("/api/job-descriptions", { token })).body.total, 3);

  // delete → analyses keep working, jobDescriptionId nulled
  assert.equal((await api(`/api/job-descriptions/${jd.id}`, { method: "DELETE", token })).status, 204);
  const after = await api(`/api/analysis/${a1.body.analysis.id}`, { token });
  assert.equal(after.status, 200);
  assert.equal(after.body.analysis.jobDescriptionId, null);
  assert.equal(after.body.analysis.jobDescription, JOB_DESCRIPTION.trim(), "inputs are retained on the analysis itself");
});

// ─── Analysis history filters ────────────────────────────────────────────────

test("analysis history: pagination, filters by role/date/mode, sorting by score", async () => {
  const token = await registerUser("h1@example.com");
  const r = await uploadResume(token, "CV");
  const mk = (jobTitle, targetRole) => api("/api/analysis/resume", { method: "POST", token, body: { resumeId: r.id, jobTitle, targetRole, jobDescription: JOB_DESCRIPTION } });
  await mk("Job A", "Frontend Developer");
  await mk("Job B", "Backend Developer");
  await mk("Job C", "Frontend Developer");
  // Make scores distinguishable by editing the fake store directly
  const rows = prisma.tables.analysis.filter((a) => a.jobTitle === "Job B");
  rows[0].matchScore = 99;

  const all = await api("/api/analysis?limit=2", { token });
  assert.equal(all.body.analyses.length, 2);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.totalPages, 2);
  assert.equal((await api("/api/analysis?targetRole=Backend%20Developer", { token })).body.analyses.length, 1);
  assert.equal((await api("/api/analysis?mode=demo", { token })).body.analyses.length, 0);
  assert.equal((await api("/api/analysis?sort=score_desc", { token })).body.analyses[0].jobTitle, "Job B");
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal((await api(`/api/analysis?from=${future}`, { token })).body.analyses.length, 0);
  assert.equal((await api("/api/analysis?sort=bogus", { token })).status, 400);
});

// ─── Applications ────────────────────────────────────────────────────────────

test("applications: CRUD, status validation, linking, filters, pipeline, ownership, linked-record deletion", async () => {
  const token = await registerUser("a1@example.com");
  const other = await registerUser("a2@example.com");
  const jd = (await api("/api/job-descriptions", { method: "POST", token, body: jdBody })).body.jobDescription;
  const resume = await uploadResume(token, "CV");
  const analysis = (await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: resume.id, jobDescriptionId: jd.id } })).body.analysis;

  // validation
  const bad = await api("/api/applications", { method: "POST", token, body: { companyName: "", jobTitle: "x", status: "HIRED", jobUrl: "notaurl" } });
  assert.equal(bad.status, 400);
  const fields = bad.body.error.details.map((d) => d.field);
  assert.ok(fields.includes("status") && fields.includes("companyName") && fields.includes("jobUrl"));

  // linking someone else's record is refused
  const otherResume = await uploadResume(other, "Other CV");
  const steal = await api("/api/applications", { method: "POST", token, body: { companyName: "Acme", jobTitle: "FE", resumeId: otherResume.id } });
  assert.equal(steal.status, 400);

  const created = await api("/api/applications", {
    method: "POST",
    token,
    body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", jobUrl: "https://acme.example/jobs/1", status: "APPLIED", applicationDate: "2026-10-01", nextFollowUpDate: "2026-10-20", notes: "Referred by Sam", jobDescriptionId: jd.id, resumeId: resume.id, analysisId: analysis.id },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const app1 = created.body.application;
  assert.equal(app1.status, "APPLIED");
  assert.equal(app1.matchScore, 67);
  assert.equal(app1.jobDescription.targetRole, "Frontend Developer");
  assert.equal(app1.resume.name, "CV");

  await api("/api/applications", { method: "POST", token, body: { companyName: "Globex", jobTitle: "Data Analyst", status: "INTERESTED", applicationDate: "2026-09-15" } });
  await api("/api/applications", { method: "POST", token, body: { companyName: "Initech", jobTitle: "Backend Dev", status: "REJECTED", applicationDate: "2026-08-01" } });

  // status change persists
  const moved = await api(`/api/applications/${app1.id}`, { method: "PATCH", token, body: { status: "INTERVIEW" } });
  assert.equal(moved.status, 200);
  assert.equal((await api(`/api/applications/${app1.id}`, { token })).body.application.status, "INTERVIEW");

  // filters & sorting
  const list = await api("/api/applications", { token });
  assert.equal(list.body.total, 3);
  assert.deepEqual(list.body.pipeline.counts.INTERVIEW, 1);
  assert.equal(list.body.pipeline.active, 2);
  assert.equal((await api("/api/applications?status=INTERESTED,REJECTED", { token })).body.applications.length, 2);
  assert.equal((await api("/api/applications?q=glob", { token })).body.applications[0].companyName, "Globex");
  assert.equal((await api("/api/applications?targetRole=Frontend%20Developer", { token })).body.applications.length, 1);
  assert.equal((await api("/api/applications?from=2026-09-01&to=2026-09-30", { token })).body.applications.length, 1);
  assert.equal((await api("/api/applications?sort=company", { token })).body.applications[0].companyName, "Acme");
  assert.equal((await api("/api/applications?sort=score", { token })).body.applications[0].id, app1.id);
  assert.equal((await api("/api/applications/pipeline", { token })).body.pipeline.total, 3);

  // ownership
  assert.equal((await api(`/api/applications/${app1.id}`, { token: other })).status, 404);
  assert.equal((await api(`/api/applications/${app1.id}`, { method: "PATCH", token: other, body: { status: "OFFER" } })).status, 404);
  assert.equal((await api(`/api/applications/${app1.id}`, { method: "DELETE", token: other })).status, 404);
  assert.equal((await api("/api/applications", { token: other })).body.total, 0);

  // deleting the linked analysis / resume / JD nulls the links but keeps the application
  assert.equal((await api(`/api/analysis/${analysis.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api(`/api/resumes/${resume.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api(`/api/job-descriptions/${jd.id}`, { method: "DELETE", token })).status, 204);
  const orphan = await api(`/api/applications/${app1.id}`, { token });
  assert.equal(orphan.status, 200);
  assert.equal(orphan.body.application.analysisId, null);
  assert.equal(orphan.body.application.resumeId, null);
  assert.equal(orphan.body.application.jobDescriptionId, null);
  assert.equal(orphan.body.application.companyName, "Acme");

  assert.equal((await api(`/api/applications/${app1.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api(`/api/applications/${app1.id}`, { token })).status, 404);
});

// ─── Interviews ──────────────────────────────────────────────────────────────

test("interviews: record sessions and read history summary", async () => {
  const token = await registerUser("i1@example.com");
  const empty = await api("/api/interviews/history", { token });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.sessions.length, 0);

  const bad = await api("/api/interviews/practice-log", { method: "POST", token, body: { targetRole: "Frontend Developer", questionCount: 3, completedQuestionCount: 5 } });
  assert.equal(bad.status, 400);

  const s = await api("/api/interviews/practice-log", { method: "POST", token, body: { targetRole: "Frontend Developer", interviewType: "mixed", questionCount: 6, completedQuestionCount: 6, status: "completed", score: 80 } });
  assert.equal(s.status, 201);
  assert.ok(s.body.session.completedAt);
  await api("/api/interviews/practice-log", { method: "POST", token, body: { targetRole: "Frontend Developer", questionCount: 4, completedQuestionCount: 1 } });

  const hist = await api("/api/interviews/history", { token });
  assert.equal(hist.body.total, 2);
  assert.equal(hist.body.summary.completed, 1);
  assert.equal(hist.body.summary.questionsPracticed, 6);
  assert.equal((await api("/api/interviews/history?status=completed", { token })).body.sessions.length, 1);
});

// ─── Dashboard ───────────────────────────────────────────────────────────────

test("dashboard: empty state for a new user, then real metrics from the user's own records only", async () => {
  const token = await registerUser("d1@example.com");
  const stranger = await registerUser("d2@example.com");

  const empty = await api("/api/dashboard/overview", { token });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.totals.resumes, 0);
  assert.equal(empty.body.averageMatchScore.value, null);
  assert.equal(empty.body.averageMatchScore.sampleSize, 0);
  assert.ok(empty.body.recommendedActions.some((a) => a.key === "upload-resume"));
  assert.deepEqual(empty.body.skillGaps, []);

  // stranger's data must not leak
  await uploadResume(stranger, "Stranger CV");

  const resume = await uploadResume(token, "Mine");
  const an = (await api("/api/analysis/resume", { method: "POST", token, body: { resumeId: resume.id, jobTitle: "FE", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } })).body.analysis;
  await api("/api/applications", { method: "POST", token, body: { companyName: "Acme", jobTitle: "FE", status: "APPLIED", analysisId: an.id, nextFollowUpDate: "2020-01-01" } });
  await api("/api/applications", { method: "POST", token, body: { companyName: "Globex", jobTitle: "BE", status: "REJECTED" } });
  await api("/api/interviews/practice-log", { method: "POST", token, body: { targetRole: "Frontend Developer", questionCount: 3, completedQuestionCount: 3, status: "completed", score: 70 } });

  const ov = await api("/api/dashboard/overview", { token });
  assert.equal(ov.body.totals.resumes, 1, "only own resumes counted");
  assert.equal(ov.body.totals.analyses, 1);
  assert.equal(ov.body.totals.aiAnalyses, 1);
  assert.equal(ov.body.totals.applications, 2);
  assert.equal(ov.body.totals.activeApplications, 1);
  assert.equal(ov.body.totals.interviewsCompleted, 1);
  assert.equal(ov.body.averageMatchScore.value, 67);
  assert.equal(ov.body.followUps.overdue, 1);
  assert.equal(ov.body.skillGaps[0].name, "GraphQL");
  assert.equal(ov.body.learningProgress.questionsPracticed, 3);
  assert.ok(ov.body.recommendedActions.some((a) => a.key === "follow-ups"));

  const act = await api("/api/dashboard/activity?limit=3", { token });
  assert.equal(act.body.recentAnalyses.length, 1);
  assert.equal(act.body.recentApplications.length, 2);
  assert.equal(act.body.upcomingFollowUps[0].overdue, true);

  const an2 = await api("/api/dashboard/analytics?range=90d", { token });
  assert.equal(an2.status, 200);
  assert.equal(an2.body.scoreTrend.length, 1);
  assert.equal(an2.body.insufficientHistory, true);
  assert.equal(an2.body.statusDistribution.find((s) => s.status === "REJECTED").count, 1);
  assert.equal(an2.body.applicationsOverTime.reduce((s, b) => s + b.count, 0), 2);
  assert.match(an2.body.scoreTrendNote, /not hiring probabilities/);
  assert.equal((await api("/api/dashboard/analytics?range=1y", { token })).status, 400);

  const strangerOv = await api("/api/dashboard/overview", { token: stranger });
  assert.equal(strangerOv.body.totals.analyses, 0);
  assert.equal(strangerOv.body.totals.resumes, 1);
});
