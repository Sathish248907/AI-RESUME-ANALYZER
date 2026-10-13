/**
 * sanitize.js — prepares untrusted document text before it is embedded in a prompt.
 *
 * Uploaded resumes and pasted job descriptions are DATA, never instructions.
 * We strip control characters, collapse runaway whitespace, cap the length and
 * neutralise the XML delimiters we use to fence the content so a document cannot
 * "close" its own fence and inject instructions.
 */

export const MAX_RESUME_CHARS = 30000;
export const MAX_JOB_DESCRIPTION_CHARS = 20000;

const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now (a|an) /i,
  /\bsystem prompt\b/i,
  /\bas an ai (language )?model\b/i,
  /rate (this|the) (resume|candidate) (as )?(100|a perfect)/i,
  /give (this|the) (resume|candidate) (a |the )?(highest|maximum|perfect|top) (score|rating|match)/i,
  /<\/?(system|assistant|instructions?)>/i,
];

/**
 * @param {string} text
 * @param {number} maxChars
 */
export function sanitizeDocumentText(text, maxChars) {
  if (typeof text !== "string") return "";
  let out = text
    .replace(/\r\n?/g, "\n")
    // strip C0/C1 control characters except tab and newline
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    // zero-width / bidi characters often used to hide text
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  // Neutralise our own fence tags so the document cannot terminate the block.
  out = out.replace(/<\s*\/?\s*(resume|job_description|candidate_document)\s*>/gi, (m) => m.replace("<", "‹").replace(">", "›"));
  if (out.length > maxChars) out = out.slice(0, maxChars);
  return out;
}

/**
 * Returns a list of suspicious phrases found in the text. Detection is advisory —
 * the content is still analysed, but the result carries a limitation note and the
 * system prompt already instructs the model to treat documents as data.
 * @param {string} text
 */
export function detectInjectionAttempts(text) {
  if (typeof text !== "string") return [];
  const hits = [];
  for (const rx of INJECTION_PATTERNS) {
    const m = text.match(rx);
    if (m) hits.push(m[0].slice(0, 80));
  }
  return hits;
}

/** Sanitise short free-text fields (titles, names). */
export function sanitizeShortText(text, max = 120) {
  if (typeof text !== "string") return "";
  return text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
