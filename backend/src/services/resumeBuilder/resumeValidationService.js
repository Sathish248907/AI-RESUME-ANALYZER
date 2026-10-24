/**
 * resumeValidationService.js — document validation (resume-validation-1.0) and
 * the registry of safe automatic fixes.
 *
 * "Safe" has one meaning here: a fix is safe only when it is purely mechanical
 * and adds no information — reformatting a date, removing an exact duplicate,
 * stripping a decorative glyph, correcting an unambiguous misspelling, renaming
 * a heading to its conventional form. Anything that would need a fact the
 * resume does not contain (a metric, a technology, an employer, a date the user
 * never entered) is NOT a fix: it is returned as a question for the user, or
 * left to the AI suggestion flow where the user reviews every change.
 *
 * Validation findings are addressed to a section / entry / field so the editor
 * can show them inline, and they carry the same `autoFix` descriptors the ATS
 * action plan uses, so one Apply-Fix implementation serves both panels.
 */
import { listTextFields, sectionLines, normaliseContent } from "./resumeContentSchema.js";
import { scoreAtsReadiness, dateFormatName, linkProblems, STANDARD_HEADINGS } from "./atsScoringService.js";

export const VALIDATION_METHOD = "resume-validation-1.0";

const norm = (s) => String(s ?? "").toLowerCase().trim();
const words = (s) => String(s ?? "").split(/\s+/).filter(Boolean);

/** Unambiguous misspellings only — never a word that is also a valid spelling. */
export const COMMON_MISSPELLINGS = Object.freeze({
  recieve: "receive", seperate: "separate", acheive: "achieve", occured: "occurred", managment: "management",
  enviroment: "environment", developement: "development", definately: "definitely", succesful: "successful",
  responsibilty: "responsibility", experiance: "experience", knowlege: "knowledge", comunication: "communication",
  javascrpit: "JavaScript", pyhton: "Python", lenght: "length", recomend: "recommend", acomplished: "accomplished",
  colaborated: "collaborated", efficency: "efficiency", mantained: "maintained", perfomance: "performance",
  requirment: "requirement", sucessfully: "successfully", tecnical: "technical", archtecture: "architecture",
  depolyed: "deployed", intergrated: "integrated", optimisied: "optimised", buisness: "business",
});

/** Decorative glyphs people paste into bullet text; the template draws real bullets. */
const DECORATIVE_RX = /[•▪●‣⁃∙☑✔✓➜➤→▶❖◦]/g;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_WORDS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };

const deep = (c) => JSON.parse(JSON.stringify(c));

/**
 * Full validation report. Reuses the ATS engine's deterministic findings and
 * adds document-level checks the score does not itself penalise.
 *
 * @param {object} content
 * @param {{ jobKeywords?: string[], jobTitle?: string, targetRole?: string, formatting?: object, templateId?: string }} [opts]
 */
