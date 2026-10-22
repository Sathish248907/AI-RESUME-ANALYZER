"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, FileWarning, Maximize2 } from "lucide-react";
import type { Formatting, ResumeContent, ResumeSection, TemplateId } from "@/services/resumeBuilderService";
import { cn } from "@/lib/utils";

/**
 * HTML rendering of the resume that mirrors the server PDF layout: A4 page,
 * the same margins / fonts / section order per template. Page breaks are shown
 * as dashed lines at A4 height; the exact break in the PDF can differ slightly
 * because browser and PDF text metrics are not identical.
 */
const A4 = { w: 794, h: 1123 }; // px at 96 dpi
const MARGIN_PX: Record<string, number> = { narrow: 48, normal: 67, wide: 85 };
const SPACING: Record<string, number> = { compact: 0.7, normal: 1, relaxed: 1.35 };
const FONT_STACK: Record<string, string> = { Helvetica: "Helvetica, Arial, sans-serif", Times: "'Times New Roman', Times, serif", Courier: "'Courier New', Courier, monospace" };
const BULLET: Record<string, string> = { disc: "•", dash: "–", arrow: "›" };
const TECH_ORDER = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "languages", "custom"];

export function sectionHasContent(s: ResumeSection): boolean {
  switch (s.type) {
    case "summary": return Boolean(s.text?.trim());
    case "skills": return s.groups.some((g) => g.items.length);
    case "experience": case "projects": case "education": case "certifications": return s.entries.length > 0;
    default: return s.items.length > 0;
  }
}

interface Props { content: ResumeContent; templateId: TemplateId; formatting: Formatting; highlightId?: string | null; className?: string }

