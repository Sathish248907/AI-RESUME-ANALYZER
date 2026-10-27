/**
 * applicationDocumentService.js — validation and storage rules for files
 * attached to an application (`application-documents-1.0`).
 *
 * Three rules, in order of how often they matter:
 *
 *   1. **Content decides the type, not the filename.** `sniffType` reads the
 *      magic bytes; a `.pdf` that is really a zip, or an `.png` that is really
 *      a script, is rejected. The declared MIME type must agree with the bytes.
 *   2. **No storage means no pretending.** When `STORAGE_DRIVER=none` the
 *      driver discards what it is given, so an upload would silently vanish.
 *      `assertStorageUsable` refuses the request with the configuration needed
 *      instead of reporting a success that did not happen.
 *   3. **Storage keys never leave the backend.** A document is downloaded
 *      through an owner-checked endpoint that streams it; the key is not in any
 *      response body, so there is no public URL to guess.
 */
import { createHash } from "node:crypto";
import { ApiError } from "../../utils/errors.js";
import { sanitizeShortText } from "../../utils/sanitize.js";

export const DOCUMENT_METHOD = "application-documents-1.0";

export const DOCUMENT_CATEGORIES = ["resume", "cover_letter", "portfolio", "certificate", "transcript", "other"];
export const DOCUMENT_KINDS = ["file", "link"];

/** 10 MB: large enough for a scanned transcript, small enough to stay sane. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Declared MIME → the extension we store it under. */
export const ALLOWED_DOCUMENT_TYPES = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "image/png": "png",
  "image/jpeg": "jpg",
  "text/plain": "txt",
});

const EXTENSION_RX = /\.(pdf|docx|doc|png|jpe?g|txt)$/i;

/**
 * Identify a buffer from its leading bytes. Returns null when the content is
 * not one of the formats we accept, which is itself a rejection reason.
 * @param {Buffer} buffer
 */
export function sniffType(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const head = buffer.subarray(0, 4);
  const latin = head.toString("latin1");
  if (latin.startsWith("%PDF")) return "application/pdf";
  // DOCX is a zip; so is anything else zip-shaped, which is why the declared
  // type must also be docx for this to be accepted.
  if (latin.startsWith("PK\u0003\u0004")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/msword";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  // Plain text has no signature: accept it only when every byte is printable.
  if (isProbablyText(buffer)) return "text/plain";
  return null;
}

function isProbablyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  for (const byte of sample) {
    if (byte === 0) return false;
    const printable = byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128;
    if (!printable) return false;
  }
  return true;
}

/**
 * Refuse the upload when the configured driver would discard it.
 * @param {{ enabled: boolean, name: string }} storage
 */
export function assertStorageUsable(storage) {
  if (storage?.enabled) return;
  throw new ApiError(503, "File storage is not configured on this server, so an upload would be discarded rather than kept. Set STORAGE_DRIVER=local (and STORAGE_LOCAL_DIR) in the backend environment, then restart it. You can still attach a portfolio or document link instead.", {
    code: "STORAGE_NOT_CONFIGURED",
    details: [
      { message: "STORAGE_DRIVER=local keeps originals under STORAGE_LOCAL_DIR with opaque names, readable only by their owner." },
      { message: "STORAGE_DRIVER=none (the current setting) discards file bytes after processing." },
    ],
  });
}

/**
 * Validate an uploaded file. Throws with a specific reason; returns the
 * normalised metadata the repository stores.
 * @param {{ buffer: Buffer, mimetype: string, originalname: string, size: number }} file
 */
export function validateDocumentFile(file) {
  if (!file) throw new ApiError(400, "No file uploaded. Send it as multipart/form-data in the `document` field.", { code: "NO_FILE" });
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(413, `Files must be under ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`, { code: "FILE_TOO_LARGE" });
  }
  if (!file.buffer?.length) throw new ApiError(400, "The uploaded file is empty.", { code: "EMPTY_FILE" });

  const declared = String(file.mimetype ?? "").toLowerCase();
  if (!ALLOWED_DOCUMENT_TYPES[declared] || !EXTENSION_RX.test(file.originalname ?? "")) {
    throw new ApiError(415, "Supported formats are PDF, DOCX, DOC, PNG, JPEG and TXT.", { code: "UNSUPPORTED_FILE_TYPE" });
  }

  const sniffed = sniffType(file.buffer);
  if (!sniffed) {
    throw new ApiError(415, "The file's contents do not match any supported format. A renamed file is not accepted.", { code: "CONTENT_TYPE_MISMATCH" });
  }
  // JPEG/JPG and the two Word types are the only places where a declared type
  // may legitimately differ in spelling from the sniffed one.
  if (sniffed !== declared && !(sniffed === "application/msword" && declared === "application/msword")) {
    throw new ApiError(415, `This file is declared as ${declared} but its contents are ${sniffed}. Upload it with its real type.`, { code: "CONTENT_TYPE_MISMATCH" });
  }

  return {
    fileName: sanitizeShortText(file.originalname, 180),
    mimeType: declared,
    fileSize: file.size,
    checksum: createHash("sha256").update(file.buffer).digest("hex"),
    extension: ALLOWED_DOCUMENT_TYPES[declared],
  };
}

/** Only an absolute http(s) URL is accepted for a link-type document. */
export function validateDocumentLink(url) {
  let parsed;
  try { parsed = new URL(String(url ?? "").trim()); } catch {
    throw new ApiError(400, "Enter a complete link, including https://", { code: "INVALID_URL" });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(400, "Links must start with http:// or https://", { code: "INVALID_URL" });
  }
  return parsed.toString();
}

/**
 * Shape a stored document for the API. `storageKey` is deliberately absent:
 * the browser gets a download endpoint, never a path.
 */
export function presentDocument(row) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    category: row.category,
    kind: row.kind,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    url: row.kind === "link" ? row.url : null,
    /** Images and PDFs can be shown inline; everything else downloads. */
    previewable: row.kind === "file" && ["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(row.mimeType ?? ""),
    downloadHref: row.kind === "file" ? `/api/application-documents/${row.id}/download` : null,
    coverLetterId: row.coverLetterId ?? null,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/** Content-Disposition value that cannot be used to smuggle a header. */
export function contentDisposition(fileName, { inline = false } = {}) {
  const safe = String(fileName ?? "document").replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";
  return `${inline ? "inline" : "attachment"}; filename="${safe}"`;
}
