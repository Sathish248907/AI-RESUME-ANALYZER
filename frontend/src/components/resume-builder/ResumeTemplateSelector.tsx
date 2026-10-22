"use client";

import { Check, LayoutTemplate } from "lucide-react";
import { BULLET_STYLES, FONT_FAMILIES, HEADING_STYLES, MARGINS, SPACINGS, type Formatting, type Template, type TemplateId } from "@/services/resumeBuilderService";
import { cn } from "@/lib/utils";

interface Props {
  templates: Template[];
  templateId: TemplateId;
  formatting: Formatting;
  onTemplate: (id: TemplateId) => void;
  onFormatting: (patch: Partial<Formatting>) => void;
  onSaveDefault?: () => void;
}

const SWATCHES = ["#2563eb", "#0f766e", "#1f2937", "#7c3aed", "#b91c1c", "#0369a1", "#111111"];

export default function ResumeTemplateSelector({ templates, templateId, formatting, onTemplate, onFormatting, onSaveDefault }: Props) {
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-xs"><span className="font-medium text-gray-700">{label}</span>{children}</label>;
  const sel = "mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white";
  return (
    <div className="space-y-5 text-sm">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 inline-flex items-center gap-1"><LayoutTemplate className="w-3.5 h-3.5" /> Template</p>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => onTemplate(t.id)} aria-pressed={templateId === t.id} className={cn("text-left rounded-xl border p-3 transition-colors", templateId === t.id ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300 bg-white")}>
              <div className="flex items-center justify-between"><span className="font-medium text-gray-900">{t.name}</span>{templateId === t.id && <Check className="w-4 h-4 text-indigo-600" />}</div>
              <p className="text-[11px] text-gray-500 mt-1">{t.description}</p>
              <div className="mt-2 h-10 rounded border border-gray-100 bg-white p-1.5 overflow-hidden" aria-hidden>
                <div className={cn("h-1.5 w-1/2 rounded", t.id === "classic" ? "mx-auto" : "")} style={{ background: t.id === "minimal_ats" ? "#111" : t.defaults.accentColor }} />
                <div className="h-1 w-3/4 bg-gray-200 rounded mt-1" /><div className="h-1 w-2/3 bg-gray-200 rounded mt-1" />
              </div>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-2">All templates are single-column with real text, so applicant tracking systems can parse them. Switching templates keeps your content.</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formatting</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Font family"><select className={sel} value={formatting.fontFamily} onChange={(e) => onFormatting({ fontFamily: e.target.value as Formatting["fontFamily"] })}>{FONT_FAMILIES.map((f) => <option key={f}>{f}</option>)}</select></Field>
          <Field label="Font size (pt)"><select className={sel} value={formatting.fontSize} onChange={(e) => onFormatting({ fontSize: Number(e.target.value) })}>{[9, 9.5, 10, 10.5, 11, 11.5, 12, 13].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label="Page margins"><select className={sel} value={formatting.margins} onChange={(e) => onFormatting({ margins: e.target.value as Formatting["margins"] })}>{MARGINS.map((m) => <option key={m} value={m} className="capitalize">{m}</option>)}</select></Field>
          <Field label="Section spacing"><select className={sel} value={formatting.sectionSpacing} onChange={(e) => onFormatting({ sectionSpacing: e.target.value as Formatting["sectionSpacing"] })}>{SPACINGS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
          <Field label="Heading style"><select className={sel} value={formatting.headingStyle} onChange={(e) => onFormatting({ headingStyle: e.target.value as Formatting["headingStyle"] })}>{HEADING_STYLES.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
          <Field label="Bullet style"><select className={sel} value={formatting.bulletStyle} onChange={(e) => onFormatting({ bulletStyle: e.target.value as Formatting["bulletStyle"] })}>{BULLET_STYLES.map((m) => <option key={m} value={m}>{m === "disc" ? "• disc" : m === "dash" ? "– dash" : "› arrow"}</option>)}</select></Field>
          <Field label="Layout"><select className={sel} value={formatting.layout} onChange={(e) => onFormatting({ layout: e.target.value as Formatting["layout"] })}><option value="multi">Multi-page allowed</option><option value="single">One page (warn on overflow)</option></select></Field>
          <Field label="Page size"><input className={cn(sel, "bg-gray-50")} value="A4 (210 × 297 mm)" readOnly /></Field>
        </div>
        <div className="mt-3">
          <span className="text-xs font-medium text-gray-700">Accent colour {templateId === "minimal_ats" && <span className="text-gray-400">(ignored by the ATS template)</span>}</span>
          <div className="flex items-center gap-2 mt-1">
            {SWATCHES.map((c) => <button key={c} type="button" aria-label={`Accent ${c}`} onClick={() => onFormatting({ accentColor: c })} className={cn("w-6 h-6 rounded-full border-2", formatting.accentColor.toLowerCase() === c ? "border-gray-900" : "border-white shadow")} style={{ background: c }} />)}
            <input type="color" aria-label="Custom accent colour" value={formatting.accentColor} onChange={(e) => onFormatting({ accentColor: e.target.value })} className="w-8 h-6 p-0 border border-gray-300 rounded" />
          </div>
        </div>
        {onSaveDefault && <button type="button" onClick={onSaveDefault} className="mt-3 text-xs text-indigo-700 hover:underline">Use this template and formatting for new versions</button>}
      </div>
    </div>
  );
}