export default function ResumePreview({ content, templateId, formatting, highlightId, className }: Props) {
  const [zoom, setZoom] = useState(0.75);
  const [pages, setPages] = useState(1);
  const [overflow, setOverflow] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.scrollHeight;
      const n = Math.max(1, Math.ceil(h / A4.h));
      setPages(n);
      setOverflow(formatting.layout === "single" && n > 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, templateId, formatting]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => { const avail = el.clientWidth - 32; if (avail > 0 && avail < A4.w) setZoom(Math.max(0.35, Math.min(1, avail / A4.w))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = MARGIN_PX[formatting.margins] ?? MARGIN_PX.normal;
  const sp = SPACING[formatting.sectionSpacing] ?? 1;
  const accent = templateId === "minimal_ats" ? "#111111" : formatting.accentColor;
  const font = FONT_STACK[formatting.fontFamily] ?? FONT_STACK.Helvetica;
  const basePx = formatting.fontSize * (96 / 72);
  const upper = formatting.headingStyle === "uppercase";
  const bullet = BULLET[formatting.bulletStyle] ?? "•";
  const centred = templateId === "classic";
  const p = content.personal;
  const visible = content.sections.filter((s) => s.visible !== false && sectionHasContent(s));
  const sections = templateId === "technical" ? [...visible].sort((a, b) => TECH_ORDER.indexOf(a.type) - TECH_ORDER.indexOf(b.type)) : visible;
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean);
  const hl = (id: string) => (highlightId === id ? "bg-yellow-100 ring-2 ring-yellow-300 rounded" : "");

  const Heading = ({ s }: { s: ResumeSection }) => (
    <div style={{ marginTop: `${14 * sp}px`, marginBottom: `${6 * sp}px` }}>
      <h2 style={{ color: accent, fontSize: basePx * 1.15, fontWeight: 700, letterSpacing: upper ? "0.06em" : 0, textTransform: upper ? "uppercase" : "none", margin: 0 }}>{s.title}</h2>
      {templateId !== "technical" && <div style={{ borderBottom: `${templateId === "minimal_ats" ? "0.6px solid #999" : `0.8px solid ${accent}`}`, marginTop: 2 }} />}
    </div>
  );
  const Bullets = ({ items }: { items: string[] }) => (
    <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0 }}>
      {items.filter(Boolean).map((b, i) => <li key={i} style={{ display: "flex", gap: 8, marginBottom: 2 * sp }}><span style={{ width: 10, flexShrink: 0 }}>{bullet}</span><span style={{ flex: 1 }}>{b}</span></li>)}
    </ul>
  );
  const Row = ({ left, right, sub }: { left: string; right?: string; sub?: string }) => (
    <div style={{ marginTop: 6 * sp }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><strong style={{ fontSize: basePx * 1.02 }}>{left}</strong>{right && <span style={{ color: "#555", fontSize: basePx * 0.9, whiteSpace: "nowrap" }}>{right}</span>}</div>
      {sub && <div style={{ color: "#555", fontStyle: "italic", fontSize: basePx * 0.95 }}>{sub}</div>}
    </div>
  );
  const dates = (a: string, b: string, cur?: boolean) => [a, cur ? "Present" : b].filter(Boolean).join(" – ");

  return (
    <div ref={wrapRef} className={cn("relative h-full flex flex-col", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-white text-xs text-gray-600">
        <span className="inline-flex items-center gap-2">A4 preview · {pages} page{pages === 1 ? "" : "s"} {overflow && <span className="inline-flex items-center gap-1 text-amber-700"><FileWarning className="w-3.5 h-3.5" /> exceeds one page</span>}</span>
        <span className="inline-flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(2)))} className="p-1 rounded hover:bg-gray-100"><ZoomOut className="w-4 h-4" /></button>
          <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} className="p-1 rounded hover:bg-gray-100"><ZoomIn className="w-4 h-4" /></button>
          <button type="button" aria-label="Fit width" onClick={() => { const el = wrapRef.current; if (el) setZoom(Math.max(0.35, Math.min(1, (el.clientWidth - 32) / A4.w))); }} className="p-1 rounded hover:bg-gray-100"><Maximize2 className="w-4 h-4" /></button>
        </span>
      </div>
      <div className="flex-1 overflow-auto bg-gray-200/70 p-4">
        <div style={{ width: A4.w * zoom, height: Math.max(A4.h, pages * A4.h) * zoom, margin: "0 auto", position: "relative" }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: A4.w, position: "absolute", top: 0, left: 0 }}>
            <div ref={pageRef} style={{ width: A4.w, minHeight: A4.h, background: "white", boxShadow: "0 1px 6px rgba(0,0,0,0.25)", padding: margin, boxSizing: "border-box", fontFamily: font, fontSize: basePx, color: "#111", lineHeight: 1.35, position: "relative" }}>
              {Array.from({ length: pages - 1 }, (_, i) => (
                <div key={i} aria-hidden style={{ position: "absolute", left: 0, right: 0, top: (i + 1) * A4.h, borderTop: "2px dashed #f59e0b", pointerEvents: "none" }}>
                  <span style={{ position: "absolute", right: 8, top: -18, fontSize: 11, color: "#b45309", background: "#fff7ed", padding: "0 6px", fontFamily: "sans-serif" }}>page {i + 2} starts here (approximate)</span>
                </div>
              ))}
              <header style={{ textAlign: centred ? "center" : "left" }}>
                <h1 style={{ fontSize: basePx * 2, fontWeight: 700, margin: 0 }}>{p.fullName || <span style={{ color: "#aaa" }}>Your name</span>}</h1>
                {p.title && <div style={{ color: accent, fontSize: basePx * 1.15 }}>{p.title}</div>}
                {contact.length > 0 && <div style={{ color: "#555", fontSize: basePx * 0.9, marginTop: 3 }}>{contact.join("  |  ")}</div>}
                {(templateId === "modern" || templateId === "technical") && <div style={{ borderBottom: `1.5px solid ${accent}`, marginTop: 8 }} />}
                {templateId === "classic" && <div style={{ borderBottom: "0.8px solid #111", marginTop: 8 }} />}
              </header>
              {sections.map((s) => (
                <section key={s.id} className={hl(s.id)}>
                  <Heading s={s} />
                  {s.type === "summary" && <p style={{ margin: 0 }}>{s.text}</p>}
                  {s.type === "skills" && s.groups.filter((g) => g.items.length).map((g) => (
                    <div key={g.id} className={hl(g.id)} style={{ marginBottom: 3 * sp }}>{g.name && <strong>{g.name}: </strong>}<span style={templateId === "technical" ? { fontFamily: FONT_STACK.Courier } : undefined}>{g.items.join(templateId === "technical" ? "  ·  " : ", ")}</span></div>
                  ))}
                  {s.type === "experience" && s.entries.map((e) => <div key={e.id} className={hl(e.id)}><Row left={e.role || e.company} right={dates(e.startDate, e.endDate, e.current)} sub={[e.company, e.location].filter(Boolean).join(" · ")} /><Bullets items={e.bullets} /></div>)}
                  {s.type === "projects" && s.entries.map((e) => <div key={e.id} className={hl(e.id)}><Row left={e.name} right={dates(e.startDate, e.endDate)} sub={[e.role, e.technologies.join(", "), e.link].filter(Boolean).join(" · ")} /><Bullets items={e.bullets} /></div>)}
                  {s.type === "education" && s.entries.map((e) => <div key={e.id} className={hl(e.id)}><Row left={e.degree || e.institution} right={dates(e.startDate, e.endDate)} sub={[e.institution, e.location].filter(Boolean).join(" · ")} /><Bullets items={e.details} /></div>)}
                  {s.type === "certifications" && s.entries.map((e) => <div key={e.id} className={hl(e.id)} style={{ marginTop: 3 * sp }}><strong>{e.name}</strong>{(e.issuer || e.date) && <span style={{ color: "#555" }}> — {[e.issuer, e.date].filter(Boolean).join(", ")}</span>}{e.link && <div style={{ color: accent, fontSize: basePx * 0.85 }}>{e.link}</div>}</div>)}
                  {(s.type === "achievements" || s.type === "languages" || s.type === "custom") && <Bullets items={s.items} />}
                </section>
              ))}
              {sections.length === 0 && <p style={{ color: "#999", marginTop: 40, textAlign: "center" }}>Add content on the left to see it here.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
