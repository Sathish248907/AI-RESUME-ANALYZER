/**
 * resumeParserService.js — validates an uploaded resume and extracts its text.
 * Files are processed from memory buffers; nothing is written to disk and the
 * file is never executed or interpreted beyond text extraction.
 */
import { ApiError } from "../../utils/errors.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);
const ALLOWED_EXTENSIONS = /\.(pdf|docx|doc)$/i;
const MIN_TEXT_CHARS = 50;

/** Cheap signature check so a renamed file cannot pass as PDF/DOCX. */
function sniffType(buffer, declared) {
  if (!buffer || buffer.length < 4) return null;
  const head = buffer.subarray(0, 4).toString("latin1");
  if (head.startsWith("%PDF")) return "application/pdf";
  if (head.startsWith("PK\u0003\u0004")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/msword";
  return null;
}

/**
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, size: number } | undefined} file
 */
export function validateResumeFile(file) {
  if (!file) throw new ApiError(400, "No file uploaded. Send the resume as multipart/form-data in the `resume` field.", { code: "NO_FILE" });
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, "File size must be under 5 MB.", { code: "FILE_TOO_LARGE" });
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.test(file.originalname ?? "")) {
    throw new ApiError(415, "Only PDF and DOCX files are supported.", { code: "UNSUPPORTED_FILE_TYPE" });
  }
  const sniffed = sniffType(file.buffer, file.mimetype);
  if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
    throw new ApiError(415, "The file content does not look like a PDF or DOCX document.", { code: "UNSUPPORTED_FILE_TYPE" });
  }
  return sniffed;
}

export function normaliseText(text) {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Extract text from a validated upload.
 * @returns {Promise<{ text: string, charCount: number, mimeType: string }>}
 */
export async function extractResumeText(file) {
  const mimeType = validateResumeFile(file);
  let raw = "";
  try {
    if (mimeType === "application/pdf") {
      const { default: pdfParse } = await import("pdf-parse");
      const unshared = new Uint8Array(file.buffer.length);
      unshared.set(file.buffer);
      raw = (await pdfParse(unshared)).text;
    } else {
      const mammoth = await import("mammoth");
      raw = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    }
  } catch {
    throw new ApiError(422, "The file could not be read. It may be corrupted, password-protected or not a real PDF/DOCX.", { code: "PARSE_FAILED" });
  }
  const text = normaliseText(raw);
  if (text.length < MIN_TEXT_CHARS) {
    throw new ApiError(422, "Could not extract enough text from this file. Image-based or scanned resumes are not supported — export a text-based PDF or DOCX.", {
      code: "INSUFFICIENT_TEXT",
    });
  }
  return { text, charCount: text.length, mimeType };
}