export function runValidation(content, opts = {}) {
  const issues = [];
  let n = 0;
  const push = (i) => { issues.push({ id: `v${++n}`, sectionId: null, entryId: null, field: null, autoFix: null, ...i }); };

  const fields = listTextFields(content);
  const sections = (content.sections ?? []).filter((s) => s.visible !== false);
  const byType = (t) => sections.filter((s) => s.type === t);

  // ── Spelling (dictionary-limited, so we say so) ──
  const misspelt = new Map();
  for (const f of fields) {
    for (const w of String(f.text).toLowerCase().match(/[a-z]{4,}/g) ?? []) {
      if (COMMON_MISSPELLINGS[w]) {
        if (!misspelt.has(w)) misspelt.set(w, []);
        misspelt.get(w).push(f);
      }
    }
  }
  for (const [wrong, where] of misspelt) {
    const f = where[0];
    push({
      category: "grammar", severity: "high",
      title: `Likely misspelling: “${wrong}”`,
      detail: `Found in ${where.length} field${where.length === 1 ? "" : "s"}. The conventional spelling is “${COMMON_MISSPELLINGS[wrong]}”.`,
      action: `Replace “${wrong}” with “${COMMON_MISSPELLINGS[wrong]}”.`,
      sectionId: f.sectionId, entryId: f.entryId, field: f.field,
      autoFix: { kind: "fix_spelling", label: `Correct “${wrong}” → “${COMMON_MISSPELLINGS[wrong]}”`, value: wrong },
    });
  }

  // ── Paragraph length ──
  for (const f of fields) {
    const w = words(f.text).length;
    if (w > 60) {
      push({ category: "readability", severity: "medium", title: `A ${w}-word paragraph will not be read`, detail: `“${String(f.text).slice(0, 90)}…”`, action: "Break it into separate bullets of one idea each.", sectionId: f.sectionId, entryId: f.entryId, field: f.field });
    }
  }

  // ── Duplicate bullets, within and across entries ──
  const seen = new Map();
  for (const f of fields) {
    const k = norm(f.text);
    if (!k || k.length < 12) continue;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(f);
  }
  for (const [, group] of seen) {
    if (group.length < 2) continue;
    push({ category: "duplication", severity: "medium", title: "The same text appears more than once", detail: `“${String(group[0].text).slice(0, 80)}${String(group[0].text).length > 80 ? "…" : ""}” appears ${group.length} times.`, action: "Keep the strongest occurrence and delete or rewrite the rest.", sectionId: group[1].sectionId, entryId: group[1].entryId, field: group[1].field, autoFix: { kind: "dedupe_bullets", label: "Remove duplicate bullets" } });
  }

  // ── Repeated skills / keyword stuffing in the skills section ──
  const skillSections = byType("skills");
  for (const s of skillSections) {
    const items = (s.groups ?? []).flatMap((g) => g.items ?? []);
    const counts = new Map();
    for (const i of items) { const k = norm(i); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
    const dupes = [...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
    if (dupes.length) {
      push({ category: "duplication", severity: "low", title: `${dupes.length} skill${dupes.length === 1 ? " is" : "s are"} listed more than once`, detail: dupes.join(", "), action: "Remove the repeated entries.", sectionId: s.id, autoFix: { kind: "dedupe_skills", label: "Remove duplicate skills" } });
    }
    if (items.length > 45) {
      push({ category: "keywords", severity: "medium", title: `${items.length} skills is long enough to read as keyword stuffing`, detail: "Very long skill lists lose the reader and do not improve matching.", action: "Keep what is relevant to your target role; cut the rest.", sectionId: s.id });
    }
  }

  // ── Unclear project descriptions ──
  for (const s of byType("projects")) {
    for (const e of s.entries ?? []) {
      const bl = (e.bullets ?? []).filter((b) => String(b).trim());
      const label = e.name || "A project";
      if (bl.length && !bl.some((b) => /\b(built|designed|implemented|developed|created|wrote|led|owned|architected|integrated|deployed|automated|refactored|migrated)\b/i.test(b))) {
        push({ category: "projects", severity: "medium", title: `“${label}” does not say what you personally did`, detail: "The description explains the project but not your own contribution.", action: "State which parts you built, in the first position of a bullet. On a team project, say what was yours.", sectionId: s.id, entryId: e.id, needsUserInput: true, question: `On “${label}”, which parts did you build or own yourself?` });
      }
      if (!e.link && !(e.technologies ?? []).length) {
        push({ category: "projects", severity: "low", title: `“${label}” has no technologies and no link`, detail: "Nothing connects the project to a verifiable skill.", action: "Add the stack used, and a repository or demo link if there is one.", sectionId: s.id, entryId: e.id });
      }
    }
  }

  // ── Missing facts the AI must never invent — asked, not fixed ──
  for (const s of [...byType("experience"), ...byType("projects")]) {
    for (const e of s.entries ?? []) {
      const bl = (e.bullets ?? []).filter((b) => String(b).trim());
      if (bl.length && !bl.some((b) => /\d/.test(b))) {
        const label = e.role || e.name || e.company || "this entry";
        push({
          category: "impact", severity: "low",
          title: `No numbers anywhere in “${label}”`,
          detail: "Impact is easiest to judge from a figure, but a figure can only come from you.",
          action: "If you know the real number — users, requests, time saved, team size, percentage — add it. If you do not, leave the bullet qualitative rather than estimating.",
          sectionId: s.id, entryId: e.id, needsUserInput: true,
          question: `For “${label}”, do you know any real figures — users served, time saved, volume handled, team size?`,
        });
      }
    }
  }

  // ── Links ──
  for (const l of linkProblems(content.personal ?? {}, content)) {
    push({ category: "links", severity: "medium", title: `The ${l.label} link looks malformed`, detail: `“${l.value}” — ${l.reason}.`, action: "Use the complete address, e.g. linkedin.com/in/yourname.", field: l.field });
  }

  // ── Dates ──
  const dated = [...byType("experience"), ...byType("projects"), ...byType("education")].flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id })));
  const unrecognised = dated.flatMap((e) => [["startDate", e.startDate], ["endDate", e.endDate]].filter(([, v]) => String(v ?? "").trim() && !dateFormatName(v)).map(([k, v]) => ({ entry: e, key: k, value: v })));
  if (unrecognised.length) {
    push({ category: "dates", severity: "medium", title: `${unrecognised.length} date${unrecognised.length === 1 ? "" : "s"} in no conventional format`, detail: unrecognised.slice(0, 4).map((u) => `“${u.value}”`).join(", "), action: "Use “Mar 2023” or “03/2023”.", sectionId: unrecognised[0].entry.sectionId, entryId: unrecognised[0].entry.id, autoFix: { kind: "normalise_dates", label: "Reformat all dates as “Mon YYYY”" } });
  }
  for (const e of dated) {
    if (e.current && String(e.endDate ?? "").trim()) {
      push({ category: "dates", severity: "medium", title: `“${e.role || e.name || "An entry"}” is marked current but has an end date`, detail: `End date: “${e.endDate}”.`, action: "Clear the end date, or untick “current”.", sectionId: e.sectionId, entryId: e.id, autoFix: { kind: "fix_current_dates", label: "Clear the end date on current roles" } });
    }
    const a = parseMonthYear(e.startDate), b = parseMonthYear(e.endDate);
    if (a && b && b < a) {
      push({ category: "dates", severity: "high", title: `“${e.role || e.name || e.degree || "An entry"}” ends before it starts`, detail: `${e.startDate} – ${e.endDate}.`, action: "Correct the start or end date.", sectionId: e.sectionId, entryId: e.id });
    }
  }

  // ── Headings ──
  for (const s of sections) {
    const standard = STANDARD_HEADINGS[s.type] ?? [];
    if (!standard.length || sectionLines(s).length === 0) continue;
    if (!standard.includes(norm(s.title))) {
      const suggested = titleCase(standard[0]);
      push({ category: "structure", severity: "medium", title: `“${s.title}” is not a heading parsers reliably recognise`, detail: `Conventional alternatives: ${standard.slice(0, 3).map(titleCase).join(", ")}.`, action: `Rename it to “${suggested}”.`, sectionId: s.id, autoFix: { kind: "rename_heading", label: `Rename to “${suggested}”`, sectionId: s.id, value: suggested } });
    }
  }

  // ── Decorative symbols and stray whitespace ──
  const symbolFields = fields.filter((f) => DECORATIVE_RX.test(f.text));
  if (symbolFields.length) {
    push({ category: "formatting", severity: "low", title: `${symbolFields.length} field${symbolFields.length === 1 ? " contains" : "s contain"} decorative symbols`, detail: "Characters such as ● ▪ ➜ ✔ typed into the text may export as question marks.", action: "Remove them; the template draws your bullets.", sectionId: symbolFields[0].sectionId, entryId: symbolFields[0].entryId, field: symbolFields[0].field, autoFix: { kind: "strip_symbols", label: "Remove decorative symbols from the text" } });
  }
  const messy = fields.filter((f) => f.text !== String(f.text).trim() || /\s{2,}/.test(f.text));
  if (messy.length) {
    push({ category: "formatting", severity: "low", title: `${messy.length} field${messy.length === 1 ? " has" : "s have"} stray spacing`, detail: "Leading, trailing or doubled spaces.", action: "Tidy the spacing.", sectionId: messy[0].sectionId, entryId: messy[0].entryId, field: messy[0].field, autoFix: { kind: "trim_whitespace", label: "Tidy stray spacing" } });
  }

  // ── Empty visible sections ──
  const empty = sections.filter((s) => sectionLines(s).length === 0);
  if (empty.length) {
    push({ category: "structure", severity: "low", title: `${empty.length} visible section${empty.length === 1 ? " is" : "s are"} empty`, detail: empty.map((s) => s.title).join(", "), action: "Fill them in, or hide them so they do not print.", sectionId: empty[0].id, autoFix: { kind: "hide_empty_sections", label: "Hide the empty sections" } });
  }

  const SEV = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => SEV[a.severity] - SEV[b.severity]);

  const bySection = {};
  for (const i of issues) {
    const k = i.sectionId ?? "personal";
    (bySection[k] ??= []).push(i.id);
  }

  return {
    method: VALIDATION_METHOD,
    issues,
    bySection,
    counts: {
      total: issues.length,
      high: issues.filter((i) => i.severity === "high").length,
      medium: issues.filter((i) => i.severity === "medium").length,
      low: issues.filter((i) => i.severity === "low").length,
      autoFixable: issues.filter((i) => i.autoFix).length,
      needsUserInput: issues.filter((i) => i.needsUserInput).length,
    },
    availableFixes: availableAutoFixes(content),
    notes: [
      "Spelling uses a fixed list of common misspellings, not a full dictionary, so it will miss some errors and never flags a correctly spelled word.",
      "Links are checked for obvious malformation only; nothing is fetched, so a well-formed but dead link is not detected.",
      "Anything that would need a fact the resume does not contain is raised as a question rather than fixed.",
    ],
    checkedAt: new Date().toISOString(),
  };
}

