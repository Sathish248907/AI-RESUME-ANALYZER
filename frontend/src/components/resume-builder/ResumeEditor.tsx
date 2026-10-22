"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Plus, Trash2, ArrowUp, ArrowDown, User } from "lucide-react";
import Button from "@/components/common/Button";
import { SECTION_LABELS, SECTION_TYPES, emptySection, newId, type CertificationEntry, type EducationEntry, type ExperienceEntry, type Personal, type ProjectEntry, type ResumeContent, type ResumeSection, type SectionType, type SkillGroup } from "@/services/resumeBuilderService";
import { cn } from "@/lib/utils";

interface Props {
  content: ResumeContent;
  onChange: (next: ResumeContent) => void;
  readOnly?: boolean;
  focusId?: string | null;
  onFocusId?: (id: string | null) => void;
}

const input = "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50";
const label = "block text-[11px] font-medium text-gray-600 mb-0.5";

/** Structured editor: personal details + ordered sections with inline entry/bullet editing. */
export default function ResumeEditor({ content, onChange, readOnly = false, focusId, onFocusId }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ personal: true });
  const [addType, setAddType] = useState<SectionType>("custom");
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? true) }));
  const isOpen = (id: string) => open[id] ?? true;

  const setPersonal = (patch: Partial<Personal>) => onChange({ ...content, personal: { ...content.personal, ...patch } });
  const setSection = (id: string, next: ResumeSection) => onChange({ ...content, sections: content.sections.map((s) => (s.id === id ? next : s)) });
  const removeSection = (id: string) => onChange({ ...content, sections: content.sections.filter((s) => s.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    const i = content.sections.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= content.sections.length) return;
    const next = [...content.sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...content, sections: next });
  };
  const addSection = () => {
    const s = emptySection(addType);
    onChange({ ...content, sections: [...content.sections, s] });
    setOpen((o) => ({ ...o, [s.id]: true }));
  };

  return (
    <div className="space-y-3">
      {/* Personal */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <button type="button" onClick={() => toggle("personal")} className="w-full flex items-center justify-between px-4 py-3 text-left">
          <span className="font-semibold text-gray-900 inline-flex items-center gap-2"><User className="w-4 h-4 text-indigo-600" /> Personal details</span>
          {isOpen("personal") ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {isOpen("personal") && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([["fullName", "Full name *"], ["title", "Headline / title"], ["email", "Email *"], ["phone", "Phone"], ["location", "Location"], ["website", "Website / portfolio"], ["linkedin", "LinkedIn"], ["github", "GitHub"]] as [keyof Personal, string][]).map(([k, l]) => (
              <div key={k}><label className={label} htmlFor={`p-${k}`}>{l}</label><input id={`p-${k}`} className={input} value={content.personal[k] ?? ""} disabled={readOnly} onChange={(e) => setPersonal({ [k]: e.target.value })} /></div>
            ))}
          </div>
        )}
      </section>

      {content.sections.map((s, idx) => (
        <section key={s.id} className={cn("rounded-xl border bg-white", focusId === s.id ? "border-yellow-400" : "border-gray-200", s.visible === false && "opacity-70")} onFocus={() => onFocusId?.(s.id)}>
          <div className="flex items-center gap-1 px-2 py-2">
            <GripVertical className="w-4 h-4 text-gray-300" aria-hidden />
            <button type="button" onClick={() => toggle(s.id)} className="flex-1 text-left min-w-0">
              <span className="font-semibold text-gray-900 truncate">{s.title || SECTION_LABELS[s.type]}</span>
              <span className="ml-2 text-[11px] text-gray-400 uppercase">{s.type}</span>
            </button>
            {!readOnly && (
              <>
                <button type="button" aria-label="Move up" disabled={idx === 0} onClick={() => move(s.id, -1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Move down" disabled={idx === content.sections.length - 1} onClick={() => move(s.id, 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label={s.visible === false ? "Show section" : "Hide section"} onClick={() => setSection(s.id, { ...s, visible: s.visible === false })} className="p-1 rounded hover:bg-gray-100">{s.visible === false ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4" />}</button>
                <button type="button" aria-label="Delete section" onClick={() => { if (window.confirm(`Delete the “${s.title}” section and its content?`)) removeSection(s.id); }} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
            <button type="button" aria-label={isOpen(s.id) ? "Collapse" : "Expand"} onClick={() => toggle(s.id)} className="p-1 rounded hover:bg-gray-100">{isOpen(s.id) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</button>
          </div>
          {isOpen(s.id) && (
            <div className="px-4 pb-4 space-y-3">
              <div><label className={label}>Section title</label><input className={input} value={s.title} disabled={readOnly} onChange={(e) => setSection(s.id, { ...s, title: e.target.value })} /></div>
              <SectionBody section={s} readOnly={readOnly} onChange={(next) => setSection(s.id, next)} focusId={focusId} />
            </div>
          )}
        </section>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3">
          <select value={addType} onChange={(e) => setAddType(e.target.value as SectionType)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            {SECTION_TYPES.map((t) => <option key={t} value={t}>{SECTION_LABELS[t]}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={addSection}><Plus className="w-4 h-4 mr-1" /> Add section</Button>
        </div>
      )}
    </div>
  );
}

function SectionBody({ section: s, onChange, readOnly, focusId }: { section: ResumeSection; onChange: (s: ResumeSection) => void; readOnly: boolean; focusId?: string | null }) {
  switch (s.type) {
    case "summary":
      return <div><label className={label}>Summary (2–4 sentences, no first person)</label><textarea className={input} rows={5} value={s.text} disabled={readOnly} onChange={(e) => onChange({ ...s, text: e.target.value })} /><p className="text-[11px] text-gray-400 mt-0.5">{s.text.trim().split(/\s+/).filter(Boolean).length} words</p></div>;
    case "skills":
      return (
        <EntryList<SkillGroup> items={s.groups} readOnly={readOnly} onChange={(groups) => onChange({ ...s, groups })} create={() => ({ id: newId("g"), name: "", items: [] })} labelOf={(g) => g.name || "Skill group"} focusId={focusId}
          render={(g, set) => (
            <div className="grid sm:grid-cols-3 gap-2">
              <div><label className={label}>Group (e.g. Languages)</label><input className={input} value={g.name} disabled={readOnly} onChange={(e) => set({ ...g, name: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={label}>Skills, comma-separated</label><input className={input} value={g.items.join(", ")} disabled={readOnly} onChange={(e) => set({ ...g, items: e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 60) })} /></div>
            </div>
          )} />
      );
    case "experience":
      return (
        <EntryList<ExperienceEntry> items={s.entries} readOnly={readOnly} onChange={(entries) => onChange({ ...s, entries })} create={() => ({ id: newId("e"), role: "", company: "", location: "", startDate: "", endDate: "", current: false, bullets: [""] })} labelOf={(e) => e.role || e.company || "Experience"} focusId={focusId}
          render={(e, set) => (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className={label}>Role *</label><input className={input} value={e.role} disabled={readOnly} onChange={(ev) => set({ ...e, role: ev.target.value })} /></div>
                <div><label className={label}>Company *</label><input className={input} value={e.company} disabled={readOnly} onChange={(ev) => set({ ...e, company: ev.target.value })} /></div>
                <div><label className={label}>Location</label><input className={input} value={e.location} disabled={readOnly} onChange={(ev) => set({ ...e, location: ev.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Start (e.g. Mar 2022)</label><input className={input} value={e.startDate} disabled={readOnly} onChange={(ev) => set({ ...e, startDate: ev.target.value })} /></div>
                  <div><label className={label}>End</label><input className={input} value={e.endDate} disabled={readOnly || e.current} placeholder={e.current ? "Present" : ""} onChange={(ev) => set({ ...e, endDate: ev.target.value })} /></div>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={e.current} disabled={readOnly} onChange={(ev) => set({ ...e, current: ev.target.checked, endDate: ev.target.checked ? "" : e.endDate })} /> I currently work here</label>
              <Bullets items={e.bullets} readOnly={readOnly} onChange={(bullets) => set({ ...e, bullets })} placeholder="Built … using … which resulted in …" />
            </div>
          )} />
      );
    case "projects":
      return (
        <EntryList<ProjectEntry> items={s.entries} readOnly={readOnly} onChange={(entries) => onChange({ ...s, entries })} create={() => ({ id: newId("p"), name: "", role: "", technologies: [], link: "", startDate: "", endDate: "", bullets: [""] })} labelOf={(e) => e.name || "Project"} focusId={focusId}
          render={(e, set) => (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className={label}>Project name *</label><input className={input} value={e.name} disabled={readOnly} onChange={(ev) => set({ ...e, name: ev.target.value })} /></div>
                <div><label className={label}>Your role</label><input className={input} value={e.role} disabled={readOnly} onChange={(ev) => set({ ...e, role: ev.target.value })} /></div>
                <div><label className={label}>Technologies, comma-separated</label><input className={input} value={e.technologies.join(", ")} disabled={readOnly} onChange={(ev) => set({ ...e, technologies: ev.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30) })} /></div>
                <div><label className={label}>Link</label><input className={input} value={e.link} disabled={readOnly} onChange={(ev) => set({ ...e, link: ev.target.value })} /></div>
                <div><label className={label}>Start</label><input className={input} value={e.startDate} disabled={readOnly} onChange={(ev) => set({ ...e, startDate: ev.target.value })} /></div>
                <div><label className={label}>End</label><input className={input} value={e.endDate} disabled={readOnly} onChange={(ev) => set({ ...e, endDate: ev.target.value })} /></div>
              </div>
              <Bullets items={e.bullets} readOnly={readOnly} onChange={(bullets) => set({ ...e, bullets })} placeholder="What it does, what you built, the outcome" />
            </div>
          )} />
      );
    case "education":
      return (
        <EntryList<EducationEntry> items={s.entries} readOnly={readOnly} onChange={(entries) => onChange({ ...s, entries })} create={() => ({ id: newId("ed"), degree: "", institution: "", location: "", startDate: "", endDate: "", details: [] })} labelOf={(e) => e.degree || e.institution || "Education"} focusId={focusId}
          render={(e, set) => (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <div><label className={label}>Degree *</label><input className={input} value={e.degree} disabled={readOnly} onChange={(ev) => set({ ...e, degree: ev.target.value })} /></div>
                <div><label className={label}>Institution *</label><input className={input} value={e.institution} disabled={readOnly} onChange={(ev) => set({ ...e, institution: ev.target.value })} /></div>
                <div><label className={label}>Location</label><input className={input} value={e.location} disabled={readOnly} onChange={(ev) => set({ ...e, location: ev.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Start</label><input className={input} value={e.startDate} disabled={readOnly} onChange={(ev) => set({ ...e, startDate: ev.target.value })} /></div>
                  <div><label className={label}>End</label><input className={input} value={e.endDate} disabled={readOnly} onChange={(ev) => set({ ...e, endDate: ev.target.value })} /></div>
                </div>
              </div>
              <Bullets items={e.details} readOnly={readOnly} onChange={(details) => set({ ...e, details })} placeholder="GPA, honours, relevant coursework (optional)" label="Details" />
            </div>
          )} />
      );
    case "certifications":
      return (
        <EntryList<CertificationEntry> items={s.entries} readOnly={readOnly} onChange={(entries) => onChange({ ...s, entries })} create={() => ({ id: newId("c"), name: "", issuer: "", date: "", link: "" })} labelOf={(e) => e.name || "Certification"} focusId={focusId}
          render={(e, set) => (
            <div className="grid sm:grid-cols-2 gap-2">
              <div><label className={label}>Name *</label><input className={input} value={e.name} disabled={readOnly} onChange={(ev) => set({ ...e, name: ev.target.value })} /></div>
              <div><label className={label}>Issuer</label><input className={input} value={e.issuer} disabled={readOnly} onChange={(ev) => set({ ...e, issuer: ev.target.value })} /></div>
              <div><label className={label}>Date</label><input className={input} value={e.date} disabled={readOnly} onChange={(ev) => set({ ...e, date: ev.target.value })} /></div>
              <div><label className={label}>Link</label><input className={input} value={e.link} disabled={readOnly} onChange={(ev) => set({ ...e, link: ev.target.value })} /></div>
            </div>
          )} />
      );
    default:
      return <Bullets items={s.items} readOnly={readOnly} onChange={(items) => onChange({ ...s, items })} placeholder={s.type === "languages" ? "English — Fluent" : "One item per line"} label="Items" />;
  }
}

function EntryList<T extends { id: string }>({ items, onChange, create, render, labelOf, readOnly, focusId }: { items: T[]; onChange: (items: T[]) => void; create: () => T; render: (item: T, set: (next: T) => void) => React.ReactNode; labelOf: (item: T) => string; readOnly: boolean; focusId?: string | null }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const set = (id: string, next: T) => onChange(items.map((i) => (i.id === id ? next : i)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id} className={cn("rounded-lg border p-3", focusId === it.id ? "border-yellow-400 bg-yellow-50/40" : "border-gray-200 bg-gray-50/50")}>
          <div className="flex items-center gap-1 mb-2">
            <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [it.id]: !c[it.id] }))} className="flex-1 text-left text-sm font-medium text-gray-800 truncate">{labelOf(it)}</button>
            {!readOnly && (<>
              <button type="button" aria-label="Move entry up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" aria-label="Move entry down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button type="button" aria-label="Delete entry" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </>)}
          </div>
          {!collapsed[it.id] && render(it, (next) => set(it.id, next))}
        </div>
      ))}
      {!readOnly && <Button size="sm" variant="ghost" onClick={() => onChange([...items, create()])}><Plus className="w-4 h-4 mr-1" /> Add entry</Button>}
      {items.length === 0 && readOnly && <p className="text-xs text-gray-400">No entries.</p>}
    </div>
  );
}

function Bullets({ items, onChange, readOnly, placeholder, label: l = "Bullet points" }: { items: string[]; onChange: (items: string[]) => void; readOnly: boolean; placeholder?: string; label?: string }) {
  const set = (i: number, v: string) => onChange(items.map((b, j) => (j === i ? v : b)));
  return (
    <div>
      <span className={label}>{l}</span>
      <div className="space-y-1.5">
        {items.map((b, i) => (
          <div key={i} className="flex items-start gap-1">
            <span className="mt-2 text-gray-400">•</span>
            <textarea className={cn(input, "min-h-[2.2rem]")} rows={Math.min(4, Math.max(1, Math.ceil(b.length / 90)))} value={b} disabled={readOnly} placeholder={placeholder} onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !readOnly) { e.preventDefault(); onChange([...items.slice(0, i + 1), "", ...items.slice(i + 1)]); } if (e.key === "Backspace" && b === "" && items.length > 1 && !readOnly) { e.preventDefault(); onChange(items.filter((_, j) => j !== i)); } }} />
            {!readOnly && <button type="button" aria-label="Remove bullet" onClick={() => onChange(items.filter((_, j) => j !== i))} className="mt-1.5 p-1 rounded hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
        {!readOnly && <button type="button" onClick={() => onChange([...items, ""])} className="text-xs text-indigo-700 hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add bullet</button>}
      </div>
    </div>
  );
}
