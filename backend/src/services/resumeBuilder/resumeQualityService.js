/**
 * resumeQualityService.js — deterministic resume quality checks (resume-quality-1.0).
 *
 * This is NOT the Phase 4 job-match score. Quality measures how well the
 * document itself is written and structured; job-match measures fit against
 * one job description. The two are reported separately and never mixed.
 * Every check carries an explanation; scores are weighted averages of checks.
 */
import { contentToPlainText, listTextFields, sectionLines } from "./resumeContentSchema.js";
import { runTextAtsChecks } from "../resume/atsService.js";
import { catalogSkills } from "../learning/learningResourceService.js";

/** Catalog skills mentioned in a job description (used when no parsed requirements exist). */
export function keywordsFromText(text) {
  const lower = String(text ?? "").toLowerCase();
  if (!lower) return [];
  // Boundary-aware substring match (no regex escaping needed for keys like "c++" or "next.js").
  const isWordChar = (ch) => /[a-z0-9]/i.test(ch ?? "");
  const mentioned = (k) => { let idx = lower.indexOf(k); while (idx !== -1) { if (!isWordChar(lower[idx - 1]) && !isWordChar(lower[idx + k.length])) return true; idx = lower.indexOf(k, idx + 1); } return false; };
  const titleCase = (k) => k.split(" ").map((w) => (w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase())).join(" ");
  return catalogSkills().filter((k) => k.length >= 2 && mentioned(k)).map(titleCase);
}

export const QUALITY_METHOD = "resume-quality-1.0";

export const CATEGORY_WEIGHTS = Object.freeze({ contact: 10, summary: 15, experience: 25, projects: 10, skills: 10, language: 15, consistency: 10, ats: 5 });

const WEAK_VERBS = /\b(responsible for|worked on|helped|involved in|assisted with|participated in|tasked with|duties included)\b/i;
const STRONG_VERBS = /\b(built|designed|developed|led|launched|shipped|implemented|optimi[sz]ed|reduced|increased|improved|automated|migrated|architected|delivered|created|owned|mentored|scaled|cut|grew|refactored|integrated|deployed|analy[sz]ed|resolved)\b/i;
const METRIC_RX = /\b\d+(\.\d+)?\s?(%|percent|x\b|k\b|m\b|users|customers|requests|ms|seconds|hours|days|million|thousand|\$|€|£)/i;
const GENERIC_SUMMARY = /\b(hard[- ]working|team player|passionate|motivated|results[- ]driven|detail[- ]oriented|fast learner|go-getter|synergy|think outside the box|dynamic professional)\b/gi;
const PRONOUN_RX = /\b(i|my|me|we|our)\b/i;
const DATE_FORMATS = [
  { name: "Month YYYY", rx: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}$/i },
  { name: "MM/YYYY", rx: /^\d{1,2}\/\d{4}$/ },
  { name: "YYYY-MM", rx: /^\d{4}-\d{2}$/ },
  { name: "YYYY", rx: /^\d{4}$/ },
];
const COMMON_MISSPELLINGS = { recieve: "receive", seperate: "separate", acheive: "achieve", occured: "occurred", managment: "management", enviroment: "environment", developement: "development", definately: "definitely", succesful: "successful", teh: "the", responsibilty: "responsibility", experiance: "experience", knowlege: "knowledge", comunication: "communication", analysys: "analysis", javascrpit: "javascript", pyhton: "python", lenght: "length", wich: "which", recomend: "recommend" };

/**
 * @param {object} content
 * @param {{ jobKeywords?: string[], jobTitle?: string }} [opts]
 */
