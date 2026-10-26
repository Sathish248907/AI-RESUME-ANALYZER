"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Undo2, Redo2, Save, Check, AlertCircle, Loader2, Pencil, LayoutTemplate, Wand2, Target, ShieldCheck, History, Lock, Copy, Eye, EyeOff, Gauge, ClipboardCheck, Compass, MessageSquare } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import ResumeEditor from "@/components/resume-builder/ResumeEditor";
import ResumePreview from "@/components/resume-builder/ResumePreview";
import ResumeTemplateSelector from "@/components/resume-builder/ResumeTemplateSelector";
import AIImprovementPanel from "@/components/resume-builder/AIImprovementPanel";
import JobTailoringPanel from "@/components/resume-builder/JobTailoringPanel";
import ResumeQualityPanel from "@/components/resume-builder/ResumeQualityPanel";
import ResumeVersionHistory from "@/components/resume-builder/ResumeVersionHistory";
import ResumeComparison from "@/components/resume-builder/ResumeComparison";
import PDFExportButton from "@/components/resume-builder/PDFExportButton";
import ATSScorePanel from "@/components/resume-builder/ATSScorePanel";
import ResumeValidationPanel from "@/components/resume-builder/ResumeValidationPanel";
import RoleRecommendationPanel from "@/components/resume-builder/RoleRecommendationPanel";
import ResumeAssistantPanel from "@/components/resume-builder/ResumeAssistantPanel";
import {
  applyFix, applyTextField, askAssistant, atsCheck, atsHistory, compareVersions, deleteVersion, describeTarget, duplicateVersion, getVersion, improveVersion, listSuggestions, listVersions, qualityCheck, resolveSuggestion, restoreVersion, roleRecommendations, savePreference, selectTargetRole, tailorVersion, updateVersion, validateResume,
  type ApplyFixResult, type AssistantDraft, type AtsAssessment, type AtsAutoFix, type AtsHistory, type AutoFixKind, type CompareResult, type Formatting, type QualityIssue, type QualityReport, type ResumeContent, type ResumeVersion, type ResumeVersionSummary, type RoleRecommendations, type Suggestion, type TailorResult, type Template, type TemplateId, type ValidationReport,
} from "@/services/resumeBuilderService";
import { listJobDescriptions } from "@/services/jobDescriptionService";
import type { AssistantTurn, JobDescriptionOption } from "@/components/resume-builder/types";
import { cn } from "@/lib/utils";

type Tab = "edit" | "template" | "improve" | "tailor" | "assistant" | "ats" | "checks" | "quality" | "roles" | "versions";
type SaveState = "saved" | "dirty" | "saving" | "error" | "readonly";
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "edit", label: "Edit", icon: Pencil }, { id: "template", label: "Template", icon: LayoutTemplate }, { id: "improve", label: "AI improve", icon: Wand2 }, { id: "tailor", label: "Tailor to job", icon: Target }, { id: "assistant", label: "Assistant", icon: MessageSquare }, { id: "ats", label: "ATS score", icon: Gauge }, { id: "checks", label: "Checks", icon: ClipboardCheck }, { id: "quality", label: "Quality", icon: ShieldCheck }, { id: "roles", label: "Roles", icon: Compass }, { id: "versions", label: "Versions", icon: History },
];
const HISTORY_LIMIT = 60;

