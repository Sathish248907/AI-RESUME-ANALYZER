// Live Phase 8 probe against the running backend (Neon + configured LLM). Two Gemini calls (improve, tailor).
// Uploads a DOCX, opens the editor, edits, gets AI suggestions, accepts one, tailors, checks quality, exports a PDF.
import fs from "node:fs";
import { createRequire } from "node:module";
import { JOB_DESCRIPTION, RESUME_TEXT } from "./fixtures.js";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const BASE = "http://localhost:4000";
const email = `e2e_p8_${Date.now()}@example.com`;
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
async function api(path, { method = "GET", body, form, raw = false } = {}) {
  const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", ...(form ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(340000) });
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function must(label, p, ok = (s) => s < 300) { const r = await p; if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`); process.exit(1); } log(`ok   ${label} (${r.status})`); return r.body ?? r; }

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zipStored(files) { const locals = [], centrals = []; let offset = 0; for (const [name, content] of Object.entries(files)) { const nameBuf = Buffer.from(name), data = Buffer.from(content), crc = crc32(data); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42); locals.push(local, nameBuf, data); centrals.push(central, nameBuf); offset += local.length + nameBuf.length + data.length; } const centralSize = centrals.reduce((s, b) => s + b.length, 0); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, ...centrals, end]); }
const docx = zipStored({
  "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  "word/document.xml": '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + RESUME_TEXT.split("\n").map((p) => `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</w:t></w:r></w:p>`).join("") + "</w:body></w:document>",
});

token = (await must("register", api("/api/auth/register", { method: "POST", body: { email, password: "password123", name: "E2E P8" } }))).token;
const form = new FormData();
form.append("resume", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "e2e-cv.docx");
form.append("name", "E2E CV");
const up = await must("upload resume", api("/api/resumes", { method: "POST", form }));
const resumeId = up.resume.id;

const ed = await must("open editable resume", api(`/api/resume-builder/${resumeId}`));
log(`     original v${ed.original.versionNumber} "${ed.original.name}" · ${ed.original.content.sections.length} sections · name=${ed.original.content.personal.fullName}`);
const created = await must("create working version", api(`/api/resume-builder/${resumeId}/versions`, { method: "POST", body: { name: "E2E working copy" } }));
const v = created.version;
const content = v.content;
const summary = content.sections.find((s) => s.type === "summary");
summary.text = "Frontend developer with 4 years of experience building React applications for fintech products.";
const saved = await must("autosave edit", api(`/api/resume-builder/versions/${v.id}`, { method: "PATCH", body: { content, expectedUpdatedAt: v.updatedAt } }));
log(`     quality after edit: ${saved.version.lastQualityScore}`);
await must("stale save rejected", api(`/api/resume-builder/versions/${v.id}`, { method: "PATCH", body: { name: "x", expectedUpdatedAt: v.updatedAt } }), (s) => s === 409);

log("     AI improve …");
const imp = await must("AI improve (Gemini)", api(`/api/resume-builder/versions/${v.id}/improve`, { method: "POST", body: { userNotes: "The design system is used by 12 product teams." } }));
log(`     ${imp.suggestions.length} suggestions via ${imp.provider}/${imp.model}; flagged: ${imp.suggestions.filter((s) => s.needsConfirmation).length}; notes: ${imp.generalNotes.length}`);
for (const s of imp.suggestions.slice(0, 4)) log(`       [${s.category}${s.needsConfirmation ? " ⚠" : ""}] ${s.field}: "${s.originalText.slice(0, 50)}…" → "${s.suggestedText.slice(0, 70)}…"`);
const plain = imp.suggestions.find((s) => !s.needsConfirmation) ?? imp.suggestions[0];
if (plain) {
  const acc = await must("accept a suggestion", api(`/api/resume-builder/versions/${v.id}/improvements/${plain.id}`, { method: "POST", body: { action: "accept" } }));
  log(`     status=${acc.suggestion.status}; applied=${JSON.stringify(acc.version.content).includes(plain.suggestedText.slice(0, 40))}`);
  const reset = await must("reset the suggestion", api(`/api/resume-builder/versions/${v.id}/improvements/${plain.id}`, { method: "POST", body: { action: "reset" } }));
  log(`     reverted=${JSON.stringify(reset.version.content).includes(plain.originalText.slice(0, 40))}`);
}

log("     AI tailor …");
const tl = await must("AI tailor (Gemini)", api(`/api/resume-builder/versions/${v.id}/tailor`, { method: "POST", body: { jobDescription: JOB_DESCRIPTION, jobTitle: "Senior Frontend Developer", companyName: "Acme", saveJobDescription: true } }));
log(`     ${tl.suggestions.length} tailoring suggestions; keywordsToAdd=${JSON.stringify(tl.keywordsToAdd)}; genuineGaps=${JSON.stringify(tl.genuineGaps)}; target=${tl.target.jobTitle} jd=${tl.target.jobDescriptionId}`);

const q = await must("quality check", api(`/api/resume-builder/versions/${v.id}/quality-check`));
log(`     quality ${q.quality.overall} (${q.quality.label}) · ${q.quality.issues.length} issues · keywords ${q.quality.keywordCoverage ? q.quality.keywordCoverage.percent + "%" : "n/a"}`);
const cmp = await must("compare with original", api(`/api/resume-builder/versions/${v.id}/compare`, { method: "POST", body: { otherVersionId: ed.original.id } }));
log(`     ${cmp.description}`);
const dup = await must("duplicate", api(`/api/resume-builder/versions/${v.id}/duplicate`, { method: "POST", body: { name: "E2E copy" } }));
const pdf = await must("export PDF", api(`/api/resume-builder/versions/${v.id}/export/pdf`, { method: "POST", body: {}, raw: true }));
const parsed = await pdfParse(pdf.buffer);
log(`     PDF ${pdf.buffer.length} bytes, ${pdf.headers.get("x-resume-pages")} page(s), ${pdf.headers.get("content-disposition")}, text ok=${/Jane Doe/.test(parsed.text)}`);
fs.writeFileSync(`${process.env.TEMP ?? "."}/e2e-p8.pdf`, pdf.buffer);
const list = await must("list versions", api(`/api/resume-builder/${resumeId}/versions`));
log(`     ${list.total} versions`);

// cleanup
await must("delete copy", api(`/api/resume-builder/versions/${dup.version.id}`, { method: "DELETE" }), (s) => s === 204);
await must("delete working version", api(`/api/resume-builder/versions/${v.id}`, { method: "DELETE" }), (s) => s === 204);
await must("delete original version", api(`/api/resume-builder/versions/${ed.original.id}`, { method: "DELETE" }), (s) => s === 204 || s === 409);
if (tl.target.jobDescriptionId) await must("delete saved JD", api(`/api/job-descriptions/${tl.target.jobDescriptionId}`, { method: "DELETE" }), (s) => s === 204);
await must("delete resume", api(`/api/resumes/${resumeId}`, { method: "DELETE" }), (s) => s === 204);
log("PHASE 8 LIVE E2E PASSED for", email, "(test user remains; records cleaned up)");