export function runQualityChecks(content, { jobKeywords = [], jobTitle } = {}) {
  const issues = []; // { id, category, severity: high|medium|low, message, suggestion, sectionId?, entryId?, field? }
  const text = contentToPlainText(content);
  const fields = listTextFields(content);
  const sections = (content.sections ?? []).filter((s) => s.visible !== false);
  const byType = (t) => sections.filter((s) => s.type === t);
  const scores = {};

  // ── Contact ──
  const p = content.personal ?? {};
  let contact = 100;
  if (!p.fullName) { contact -= 40; issues.push(issue("contact", "high", "Your name is missing.", "Add your full name at the top of the resume.")); }
  if (!p.email) { contact -= 30; issues.push(issue("contact", "high", "No email address.", "Add a professional email address.")); }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) { contact -= 15; issues.push(issue("contact", "medium", "The email address does not look valid.", "Check the email for typos.")); }
  if (!p.phone) { contact -= 15; issues.push(issue("contact", "medium", "No phone number.", "Recruiters often call; add a phone number with country code.")); }
  if (!p.linkedin && !p.github && !p.website) { contact -= 10; issues.push(issue("contact", "low", "No LinkedIn, GitHub or portfolio link.", "Add at least one professional link.")); }
  if (!p.location) { contact -= 5; issues.push(issue("contact", "low", "No location.", "City and country help with location-based filtering.")); }
  scores.contact = clamp(contact);

  // ── Summary ──
  const summary = byType("summary")[0];
  let sum = 100;
  const sText = summary?.text?.trim() ?? "";
  if (!sText) { sum = 20; issues.push(issue("summary", "high", "No professional summary.", "Add 2–4 sentences stating your role, years of experience, core stack and what you deliver.", summary?.id)); }
  else {
    const words = sText.split(/\s+/).length;
    if (words < 20) { sum -= 30; issues.push(issue("summary", "medium", `The summary is very short (${words} words).`, "Aim for 40–80 words covering role, strengths and target.", summary.id, null, "summary")); }
    if (words > 120) { sum -= 20; issues.push(issue("summary", "medium", `The summary is long (${words} words).`, "Trim to the essentials; details belong in experience.", summary.id, null, "summary")); }
    const generic = [...new Set((sText.match(GENERIC_SUMMARY) ?? []).map((g) => g.toLowerCase()))];
    if (generic.length) { sum -= Math.min(30, generic.length * 10); issues.push(issue("summary", "medium", `Generic phrases: ${generic.join(", ")}.`, "Replace clichés with concrete skills, domains or outcomes.", summary.id, null, "summary")); }
    if (PRONOUN_RX.test(sText)) { sum -= 10; issues.push(issue("summary", "low", "The summary uses first-person pronouns.", "Resumes conventionally omit “I”, “my” and “we”.", summary.id, null, "summary")); }
    if (!/\d/.test(sText) && !STRONG_VERBS.test(sText)) { sum -= 10; issues.push(issue("summary", "low", "The summary has no specifics.", "Mention years of experience, a stack or a notable outcome.", summary.id, null, "summary")); }
  }
  scores.summary = clamp(sum);

  // ── Experience ──
  const exp = byType("experience").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id })));
  let ex = 100;
  if (exp.length === 0) { ex = 45; issues.push(issue("experience", "medium", "No work experience entries.", "Add internships, freelance work or substantial projects as experience if you have them.")); }
  for (const e of exp) {
    if (!e.role || !e.company) { ex -= 10; issues.push(issue("experience", "medium", `An experience entry is missing its ${!e.role ? "role" : "company"}.`, "Every entry needs a role title and an employer.", e.sectionId, e.id)); }
    if (!e.startDate) { ex -= 5; issues.push(issue("experience", "low", `“${e.role || e.company || "Entry"}” has no dates.`, "Add start and end dates (or mark as current).", e.sectionId, e.id)); }
    if ((e.bullets ?? []).length === 0) { ex -= 15; issues.push(issue("experience", "high", `“${e.role || e.company}” has no bullet points.`, "Add 2–5 bullets describing what you built and the result.", e.sectionId, e.id)); }
    (e.bullets ?? []).forEach((b, i) => {
      if (WEAK_VERBS.test(b)) { ex -= 4; issues.push(issue("experience", "medium", `Weak opening: “${b.slice(0, 60)}…”`, "Start with a strong action verb (built, led, reduced…).", e.sectionId, e.id, `bullet:${i}`)); }
      else if (!STRONG_VERBS.test(b.split(/\s+/).slice(0, 3).join(" "))) { ex -= 2; }
      if (b.split(/\s+/).length > 35) { ex -= 3; issues.push(issue("experience", "low", `A bullet is very long (${b.split(/\s+/).length} words).`, "Split it or cut to one outcome per bullet.", e.sectionId, e.id, `bullet:${i}`)); }
      if (b.split(/\s+/).length < 6) { ex -= 3; issues.push(issue("experience", "low", `A bullet is too short to give context: “${b}”.`, "Say what you did, how, and the effect.", e.sectionId, e.id, `bullet:${i}`)); }
    });
  }
  const allBullets = exp.flatMap((e) => e.bullets ?? []);
  if (allBullets.length && !allBullets.some((b) => METRIC_RX.test(b))) { ex -= 10; issues.push(issue("experience", "medium", "No bullet contains a measurable result.", "Where you honestly can, quantify: users, latency, revenue, time saved. Never invent numbers.")); }
  scores.experience = clamp(ex);

  // ── Projects ──
  const projects = byType("projects").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id })));
  let pr = 100;
  if (projects.length === 0) { pr = exp.length ? 70 : 40; issues.push(issue("projects", exp.length ? "low" : "high", "No projects listed.", "Projects show hands-on skill, especially for early-career candidates.")); }
  for (const e of projects) {
    if (!e.name) { pr -= 10; issues.push(issue("projects", "medium", "A project has no name.", "Give each project a clear name.", e.sectionId, e.id)); }
    if ((e.technologies ?? []).length === 0) { pr -= 8; issues.push(issue("projects", "medium", `“${e.name || "Project"}” lists no technologies.`, "Add the stack used so skills are verifiable.", e.sectionId, e.id)); }
    if ((e.bullets ?? []).length === 0) { pr -= 12; issues.push(issue("projects", "high", `“${e.name || "Project"}” has no description.`, "Describe what it does, your contribution and the outcome.", e.sectionId, e.id)); }
    else if (!(e.bullets ?? []).some((b) => /\b(i|my|built|designed|implemented|developed|led|created|owned)\b/i.test(b))) { pr -= 5; issues.push(issue("projects", "low", `“${e.name}” does not state your own contribution.`, "Say which parts you personally built.", e.sectionId, e.id)); }
  }
  scores.projects = clamp(pr);

  // ── Skills ──
  const skillGroups = byType("skills").flatMap((s) => s.groups ?? []);
  const skillItems = skillGroups.flatMap((g) => g.items ?? []);
  let sk = 100;
  if (skillItems.length === 0) { sk = 25; issues.push(issue("skills", "high", "No skills listed.", "Add a skills section grouped by category (languages, frameworks, tools).")); }
  else {
    if (skillItems.length < 5) { sk -= 25; issues.push(issue("skills", "medium", `Only ${skillItems.length} skills listed.`, "List the languages, frameworks, databases and tools you actually use.")); }
    if (skillItems.length > 35) { sk -= 15; issues.push(issue("skills", "low", `${skillItems.length} skills is a long list.`, "Keep the ones relevant to your target role; long lists read as padding.")); }
    if (skillGroups.length === 1 && skillItems.length > 10) { sk -= 10; issues.push(issue("skills", "low", "Skills are one flat list.", "Group them (e.g. Languages / Frameworks / Tools) for scanability.")); }
    const dupes = findDuplicates(skillItems);
    if (dupes.length) { sk -= 10; issues.push(issue("skills", "low", `Duplicate skills: ${dupes.join(", ")}.`, "Remove repeated entries.")); }
  }
  scores.skills = clamp(sk);

  // ── Language (spelling, repetition, clarity) ──
  let lang = 100;
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const misspelt = [...new Set(words.filter((w) => COMMON_MISSPELLINGS[w]))];
  if (misspelt.length) { lang -= Math.min(30, misspelt.length * 8); issues.push(issue("language", "high", `Possible misspellings: ${misspelt.map((w) => `${w} → ${COMMON_MISSPELLINGS[w]}`).join(", ")}.`, "Fix spelling; ATS keyword matching is exact.")); }
  const verbCounts = {};
  for (const f of fields) { const v = f.text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, ""); if (v && v.length > 3) verbCounts[v] = (verbCounts[v] ?? 0) + 1; }
  const repeated = Object.entries(verbCounts).filter(([, n]) => n >= 4).map(([v, n]) => `${v} ×${n}`);
  if (repeated.length) { lang -= 15; issues.push(issue("language", "medium", `Repetitive openings: ${repeated.join(", ")}.`, "Vary the verbs that start your bullets.")); }
  const longSentences = fields.filter((f) => f.text.split(/\s+/).length > 40).length;
  if (longSentences) { lang -= Math.min(15, longSentences * 5); issues.push(issue("language", "low", `${longSentences} very long sentence${longSentences === 1 ? "" : "s"}.`, "Keep bullets to one idea each.")); }
  const vague = fields.filter((f) => /\b(various|several|many|some|stuff|things|etc\.?|and more)\b/i.test(f.text)).length;
  if (vague) { lang -= Math.min(15, vague * 4); issues.push(issue("language", "medium", `${vague} vague phrase${vague === 1 ? "" : "s"} (“various”, “several”, “etc.”).`, "Name the specific technologies, systems or numbers.")); }
  scores.language = clamp(lang);

  // ── Consistency (dates, tense, formatting) ──
  let cons = 100;
  const dates = [...exp, ...projects, ...byType("education").flatMap((s) => s.entries ?? [])].flatMap((e) => [e.startDate, e.endDate]).filter(Boolean);
  const formats = new Set(dates.map((d) => DATE_FORMATS.find((f) => f.rx.test(d.trim()))?.name ?? "other"));
  if (formats.size > 1) { cons -= 20; issues.push(issue("consistency", "medium", `Mixed date formats (${[...formats].join(", ")}).`, "Use one format throughout, e.g. “Mar 2023 – Present”.")); }
  if (formats.has("other")) { cons -= 10; issues.push(issue("consistency", "low", "Some dates are not recognisable.", "Use Month YYYY or MM/YYYY.")); }
  for (const e of exp) if (e.endDate && e.current) { cons -= 10; issues.push(issue("consistency", "medium", `“${e.role}” is marked current but has an end date.`, "Clear the end date or untick “current”.", e.sectionId, e.id)); }
  const emptySections = sections.filter((s) => sectionLines(s).length === 0);
  if (emptySections.length) { cons -= Math.min(20, emptySections.length * 10); issues.push(issue("consistency", "low", `Empty section${emptySections.length === 1 ? "" : "s"}: ${emptySections.map((s) => s.title).join(", ")}.`, "Fill them in or hide them before exporting.")); }
  scores.consistency = clamp(cons);

  // ── ATS (reuse Phase 4 text checks) + job keywords ──
  const keywordAnalysis = { foundKeywords: [], missingOrUnverifiedKeywords: [] };
  const lower = text.toLowerCase();
  for (const k of jobKeywords) (lower.includes(String(k).toLowerCase()) ? keywordAnalysis.foundKeywords : keywordAnalysis.missingOrUnverifiedKeywords).push(k);
  const ats = runTextAtsChecks(text, keywordAnalysis).map((c) => ({ ...c, source: "phase4-ats" }));
  const atsFails = ats.filter((c) => c.status === "fail").length, atsWarns = ats.filter((c) => c.status === "warn").length;
  scores.ats = clamp(100 - atsFails * 25 - atsWarns * 10);
  for (const c of ats) if (c.status !== "pass") issues.push(issue("ats", c.status === "fail" ? "high" : "low", `${c.name}: ${c.explanation}`, "Address this for cleaner automated parsing."));
  let keywordCoverage = null;
  if (jobKeywords.length) {
    keywordCoverage = { total: jobKeywords.length, found: keywordAnalysis.foundKeywords, missing: keywordAnalysis.missingOrUnverifiedKeywords, percent: Math.round((keywordAnalysis.foundKeywords.length / jobKeywords.length) * 100) };
    if (keywordAnalysis.missingOrUnverifiedKeywords.length) issues.push(issue("keywords", "medium", `${keywordAnalysis.missingOrUnverifiedKeywords.length} job keywords are not in the resume: ${keywordAnalysis.missingOrUnverifiedKeywords.slice(0, 8).join(", ")}.`, "Add a keyword only where you genuinely have the skill; otherwise treat it as a skill gap, not a wording problem."));
  }

  const totalWeight = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  const overall = Math.round(Object.entries(CATEGORY_WEIGHTS).reduce((sum, [k, w]) => sum + (scores[k] ?? 0) * w, 0) / totalWeight);
  const order = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    method: QUALITY_METHOD,
    overall,
    label: overall >= 85 ? "Strong" : overall >= 70 ? "Good" : overall >= 50 ? "Needs work" : "Weak",
    categories: Object.entries(CATEGORY_WEIGHTS).map(([key, weight]) => ({ key, label: CATEGORY_LABELS[key], weight, score: scores[key] ?? 0, explanation: CATEGORY_EXPLANATIONS[key] })),
    issues: issues.map((i, n) => ({ id: `q${n + 1}`, ...i })),
    atsChecks: ats,
    keywordCoverage,
    jobTitle: jobTitle ?? null,
    disclaimer: "Quality scores describe how clearly the document is written and structured. They are not an ATS verdict, a job-match percentage or a prediction of interviews.",
    checkedAt: new Date().toISOString(),
  };
}

const CATEGORY_LABELS = { contact: "Contact details", summary: "Professional summary", experience: "Experience", projects: "Projects", skills: "Skills", language: "Language & clarity", consistency: "Consistency", ats: "ATS parsing" };
const CATEGORY_EXPLANATIONS = {
  contact: "Name, email, phone, link and location present and valid.",
  summary: "Present, 40–80 words, specific, free of clichés and first-person pronouns.",
  experience: "Each entry has role, employer, dates and strong, result-oriented bullets.",
  projects: "Named projects with technologies, your contribution and outcomes.",
  skills: "A grouped, relevant list without duplicates or padding.",
  language: "Spelling, varied verbs, concise sentences, no vague filler.",
  consistency: "Uniform date formats, no contradictory dates, no empty sections.",
  ats: "Phase 4 text checks: contact block, dates, bullets, section headings, keyword hits.",
};

function issue(category, severity, message, suggestion, sectionId = null, entryId = null, field = null) {
  return { category, severity, message, suggestion, sectionId, entryId, field };
}
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
function findDuplicates(items) {
  const seen = new Map();
  for (const i of items) { const k = String(i).toLowerCase().trim(); seen.set(k, (seen.get(k) ?? 0) + 1); }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
