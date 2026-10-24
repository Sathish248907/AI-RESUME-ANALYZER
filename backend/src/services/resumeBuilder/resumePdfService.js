/**
 * resumePdfService.js — renders a resume version to an A4 PDF with pdfkit.
 *
 * Text is drawn as real text (selectable, searchable). No HTML or scripts are
 * interpreted: every string from the content document is written through
 * pdfkit's text API, so user content cannot execute anything. Fonts are the
 * PDF standard 14 (Helvetica / Times / Courier), which embed nothing and are
 * ATS-safe. Layout is single-column for every template; templates differ in
 * colour, typography, header alignment and section order.
 */
import PDFDocument from "pdfkit";
import { TEMPLATES, normaliseFormatting, orderSectionsForTemplate, sectionLines } from "./resumeContentSchema.js";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN_PT = { narrow: 36, normal: 50, wide: 64 };
const SPACING = { compact: 0.7, normal: 1, relaxed: 1.35 };
const BULLET_CHAR = { disc: "•", dash: "–", arrow: "›" };
const FONTS = {
  Helvetica: { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" },
  Times: { regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" },
  Courier: { regular: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique" },
};
/** Templates that centre the header block. */
const CENTRED_HEADER = new Set(["classic"]);
/** Templates that draw a rule under the header block. */
const HEADER_RULE = new Set(["modern", "technical", "fresher", "experienced", "classic"]);

/** Safe, ASCII-only filename from a version name. */
export function safeFileName(name, ext = "pdf") {
  const base = String(name ?? "resume").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "resume";
  return `${base}.${ext}`;
}

/**
 * Render to a Buffer.
 * @param {{ content, templateId: string, formatting: object }} version
 * @returns {Promise<{ buffer: Buffer, pages: number }>}
 */
export function renderResumePdf({ content, templateId = "modern", formatting, compress = true }) {
  const fmt = normaliseFormatting(formatting, templateId);
  const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES.find((t) => t.id === "modern");
  const font = FONTS[fmt.fontFamily] ?? FONTS.Helvetica;
  const margin = MARGIN_PT[fmt.margins] ?? MARGIN_PT.normal;
  const sp = SPACING[fmt.sectionSpacing] ?? 1;
  const base = fmt.fontSize;
  const ink = "#111111", muted = "#555555";
  // ATS mode (explicit flag or an ats-safe template) drops colour and decorative rules.
  const plain = Boolean(fmt.atsMode) || tpl.atsSafe === true;
  const accent = plain ? ink : fmt.accentColor;
  const bullet = BULLET_CHAR[fmt.bulletStyle] ?? "•";
  const upper = (s) => (fmt.headingStyle === "uppercase" ? String(s).toUpperCase() : String(s));
  const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: margin, bottom: margin, left: margin, right: margin }, bufferPages: true, compress, info: { Title: clean(content.personal?.fullName ? `${content.personal.fullName} — Resume` : "Resume"), Author: clean(content.personal?.fullName ?? ""), Creator: "AI Resume Analyzer" }, pdfVersion: "1.5" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    let pages = 0;
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pages }));

    const width = A4.width - margin * 2;
    const p = content.personal ?? {};
    const centred = CENTRED_HEADER.has(tpl.id);

    // ── Header ──
    doc.fillColor(ink).font(font.bold).fontSize(base * 2).text(clean(p.fullName) || " ", { align: centred ? "center" : "left" });
    if (p.title) doc.font(font.regular).fontSize(base * 1.15).fillColor(accent).text(clean(p.title), { align: centred ? "center" : "left" });
    const contact = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].map(clean).filter(Boolean);
    if (contact.length) doc.moveDown(0.2).font(font.regular).fontSize(base * 0.9).fillColor(muted).text(contact.join("  |  "), { align: centred ? "center" : "left" });
    if (HEADER_RULE.has(tpl.id)) { doc.moveDown(0.4); rule(doc, accent, plain ? 0.8 : 1.5, width); }
    doc.moveDown(0.6 * sp);

    // ── Sections ──
    const visible = (content.sections ?? []).filter((s) => s.visible !== false && sectionLines(s).length > 0);
    const ordered = orderSectionsForTemplate(visible, tpl.id);

    for (const s of ordered) {
      ensureSpace(doc, base * 4, margin);
      doc.font(font.bold).fontSize(base * 1.15).fillColor(accent).text(upper(clean(s.title)), { characterSpacing: fmt.headingStyle === "uppercase" ? 0.6 : 0 });
      if (tpl.id !== "technical") rule(doc, plain ? "#999999" : accent, 0.6, width);
      doc.moveDown(0.3 * sp);
      doc.fillColor(ink).font(font.regular).fontSize(base);
      renderSection(doc, s, { font, base, ink, muted, accent, bullet, sp, width, margin, tpl, clean, plain });
      doc.moveDown(0.8 * sp);
    }

    // ── Page numbers (only when more than one page) ──
    const range = doc.bufferedPageRange();
    pages = range.count;
    if (range.count > 1) {
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // Writing inside the bottom margin must not trigger pdfkit's automatic page break.
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font(font.regular).fontSize(base * 0.8).fillColor(muted).text(`${clean(p.fullName) || "Resume"} — page ${i + 1} of ${range.count}`, margin, A4.height - margin + 12, { width, align: "center", lineBreak: false });
        doc.page.margins.bottom = bottom;
      }
    }
    doc.end();
  });
}

