/**
 * Tests for the resume upload/parse endpoint: validation by type, size and
 * content signature, plus a real DOCX round-trip (built in-memory with mammoth-
 * compatible OOXML) and a real text-based PDF.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { validateResumeFile, normaliseText } from "../src/services/resume/resumeParserService.js";
import { TEST_ENV, fakeLlm, fakePrisma } from "./fixtures.js";

let server;
let baseUrl;

async function ensureServer() {
  if (server) return;
  const app = createApp({ env: loadEnv(TEST_ENV), prisma: fakePrisma(), llm: fakeLlm() });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
    server.unref();
  });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

async function upload(buffer, filename, type) {
  await ensureServer();
  const form = new FormData();
  form.append("resume", new Blob([buffer], { type }), filename);
  const res = await fetch(`${baseUrl}/api/resume/parse`, { method: "POST", body: form, headers: { Origin: "http://localhost:3001" } });
  return { status: res.status, body: await res.json() };
}

/** Minimal valid PDF with one text line (text-based, so pdf-parse can read it). */
function makePdf(text) {
  const content = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const body = [
    "%PDF-1.4\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let raw = "";
  const offsets = [];
  for (let i = 0; i < body.length; i++) {
    if (i > 0) offsets.push(raw.length);
    raw += body[i];
  }

  const startxref = raw.length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    xref += `${String(o).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  const buf = Buffer.from(raw + xref + trailer, "latin1");
  const unshared = new Uint8Array(buf.length);
  unshared.set(buf);
  return unshared;
}

/** Minimal DOCX (zip with document.xml) built with the zlib "stored" method via a tiny zip writer. */
function makeDocx(paragraphs) {
  const files = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml":
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("") +
      "</w:body></w:document>",
  };
  return zipStored(files);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStored(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test("validateResumeFile rejects missing, oversized, wrong-type and spoofed files", () => {
  assert.throws(() => validateResumeFile(undefined), (e) => e.status === 400);
  assert.throws(() => validateResumeFile({ buffer: Buffer.from("%PDF-1.4"), mimetype: "application/pdf", originalname: "a.pdf", size: 6 * 1024 * 1024 }), (e) => e.status === 413);
  assert.throws(() => validateResumeFile({ buffer: Buffer.from("hello"), mimetype: "text/plain", originalname: "a.txt", size: 5 }), (e) => e.status === 415);
  // declared PDF but content is plain text
  assert.throws(() => validateResumeFile({ buffer: Buffer.from("not a pdf at all"), mimetype: "application/pdf", originalname: "a.pdf", size: 16 }), (e) => e.status === 415);
  assert.equal(validateResumeFile({ buffer: Buffer.from("%PDF-1.4 ..."), mimetype: "application/pdf", originalname: "a.pdf", size: 12 }), "application/pdf");
});

test("normaliseText collapses whitespace", () => {
  assert.equal(normaliseText("a  \r\n\r\n\r\n\r\nb\t\tc  "), "a\n\nb c");
});

test("POST /api/resume/parse rejects non-resume uploads with clear messages", async () => {
  const txt = await upload(Buffer.from("just text"), "notes.txt", "text/plain");
  assert.equal(txt.status, 415);
  assert.equal(txt.body.error.code, "UNSUPPORTED_FILE_TYPE");

  const spoof = await upload(Buffer.from("plain text pretending"), "resume.pdf", "application/pdf");
  assert.equal(spoof.status, 415);

  await ensureServer();
  const noFile = await fetch(`${baseUrl}/api/resume/parse`, { method: "POST", body: new FormData() });
  assert.equal(noFile.status, 400);
});

test("POST /api/resume/parse extracts text from a real DOCX", async () => {
  const docx = makeDocx(["Jane Doe", "jane@example.com", "Experience", "Frontend Developer at Acme building React applications with TypeScript and testing with Jest."]);
  const r = await upload(docx, "resume.docx", DOCX_MIME);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.text, /Jane Doe/);
  assert.match(r.body.text, /React applications/);
  assert.equal(r.body.mimeType, DOCX_MIME);
  assert.equal(r.body.fileName, "resume.docx");
  assert.ok(r.body.charCount > 50);
});

test("POST /api/resume/parse extracts text from a real PDF and rejects near-empty ones", async () => {
  const good = await upload(makePdf("Jane Doe frontend developer with React TypeScript Jest and five years of experience building web apps"), "resume.pdf", "application/pdf");
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.match(good.body.text, /React/);

  const empty = await upload(makePdf("Hi"), "resume.pdf", "application/pdf");
  assert.equal(empty.status, 422);
  assert.equal(empty.body.error.code, "INSUFFICIENT_TEXT");
});
