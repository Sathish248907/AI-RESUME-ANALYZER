/**
 * resumeContentSchema.js — the structured resume document shared by the editor,
 * the AI services, quality checks and the PDF renderer.
 *
 * A version's `content` is:
 *   { personal: {...}, sections: [ { id, type, title, visible, ...typeSpecific } ] }
 * Sections are ordered; their type decides the payload shape (see below). Custom
 * sections carry free-form bullet items. Every entry has a stable `id` so AI
 * suggestions and diffs can point at exactly one field.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";

export const CONTENT_SCHEMA_VERSION = "resume-content-1.0";
export const SECTION_TYPES = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "languages", "custom"];
export const TEMPLATE_IDS = ["modern", "minimal_ats", "technical", "classic"];
export const FONT_FAMILIES = ["Helvetica", "Times", "Courier"];
export const MARGINS = ["narrow", "normal", "wide"];
export const SPACINGS = ["compact", "normal", "relaxed"];
export const HEADING_STYLES = ["uppercase", "capitalize"];
export const BULLET_STYLES = ["disc", "dash", "arrow"];

export const TEMPLATES = [
  { id: "modern", name: "Modern Professional", description: "Accent-coloured headings, clean two-tone layout, good for most roles.", defaults: { accentColor: "#2563eb", headingStyle: "uppercase", fontFamily: "Helvetica" } },
  { id: "minimal_ats", name: "Minimal ATS-Friendly", description: "Single column, plain headings, no colour — the safest choice for automated screening.", defaults: { accentColor: "#111111", headingStyle: "uppercase", fontFamily: "Helvetica" } },
  { id: "technical", name: "Technical Developer", description: "Skills first, compact bullets, monospace accents for technologies.", defaults: { accentColor: "#0f766e", headingStyle: "capitalize", fontFamily: "Helvetica" } },
  { id: "classic", name: "Classic Corporate", description: "Serif typography, centred header, traditional section order.", defaults: { accentColor: "#1f2937", headingStyle: "uppercase", fontFamily: "Times" } },
];

export const DEFAULT_FORMATTING = Object.freeze({
  fontFamily: "Helvetica",
  fontSize: 10.5,
  accentColor: "#2563eb",
  margins: "normal",
  sectionSpacing: "normal",
  headingStyle: "uppercase",
  bulletStyle: "disc",
  pageSize: "A4",
  layout: "multi", // single = warn when content exceeds one page
});

const MAX_TEXT = 4000;
const MAX_LINE = 400;
const MAX_ITEMS = 40;
const id = z.string().min(1).max(40);
const line = z.string().max(MAX_LINE);
const items = z.array(line).max(MAX_ITEMS);
const date = z.string().max(40);

export const personalSchema = z.object({
  fullName: z.string().max(120).default(""),
  title: z.string().max(120).default(""),
  email: z.string().max(160).default(""),
  phone: z.string().max(40).default(""),
  location: z.string().max(120).default(""),
  website: z.string().max(200).default(""),
  linkedin: z.string().max(200).default(""),
  github: z.string().max(200).default(""),
});

const base = { id, title: z.string().max(80), visible: z.boolean().default(true) };
export const experienceEntry = z.object({ id, role: line.default(""), company: line.default(""), location: line.default(""), startDate: date.default(""), endDate: date.default(""), current: z.boolean().default(false), bullets: items.default([]) });
export const projectEntry = z.object({ id, name: line.default(""), role: line.default(""), technologies: z.array(z.string().max(60)).max(30).default([]), link: z.string().max(300).default(""), startDate: date.default(""), endDate: date.default(""), bullets: items.default([]) });
export const educationEntry = z.object({ id, degree: line.default(""), institution: line.default(""), location: line.default(""), startDate: date.default(""), endDate: date.default(""), details: items.default([]) });
export const certificationEntry = z.object({ id, name: line.default(""), issuer: line.default(""), date: date.default(""), link: z.string().max(300).default("") });
export const skillGroup = z.object({ id, name: z.string().max(80).default(""), items: z.array(z.string().max(60)).max(60).default([]) });

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("summary"), text: z.string().max(MAX_TEXT).default("") }),
  z.object({ ...base, type: z.literal("skills"), groups: z.array(skillGroup).max(15).default([]) }),
  z.object({ ...base, type: z.literal("experience"), entries: z.array(experienceEntry).max(30).default([]) }),
  z.object({ ...base, type: z.literal("projects"), entries: z.array(projectEntry).max(30).default([]) }),
  z.object({ ...base, type: z.literal("education"), entries: z.array(educationEntry).max(15).default([]) }),
  z.object({ ...base, type: z.literal("certifications"), entries: z.array(certificationEntry).max(30).default([]) }),
  z.object({ ...base, type: z.literal("achievements"), items: items.default([]) }),
  z.object({ ...base, type: z.literal("languages"), items: items.default([]) }),
  z.object({ ...base, type: z.literal("custom"), items: items.default([]) }),
]);

export const contentSchema = z.object({
  schemaVersion: z.string().default(CONTENT_SCHEMA_VERSION),
  personal: personalSchema.default({}),
  sections: z.array(sectionSchema).max(25).default([]),
}).superRefine((c, ctx) => {
  const ids = c.sections.map((s) => s.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Section ids must be unique.", path: ["sections"] });
  if (JSON.stringify(c).length > 120_000) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Resume content is too large (max ~120 KB).", path: ["sections"] });
});

export const formattingSchema = z.object({
  fontFamily: z.enum(FONT_FAMILIES).default(DEFAULT_FORMATTING.fontFamily),
  fontSize: z.coerce.number().min(9).max(13).default(DEFAULT_FORMATTING.fontSize),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Accent colour must be a hex colour like #2563eb.").default(DEFAULT_FORMATTING.accentColor),
  margins: z.enum(MARGINS).default(DEFAULT_FORMATTING.margins),
  sectionSpacing: z.enum(SPACINGS).default(DEFAULT_FORMATTING.sectionSpacing),
  headingStyle: z.enum(HEADING_STYLES).default(DEFAULT_FORMATTING.headingStyle),
  bulletStyle: z.enum(BULLET_STYLES).default(DEFAULT_FORMATTING.bulletStyle),
  pageSize: z.literal("A4").default("A4"),
  layout: z.enum(["single", "multi"]).default(DEFAULT_FORMATTING.layout),
});

export const newId = (prefix = "s") => `${prefix}_${randomBytes(5).toString("hex")}`;

export const DEFAULT_SECTION_TITLES = { summary: "Professional Summary", skills: "Technical Skills", experience: "Work Experience", projects: "Projects", education: "Education", certifications: "Certifications", achievements: "Achievements", languages: "Languages", custom: "Additional Information" };

/** A blank section of the given type. */
export function emptySection(type, title) {
  const s = { id: newId(), type, title: title ?? DEFAULT_SECTION_TITLES[type] ?? "Section", visible: true };
  switch (type) {
    case "summary": return { ...s, text: "" };
    case "skills": return { ...s, groups: [] };
    case "experience": case "projects": case "education": case "certifications": return { ...s, entries: [] };
    default: return { ...s, items: [] };
  }
}

