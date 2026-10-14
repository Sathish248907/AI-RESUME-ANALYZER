// Live end-to-end probe against the running backend (Neon Postgres + configured LLM). Not part of the suite.
import { JOB_DESCRIPTION, RESUME_TEXT } from "./fixtures.js";

const BASE = "http://localhost:4000";
const email = `e2e_${Date.now()}@example.com`;
const password = "password123";
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);

async function api(path, { method = "GET", body, form, timeout = 340000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined), signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    clearTimeout(timer);
  }
}
async function must(label, p, ok = (s) => s < 300) {
  const r = await p;
  if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`); process.exit(1); }
  log(`ok   ${label} (${r.status})`);
  return r.body;
}
async function withRetry(label, fn, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    const r = await fn();
    if (r.status < 500 && r.status !== 429) return r;
    log(`retry ${label}: attempt ${i} got ${r.status} ${r.body?.error?.code ?? ""}`);
    await new Promise((res) => setTimeout(res, 15000));
  }
  return fn();
}

// minimal DOCX builder (same as tests)
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zipStored(files) { const locals = [], centrals = []; let offset = 0; for (const [name, content] of Object.entries(files)) { const nameBuf = Buffer.from(name), data = Buffer.from(content), crc = crc32(data); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42); locals.push(local, nameBuf, data); centrals.push(central, nameBuf); offset += local.length + nameBuf.length + data.length; } const centralSize = centrals.reduce((s, b) => s + b.length, 0); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, ...centrals, end]); }
const docx = zipStored({
  "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + RESUME_TEXT.split("\n").map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("") + "</w:body></w:document>",
});

// 1. auth
const reg = await must("register", api("/api/auth/register", { method: "POST", body: { email, password, name: "E2E" } }));
token = reg.token;

// 2. resume upload
const form = new FormData();
form.append("resume", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "e2e-cv.docx");
form.append("name", "E2E CV");
form.append("targetRole", "Frontend Developer");
const up = await must("upload resume", api("/api/resumes", { method: "POST", form }));
const resumeId = up.resume.id;
log("     resume", resumeId, up.resume.charCount, "chars");

// 3. job description
const jd = await must("create job description", api("/api/job-descriptions", { method: "POST", body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } }));

// 4. AI analysis via stored ids
const an = await must("AI analysis (stored resume + JD)", withRetry("analysis", () => api("/api/analysis/resume", { method: "POST", body: { resumeId, jobDescriptionId: jd.jobDescription.id } })));
log("     score", an.analysis.matchScore, "| matched", an.analysis.result.matchedSkills.map((s) => s.name).slice(0, 5).join(", "), "| provider", an.analysis.provider);

// 5. application
const app = await must("create application", api("/api/applications", { method: "POST", body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", status: "APPLIED", nextFollowUpDate: "2026-10-20", resumeId, jobDescriptionId: jd.jobDescription.id, analysisId: an.analysis.id } }));
await must("move application to INTERVIEW", api(`/api/applications/${app.application.id}`, { method: "PATCH", body: { status: "INTERVIEW" } }));

// 6. dashboard
const ov = await must("dashboard overview", api("/api/dashboard/overview"));
log("     totals", JSON.stringify(ov.totals), "| avg", ov.averageMatchScore.value);

// 7. mock interview
const iv = await must("create mock interview (5 q)", withRetry("interview", () => api("/api/interviews", { method: "POST", body: { targetRole: "Frontend Developer", interviewType: "mixed", difficulty: "intermediate", durationMinutes: 20, questionCount: 5, resumeId, jobDescriptionId: jd.jobDescription.id, topics: ["React state management"] } })));
const s = iv.session;
log("     questions:", s.questions.map((q) => `${q.questionType}/${q.topic}`).join(" | "));
const q1 = s.questions[0];
await must("save draft", api(`/api/interviews/${s.id}/answers/${q1.id}`, { method: "PUT", body: { answerText: "draft" } }));
const ev = await must("evaluate answer", withRetry("evaluate", () => api(`/api/interviews/${s.id}/answers/${q1.id}/evaluate`, { method: "POST", body: { answerText: "State shared by several components should be lifted to a common ancestor or kept in a store. I used context plus useReducer for theming and a small Zustand store for cross-page filters so re-renders stay scoped by selecting slices; server state lives in React Query. The trade-off is that global stores obscure data flow, so each slice is documented." } })));
log("     evaluation:", ev.answer.status, "score", ev.answer.score, ev.answer.evaluation?.rating, "| criteria", (ev.answer.evaluation?.criterionFeedback ?? []).map((c) => `${c.criterion}=${c.score}`).join(", "));
await must("skip q2", api(`/api/interviews/${s.id}/answers/${s.questions[1].id}`, { method: "PUT", body: { skip: true, answerText: "" } }));
const done = await must("complete interview", api(`/api/interviews/${s.id}/complete`, { method: "POST", body: { durationSeconds: 300 } }));
log("     overall", done.session.overallScore, "answered", done.session.answeredQuestions, "/", done.session.totalQuestions);
const rep = await must("report", api(`/api/interviews/${s.id}/report`));
log("     report counts", JSON.stringify(rep.report.counts), "| recommendations", rep.report.recommendations.length);

// 8. persistence: fresh login, data still there
token = null;
const login = await must("login again", api("/api/auth/login", { method: "POST", body: { email, password } }));
token = login.token;
const hist = await must("analysis history after re-login", api("/api/analysis"));
const res = await must("resumes after re-login", api("/api/resumes"));
const apps = await must("applications after re-login", api("/api/applications"));
const ivh = await must("interview history after re-login", api("/api/interviews/history"));
log("     persisted:", hist.total, "analysis,", res.total, "resume,", apps.total, "application,", ivh.total, "interview");

// 9. cleanup
await must("delete interview", api(`/api/interviews/${s.id}`, { method: "DELETE" }), (st) => st === 204);
await must("delete application", api(`/api/applications/${app.application.id}`, { method: "DELETE" }), (st) => st === 204);
await must("delete analysis", api(`/api/analysis/${an.analysis.id}`, { method: "DELETE" }), (st) => st === 204);
await must("delete job description", api(`/api/job-descriptions/${jd.jobDescription.id}`, { method: "DELETE" }), (st) => st === 204);
await must("delete resume", api(`/api/resumes/${resumeId}`, { method: "DELETE" }), (st) => st === 204);
log("E2E PASSED for", email, "(test user remains; records cleaned up)");
