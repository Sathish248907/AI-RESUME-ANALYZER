"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Search, Pencil, Trash2, ExternalLink, LogIn, Sparkles, FileText, Building2, Layers, Info, ChevronLeft, ChevronRight, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import Modal from "@/components/common/Modal";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { createJobDescription, deleteJobDescription, getJobDescription, listJobDescriptions, updateJobDescription, type ExtractedRequirements, type JobDescriptionInput, type JobDescriptionSort, type SavedJobDescription } from "@/services/jobDescriptionService";
import { listResumes, type ResumeListItem } from "@/services/resumeService";
import { runAiAnalysis } from "@/services/resumeAnalysisService";
import { parseJobDescription } from "@/services/jobDescriptionParser";
import { cn, formatDate, getScoreColor } from "@/lib/utils";

const emptyForm = (): JobDescriptionInput => ({ jobTitle: "", companyName: "", targetRole: "", description: "", sourceUrl: "" });

/** Run the Phase 3 rule-based parser and shape the result for storage. */
function extractRequirements(form: JobDescriptionInput): ExtractedRequirements | null {
  if (form.description.trim().length < 100 || !form.jobTitle.trim() || !form.targetRole) return null;
  const parsed = parseJobDescription({ jobTitle: form.jobTitle, companyName: form.companyName ?? undefined, targetRole: form.targetRole, description: form.description });
  return {
    skills: parsed.skills.map((s) => ({ name: s.name, category: s.category, priority: s.priority })),
    experience: { minYears: parsed.experience.minYears, maxYears: parsed.experience.maxYears, seniority: parsed.experience.seniority },
    education: { degrees: parsed.education.degrees, fields: parsed.education.fields },
    certifications: parsed.certifications,
    responsibilities: parsed.responsibilities.map((r) => r.text).slice(0, 40),
    keywords: parsed.keywords.technical.map((k) => k.term).slice(0, 60),
    parserVersion: parsed.parserVersion,
  };
}