function rule(doc, color, thickness, width) {
  const y = doc.y;
  doc.save().moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + width, y).lineWidth(thickness).strokeColor(color).stroke().restore();
  doc.y = y + thickness + 2;
}

function ensureSpace(doc, needed, margin) {
  if (doc.y + needed > A4.height - margin) doc.addPage();
}

function renderSection(doc, s, ctx) {
  const { font, base, ink, muted, accent, bullet, sp, width, margin, tpl, clean, plain } = ctx;
  const bullets = (items) => {
    for (const b of items ?? []) {
      const t = clean(b); if (!t) continue;
      ensureSpace(doc, base * 2.2, margin);
      const x = doc.page.margins.left;
      const y = doc.y;
      doc.font(font.regular).fontSize(base).fillColor(ink).text(bullet, x + 6, y, { width: 10, lineBreak: false });
      doc.text(t, x + 18, y, { width: width - 18, align: "left" });
      doc.moveDown(0.15 * sp);
    }
    doc.x = doc.page.margins.left;
  };
  const heading = (left, right) => {
    ensureSpace(doc, base * 3, margin);
    const y = doc.y;
    doc.font(font.bold).fontSize(base * 1.02).fillColor(ink).text(clean(left), doc.page.margins.left, y, { width: right ? width - 150 : width, lineBreak: true });
    if (right) { const after = doc.y; doc.font(font.regular).fontSize(base * 0.9).fillColor(muted).text(clean(right), doc.page.margins.left + width - 150, y, { width: 150, align: "right", lineBreak: false }); doc.y = Math.max(after, y + base * 1.3); }
    doc.x = doc.page.margins.left;
  };
  const sub = (text) => { if (text) doc.font(font.italic).fontSize(base * 0.95).fillColor(muted).text(clean(text)); };
  const mono = tpl.id === "technical" && !plain;
  const dates = (a, b, current) => [a, current ? "Present" : b].map(clean).filter(Boolean).join(" – ");

  switch (s.type) {
    case "summary": doc.font(font.regular).fontSize(base).fillColor(ink).text(clean(s.text), { align: "left", lineGap: 1.5 }); break;
    case "skills":
      for (const g of s.groups ?? []) {
        if (!(g.items ?? []).length) continue;
        ensureSpace(doc, base * 2, margin);
        const label = clean(g.name);
        const items = g.items.map(clean).filter(Boolean).join(mono ? "  ·  " : ", ");
        if (label) { doc.font(font.bold).fontSize(base).fillColor(ink).text(`${label}: `, { continued: true }); doc.font(mono ? "Courier" : font.regular).text(items); }
        else doc.font(mono ? "Courier" : font.regular).fontSize(base).fillColor(ink).text(items);
        doc.moveDown(0.15 * sp);
      }
      break;
    case "experience":
      for (const e of s.entries ?? []) { heading(e.role || e.company, dates(e.startDate, e.endDate, e.current)); sub([e.company, e.location].map(clean).filter(Boolean).join(" · ")); doc.moveDown(0.15); bullets(e.bullets); doc.moveDown(0.35 * sp); }
      break;
    case "projects":
      for (const e of s.entries ?? []) { heading(e.name, dates(e.startDate, e.endDate, false)); sub([e.role, (e.technologies ?? []).length ? (e.technologies ?? []).map(clean).join(", ") : "", e.link].filter(Boolean).join(" · ")); doc.moveDown(0.15); bullets(e.bullets); doc.moveDown(0.35 * sp); }
      break;
    case "education":
      for (const e of s.entries ?? []) { heading(e.degree || e.institution, dates(e.startDate, e.endDate, false)); sub([e.institution, e.location].map(clean).filter(Boolean).join(" · ")); doc.moveDown(0.15); bullets(e.details); doc.moveDown(0.35 * sp); }
      break;
    case "certifications":
      for (const e of s.entries ?? []) { ensureSpace(doc, base * 2, margin); doc.font(font.bold).fontSize(base).fillColor(ink).text(clean(e.name), { continued: Boolean(e.issuer || e.date) }); if (e.issuer || e.date) doc.font(font.regular).fillColor(muted).text(` — ${[e.issuer, e.date].map(clean).filter(Boolean).join(", ")}`); if (e.link) doc.font(font.regular).fontSize(base * 0.85).fillColor(accent).text(clean(e.link)); doc.moveDown(0.15 * sp); }
      break;
    default: bullets(s.items);
  }
}
