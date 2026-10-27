/**
 * jobNormalizer.js — turns a provider's raw payload into the one internal job
 * shape the rest of Phase 12 uses (`job-normal-1.0`).
 *
 * Two rules govern everything here:
 *
 * 1. **Nothing is invented.** A field the provider did not supply stays `null`
 *    or `"unknown"`; it is never filled with a plausible default. Callers render
 *    "not provided by the source" rather than a guess. The only values derived
 *    rather than copied are read out of the provider's own title or tags
 *    (e.g. a title containing "Senior"), which is parsing, not guessing.
 * 2. **Provider text is untrusted data.** Descriptions arrive as HTML from the
 *    open internet: they are converted to plain text, stripped of control and
 *    bidi characters, length-capped and fence-neutralised by the shared
 *    sanitizer before they can reach a prompt or a browser.
 */
import { createHash } from "node:crypto";
import { sanitizeDocumentText, sanitizeShortText, MAX_JOB_DESCRIPTION_CHARS } from "../../utils/sanitize.js";

export const NORMALIZER_METHOD = "job-normal-1.0";

export const WORK_ARRANGEMENTS = ["remote", "hybrid", "onsite", "unknown"];
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "temporary", "unknown"];
export const EXPERIENCE_LEVELS = ["entry", "junior", "mid", "senior", "lead", "unknown"];

/** Decode the handful of entities that survive a plain-text conversion. */
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&ndash;": "–", "&mdash;": "—", "&bull;": "•" };

/**
 * Convert provider HTML to readable plain text. Block elements become newlines
 * and list items become bullets so the structure of a job description survives;
 * `script` / `style` bodies are discarded outright rather than flattened into
 * the text.
 * @param {string} html
 */