export default function ResumeEditorPage() {
  const params = useParams<{ versionId: string }>();
  const versionId = params?.versionId as string;
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [version, setVersion] = useState<ResumeVersion | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [formatting, setFormatting] = useState<Formatting | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("modern");
  const [name, setName] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("edit");
  const [showPreview, setShowPreview] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [generalNotes, setGeneralNotes] = useState<string[]>([]);
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quality, setQuality] = useState<QualityReport | null>(null);
  const [qualityBusy, setQualityBusy] = useState(false);
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [restoring, setRestoring] = useState<ResumeVersionSummary | null>(null);
  const [deleting, setDeleting] = useState<ResumeVersionSummary | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Phase 11: ATS readiness, checks, roles, assistant ──
  const [savedJobs, setSavedJobs] = useState<JobDescriptionOption[]>([]);
  const [ats, setAts] = useState<AtsAssessment | null>(null);
  const [atsDelta, setAtsDelta] = useState<number | null>(null);
  const [atsQuality, setAtsQuality] = useState<number | null>(null);
  const [atsPast, setAtsPast] = useState<AtsHistory | null>(null);
  const [atsBusy, setAtsBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [fixBusy, setFixBusy] = useState<AutoFixKind | null>(null);
  const [lastFix, setLastFix] = useState<ApplyFixResult | null>(null);
  const [roles, setRoles] = useState<RoleRecommendations | null>(null);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [selectingRole, setSelectingRole] = useState<string | null>(null);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);

  /**
   * Every derived result (quality, ATS, checks, roles) is computed from the
   * content at one moment. `rev` counts content changes, and each panel keeps
   * the revision it ran against, so a panel can say honestly that its numbers
   * predate the current text instead of looking fresh.
   */
  const revRef = useRef(0);
  const [rev, setRev] = useState(0);
  const [qualityRev, setQualityRev] = useState<number | null>(null);
  const [atsRev, setAtsRev] = useState<number | null>(null);
  const [validationRev, setValidationRev] = useState<number | null>(null);
  const [rolesRev, setRolesRev] = useState<number | null>(null);
  const bumpRev = useCallback(() => { revRef.current += 1; setRev(revRef.current); }, []);
  const stale = (ranAt: number | null) => ranAt !== null && ranAt !== rev;

  // Undo / redo over content snapshots
  const past = useRef<ResumeContent[]>([]);
  const future = useRef<ResumeContent[]>([]);
  const [histVersion, setHistVersion] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedUpdatedAt = useRef<string | null>(null);
  const pendingRef = useRef<{ content?: ResumeContent; formatting?: Formatting; templateId?: TemplateId; name?: string } | null>(null);
  const readOnly = Boolean(version?.isOriginal);

  const load = useCallback(async () => {
    if (!user || !versionId) return;
    setLoading(true); setLoadError(null);
    try {
      const [{ version: v, templates: t }, sugg, h] = await Promise.all([getVersion(versionId), listSuggestions(versionId), getBackendHealth()]);
      setVersion(v); setTemplates(t); setContent(v.content); setFormatting(v.formatting); setTemplateId(v.templateId); setName(v.name);
      setSuggestions(sugg); setAiConfigured(Boolean(h?.ai.configured));
      expectedUpdatedAt.current = v.updatedAt; past.current = []; future.current = [];
      setSaveState(v.isOriginal ? "readonly" : "saved");
      const all = await listVersions({ ...(v.resumeId ? { resumeId: v.resumeId } : {}), limit: 100 });
      setVersions(v.resumeId ? all.versions : all.versions.filter((x) => x.resumeId === null));
      // Saved job descriptions are a convenience for the ATS and assistant panels; a failure there must not block the editor.
      const jds = await listJobDescriptions({ limit: 50 }).catch(() => null);
      setSavedJobs(jds ? jds.jobDescriptions.map((j) => ({ id: j.id, jobTitle: j.jobTitle, companyName: j.companyName })) : []);
    } catch (err) { setLoadError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, versionId]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  // ── Autosave (debounced, optimistic concurrency) ──
  const flush = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const pending = pendingRef.current;
    if (!pending || !version || readOnly) return;
    pendingRef.current = null;
    setSaveState("saving"); setSaveError(null);
    try {
      const updated = await updateVersion(version.id, { ...pending, expectedUpdatedAt: expectedUpdatedAt.current ?? undefined });
      expectedUpdatedAt.current = updated.updatedAt;
      setVersion(updated);
      setVersions((vs) => vs.map((x) => (x.id === updated.id ? { ...x, name: updated.name, templateId: updated.templateId, updatedAt: updated.updatedAt, lastQualityScore: updated.lastQualityScore } : x)));
      setSaveState(pendingRef.current ? "dirty" : "saved");
    } catch (err) {
      const e = toApiClientError(err);
      pendingRef.current = { ...pending, ...(pendingRef.current ?? {}) }; // keep unsaved work
      setSaveState("error");
      setSaveError(e.code === "VERSION_CONFLICT" ? "Changed elsewhere. Reload to get the latest version; your unsaved edits will be lost." : e.message);
      if (e.details?.length) setSaveError(`${e.message} ${e.details.map((d) => d.message).join(" ")}`);
    }
  }, [version, readOnly]);
  const queueSave = useCallback((patch: NonNullable<typeof pendingRef.current>) => {
    if (readOnly) return;
    pendingRef.current = { ...(pendingRef.current ?? {}), ...patch };
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 1200);
  }, [flush, readOnly]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); } if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) { e.preventDefault(); redo(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pendingRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function changeContent(next: ResumeContent, { record = true } = {}) {
    if (record && content) { past.current = [...past.current.slice(-HISTORY_LIMIT), content]; future.current = []; setHistVersion((n) => n + 1); }
    setContent(next); bumpRev();
    queueSave({ content: next });
  }
  function undo() { if (!past.current.length || !content) return; const prev = past.current.pop()!; future.current.push(content); setHistVersion((n) => n + 1); setContent(prev); bumpRev(); queueSave({ content: prev }); }
  function redo() { if (!future.current.length || !content) return; const next = future.current.pop()!; past.current.push(content); setHistVersion((n) => n + 1); setContent(next); bumpRev(); queueSave({ content: next }); }

  function changeFormatting(patch: Partial<Formatting>) { if (!formatting) return; const next = { ...formatting, ...patch }; setFormatting(next); queueSave({ formatting: next }); }
  function changeTemplate(id: TemplateId) {
    const tpl = templates.find((t) => t.id === id);
    const next = { ...(formatting as Formatting), ...(tpl?.defaults ?? {}) } as Formatting;
    setTemplateId(id); setFormatting(next); queueSave({ templateId: id, formatting: next });
  }

  // ── Applied-content sync after AI resolve / restore ──
  function adoptVersion(v: ResumeVersion) {
    setVersion(v); setContent(v.content); setFormatting(v.formatting); setTemplateId(v.templateId); setName(v.name); expectedUpdatedAt.current = v.updatedAt; bumpRev();
  }

  async function onGenerate(input: { sectionIds?: string[]; userNotes?: string }) {
    if (!version) return;
    await flush();
    setAiBusy(true);
    try { const r = await improveVersion(version.id, input); setGeneralNotes(r.generalNotes); setSuggestions(await listSuggestions(version.id)); toast.success(`${r.suggestions.length} suggestion${r.suggestions.length === 1 ? "" : "s"} generated — nothing applied yet.`); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setAiBusy(false); }
  }
  async function onTailor(input: Parameters<typeof tailorVersion>[1]) {
    if (!version) return;
    await flush();
    setAiBusy(true);
    try { const r = await tailorVersion(version.id, input); setTailorResult(r); setVersion(r.version); expectedUpdatedAt.current = r.version.updatedAt; setSuggestions(await listSuggestions(version.id)); setVersions((vs) => vs.map((x) => (x.id === r.version.id ? { ...x, kind: r.version.kind, jobDescriptionId: r.version.jobDescriptionId, targetJobTitle: r.version.targetJobTitle } : x))); toast.success(`${r.suggestions.length} tailoring suggestion${r.suggestions.length === 1 ? "" : "s"} for ${r.target.jobTitle ?? "the job"}.`); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setAiBusy(false); }
  }
  async function onResolve(s: Suggestion, action: "accept" | "reject" | "edit" | "reset", text?: string) {
    if (!version) return;
    await flush();
    setBusyId(s.id);
    try {
      const r = await resolveSuggestion(version.id, s.id, { action, text });
      setSuggestions((all) => all.map((x) => (x.id === r.suggestion.id ? r.suggestion : x)));
      if (content) { past.current = [...past.current.slice(-HISTORY_LIMIT), content]; future.current = []; setHistVersion((n) => n + 1); }
      adoptVersion(r.version);
      setSaveState("saved");
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusyId(null); }
  }
  function locate(s: { sectionId: string; entryId?: string | null }) { setFocusId(s.entryId ?? s.sectionId); setTab("edit"); setTimeout(() => setFocusId(null), 4000); }
  async function runQuality() {
    if (!version) return;
    await flush();
    setQualityBusy(true);
    try { const r = await qualityCheck(version.id); setQuality(r.quality); setQualityRev(revRef.current); } catch (err) { toast.error(toApiClientError(err).message); } finally { setQualityBusy(false); }
  }

  // ── ATS readiness ──
  async function runAts(input: { jobDescriptionId?: string; jobDescription?: string; jobTitle?: string; saveJobDescription?: boolean }) {
    if (!version) return;
    await flush();
    setAtsBusy(true);
    try {
      const r = await atsCheck(version.id, { ...input, save: true });
      setAts(r.ats); setAtsDelta(r.delta); setAtsQuality(r.quality.overall); setAtsRev(revRef.current);
      setAtsPast(await atsHistory(version.id).catch(() => null));
      if (input.saveJobDescription) { const jds = await listJobDescriptions({ limit: 50 }).catch(() => null); if (jds) setSavedJobs(jds.jobDescriptions.map((j) => ({ id: j.id, jobTitle: j.jobTitle, companyName: j.companyName }))); }
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setAtsBusy(false); }
  }

  // ── Deterministic checks and safe fixes ──
  async function runValidation() {
    if (!version) return;
    await flush();
    setValidationBusy(true);
    try { const r = await validateResume(version.id); setValidation(r.validation); setValidationRev(revRef.current); } catch (err) { toast.error(toApiClientError(err).message); } finally { setValidationBusy(false); }
  }
  /** Applies one mechanical fix server-side, then re-reads the findings so the list matches the new content. */
  async function doApplyFix(fix: { kind: AutoFixKind; sectionId?: string; value?: string }) {
    if (!version || readOnly) return;
    await flush();
    setFixBusy(fix.kind);
    try {
      const r = await applyFix(version.id, fix);
      setLastFix(r);
      if (!r.changed) { toast.success(r.summary); return; }
      if (content) { past.current = [...past.current.slice(-HISTORY_LIMIT), content]; future.current = []; setHistVersion((n) => n + 1); }
      adoptVersion(r.version); setSaveState("saved");
      toast.success(r.scoreBefore !== null && r.scoreAfter !== null ? `${r.summary} ATS readiness ${r.scoreBefore} → ${r.scoreAfter}.` : r.summary);
      const re = await validateResume(version.id);
      setValidation(re.validation); setValidationRev(revRef.current);
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setFixBusy(null); }
  }
  /** The ATS panel surfaces the same fixes on its findings. */
  async function applyAtsFix(fix: AtsAutoFix) {
    await doApplyFix({ kind: fix.kind, sectionId: fix.sectionId, value: fix.value });
  }

  // ── Role recommendations ──
  async function runRoles() {
    if (!version) return;
    await flush();
    setRolesBusy(true);
    try { const r = await roleRecommendations(version.id, { save: true }); setRoles(r); setRolesRev(revRef.current); } catch (err) { toast.error(toApiClientError(err).message); } finally { setRolesBusy(false); }
  }
  async function doSelectRole(input: { role: string; applyTemplate: boolean; applySectionOrder: boolean }) {
    if (!version) return;
    await flush();
    setSelectingRole(input.role);
    try {
      const r = await selectTargetRole(version.id, { ...input, recommendationId: roles?.recommendationId ?? undefined });
      if (content && (input.applyTemplate || input.applySectionOrder)) { past.current = [...past.current.slice(-HISTORY_LIMIT), content]; future.current = []; setHistVersion((n) => n + 1); }
      adoptVersion(r.version); setSaveState("saved");
      setRoles((prev) => (prev ? { ...prev, currentTargetRoles: r.targetRoles } : prev));
      const applied = [r.applied.template && "template", r.applied.sectionOrder && "section order"].filter(Boolean).join(" and ");
      toast.success(r.readOnlySkipped ?? `Targeting ${r.targetRole}${applied ? ` · applied the ${applied}` : ""}.`);
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setSelectingRole(null); }
  }

  // ── Writing assistant ──
  async function onAsk(input: { intent: AssistantTurn["intent"]; question?: string; sectionId?: string; entryId?: string; targetRole?: string; jobDescriptionId?: string; scopeLabel: string; intentLabel: string }) {
    if (!version) return;
    await flush();
    const id = `turn_${Date.now()}`;
    const turn: AssistantTurn = { id, intent: input.intent, intentLabel: input.intentLabel, question: input.question ?? "", scopeLabel: input.scopeLabel, askedAt: new Date().toISOString(), reply: null, error: null };
    setTurns((all) => [...all, turn]);
    setAssistantBusy(true);
    try {
      // Recent turns only, so a long thread cannot push the resume out of the prompt.
      const history = turns.slice(-3).flatMap((t) => (t.reply ? [{ role: "user" as const, text: t.question || t.intentLabel }, { role: "assistant" as const, text: t.reply.answer }] : []));
      const reply = await askAssistant(version.id, { intent: input.intent, question: input.question, sectionId: input.sectionId, entryId: input.entryId, targetRole: input.targetRole, jobDescriptionId: input.jobDescriptionId, history });
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, reply } : t)));
    } catch (err) {
      const message = toApiClientError(err).message;
      setTurns((all) => all.map((t) => (t.id === id ? { ...t, error: message } : t)));
    } finally { setAssistantBusy(false); }
  }
  /** Inserts one assistant draft into the content. Drafts are never written server-side. */
  async function insertDraft(draft: AssistantDraft, text: string): Promise<boolean> {
    if (!content || readOnly) return false;
    const target = { sectionId: draft.sectionId, entryId: draft.entryId, field: draft.field };
    const next = applyTextField(content, target, text);
    if (!next) { toast.error("That part of the resume has changed since the draft was written. Ask again."); return false; }
    changeContent(next);
    toast.success(`Inserted into ${describeTarget(next, target)}.`);
    return true;
  }

  // ── Versions ──
  async function onRename(v: ResumeVersionSummary, newName: string) { try { const u = await updateVersion(v.id, { name: newName }); setVersions((vs) => vs.map((x) => (x.id === u.id ? { ...x, name: u.name, updatedAt: u.updatedAt } : x))); if (u.id === version?.id) { setName(u.name); expectedUpdatedAt.current = u.updatedAt; } toast.success("Renamed."); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function onDuplicate(v: ResumeVersionSummary) { try { const c = await duplicateVersion(v.id); toast.success(`Created “${c.name}”.`); router.push(`/dashboard/resume-builder/${c.id}`); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function onCompare(v: ResumeVersionSummary) { if (!version) return; await flush(); try { setCompare(await compareVersions(version.id, v.id)); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function doRestore() {
    if (!version || !restoring) return;
    setBusy(true);
    try { const r = await restoreVersion(version.id, restoring.id); if (content) { past.current = [...past.current, content]; future.current = []; } adoptVersion(r.version); setSaveState("saved"); setRestoring(null); setCompare(null); toast.success(r.backup ? `Restored. Previous content saved as “${r.backup.name}”.` : "No differences to restore."); const all = await listVersions({ ...(version.resumeId ? { resumeId: version.resumeId } : {}), limit: 100 }); setVersions(version.resumeId ? all.versions : all.versions.filter((x) => x.resumeId === null)); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(false); }
  }
  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try { await deleteVersion(deleting.id); toast.success("Version deleted."); if (deleting.id === version?.id) router.push("/dashboard/resume-builder"); else setVersions((vs) => vs.filter((x) => x.id !== deleting.id)); setDeleting(null); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(false); }
  }

  const pendingCount = useMemo(() => suggestions.filter((s) => s.status === "pending").length, [suggestions]);

  if (!ready || (user && loading)) return <div className="max-w-7xl mx-auto px-4 py-10"><SkeletonCard lines={10} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={Lock} title="Sign in to edit resumes" action={{ label: "Sign in", href: `/auth/login?next=/dashboard/resume-builder/${versionId}` }} /></div>;
  if (loadError || !version || !content || !formatting) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={AlertCircle} title="Could not load this version" description={loadError ?? "Not found."} action={{ label: "Back to resume builder", href: "/dashboard/resume-builder" }} /></div>;

  const saveBadge = { saved: { icon: Check, text: "Saved", cls: "text-green-700" }, dirty: { icon: Save, text: "Unsaved changes", cls: "text-amber-700" }, saving: { icon: Loader2, text: "Saving…", cls: "text-indigo-700" }, error: { icon: AlertCircle, text: saveError ?? "Save failed", cls: "text-red-700" }, readonly: { icon: Lock, text: "Original — read-only", cls: "text-gray-500" } }[saveState];
  const SaveIcon = saveBadge.icon;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex flex-wrap items-center gap-2">
        <Link href="/dashboard/resume-builder" className="text-gray-500 hover:text-gray-800" aria-label="Back"><ArrowLeft className="w-5 h-5" /></Link>
        <input value={name} disabled={readOnly} onChange={(e) => { setName(e.target.value); queueSave({ name: e.target.value }); }} aria-label="Version name" className="font-semibold text-gray-900 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-300 rounded px-2 py-1 min-w-[12rem] flex-1 max-w-md" />
        <span className={cn("text-xs inline-flex items-center gap-1", saveBadge.cls)} aria-live="polite"><SaveIcon className={cn("w-3.5 h-3.5", saveState === "saving" && "animate-spin")} /> {saveBadge.text}{saveState === "error" && <button className="underline ml-1" onClick={flush}>retry</button>}</span>
        <div className="ml-auto flex items-center gap-1">
          {!readOnly && <>
            <Button size="sm" variant="ghost" aria-label="Undo" disabled={past.current.length === 0} onClick={undo} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" aria-label="Redo" disabled={future.current.length === 0} onClick={redo} title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></Button>
            <span className="sr-only">{histVersion}</span>
          </>}
          {readOnly && <Button size="sm" variant="outline" onClick={() => onDuplicate(version)}><Copy className="w-4 h-4 mr-1" /> Duplicate to edit</Button>}
          <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => setShowPreview((p) => !p)}>{showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
          <PDFExportButton versionId={version.id} size="sm" unsaved={saveState === "dirty"} onBeforeExport={flush} />
        </div>
      </div>

      {/* Split screen */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-2">
        <div className={cn("min-h-0 flex flex-col border-r border-gray-200 bg-gray-50", showPreview && "hidden lg:flex")}>
          <nav className="flex overflow-x-auto border-b border-gray-200 bg-white text-sm" aria-label="Editor panels">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} className={cn("px-3 py-2.5 inline-flex items-center gap-1.5 whitespace-nowrap border-b-2", tab === t.id ? "border-indigo-600 text-indigo-700 font-medium" : "border-transparent text-gray-600 hover:text-gray-900")}>
                <t.icon className="w-4 h-4" /> {t.label}{t.id === "improve" && pendingCount > 0 && <span className="ml-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] px-1.5">{suggestions.filter((s) => s.status === "pending" && s.mode === "improve").length}</span>}{t.id === "tailor" && suggestions.some((s) => s.status === "pending" && s.mode === "tailor") && <span className="ml-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] px-1.5">{suggestions.filter((s) => s.status === "pending" && s.mode === "tailor").length}</span>}
              </button>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "edit" && <ResumeEditor content={content} onChange={changeContent} readOnly={readOnly} focusId={focusId} />}
            {tab === "template" && <ResumeTemplateSelector templates={templates} templateId={templateId} formatting={formatting} onTemplate={changeTemplate} onFormatting={changeFormatting} onSaveDefault={async () => { try { await savePreference({ templateId, formatting }); toast.success("Saved as your default for new versions."); } catch (err) { toast.error(toApiClientError(err).message); } }} />}
            {tab === "improve" && <AIImprovementPanel content={content} suggestions={suggestions} generalNotes={generalNotes} busy={aiBusy} busyId={busyId} aiConfigured={aiConfigured} readOnly={readOnly} onGenerate={onGenerate} onResolve={onResolve} onLocate={locate} />}
            {tab === "tailor" && <JobTailoringPanel content={content} version={version} suggestions={suggestions} lastResult={tailorResult} busy={aiBusy} busyId={busyId} aiConfigured={aiConfigured} onTailor={onTailor} onResolve={onResolve} onLocate={locate} />}
            {tab === "assistant" && <ResumeAssistantPanel content={content} turns={turns} busy={assistantBusy} aiConfigured={aiConfigured} readOnly={readOnly} savedJobs={savedJobs} targetRole={roles?.currentTargetRoles[0] ?? version.targetJobTitle} onAsk={onAsk} onInsertDraft={insertDraft} onLocate={(t) => locate({ sectionId: t.sectionId as string, entryId: t.entryId })} />}
            {tab === "ats" && <ATSScorePanel assessment={ats} history={atsPast} delta={atsDelta} qualityScore={atsQuality} busy={atsBusy} stale={stale(atsRev)} savedJobs={savedJobs} onRun={runAts} onLocate={(t) => locate({ sectionId: t.sectionId as string, entryId: t.entryId })} onApplyFix={readOnly ? undefined : async (fix) => { await applyAtsFix(fix); }} />}
            {tab === "checks" && <ResumeValidationPanel report={validation} busy={validationBusy} stale={stale(validationRev)} fixBusy={fixBusy} lastFix={lastFix} readOnly={readOnly} onRun={runValidation} onApplyFix={doApplyFix} onLocate={(t) => locate({ sectionId: t.sectionId as string, entryId: t.entryId })} />}
            {tab === "quality" && <ResumeQualityPanel report={quality} busy={qualityBusy} onRun={runQuality} dirty={stale(qualityRev)} onLocate={(i: QualityIssue) => locate({ sectionId: i.sectionId as string, entryId: i.entryId })} />}
            {tab === "roles" && <RoleRecommendationPanel result={roles} busy={rolesBusy} stale={stale(rolesRev)} selectingRole={selectingRole} readOnly={readOnly} onRun={runRoles} onSelectRole={doSelectRole} onLocate={(t) => locate({ sectionId: t.sectionId as string, entryId: t.entryId })} />}
            {tab === "versions" && <ResumeVersionHistory versions={versions} currentId={version.id} onRename={onRename} onDuplicate={onDuplicate} onDelete={setDeleting} onCompare={onCompare} onRestore={(v) => { if (readOnly) { toast.error("The original is read-only. Open a working version to restore into it."); return; } setRestoring(v); }} />}
          </div>
        </div>
        <div className={cn("min-h-0", !showPreview && "hidden lg:block")}>
          <ResumePreview content={content} templateId={templateId} formatting={formatting} highlightId={focusId} className="h-full" />
        </div>
      </div>

      <ResumeComparison result={compare} open={Boolean(compare)} onClose={() => setCompare(null)} onRestore={readOnly ? undefined : () => { const other = versions.find((v) => v.id === compare?.other.id); if (other) setRestoring(other); }} />
      <ConfirmDialog open={Boolean(restoring)} title={`Restore “${restoring?.name}” into “${version.name}”?`} message="The current content of this version is replaced with the selected version's content. A backup version with your current content is created first, so nothing is lost." confirmLabel="Restore" destructive={false} busy={busy} onConfirm={doRestore} onCancel={() => setRestoring(null)} />
      <ConfirmDialog open={Boolean(deleting)} title={`Delete “${deleting?.name}”?`} message="This version, its AI suggestions and history are removed permanently. The uploaded file and the original version are not affected." confirmLabel="Delete version" busy={busy} onConfirm={doDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
