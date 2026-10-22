/**
 * resumeDiffService.js — deterministic comparison of two resume contents.
 * Produces a change list (section / entry / field level) and a short summary,
 * used for version comparison, regeneration previews and "what changed".
 */
import { listTextFields, sectionLines } from "./resumeContentSchema.js";

export const DIFF_METHOD = "resume-diff-1.0";

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * @returns {{ method, summary: { sectionsAdded, sectionsRemoved, sectionsReordered, entriesAdded, entriesRemoved, fieldsChanged, personalChanged, wordsBefore, wordsAfter }, changes: Array }}
 */
export function compareContents(before, afterRaw) {
  const changes = [];
  const after = aliasSectionIds(before, afterRaw);
  const bSecs = before.sections ?? [], aSecs = after.sections ?? [];
  const bById = new Map(bSecs.map((s) => [s.id, s])), aById = new Map(aSecs.map((s) => [s.id, s]));

  // Personal
  const personalChanged = [];
  for (const k of new Set([...Object.keys(before.personal ?? {}), ...Object.keys(after.personal ?? {})])) {
    const b = norm(before.personal?.[k]), a = norm(after.personal?.[k]);
    if (b !== a) { personalChanged.push(k); changes.push({ kind: "personal", field: k, before: b, after: a }); }
  }

  // Sections added / removed / renamed / hidden / reordered
  for (const s of aSecs) if (!bById.has(s.id)) changes.push({ kind: "section_added", sectionId: s.id, title: s.title, type: s.type, lines: sectionLines(s).length });
  for (const s of bSecs) if (!aById.has(s.id)) changes.push({ kind: "section_removed", sectionId: s.id, title: s.title, type: s.type, lines: sectionLines(s).length });
  for (const s of aSecs) {
    const b = bById.get(s.id); if (!b) continue;
    if (norm(b.title) !== norm(s.title)) changes.push({ kind: "section_renamed", sectionId: s.id, before: b.title, after: s.title });
    if ((b.visible !== false) !== (s.visible !== false)) changes.push({ kind: s.visible === false ? "section_hidden" : "section_shown", sectionId: s.id, title: s.title });
  }
  const commonOrderB = bSecs.filter((s) => aById.has(s.id)).map((s) => s.id);
  const commonOrderA = aSecs.filter((s) => bById.has(s.id)).map((s) => s.id);
  const reordered = commonOrderA.some((id, i) => commonOrderB[i] !== id);
  if (reordered) changes.push({ kind: "sections_reordered", before: commonOrderB, after: commonOrderA });

  // Entries (experience / projects / education / certifications / skill groups)
  let entriesAdded = 0, entriesRemoved = 0;
  for (const s of aSecs) {
    const b = bById.get(s.id); if (!b) continue;
    const bEntries = entryList(b), aEntries = entryList(s);
    const bIds = new Map(bEntries.map((e) => [e.id, e])), aIds = new Map(aEntries.map((e) => [e.id, e]));
    for (const e of aEntries) if (!bIds.has(e.id)) { entriesAdded++; changes.push({ kind: "entry_added", sectionId: s.id, sectionTitle: s.title, entryId: e.id, label: entryLabel(e) }); }
    for (const e of bEntries) if (!aIds.has(e.id)) { entriesRemoved++; changes.push({ kind: "entry_removed", sectionId: s.id, sectionTitle: s.title, entryId: e.id, label: entryLabel(e) }); }
    for (const e of aEntries) {
      const be = bIds.get(e.id); if (!be) continue;
      for (const k of ["role", "company", "location", "startDate", "endDate", "current", "name", "degree", "institution", "issuer", "date", "link"]) {
        if (k in e || k in be) { const bv = norm(be[k]), av = norm(e[k]); if (bv !== av) changes.push({ kind: "entry_field", sectionId: s.id, sectionTitle: s.title, entryId: e.id, label: entryLabel(e), field: k, before: bv, after: av }); }
      }
      if (Array.isArray(e.technologies) || Array.isArray(be.technologies)) {
        const bt = (be.technologies ?? []).join(", "), at = (e.technologies ?? []).join(", ");
        if (norm(bt) !== norm(at)) changes.push({ kind: "entry_field", sectionId: s.id, sectionTitle: s.title, entryId: e.id, label: entryLabel(e), field: "technologies", before: bt, after: at });
      }
      const bList = be.bullets ?? be.details ?? be.items ?? null, aList = e.bullets ?? e.details ?? e.items ?? null;
      if (bList || aList) diffLists(bList ?? [], aList ?? [], (c) => changes.push({ ...c, sectionId: s.id, sectionTitle: s.title, entryId: e.id, label: entryLabel(e) }));
    }
    if (s.type === "summary" && norm(b.text) !== norm(s.text)) changes.push({ kind: "text_changed", sectionId: s.id, sectionTitle: s.title, field: "summary", before: norm(b.text), after: norm(s.text) });
    if (["achievements", "languages", "custom"].includes(s.type)) diffLists(b.items ?? [], s.items ?? [], (c) => changes.push({ ...c, sectionId: s.id, sectionTitle: s.title }));
  }

  const fieldsChanged = changes.filter((c) => ["text_changed", "entry_field", "line_changed", "line_added", "line_removed", "personal"].includes(c.kind)).length;
  const wc = (c) => listTextFields(c).reduce((n, f) => n + f.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    method: DIFF_METHOD,
    summary: {
      sectionsAdded: changes.filter((c) => c.kind === "section_added").length,
      sectionsRemoved: changes.filter((c) => c.kind === "section_removed").length,
      sectionsReordered: reordered,
      entriesAdded, entriesRemoved, fieldsChanged, personalChanged,
      wordsBefore: wc(before), wordsAfter: wc(after),
      totalChanges: changes.length,
    },
    changes,
  };
}

