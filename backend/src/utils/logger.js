/**
 * logger.js — minimal structured logger.
 * Never pass resume text, passwords, tokens or API keys into these calls;
 * `redact` strips the most common secret-bearing keys defensively.
 */
const SECRET_KEYS = /^(password|passwordHash|token|authorization|apiKey|api_key|secret|resumeText|jobDescription)$/i;

export function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function write(level, message, meta) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const entry = { time: new Date().toISOString(), level, message, ...(meta ? { meta: redact(meta) } : {}) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
};
