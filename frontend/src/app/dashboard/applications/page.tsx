"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, Search, Pencil, Trash2, ExternalLink, LayoutList, LayoutGrid, Columns3, LogIn, Calendar, Bell, FileText, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import {
  APPLICATION_STATUSES, STATUS_LABELS, STATUS_STYLES, createApplication, deleteApplication, listApplications, updateApplication,
  type ApplicationInput, type ApplicationSort, type ApplicationStatus, type JobApplication, type Pipeline,
} from "@/services/jobApplicationService";
import { listJobDescriptions, type SavedJobDescription } from "@/services/jobDescriptionService";
import { listResumes, type ResumeListItem } from "@/services/resumeService";
import { listAnalysisHistory, type AnalysisHistoryItem } from "@/services/analysisHistoryService";
import { cn, formatDate, getScoreColor } from "@/lib/utils";

type View = "table" | "cards" | "kanban";

const emptyForm = (): ApplicationInput & { applicationDate: string } => ({
  companyName: "", jobTitle: "", jobUrl: "", applicationDate: new Date().toISOString().slice(0, 10), status: "INTERESTED", nextFollowUpDate: "", notes: "", jobDescriptionId: "", resumeId: "", analysisId: "",
});

const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

export default function ApplicationsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [rows, setRows] = useState<JobApplication[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("table");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ApplicationStatus | "">("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<ApplicationSort>("newest");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<JobApplication | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [jds, setJds] = useState<SavedJobDescription[]>([]);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("resumeai_applications_view");
      if (saved === "table" || saved === "cards" || saved === "kanban") setView(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem("resumeai_applications_view", view); } catch { /* ignore */ }
  }, [view]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listApplications({ q: q || undefined, status: status || undefined, targetRole: role || undefined, from: from || undefined, to: to ? `${to}T23:59:59` : undefined, sort, page, limit: view === "kanban" ? 100 : 20 });
      setRows(data.applications);
      setPipeline(data.pipeline);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, q, status, role, from, to, sort, page, view]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [ready, user, load, q]);
  useEffect(() => { setPage(1); }, [q, status, role, from, to, sort, view]);

  async function loadLinkOptions() {
    try {
      const [j, r, a] = await Promise.all([listJobDescriptions({ limit: 100 }), listResumes({ limit: 100 }), listAnalysisHistory({ mode: "ai", limit: 100 })]);
      setJds(j.jobDescriptions); setResumes(r.resumes); setAnalyses(a.analyses);
    } catch { /* link pickers stay empty */ }
  }

  function openCreate(prefill?: Partial<ApplicationInput>) {
    setEditing(null);
    setForm({ ...emptyForm(), ...prefill });
    setFormErrors({});
    setFormOpen(true);
    loadLinkOptions();
  }
  function openEdit(a: JobApplication) {
    setEditing(a);
    setForm({ companyName: a.companyName, jobTitle: a.jobTitle, jobUrl: a.jobUrl ?? "", applicationDate: toDateInput(a.applicationDate), status: a.status, nextFollowUpDate: toDateInput(a.nextFollowUpDate), notes: a.notes ?? "", jobDescriptionId: a.jobDescriptionId ?? "", resumeId: a.resumeId ?? "", analysisId: a.analysisId ?? "" });
    setFormErrors({});
    setFormOpen(true);
    loadLinkOptions();
  }

  function validateForm() {
    const errs: Record<string, string> = {};
    if (!form.companyName.trim()) errs.companyName = "Company is required.";
    if (form.jobTitle.trim().length < 2) errs.jobTitle = "Job title is required.";
    if (form.jobUrl && !/^https?:\/\/\S+$/i.test(form.jobUrl)) errs.jobUrl = "Enter a valid http(s) URL.";
    if (form.nextFollowUpDate && form.applicationDate && form.nextFollowUpDate < form.applicationDate) errs.nextFollowUpDate = "Follow-up must be on or after the application date.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: ApplicationInput = {
        companyName: form.companyName.trim(), jobTitle: form.jobTitle.trim(), jobUrl: form.jobUrl || null, applicationDate: form.applicationDate || undefined, status: form.status,
        nextFollowUpDate: form.nextFollowUpDate || null, notes: form.notes || null, jobDescriptionId: form.jobDescriptionId || null, resumeId: form.resumeId || null, analysisId: form.analysisId || null,
      };
      if (editing) await updateApplication(editing.id, payload);
      else await createApplication(payload);
      toast.success(editing ? "Application updated." : "Application added.");
      setFormOpen(false);
      await load();
    } catch (err) {
      const e = toApiClientError(err) as ApiClientError;
      if (e.details?.length) setFormErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
      else toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(a: JobApplication, next: ApplicationStatus) {
    if (a.status === next) return;
    setBusyId(a.id);
    const prev = rows;
    setRows((r) => r.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    try {
      await updateApplication(a.id, { status: next });
      toast.success(`${a.companyName}: moved to ${STATUS_LABELS[next]}.`);
      await load();
    } catch (err) {
      setRows(prev);
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await deleteApplication(deleting.id);
      toast.success("Application deleted.");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return <div className="max-w-6xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={LogIn} title="Sign in to track applications" description="Applications, statuses, notes and follow-ups are stored in your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/applications", icon: LogIn }} />
      </div>
    );
  }

  const filtersActive = Boolean(q || status || role || from || to);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Applications</h1>
          <p className="text-gray-500 mt-1">{pipeline ? `${pipeline.total} tracked · ${pipeline.active} active` : "Track every application from interest to offer"}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="View">
            {([["table", LayoutList, "Table"], ["cards", LayoutGrid, "Cards"], ["kanban", Columns3, "Kanban"]] as const).map(([v, Icon, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md", view === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100")}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button onClick={() => openCreate()}><Plus className="w-4 h-4" /> Add application</Button>
        </div>
      </div>

      {/* Pipeline */}
      {pipeline && pipeline.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {APPLICATION_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(status === s ? "" : s)} className={cn("rounded-xl border px-3 py-2.5 text-left transition-shadow hover:shadow-sm", STATUS_STYLES[s], status === s && "ring-2 ring-offset-1 ring-gray-900")}>
              <div className="text-xl font-bold tabular-nums">{pipeline.counts[s]}</div>
              <div className="text-xs font-medium">{STATUS_LABELS[s]}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-[calc(50%+6px)] -translate-y-1/2 w-4 h-4 text-gray-400" />
            <label className="text-xs text-gray-600">Search
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or title" className="mt-1 w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" />
            </label>
          </div>
          <label className="text-xs text-gray-600">Status
            <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus | "")} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Any</option>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">Role
            <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Any</option>{TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-600">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white" /></label>
          <label className="text-xs text-gray-600">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white" /></label>
          <label className="text-xs text-gray-600">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as ApplicationSort)} className="mt-1 w-full text-sm px-2 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="company">Company</option><option value="followUp">Follow-up date</option><option value="updated">Recently updated</option><option value="score">Match score</option>
            </select>
          </label>
        </CardContent>
      </Card>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex justify-between gap-3"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>}

      {loading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={filtersActive ? "No applications match" : "No applications yet"}
          description={filtersActive ? "Try different filters." : "Add the jobs you're interested in and move them through the pipeline as you progress."}
          action={filtersActive ? { label: "Clear filters", onClick: () => { setQ(""); setStatus(""); setRole(""); setFrom(""); setTo(""); } } : { label: "Add Job Application", onClick: () => openCreate(), icon: Plus }}
        />
      ) : view === "table" ? (
        <TableView rows={rows} busyId={busyId} onEdit={openEdit} onDelete={setDeleting} onStatus={changeStatus} />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{rows.map((a) => <AppCard key={a.id} a={a} busy={busyId === a.id} onEdit={openEdit} onDelete={setDeleting} onStatus={changeStatus} />)}</div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[16rem] gap-3 min-w-max">
            {APPLICATION_STATUSES.map((s) => {
              const col = rows.filter((a) => a.status === s);
              return (
                <div
                  key={s}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { const a = rows.find((x) => x.id === dragId); if (a) changeStatus(a, s); setDragId(null); }}
                  className={cn("rounded-xl border p-2 min-h-[12rem] space-y-2", STATUS_STYLES[s])}
                >
                  <div className="flex items-center justify-between px-1"><span className="text-xs font-semibold">{STATUS_LABELS[s]}</span><span className="text-xs tabular-nums opacity-70">{col.length}</span></div>
                  {col.map((a) => (
                    <div key={a.id} draggable onDragStart={() => setDragId(a.id)} onDragEnd={() => setDragId(null)} className={cn("bg-white rounded-lg border border-gray-200 p-2.5 text-sm shadow-sm cursor-grab active:cursor-grabbing", dragId === a.id && "opacity-50")}>
                      <p className="font-semibold text-gray-900 truncate">{a.companyName}</p>
                      <p className="text-xs text-gray-600 truncate">{a.jobTitle}</p>
                      <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
                        <span>{formatDate(a.applicationDate)}</span>
                        {a.matchScore !== null && <span className={cn("font-semibold", getScoreColor(a.matchScore))}>{a.matchScore}%</span>}
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        <button type="button" onClick={() => openEdit(a)} className="text-[11px] text-blue-600 hover:underline">Edit</button>
                        <select aria-label="Move to" value={a.status} onChange={(e) => changeStatus(a, e.target.value as ApplicationStatus)} className="ml-auto text-[11px] border border-gray-200 rounded px-1 bg-white">
                          {APPLICATION_STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && <p className="text-[11px] opacity-60 px-1">Drop here</p>}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Drag a card to another column to change its status. Changes are saved to your account immediately.</p>
        </div>
      )}

      {view !== "kanban" && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /> Prev</Button>
          <span className="text-gray-500">Page {page} of {totalPages} · {total} total</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}

      {/* Form */}
      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? "Edit application" : "Add application"} size="lg" footer={<><Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save changes" : "Add application"}</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4" noValidate>
          <Field label="Company *" error={formErrors.companyName}><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} maxLength={120} className={inputCls(formErrors.companyName)} /></Field>
          <Field label="Job title *" error={formErrors.jobTitle}><input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} maxLength={120} className={inputCls(formErrors.jobTitle)} /></Field>
          <Field label="Job URL" error={formErrors.jobUrl}><input type="url" value={form.jobUrl ?? ""} onChange={(e) => setForm({ ...form, jobUrl: e.target.value })} placeholder="https://" className={inputCls(formErrors.jobUrl)} /></Field>
          <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })} className={inputCls()}>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></Field>
          <Field label="Application date" error={formErrors.applicationDate}><input type="date" value={form.applicationDate} onChange={(e) => setForm({ ...form, applicationDate: e.target.value })} className={inputCls(formErrors.applicationDate)} /></Field>
          <Field label="Next follow-up" error={formErrors.nextFollowUpDate}><input type="date" value={form.nextFollowUpDate ?? ""} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} className={inputCls(formErrors.nextFollowUpDate)} /></Field>
          <Field label="Saved job description" hint={jds.length === 0 ? "None saved yet" : undefined}>
            <select value={form.jobDescriptionId ?? ""} onChange={(e) => { const jd = jds.find((j) => j.id === e.target.value); setForm({ ...form, jobDescriptionId: e.target.value, ...(jd && !form.companyName ? { companyName: jd.companyName ?? "" } : {}), ...(jd && !form.jobTitle ? { jobTitle: jd.jobTitle } : {}) }); }} className={inputCls()}>
              <option value="">None</option>{jds.map((j) => <option key={j.id} value={j.id}>{j.jobTitle}{j.companyName ? ` · ${j.companyName}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Resume used" hint={resumes.length === 0 ? "No stored resumes" : undefined}>
            <select value={form.resumeId ?? ""} onChange={(e) => setForm({ ...form, resumeId: e.target.value })} className={inputCls()}><option value="">None</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          </Field>
          <Field label="Linked AI analysis" hint={analyses.length === 0 ? "No AI analyses yet" : undefined} className="sm:col-span-2">
            <select value={form.analysisId ?? ""} onChange={(e) => setForm({ ...form, analysisId: e.target.value })} className={inputCls()}>
              <option value="">None</option>{analyses.map((a) => <option key={a.id} value={a.id}>{a.jobTitle}{a.companyName ? ` · ${a.companyName}` : ""} — {a.scoreAvailable ? `${a.matchScore}%` : "no score"} ({formatDate(a.createdAt)})</option>)}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2" error={formErrors.notes}><textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={5000} className={inputCls(formErrors.notes) + " resize-y"} /></Field>
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete application?" message={`${deleting?.companyName} — ${deleting?.jobTitle} will be removed. Linked resumes, job descriptions and analyses are not affected.`} confirmLabel="Delete" busy={Boolean(busyId)} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}

function inputCls(err?: string) {
  return cn("mt-1 w-full text-sm px-3 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500", err ? "border-red-400 bg-red-50" : "border-gray-300");
}

function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block text-sm text-gray-700", className)}>
      {label}
      {children}
      {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-gray-400 mt-1">{hint}</span> : null}
    </label>
  );
}

function StatusSelect({ a, busy, onStatus }: { a: JobApplication; busy: boolean; onStatus: (a: JobApplication, s: ApplicationStatus) => void }) {
  return (
    <select aria-label="Status" disabled={busy} value={a.status} onChange={(e) => onStatus(a, e.target.value as ApplicationStatus)} className={cn("text-xs font-medium rounded-full border px-2 py-1 cursor-pointer", STATUS_STYLES[a.status])}>
      {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
    </select>
  );
}

function FollowUp({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-400">—</span>;
  const overdue = new Date(date).getTime() < Date.now() - 86400000;
  return <span className={cn("inline-flex items-center gap-1", overdue ? "text-red-600 font-medium" : "text-gray-700")}><Bell className="w-3 h-3" />{formatDate(date)}{overdue && " · overdue"}</span>;
}

function TableView({ rows, busyId, onEdit, onDelete, onStatus }: { rows: JobApplication[]; busyId: string | null; onEdit: (a: JobApplication) => void; onDelete: (a: JobApplication) => void; onStatus: (a: JobApplication, s: ApplicationStatus) => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr><th className="text-left px-4 py-3">Company / title</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Applied</th><th className="text-left px-4 py-3">Follow-up</th><th className="text-left px-4 py-3">Links</th><th className="text-right px-4 py-3">Score</th><th className="px-4 py-3" /></tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50/60">
              <td className="px-4 py-3">
                <div className="font-semibold text-gray-900 flex items-center gap-1.5"><Link href={`/dashboard/applications/${a.id}`} className="hover:text-blue-700">{a.companyName}</Link>{a.jobUrl && <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600" aria-label="Open job posting"><ExternalLink className="w-3.5 h-3.5" /></a>}</div>
                <div className="text-gray-600">{a.jobTitle}</div>
                <Link href={`/dashboard/applications/${a.id}`} className="text-xs text-indigo-700 hover:underline">Open workspace →</Link>
                {a.notes && <div className="text-xs text-gray-400 truncate max-w-xs" title={a.notes}>{a.notes}</div>}
              </td>
              <td className="px-4 py-3"><StatusSelect a={a} busy={busyId === a.id} onStatus={onStatus} /></td>
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(a.applicationDate)}</td>
              <td className="px-4 py-3 whitespace-nowrap"><FollowUp date={a.nextFollowUpDate} /></td>
              <td className="px-4 py-3 text-xs text-gray-500 space-y-0.5">
                {a.resume && <div className="flex items-center gap-1"><FileText className="w-3 h-3" />{a.resume.name}</div>}
                {a.jobDescription && <div className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{a.jobDescription.targetRole}</div>}
                {a.analysis && <Link href={`/dashboard/resume-analysis/${a.analysis.id}`} className="flex items-center gap-1 text-blue-600 hover:underline"><Sparkles className="w-3 h-3" />analysis</Link>}
                {!a.resume && !a.jobDescription && !a.analysis && <span className="text-gray-300">—</span>}
              </td>
              <td className={cn("px-4 py-3 text-right font-bold tabular-nums", a.matchScore !== null ? getScoreColor(a.matchScore) : "text-gray-300")}>{a.matchScore !== null ? `${a.matchScore}%` : "—"}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <Button size="sm" variant="ghost" onClick={() => onEdit(a)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(a)} aria-label="Delete" className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppCard({ a, busy, onEdit, onDelete, onStatus }: { a: JobApplication; busy: boolean; onEdit: (a: JobApplication) => void; onDelete: (a: JobApplication) => void; onStatus: (a: JobApplication, s: ApplicationStatus) => void }) {
  return (
    <Card hover>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{a.companyName}</p>
            <p className="text-sm text-gray-600 truncate">{a.jobTitle}</p>
          </div>
          <StatusSelect a={a} busy={busy} onStatus={onStatus} />
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(a.applicationDate)}</span>
          <FollowUp date={a.nextFollowUpDate} />
          {a.matchScore !== null && <span className={cn("font-semibold", getScoreColor(a.matchScore))}>{a.matchScore}% match</span>}
        </div>
        {a.notes && <p className="text-xs text-gray-600 line-clamp-2">{a.notes}</p>}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="flex gap-2 text-xs text-gray-500">
            {a.resume && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{a.resume.name}</span>}
            {a.analysis && <Link href={`/dashboard/resume-analysis/${a.analysis.id}`} className="text-blue-600 hover:underline">View analysis</Link>}
            {a.jobUrl && <a href={a.jobUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Posting</a>}
          </div>
          <div>
            <Button size="sm" variant="ghost" onClick={() => onEdit(a)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(a)} aria-label="Delete" className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