/** Sections that exist in both documents but with different ids (e.g. re-structured copies) are matched by type + title. */
function aliasSectionIds(before, after) {
  const bIds = new Set((before.sections ?? []).map((s) => s.id));
  const used = new Set();
  const sections = (after.sections ?? []).map((s) => {
    if (bIds.has(s.id)) return s;
    const match = (before.sections ?? []).find((b) => !used.has(b.id) && b.type === s.type && norm(b.title).toLowerCase() === norm(s.title).toLowerCase() && !(after.sections ?? []).some((x) => x.id === b.id));
    if (!match) return s;
    used.add(match.id);
    return aliasEntryIds(match, { ...s, id: match.id });
  });
  return { ...after, sections };
}
/** Entries with different ids are paired by position when their headline fields match. */
function aliasEntryIds(bSection, aSection) {
  const bEntries = entryList(bSection), aEntries = entryList(aSection);
  if (!bEntries.length || !aEntries.length) return aSection;
  const bIds = new Set(bEntries.map((e) => e.id));
  const used = new Set();
  const remap = aEntries.map((e) => {
    if (bIds.has(e.id)) return e;
    const match = bEntries.find((b) => !used.has(b.id) && norm(entryLabel(b)).toLowerCase() === norm(entryLabel(e)).toLowerCase());
    if (!match) return e;
    used.add(match.id);
    return { ...e, id: match.id };
  });
  if (aSection.type === "skills") return { ...aSection, groups: remap };
  return { ...aSection, entries: remap };
}

function entryList(s) {
  if (s.type === "skills") return (s.groups ?? []).map((g) => ({ ...g, items: g.items }));
  return s.entries ?? [];
}
function entryLabel(e) { return e.role || e.name || e.degree || e.company || e.institution || (Array.isArray(e.items) ? `Skill group${e.name ? `: ${e.name}` : ""}` : "Entry"); }

/** Line-level diff with "changed" detection by position when both lists have the index. */
function diffLists(before, after, push) {
  const max = Math.max(before.length, after.length);
  const bNorm = before.map(norm), aNorm = after.map(norm);
  for (let i = 0; i < max; i++) {
    const b = bNorm[i], a = aNorm[i];
    if (b === undefined && a !== undefined) { if (!bNorm.includes(a)) push({ kind: "line_added", index: i, after: a }); }
    else if (a === undefined && b !== undefined) { if (!aNorm.includes(b)) push({ kind: "line_removed", index: i, before: b }); }
    else if (a !== b) {
      if (aNorm.includes(b) && bNorm.includes(a)) continue; // just moved
      push({ kind: "line_changed", index: i, before: b, after: a });
    }
  }
}

/** One-paragraph, human-readable summary of a diff. */
export function describeChanges(diff) {
  const s = diff.summary;
  const parts = [];
  if (s.sectionsAdded) parts.push(`${s.sectionsAdded} section${s.sectionsAdded === 1 ? "" : "s"} added`);
  if (s.sectionsRemoved) parts.push(`${s.sectionsRemoved} section${s.sectionsRemoved === 1 ? "" : "s"} removed`);
  if (s.sectionsReordered) parts.push("sections reordered");
  if (s.entriesAdded) parts.push(`${s.entriesAdded} entr${s.entriesAdded === 1 ? "y" : "ies"} added`);
  if (s.entriesRemoved) parts.push(`${s.entriesRemoved} entr${s.entriesRemoved === 1 ? "y" : "ies"} removed`);
  if (s.fieldsChanged) parts.push(`${s.fieldsChanged} text field${s.fieldsChanged === 1 ? "" : "s"} changed`);
  if (s.personalChanged.length) parts.push(`contact details updated (${s.personalChanged.join(", ")})`);
  const delta = s.wordsAfter - s.wordsBefore;
  if (delta) parts.push(`${delta > 0 ? "+" : ""}${delta} words`);
  return parts.length ? parts.join(", ") + "." : "No content differences.";
}
