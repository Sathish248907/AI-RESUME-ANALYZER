/**
 * resumeParser.ts
 * Client-side resume parsing service.
 * PDF parsing is done server-side via /api/parse-resume.
 * DOCX parsing is attempted client-side with mammoth (browser bundle).
 * No resume text is logged to the console.
 */

export interface ParsedResume {
  text: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  charCount: number;
  method: "server" | "client";
}

export interface ParseError {
  message: string;
  code: "UNSUPPORTED_TYPE" | "TOO_LARGE" | "PARSE_FAILED" | "EMPTY_TEXT";
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function validateFile(file: File): ParseError | null {
  const allowed = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];

  if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|docx|doc)$/i)) {
    return { message: "Only PDF or DOCX files are accepted.", code: "UNSUPPORTED_TYPE" };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { message: "File must be under 5 MB.", code: "TOO_LARGE" };
  }

  return null;
}

/**
 * Parse a resume file by sending it to the server-side API route.
 * Falls back with a helpful message on failure.
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError.message);

  const formData = new FormData();
  formData.append("resume", file);

  const res = await fetch("/api/parse-resume", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.error ??
        "Could not parse this file. If it is a scanned PDF (image-based), text extraction is not supported — please use a text-based PDF or DOCX."
    );
  }

  if (!data.text || data.text.trim().length < 50) {
    throw new Error(
      "Not enough text was extracted from this file. It may be image-based or password-protected."
    );
  }

  return {
    text: data.text,
    fileName: data.fileName,
    fileSize: data.fileSize,
    mimeType: data.mimeType,
    charCount: data.charCount,
    method: "server",
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileTypeLabel(mimeType: string): string {
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return "DOCX";
  return "Document";
}