/** A blank resume with the standard section order. */
export function emptyContent() {
  return contentSchema.parse({ personal: {}, sections: ["summary", "skills", "experience", "projects", "education"].map((t) => emptySection(t)) });
}

/** Validate + fill defaults; throws ZodError on invalid shapes. */
export function normaliseContent(raw) {
  return contentSchema.parse(raw ?? {});
}

export function normaliseFormatting(raw, templateId) {
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  return formattingSchema.parse({ ...(tpl?.defaults ?? {}), ...(raw ?? {}) });
}

/** Human-readable plain text of the whole resume (used by quality checks and AI prompts). */
export function contentToPlainText(content, { includePersonal = true } = {}) {
  const out = [];
  const p = content.personal ?? {};
  if (includePersonal) {
    if (p.fullName) out.push(p.fullName);
    if (p.title) out.push(p.title);
    const contact = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean).join(" · ");
    if (contact) out.push(contact);
    out.push("");
  }
  for (const s of content.sections ?? []) {
    if (s.visible === false) continue;
    out.push(s.title.toUpperCase());
    for (const l of sectionLines(s)) out.push(l);
    out.push("");
  }
  return out.join("\n").trim();
}

export function sectionLines(s) {
  const lines = [];
  switch (s.type) {
    case "summary": if (s.text) lines.push(s.text); break;
    case "skills": for (const g of s.groups ?? []) lines.push(`${g.name ? g.name + ": " : ""}${(g.items ?? []).join(", ")}`); break;
    case "experience":
      for (const e of s.entries ?? []) { lines.push(`${e.role}${e.company ? " — " + e.company : ""}${e.location ? ", " + e.location : ""} (${e.startDate}${e.startDate || e.endDate || e.current ? " – " : ""}${e.current ? "Present" : e.endDate})`); for (const b of e.bullets ?? []) lines.push(`• ${b}`); }
      break;
    case "projects":
      for (const e of s.entries ?? []) { lines.push(`${e.name}${e.role ? " — " + e.role : ""}${e.technologies?.length ? " [" + e.technologies.join(", ") + "]" : ""}`); for (const b of e.bullets ?? []) lines.push(`• ${b}`); }
      break;
    case "education":
      for (const e of s.entries ?? []) { lines.push(`${e.degree}${e.institution ? " — " + e.institution : ""} (${e.startDate}${e.startDate || e.endDate ? " – " : ""}${e.endDate})`); for (const b of e.details ?? []) lines.push(`• ${b}`); }
      break;
    case "certifications": for (const e of s.entries ?? []) lines.push(`${e.name}${e.issuer ? " — " + e.issuer : ""}${e.date ? " (" + e.date + ")" : ""}`); break;
    default: for (const i of s.items ?? []) lines.push(`• ${i}`);
  }
  return lines;
}

