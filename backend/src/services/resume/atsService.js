/**
 * atsService.js — deterministic ATS checks that CAN be verified from extracted text.
 *
 * These complement the LLM's own checks. Every check carries a `verifiability`
 * flag so the UI can tell users which checks were confirmed from the text,
 * which are heuristics, and which would need the original file.
 * We never claim to reproduce any specific ATS platform.
 */

const SECTION_PATTERNS = [
  { name: "Experience", rx: /^(work |professional |employment )?(experience|history)\b|^employment\b/im },
  { name: "Education", rx: /^education\b|^academic (background|qualifications)\b/im },
  { name: "Skills", rx: /^(technical |core |key )?skills\b|^technologies\b|^competencies\b/im },
  { name: "Summary", rx: /^(professional |career )?(summary|profile|objective)\b|^about me\b/im },
  { name: "Projects", rx: /^(personal |selected |key )?projects\b/im },
];

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RX = /(\+?\d{1,3}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const LINK_RX = /(linkedin\.com\/in\/|github\.com\/|https?:\/\/)/i;
const DATE_RX = /\b(19|20)\d{2}\b/g;
const BULLET_RX = /^[\s]*[•\-–*▪●]\s+/m;
const METRIC_RX = /\b\d+(\.\d+)?\s?(%|percent|x\b|k\b|users|customers|requests|ms|seconds|hours|days|million|thousand)/i;

/**
 * @param {string} resumeText
 * @param {{ foundKeywords: string[], missingOrUnverifiedKeywords: string[] }} keywordAnalysis
 */
export function runTextAtsChecks(resumeText, keywordAnalysis) {
  const checks = [];
  const text = resumeText ?? "";

  // Contact details — verifiable from text.
  const hasEmail = EMAIL_RX.test(text);
  const hasPhone = PHONE_RX.test(text);
  const hasLink = LINK_RX.test(text);
  checks.push({
    name: "Contact information",
    status: hasEmail && (hasPhone || hasLink) ? "pass" : hasEmail || hasPhone ? "warn" : "fail",
    explanation: hasEmail
      ? `An email address was found${hasPhone ? " along with a phone number" : ""}${hasLink ? " and a profile link" : ""}.`
      : "No email address was detected in the extracted text. Make sure contact details are plain text, not inside an image or header graphic.",
    verifiability: "text",
  });

  // Section structure — verifiable from text.
  const found = SECTION_PATTERNS.filter((s) => s.rx.test(text)).map((s) => s.name);
  const missing = SECTION_PATTERNS.map((s) => s.name).filter((n) => !found.includes(n));
  const core = ["Experience", "Education", "Skills"].filter((n) => !found.includes(n));
  checks.push({
    name: "Standard section headings",
    status: core.length === 0 ? "pass" : core.length === 1 ? "warn" : "fail",
    explanation:
      found.length > 0
        ? `Detected headings: ${found.join(", ")}.${missing.length ? ` Not detected: ${missing.join(", ")}.` : ""} Conventional headings help parsers map content correctly.`
        : "No conventional section headings (Experience, Education, Skills) were detected. Parsers rely on these to classify content.",
    verifiability: "text",
  });

  // Dates — verifiable from text.
  const years = (text.match(DATE_RX) ?? []).length;
  checks.push({
    name: "Dates on roles and education",
    status: years >= 2 ? "pass" : years === 1 ? "warn" : "fail",
    explanation: years >= 2 ? `${years} year references found, which lets parsers build a timeline.` : "Few or no dates were detected. Add month/year ranges to each role.",
    verifiability: "text",
  });

  // Bullets & metrics — heuristic.
  checks.push({
    name: "Bullet points with measurable results",
    status: BULLET_RX.test(text) && METRIC_RX.test(text) ? "pass" : BULLET_RX.test(text) || METRIC_RX.test(text) ? "warn" : "fail",
    explanation: METRIC_RX.test(text)
      ? "Quantified achievements were detected (numbers, percentages or scale)."
      : "No quantified results were detected. Numbers such as % improvements or user counts make impact concrete.",
    verifiability: "heuristic",
  });

  // Keyword coverage — heuristic, derived from AI classification.
  const total = keywordAnalysis.foundKeywords.length + keywordAnalysis.missingOrUnverifiedKeywords.length;
  const coverage = total === 0 ? null : keywordAnalysis.foundKeywords.length / total;
  checks.push({
    name: "Job keyword coverage",
    status: coverage === null ? "warn" : coverage >= 0.7 ? "pass" : coverage >= 0.4 ? "warn" : "fail",
    explanation:
      coverage === null
        ? "Keyword coverage could not be computed."
        : `${keywordAnalysis.foundKeywords.length} of ${total} job keywords appear in the resume (${Math.round(coverage * 100)}%). Only add missing terms that genuinely reflect your experience.`,
    verifiability: "heuristic",
  });

  // Length — heuristic.
  const words = text.split(/\s+/).filter(Boolean).length;
  checks.push({
    name: "Resume length",
    status: words >= 250 && words <= 1100 ? "pass" : words < 250 ? "warn" : "warn",
    explanation: `${words.toLocaleString()} words extracted. Roughly 300–1,000 words (1–2 pages) is typical; shorter may lack detail, longer may bury key points.`,
    verifiability: "heuristic",
  });

  // Formatting — cannot be verified from text.
  checks.push({
    name: "Layout, columns, tables and images",
    status: "warn",
    explanation:
      "Multi-column layouts, tables, text boxes and images can be scrambled or dropped by parsers. This cannot be verified from extracted text — review the original file.",
    verifiability: "requires-original",
  });

  return checks;
}

/**
 * Merge deterministic checks with the model's checks, de-duplicating by name.
 * Deterministic text checks win on conflicts because they are verifiable.
 */
export function mergeAtsChecks(textChecks, aiChecks) {
  const seen = new Set(textChecks.map((c) => c.name.toLowerCase()));
  const extra = (aiChecks ?? []).filter((c) => !seen.has(c.name.toLowerCase()));
  return [...textChecks, ...extra].slice(0, 12);
}
