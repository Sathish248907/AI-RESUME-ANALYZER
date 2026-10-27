/**
 * coverLetterPdfService.js — renders a saved cover letter to A4 PDF
 * (`cover-letter-pdf-1.0`), using the same pdfkit dependency as the Phase 8
 * resume export.
 *
 * The output is real selectable text in a standard PDF font — not an image —
 * so it can be read by whatever the employer opens it with. Nothing is added
 * to the letter at render time: the sender block comes from the resume version
 * the letter was written against, and if a field is absent it is simply not
 * printed rather than filled with a placeholder.
 */
import PDFDocument from "pdfkit";

export const COVER_LETTER_PDF_METHOD = "cover-letter-pdf-1.0";

const MARGIN = 64;
const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();

/**
 * @param {object} input
 * @param {string} input.content          the letter body as the user approved it
 * @param {object} [input.sender]         { fullName, email, phone, location, linkedin }
 * @param {string} [input.jobTitle]
 * @param {string} [input.companyName]
 * @param {Date}   [input.date]
 * @returns {Promise<{ buffer: Buffer, pages: number }>}
 */
export function renderCoverLetterPdf({ content, sender = {}, jobTitle = "", companyName = "", date = new Date() }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: clean(`${sender.fullName ? `${sender.fullName} — ` : ""}Cover letter${companyName ? ` — ${companyName}` : ""}`),
        Author: clean(sender.fullName ?? ""),
        Creator: "AI Resume Analyzer",
      },
      pdfVersion: "1.5",
    });

    const chunks = [];
    // Count pages as they are added: bufferedPageRange() is empty once end()
    // has flushed them, so reading it in the "end" handler reports zero.
    let pages = 0;
    doc.on("pageAdded", () => { pages += 1; });
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pages: Math.max(1, pages) }));

    // Sender block — only the fields that exist.
    if (sender.fullName) doc.font("Helvetica-Bold").fontSize(14).text(clean(sender.fullName));
    const contact = [sender.email, sender.phone, sender.location].map(clean).filter(Boolean).join("  ·  ");
    if (contact) doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text(contact);
    if (sender.linkedin) doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text(clean(sender.linkedin));

    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(9.5).fillColor("#444444")
      .text(new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(date));

    if (companyName || jobTitle) {
      doc.moveDown(0.6);
      doc.fillColor("#000000").fontSize(10);
      if (companyName) doc.text(clean(companyName));
      if (jobTitle) doc.font("Helvetica-Oblique").text(clean(`Re: ${jobTitle}`)).font("Helvetica");
    }

    doc.moveDown(1.2);
    doc.fillColor("#000000").font("Helvetica").fontSize(11);

    // Blank lines separate paragraphs; keep the user's own structure.
    for (const para of clean(content).split(/\n{2,}/)) {
      const text = para.replace(/\n/g, " ").trim();
      if (!text) continue;
      doc.text(text, { align: "left", lineGap: 2.5 });
      doc.moveDown(0.8);
    }

    doc.end();
  });
}