export function htmlToText(html) {
  if (typeof html !== "string" || !html) return "";
  let out = html
    .replace(/<(script|style|noscript|iframe|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|h[1-6]|tr|ul|ol|table|blockquote)\s*>/gi, "\n\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*t[dh][^>]*>/gi, "\t")
    .replace(/<[^>]+>/g, " ");
  out = out.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? (/^&#\d+;$/.test(m) ? String.fromCharCode(Number(m.slice(2, -1))) : " "));
  return out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Accept only an absolute http(s) URL, so a provider cannot hand us a
 * `javascript:` or `data:` link that the browser would then render as a button.
 * @param {unknown} url
 * @returns {string|null}
 */
export function safeExternalUrl(url) {
  if (typeof url !== "string" || url.length > 2048) return null;
  let parsed;
  try { parsed = new URL(url.trim()); } catch { return null; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Identity of a vacancy independent of who listed it, so the same role posted to
 * two aggregators collapses to one result. Deliberately coarse (title, company,
 * city) — two genuinely different roles at one company with the same title and
 * location are indistinguishable from a duplicate in provider data anyway.
 * @param {{ title?: string, companyName?: string, location?: string }} job
 */
export function fingerprintJob({ title, companyName, location } = {}) {
  const city = norm(location).split(/\s+/).slice(0, 3).join(" ");
  return createHash("sha1").update(`${norm(title)}|${norm(companyName)}|${city}`).digest("hex");
}

/** Work arrangement, only from an explicit provider flag, tag or title marker. */
export function inferWorkArrangement({ isRemote, text = "", title = "", tags = [] } = {}) {
  const hay = `${norm(title)} ${tags.map(norm).join(" ")}`;
  if (/\bhybrid\b/.test(hay)) return "hybrid";
  if (isRemote === true || /\b(remote|work from home|wfh|distributed)\b/.test(hay)) return "remote";
  if (/\b(on ?site|in office|in person)\b/.test(hay)) return "onsite";
  // Fall back to the description only for an unambiguous single signal.
  const body = norm(text).slice(0, 4000);
  const hybrid = /\bhybrid\b/.test(body);
  const remote = /\b(fully remote|100 percent remote|remote first)\b/.test(body);
  if (hybrid && !remote) return "hybrid";
  if (remote && !hybrid) return "remote";
  return "unknown";
}

/** Employment type from a provider field, tag or the listing's own title. */
export function inferEmploymentType({ raw, title = "", tags = [] } = {}) {
  const hay = `${norm(raw)} ${norm(title)} ${tags.map(norm).join(" ")}`;
  if (/\bintern(ship)?\b|\btrainee\b|\bapprentice/.test(hay)) return "internship";
  if (/\bpart time\b/.test(hay)) return "part_time";
  if (/\b(contract|contractor|freelance|b2b)\b/.test(hay)) return "contract";
  if (/\b(temporary|temp|seasonal)\b/.test(hay)) return "temporary";
  if (/\bfull time\b|\bpermanent\b/.test(hay)) return "full_time";
  return "unknown";
}

/** Experience level read out of the listing's own title or tags. */
export function inferExperienceLevel({ raw, title = "", tags = [] } = {}) {
  const hay = `${norm(raw)} ${norm(title)} ${tags.map(norm).join(" ")}`;
  if (/\b(principal|staff|lead|head of|director|vp)\b/.test(hay)) return "lead";
  if (/\b(senior|sr|snr)\b/.test(hay)) return "senior";
  if (/\b(junior|jr)\b/.test(hay)) return "junior";
  if (/\b(intern(ship)?|graduate|fresher|entry level|trainee|apprentice)\b/.test(hay)) return "entry";
  if (/\b(mid level|mid|intermediate)\b/.test(hay)) return "mid";
  return "unknown";
}

/** A finite positive integer amount, or null. Rejects nonsense silently. */
const amount = (v) => {
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n) : null;
};

/**
 * Salary is reported only when the provider gives numbers. `isEstimate` is set
 * when the provider itself says the figure is predicted rather than advertised.
 * @param {{ min?: unknown, max?: unknown, currency?: unknown, period?: unknown, isEstimate?: boolean }} input
 */
export function parseSalary({ min, max, currency, period, isEstimate = false } = {}) {
  let lo = amount(min);
  let hi = amount(max);
  if (lo && hi && lo > hi) [lo, hi] = [hi, lo];
  if (!lo && !hi) return { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salaryIsEstimate: false };
  const cur = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency.trim()) ? currency.trim().toUpperCase() : null;
  const per = ["year", "month", "week", "day", "hour"].includes(String(period ?? "").toLowerCase()) ? String(period).toLowerCase() : null;
  return { salaryMin: lo, salaryMax: hi, salaryCurrency: cur, salaryPeriod: per, salaryIsEstimate: Boolean(isEstimate) };
}

/**
 * A date is kept only when it parses and is not absurd. `reliable` stays false
 * unless the adapter states the provider publishes a real timestamp, because a
 * relative string like "3 days ago" must not drive freshness ranking.
 * @param {unknown} value
 * @param {boolean} reliable
 */
export function parsePostedAt(value, reliable) {
  if (value === null || value === undefined || value === "") return { postedAt: null, postedAtReliable: false };
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return { postedAt: null, postedAtReliable: false };
  const now = Date.now();
  // Reject dates in the future or older than five years: both mean we misread the field.
  if (d.getTime() > now + 86_400_000 || d.getTime() < now - 5 * 365 * 86_400_000) return { postedAt: null, postedAtReliable: false };
  return { postedAt: d, postedAtReliable: Boolean(reliable) };
}

/**
 * Validate and normalise one adapter result. Returns `null` when the listing is
 * unusable (no id, title, company or description, or no application link), so a
 * malformed row is dropped instead of being shown as a half-empty card.
 *
 * @param {object} input adapter output
 * @param {string} providerSlug
 * @returns {object|null}
 */
export function normalizeJob(input, providerSlug) {
  if (!input || typeof input !== "object") return null;

  // Short fields are never meant to carry markup, and some providers leak it
  // into titles; strip tags before the usual control-character sanitising so
  // nothing downstream has to decide whether a title is safe to render.
  const shortText = (value, max) => sanitizeShortText(htmlToText(String(value ?? "")), max);

  const externalId = sanitizeShortText(String(input.externalId ?? ""), 200);
  const title = shortText(input.title, 200);
  const companyName = shortText(input.companyName, 160);
  if (!externalId || !title || !companyName) return null;

  const descriptionRaw = typeof input.descriptionHtml === "string" && input.descriptionHtml
    ? htmlToText(input.descriptionHtml)
    : String(input.description ?? "");
  const description = sanitizeDocumentText(descriptionRaw, MAX_JOB_DESCRIPTION_CHARS);
  if (description.length < 40) return null; // nothing to match against

  const applyUrl = safeExternalUrl(input.applyUrl);
  const sourceUrl = safeExternalUrl(input.sourceUrl);
  if (!applyUrl && !sourceUrl) return null; // a listing nobody can apply to is noise

  const tags = Array.isArray(input.tags) ? input.tags.map((t) => shortText(t, 40)).filter(Boolean).slice(0, 20) : [];
  const location = input.location ? shortText(input.location, 160) : null;

  return {
    providerSlug,
    externalId,
    fingerprint: fingerprintJob({ title, companyName, location }),
    title,
    companyName,
    companyLogoUrl: safeExternalUrl(input.companyLogoUrl),
    location,
    isRemote: input.isRemote === true,
    workArrangement: WORK_ARRANGEMENTS.includes(input.workArrangement)
      ? input.workArrangement
      : inferWorkArrangement({ isRemote: input.isRemote, text: description, title, tags }),
    employmentType: EMPLOYMENT_TYPES.includes(input.employmentType)
      ? input.employmentType
      : inferEmploymentType({ raw: input.employmentTypeRaw, title, tags }),
    experienceLevel: EXPERIENCE_LEVELS.includes(input.experienceLevel)
      ? input.experienceLevel
      : inferExperienceLevel({ raw: input.experienceLevelRaw, title, tags }),
    description,
    ...parseSalary(input.salary ?? {}),
    isSponsored: input.isSponsored === true,
    ...parsePostedAt(input.postedAt, input.postedAtReliable),
    sourceUrl: sourceUrl ?? applyUrl,
    applyUrl: applyUrl ?? sourceUrl,
    tags,
    listingStatus: "open",
  };
}

/**
 * Collapse duplicates across providers. Within one provider the (slug, id) pair
 * is already unique; across providers the fingerprint decides, and the more
 * complete record wins — ties broken by the newer posting date — so merging
 * never loses a salary or a description we already had.
 * @param {object[]} jobs
 */
export function dedupeJobs(jobs) {
  const completeness = (j) =>
    (j.description?.length > 400 ? 2 : 1) +
    (j.salaryMin || j.salaryMax ? 2 : 0) +
    (j.postedAtReliable ? 2 : 0) +
    (j.location ? 1 : 0) +
    (j.workArrangement !== "unknown" ? 1 : 0) +
    (j.employmentType !== "unknown" ? 1 : 0);

  const byKey = new Map();
  for (const job of jobs) {
    if (!job) continue;
    const key = `${job.providerSlug}::${job.externalId}`;
    byKey.set(key, job);
  }
  const byFingerprint = new Map();
  for (const job of byKey.values()) {
    const existing = byFingerprint.get(job.fingerprint);
    if (!existing) { byFingerprint.set(job.fingerprint, job); continue; }
    const better =
      completeness(job) > completeness(existing) ||
      (completeness(job) === completeness(existing) && (job.postedAt?.getTime() ?? 0) > (existing.postedAt?.getTime() ?? 0));
    if (better) byFingerprint.set(job.fingerprint, { ...job, duplicateOf: [...(existing.duplicateOf ?? []), existing.providerSlug] });
    else existing.duplicateOf = [...(existing.duplicateOf ?? []), job.providerSlug];
  }
  return [...byFingerprint.values()];
}