/**
 * Every editable text field as a flat list: { sectionId, entryId, field, text }.
 * `field` is "summary", "bullet:<i>", "detail:<i>", "item:<i>" or a named field.
 */
export function listTextFields(content) {
  const out = [];
  for (const s of content.sections ?? []) {
    if (s.type === "summary") { out.push({ sectionId: s.id, entryId: null, field: "summary", text: s.text ?? "", sectionType: s.type }); continue; }
    if (s.type === "skills") { (s.groups ?? []).forEach((g) => out.push({ sectionId: s.id, entryId: g.id, field: "skills", text: (g.items ?? []).join(", "), sectionType: s.type, label: g.name })); continue; }
    if (s.type === "experience" || s.type === "projects") { for (const e of s.entries ?? []) (e.bullets ?? []).forEach((b, i) => out.push({ sectionId: s.id, entryId: e.id, field: `bullet:${i}`, text: b, sectionType: s.type, label: e.role ?? e.name })); continue; }
    if (s.type === "education") { for (const e of s.entries ?? []) (e.details ?? []).forEach((b, i) => out.push({ sectionId: s.id, entryId: e.id, field: `detail:${i}`, text: b, sectionType: s.type, label: e.degree })); continue; }
    if (s.type === "certifications") continue;
    (s.items ?? []).forEach((b, i) => out.push({ sectionId: s.id, entryId: null, field: `item:${i}`, text: b, sectionType: s.type }));
  }
  return out;
}

/** Return a copy of `content` with one text field replaced. Returns null if the target no longer exists. */
export function applyTextField(content, { sectionId, entryId, field }, text) {
  const c = JSON.parse(JSON.stringify(content));
  const s = c.sections.find((x) => x.id === sectionId);
  if (!s) return null;
  if (field === "summary" && s.type === "summary") { s.text = text; return c; }
  if (field === "skills" && s.type === "skills") { const g = (s.groups ?? []).find((x) => x.id === entryId); if (!g) return null; g.items = text.split(/,|\n/).map((x) => x.trim()).filter(Boolean).slice(0, 60); return c; }
  const [kind, idxRaw] = field.split(":");
  const idx = Number(idxRaw);
  if (kind === "bullet") { const e = (s.entries ?? []).find((x) => x.id === entryId); if (!e || !Array.isArray(e.bullets) || idx >= e.bullets.length) return null; e.bullets[idx] = text; return c; }
  if (kind === "detail") { const e = (s.entries ?? []).find((x) => x.id === entryId); if (!e || !Array.isArray(e.details) || idx >= e.details.length) return null; e.details[idx] = text; return c; }
  if (kind === "item") { if (!Array.isArray(s.items) || idx >= s.items.length) return null; s.items[idx] = text; return c; }
  return null;
}

/** Read one text field (null if missing). */
export function readTextField(content, { sectionId, entryId, field }) {
  return listTextFields(content).find((f) => f.sectionId === sectionId && (f.entryId ?? null) === (entryId ?? null) && f.field === field)?.text ?? null;
}