export default function JobDescriptionsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [rows, setRows] = useState<SavedJobDescription[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState<JobDescriptionSort>("newest");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavedJobDescription | null>(null);
  const [form, setForm] = useState<JobDescriptionInput>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SavedJobDescription | null>(null);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<SavedJobDescription | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [compareResume, setCompareResume] = useState("");
  const [comparing, setComparing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listJobDescriptions({ q: q || undefined, targetRole: role || undefined, sort, page, limit: 20 });
      setRows(data.jobDescriptions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, q, role, sort, page]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [ready, user, load, q]);
  useEffect(() => { setPage(1); }, [q, role, sort]);

  function openCreate() { setEditing(null); setForm(emptyForm()); setFormErrors({}); setFormOpen(true); }
  async function openEdit(jd: SavedJobDescription) {
    try {
      const full = jd.description !== undefined ? jd : await getJobDescription(jd.id);
      setEditing(full);
      setForm({ jobTitle: full.jobTitle, companyName: full.companyName ?? "", targetRole: full.targetRole, description: full.description ?? "", sourceUrl: full.sourceUrl ?? "" });
      setFormErrors({});
      setFormOpen(true);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    }
  }

  function validateForm() {
    const errs: Record<string, string> = {};
    if (form.jobTitle.trim().length < 2) errs.jobTitle = "Job title is required.";
    if (!form.targetRole) errs.targetRole = "Select a target role.";
    if (form.description.trim().length < 100) errs.description = `Description must be at least 100 characters (${form.description.trim().length} so far).`;
    if (form.sourceUrl && !/^https?:\/\/\S+$/i.test(form.sourceUrl)) errs.sourceUrl = "Enter a valid http(s) URL.";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload: JobDescriptionInput = { jobTitle: form.jobTitle.trim(), companyName: form.companyName?.trim() || null, targetRole: form.targetRole, description: form.description.trim(), sourceUrl: form.sourceUrl || null, extractedRequirements: extractRequirements(form) };
      if (editing) await updateJobDescription(editing.id, payload);
      else await createJobDescription(payload);
      toast.success(editing ? "Job description updated." : "Job description saved.");
      setFormOpen(false);
      if (detail && editing && detail.id === editing.id) setDetail(await getJobDescription(editing.id));
      await load();
    } catch (err) {
      const e = toApiClientError(err) as ApiClientError;
      if (e.details?.length) setFormErrors(Object.fromEntries(e.details.map((d) => [d.field, d.message])));
      else toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteJobDescription(deleting.id);
      toast.success("Job description deleted. Linked analyses and applications were kept.");
      setDeleting(null);
      if (detail?.id === deleting.id) setDetail(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const [jd, r] = await Promise.all([getJobDescription(id), listResumes({ limit: 100 })]);
      setDetail(jd);
      setResumes(r.resumes);
      setCompareResume(r.resumes[0]?.id ?? "");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function compare() {
    if (!detail || !compareResume) return;
    setComparing(true);
    try {
      const rec = await runAiAnalysis({ resumeId: compareResume, jobDescriptionId: detail.id });
      toast.success("Analysis complete.");
      router.push(`/dashboard/resume-analysis/${rec.id}`);
    } catch (err) {
      const e = toApiClientError(err);
      toast.error(e.message);
    } finally {
      setComparing(false);
    }
  }

  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={LogIn} title="Sign in to save job descriptions" description="Saved descriptions can be reused across resumes and linked to applications." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/job-descriptions", icon: LogIn }} />
      </div>
    );
  }

  const skills = detail?.extractedRequirements?.skills ?? [];
  const previewReqs = formOpen ? extractRequirements(form) : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Saved Job Descriptions</h1>
          <p className="text-gray-500 mt-1">{total} saved · reuse them to analyse different resumes against the same job</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> New job description</Button>
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
        Paste the description text manually. URLs are stored for reference only — the server never fetches them.
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, company or role…" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white"><option value="">All target roles</option>{TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value as JobDescriptionSort)} className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title A–Z</option><option value="company">Company A–Z</option></select>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex justify-between gap-3"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>}

      {loading ? <SkeletonList /> : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title={q || role ? "No saved descriptions match" : "No saved job descriptions"} description={q || role ? "Try different filters." : "Save a job description once and compare every resume against it."} action={q || role ? { label: "Clear filters", onClick: () => { setQ(""); setRole(""); } } : { label: "Save your first job description", onClick: openCreate, icon: Plus }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((jd) => (
            <Card key={jd.id} hover>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => openDetail(jd.id)} className="font-semibold text-gray-900 hover:text-blue-700 text-left truncate block w-full">{jd.jobTitle}</button>
                    <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">{jd.companyName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{jd.companyName}</span>}<Badge variant="info">{jd.targetRole}</Badge></p>
                  </div>
                  {jd.sourceUrl && <a href={jd.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600" aria-label="Open source URL"><ExternalLink className="w-4 h-4" /></a>}
                </div>
                <p className="text-xs text-gray-600 line-clamp-3">{jd.descriptionPreview}</p>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{jd.skillCount} skills extracted</span>
                  <span className="flex items-center gap-1"><Bot className="w-3 h-3" />{jd.analysisCount} analyses</span>
                  <span>{jd.applicationCount} applications</span>
                  <span className="ml-auto">{formatDate(jd.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                  <Button size="sm" onClick={() => openDetail(jd.id)}><Sparkles className="w-3.5 h-3.5" /> Compare resumes</Button>
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/resume-analyzer?jobDescriptionId=${jd.id}`)}>Analyze</Button>
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => openEdit(jd)} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(jd)} aria-label="Delete" className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /> Prev</Button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}

      {/* Create / edit */}
      <Modal open={formOpen} onClose={() => !saving && setFormOpen(false)} title={editing ? "Edit job description" : "New job description"} size="lg" footer={<><Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save changes" : "Save"}</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm text-gray-700">Job title *<input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} maxLength={120} className={inputCls(formErrors.jobTitle)} />{formErrors.jobTitle && <span className="block text-xs text-red-600 mt-1">{formErrors.jobTitle}</span>}</label>
            <label className="text-sm text-gray-700">Company<input value={form.companyName ?? ""} onChange={(e) => setForm({ ...form, companyName: e.target.value })} maxLength={120} className={inputCls()} /></label>
            <label className="text-sm text-gray-700">Target role *<select value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value })} className={inputCls(formErrors.targetRole)}><option value="">Select…</option>{TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>{formErrors.targetRole && <span className="block text-xs text-red-600 mt-1">{formErrors.targetRole}</span>}</label>
          </div>
          <label className="text-sm text-gray-700 block">Source URL <span className="text-gray-400">(optional, stored for reference only)</span><input type="url" value={form.sourceUrl ?? ""} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://" className={inputCls(formErrors.sourceUrl)} />{formErrors.sourceUrl && <span className="block text-xs text-red-600 mt-1">{formErrors.sourceUrl}</span>}</label>
          <label className="text-sm text-gray-700 block">Job description * <span className="text-gray-400">({form.description.trim().length.toLocaleString()} / 20,000)</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={10} maxLength={20000} className={inputCls(formErrors.description) + " resize-y"} />
            {formErrors.description && <span className="block text-xs text-red-600 mt-1">{formErrors.description}</span>}
          </label>
          {previewReqs && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-700 mb-1">Requirements that will be stored (rule-based extraction, demo quality)</p>
              <p>{previewReqs.skills?.length ?? 0} skills · {previewReqs.experience && (previewReqs.experience as { minYears: number | null }).minYears !== null ? `${(previewReqs.experience as { minYears: number }).minYears}+ years` : "experience not stated"} · {previewReqs.responsibilities?.length ?? 0} responsibilities</p>
              <div className="flex flex-wrap gap-1 mt-1.5">{(previewReqs.skills ?? []).slice(0, 15).map((s) => <span key={s.name} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">{s.name}</span>)}{(previewReqs.skills?.length ?? 0) > 15 && <span>+{(previewReqs.skills?.length ?? 0) - 15} more</span>}</div>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog open={Boolean(deleting)} title="Delete job description?" message={`"${deleting?.jobTitle}" will be removed. Analyses and applications that used it stay in your account (the link is cleared).`} confirmLabel="Delete" busy={busy} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />

      {/* Detail / compare */}
      <Modal open={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} title={detail?.jobTitle ?? "Loading…"} description={detail ? `${detail.companyName ?? "Company not specified"} · ${detail.targetRole}` : undefined} size="lg">
        {detailLoading || !detail ? <SkeletonList rows={2} /> : (
          <div className="space-y-5">
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-indigo-900 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Compare a stored resume against this job</p>
              {resumes.length === 0 ? (
                <p className="text-xs text-indigo-800 mt-1">No stored resumes yet. <Link href="/dashboard/my-resumes" className="underline">Upload one</Link> first.</p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <select value={compareResume} onChange={(e) => setCompareResume(e.target.value)} className="flex-1 text-sm px-3 py-2 border border-indigo-200 rounded-lg bg-white">{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  <Button onClick={compare} loading={comparing} disabled={!compareResume}><Bot className="w-4 h-4" /> Run AI analysis</Button>
                </div>
              )}
              <p className="text-[11px] text-indigo-700 mt-2">Runs the real backend analysis (15–60 s) and adds a new history record.</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resumes already analysed against this job ({detail.analyses?.length ?? 0})</p>
              {!detail.analyses?.length ? <p className="text-sm text-gray-400 italic">None yet.</p> : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500"><tr><th className="text-left py-1">Resume</th><th className="text-left py-1">Date</th><th className="text-right py-1">Score</th><th /></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.analyses.map((a) => (
                      <tr key={a.id}><td className="py-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-gray-400" />{a.resumeName ?? "Deleted resume"}{a.analysisMode === "demo" && <Badge variant="warning">demo</Badge>}</td><td className="py-1.5 text-gray-500">{formatDate(a.createdAt)}</td><td className={cn("py-1.5 text-right font-bold tabular-nums", getScoreColor(a.matchScore))}>{a.matchScore}%</td><td className="py-1.5 text-right"><Link href={`/dashboard/resume-analysis/${a.id}`} className="text-blue-600 hover:underline text-xs">View</Link></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Extracted skills &amp; requirements <span className="font-normal normal-case">(rule-based, {detail.extractedRequirements?.parserVersion ?? "not extracted"})</span></p>
              {skills.length === 0 ? <p className="text-sm text-gray-400 italic">No requirements extracted. Edit and save the description to run extraction.</p> : (
                <div className="flex flex-wrap gap-1.5">{skills.map((s) => <span key={s.name} className={cn("px-2 py-0.5 rounded-full text-xs border", s.priority === "required" ? "bg-blue-50 text-blue-800 border-blue-200" : s.priority === "preferred" ? "bg-green-50 text-green-800 border-green-200" : "bg-gray-50 text-gray-700 border-gray-200")}>{s.name}</span>)}</div>
              )}
              {detail.extractedRequirements?.responsibilities?.length ? <ul className="mt-3 text-xs text-gray-600 list-disc pl-4 space-y-0.5">{detail.extractedRequirements.responsibilities.slice(0, 6).map((r) => <li key={r}>{r}</li>)}</ul> : null}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-900">Full description</summary>
              <pre className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto">{detail.description}</pre>
            </details>
          </div>
        )}
      </Modal>
    </div>
  );
}

function inputCls(err?: string) {
  return cn("mt-1 w-full text-sm px-3 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500", err ? "border-red-400 bg-red-50" : "border-gray-300");
}