// ─── Safe automatic fixes ─────────────────────────────────────────────────────

/**
 * Each fix: pure function content → { content, changed, summary }.
 * `changed` is false when there was nothing to do, so the caller can avoid
 * writing a no-op version and can tell the user honestly.
 */
export const AUTO_FIXES = {
  dedupe_skills: {
    label: "Remove duplicate skills",
    description: "Drops repeated entries inside each skill group, and entries already present in an earlier group. Keeps the first spelling you used.",
    apply(content) {
      const c = deep(content);
      const removed = [];
      for (const s of c.sections ?? []) {
        if (s.type !== "skills") continue;
        const taken = new Set();
        for (const g of s.groups ?? []) {
          g.items = (g.items ?? []).filter((i) => {
            const k = norm(i);
            if (!k) return false;
            if (taken.has(k)) { removed.push(i); return false; }
            taken.add(k);
            return true;
          });
        }
      }
      return { content: c, changed: removed.length > 0, summary: removed.length ? `Removed ${removed.length} duplicate skill${removed.length === 1 ? "" : "s"}: ${removed.slice(0, 8).join(", ")}.` : "No duplicate skills found." };
    },
  },

  dedupe_bullets: {
    label: "Remove duplicate bullets",
    description: "Removes bullets whose text is an exact repeat (ignoring case and spacing) of an earlier bullet in the same resume. Keeps the first.",
    apply(content) {
      const c = deep(content);
      const seen = new Set();
      let removed = 0;
      const filter = (arr) => (arr ?? []).filter((b) => {
        const k = norm(b);
        if (!k) return true; // empty bullets are the editor's own placeholders
        if (seen.has(k)) { removed += 1; return false; }
        seen.add(k);
        return true;
      });
      for (const s of c.sections ?? []) {
        for (const e of s.entries ?? []) {
          if (Array.isArray(e.bullets)) e.bullets = filter(e.bullets);
          if (Array.isArray(e.details)) e.details = filter(e.details);
        }
        if (Array.isArray(s.items)) s.items = filter(s.items);
      }
      return { content: c, changed: removed > 0, summary: removed ? `Removed ${removed} duplicate bullet${removed === 1 ? "" : "s"}.` : "No duplicate bullets found." };
    },
  },

  normalise_dates: {
    label: "Reformat all dates as “Mon YYYY”",
    description: "Rewrites recognisable dates to the “Mar 2023” form. A value that gives only a year stays a year — no month is invented — and anything unparseable is left untouched and still reported.",
    apply(content) {
      const c = deep(content);
      const changes = [];
      const skipped = [];
      const fix = (v) => {
        const raw = String(v ?? "").trim();
        if (!raw) return raw;
        if (/^(present|current|ongoing|now)$/i.test(raw)) return raw;
        const parsed = parseMonthYear(raw);
        if (!parsed) { skipped.push(raw); return raw; }
        if (parsed.monthKnown === false) return String(parsed.year); // year-only stays year-only
        const out = `${MONTHS[parsed.month]} ${parsed.year}`;
        if (out !== raw) changes.push(`${raw} → ${out}`);
        return out;
      };
      for (const s of c.sections ?? []) {
        for (const e of s.entries ?? []) {
          if ("startDate" in e) e.startDate = fix(e.startDate);
          if ("endDate" in e) e.endDate = fix(e.endDate);
          if ("date" in e) e.date = fix(e.date);
        }
      }
      return {
        content: c,
        changed: changes.length > 0,
        summary: changes.length
          ? `Reformatted ${changes.length} date${changes.length === 1 ? "" : "s"}: ${changes.slice(0, 6).join(", ")}.${skipped.length ? ` ${skipped.length} value${skipped.length === 1 ? "" : "s"} could not be parsed and were left as they are: ${[...new Set(skipped)].slice(0, 4).join(", ")}.` : ""}`
          : `Nothing to reformat.${skipped.length ? ` ${skipped.length} unparseable value${skipped.length === 1 ? "" : "s"} left unchanged: ${[...new Set(skipped)].slice(0, 4).join(", ")} — please correct these by hand.` : ""}`,
      };
    },
  },

  fix_current_dates: {
    label: "Clear the end date on current roles",
    description: "For entries ticked as current, clears the contradicting end date. The “current” flag is kept, because only you know which of the two is right — if the role has in fact ended, untick it and set the date.",
    apply(content) {
      const c = deep(content);
      const fixed = [];
      for (const s of c.sections ?? []) {
        for (const e of s.entries ?? []) {
          if (e.current && String(e.endDate ?? "").trim()) { fixed.push(`${e.role || e.name || "entry"} (was “${e.endDate}”)`); e.endDate = ""; }
        }
      }
      return { content: c, changed: fixed.length > 0, summary: fixed.length ? `Cleared the end date on ${fixed.length} current entr${fixed.length === 1 ? "y" : "ies"}: ${fixed.join(", ")}. If one of those roles has actually ended, untick “current” and re-enter the date.` : "No contradicting dates found." };
    },
  },

  strip_symbols: {
    label: "Remove decorative symbols from the text",
    description: "Deletes bullet glyphs and arrows typed into the content itself. Your words are untouched and the template keeps drawing real bullets.",
    apply(content) {
      const c = deep(content);
      let n = 0;
      const clean = (t) => {
        const out = String(t ?? "").replace(DECORATIVE_RX, "").replace(/\s{2,}/g, " ").trim();
        if (out !== t) n += 1;
        return out;
      };
      for (const s of c.sections ?? []) {
        if (typeof s.text === "string") s.text = clean(s.text);
        if (Array.isArray(s.items)) s.items = s.items.map(clean);
        for (const g of s.groups ?? []) if (Array.isArray(g.items)) g.items = g.items.map(clean);
        for (const e of s.entries ?? []) {
          if (Array.isArray(e.bullets)) e.bullets = e.bullets.map(clean);
          if (Array.isArray(e.details)) e.details = e.details.map(clean);
        }
      }
      return { content: c, changed: n > 0, summary: n ? `Cleaned decorative symbols out of ${n} field${n === 1 ? "" : "s"}.` : "No decorative symbols found." };
    },
  },

  trim_whitespace: {
    label: "Tidy stray spacing",
    description: "Trims leading and trailing spaces and collapses runs of spaces. No wording changes.",
    apply(content) {
      const c = deep(content);
      let n = 0;
      const clean = (t) => {
        const out = String(t ?? "").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
        if (out !== t) n += 1;
        return out;
      };
      for (const s of c.sections ?? []) {
        if (typeof s.text === "string") s.text = clean(s.text);
        if (Array.isArray(s.items)) s.items = s.items.map(clean);
        for (const g of s.groups ?? []) { if (typeof g.name === "string") g.name = clean(g.name); if (Array.isArray(g.items)) g.items = g.items.map(clean); }
        for (const e of s.entries ?? []) {
          for (const k of ["role", "company", "location", "name", "degree", "institution", "issuer", "link"]) if (typeof e[k] === "string") e[k] = clean(e[k]);
          if (Array.isArray(e.bullets)) e.bullets = e.bullets.map(clean);
          if (Array.isArray(e.details)) e.details = e.details.map(clean);
        }
      }
      for (const k of Object.keys(c.personal ?? {})) if (typeof c.personal[k] === "string") c.personal[k] = clean(c.personal[k]);
      return { content: c, changed: n > 0, summary: n ? `Tidied spacing in ${n} field${n === 1 ? "" : "s"}.` : "Spacing was already clean." };
    },
  },

  fix_spelling: {
    label: "Correct common misspellings",
    description: "Replaces words from a fixed list of unambiguous misspellings, matching whole words and preserving your capitalisation. Nothing else is rewritten.",
    /** @param {{ value?: string }} [options] one misspelling, or all of them when omitted */
    apply(content, options = {}) {
      const c = deep(content);
      const only = options.value ? norm(options.value) : null;
      const pairs = Object.entries(COMMON_MISSPELLINGS).filter(([w]) => !only || w === only);
      const applied = [];
      const clean = (t) => {
        let out = String(t ?? "");
        for (const [wrong, right] of pairs) {
          const rx = new RegExp(`\\b${wrong}\\b`, "gi");
          if (!rx.test(out)) continue;
          out = out.replace(rx, (m) => (m[0] === m[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right));
          applied.push(`${wrong} → ${right}`);
        }
        return out;
      };
      for (const s of c.sections ?? []) {
        if (typeof s.text === "string") s.text = clean(s.text);
        if (Array.isArray(s.items)) s.items = s.items.map(clean);
        for (const g of s.groups ?? []) if (Array.isArray(g.items)) g.items = g.items.map(clean);
        for (const e of s.entries ?? []) {
          for (const k of ["role", "company", "name", "degree", "institution", "issuer"]) if (typeof e[k] === "string") e[k] = clean(e[k]);
          if (Array.isArray(e.bullets)) e.bullets = e.bullets.map(clean);
          if (Array.isArray(e.details)) e.details = e.details.map(clean);
        }
      }
      const unique = [...new Set(applied)];
      return { content: c, changed: unique.length > 0, summary: unique.length ? `Corrected ${unique.join(", ")}.` : "No listed misspellings found." };
    },
  },

  rename_heading: {
    label: "Use the conventional heading",
    description: "Renames one section's heading to the standard wording for its type. Only the heading changes.",
    /** @param {{ sectionId: string, value?: string }} options */
    apply(content, options = {}) {
      const c = deep(content);
      const s = (c.sections ?? []).find((x) => x.id === options.sectionId);
      if (!s) return { content, changed: false, summary: "That section no longer exists." };
      const standard = STANDARD_HEADINGS[s.type] ?? [];
      const target = options.value?.trim() || (standard.length ? titleCase(standard[0]) : null);
      if (!target) return { content, changed: false, summary: "There is no conventional heading for a custom section — choose a clear name yourself." };
      if (standard.length && !standard.includes(norm(target))) return { content, changed: false, summary: `“${target}” is not one of the conventional headings for a ${s.type} section.` };
      if (s.title === target) return { content, changed: false, summary: "That heading is already conventional." };
      const before = s.title;
      s.title = target;
      return { content: c, changed: true, summary: `Renamed “${before}” to “${target}”.` };
    },
  },

  hide_empty_sections: {
    label: "Hide the empty sections",
    description: "Sets empty sections to hidden so they do not print. Nothing is deleted — they stay in the editor and reappear as soon as you add content.",
    apply(content) {
      const c = deep(content);
      const hidden = [];
      for (const s of c.sections ?? []) {
        if (s.visible !== false && sectionLines(s).length === 0) { s.visible = false; hidden.push(s.title); }
      }
      return { content: c, changed: hidden.length > 0, summary: hidden.length ? `Hid ${hidden.length} empty section${hidden.length === 1 ? "" : "s"}: ${hidden.join(", ")}. They are still in the editor.` : "No empty visible sections." };
    },
  },
};

export const AUTO_FIX_KINDS = Object.keys(AUTO_FIXES);

/** Which fixes would actually change something right now, with a preview of what. */
export function availableAutoFixes(content) {
  const out = [];
  for (const [kind, fix] of Object.entries(AUTO_FIXES)) {
    if (kind === "rename_heading") continue; // needs a specific sectionId
    let res;
    try { res = fix.apply(content, {}); } catch { continue; }
    if (res.changed) out.push({ kind, label: fix.label, description: fix.description, preview: res.summary });
  }
  return out;
}

/**
 * Apply one fix. Returns the new content plus a before/after score so the user
 * sees the real effect instead of a promised one.
 *
 * @param {object} content
 * @param {string} kind
 * @param {object} [options]
 * @param {object} [scoreOpts] passed to scoreAtsReadiness for the before/after comparison
 */
export function applyAutoFix(content, kind, options = {}, scoreOpts = null) {
  const fix = AUTO_FIXES[kind];
  if (!fix) return { ok: false, reason: `Unknown fix “${kind}”.` };
  const before = normaliseContent(content);
  const res = fix.apply(before, options);
  if (!res.changed) return { ok: true, changed: false, summary: res.summary, content: before, scoreBefore: null, scoreAfter: null };
  const after = normaliseContent(res.content);
  let scoreBefore = null, scoreAfter = null;
  if (scoreOpts) {
    scoreBefore = scoreAtsReadiness(before, scoreOpts).overall;
    scoreAfter = scoreAtsReadiness(after, scoreOpts).overall;
  }
  return { ok: true, changed: true, summary: res.summary, content: after, scoreBefore, scoreAfter, label: fix.label };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a resume date into { year, month, monthKnown } or null.
 * Accepts "Mar 2023", "March 2023", "03/2023", "2023-03", "2023".
 */
export function parseMonthYear(value) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  let m;
  if ((m = /^([a-z]+)\.?\s+(\d{4})$/i.exec(v))) {
    const mo = MONTH_WORDS[m[1].toLowerCase()];
    if (mo === undefined) return null;
    return withValueOf({ year: Number(m[2]), month: mo, monthKnown: true });
  }
  if ((m = /^(\d{1,2})\/(\d{4})$/.exec(v))) {
    const mo = Number(m[1]) - 1;
    if (mo < 0 || mo > 11) return null;
    return withValueOf({ year: Number(m[2]), month: mo, monthKnown: true });
  }
  if ((m = /^(\d{4})-(\d{2})$/.exec(v))) {
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) return null;
    return withValueOf({ year: Number(m[1]), month: mo, monthKnown: true });
  }
  if ((m = /^(\d{4})$/.exec(v))) return withValueOf({ year: Number(m[1]), month: 0, monthKnown: false });
  return null;
}
/**
 * Comparable with < and > so chronology checks read naturally. `valueOf` is
 * non-enumerable so the result still spreads and serialises as plain data.
 */
function withValueOf(d) {
  return Object.defineProperty(d, "valueOf", { value() { return this.year * 12 + this.month; }, enumerable: false });
}

const titleCase = (s) => String(s).split(" ").map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
