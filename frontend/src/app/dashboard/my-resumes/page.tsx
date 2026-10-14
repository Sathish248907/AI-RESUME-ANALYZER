"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Upload, Search, Pencil, Trash2, Download, Sparkles, History, Check, X, LogIn, FlaskConical, Briefcase } from "lucide-react";
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
import { toApiClientError } from "@/services/api";
import { deleteResume, downloadResume, getResume, listResumes, updateResume, uploadResume, type ResumeDetail, type ResumeListItem, type ResumeSort } from "@/services/resumeService";
import type { AnalysisHistoryItem } from "@/services/analysisHistoryService";
import { getAnalysisMetas } from "@/services/analysisStorage";
import { formatFileSize, getFileTypeLabel, validateFile } from "@/services/resumeParser";
import { formatDate, getScoreColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function MyResumesPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [items, setItems] = useState<ResumeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState<ResumeSort>("newest");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadRole, setUploadRole] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [renaming, setRenaming] = useState<ResumeListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameRole, setRenameRole] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<ResumeListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [detail, setDetail] = useState<{ resume: ResumeDetail; analyses: AnalysisHistoryItem[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const demoCount = useMemo(() => (typeof window === "undefined" ? 0 : getAnalysisMetas().length), []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listResumes({ q: q || undefined, targetRole: role || undefined, sort, limit: 50 });
      setItems(data.resumes);
      setTotal(data.total);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, q, role, sort]);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [ready, user, load, q]);

  // ── Upload ──────────────────────────────────────────────────────────────
  function pickFile(f: File | null) {
    setUploadError(null);
    if (!f) return setFile(null);
    const err = validateFile(f);
    if (err) {
      setUploadError(err.message);
      setFile(null);
      return;
    }
    setFile(f);
    if (!uploadName) setUploadName(f.name.replace(/\.(pdf|docx|doc)$/i, ""));
  }

  async function handleUpload() {
    if (!file) return setUploadError("Choose a PDF or DOCX file.");
    setUploading(true);
    setUploadError(null);
    try {
      await uploadResume(file, { name: uploadName.trim() || undefined, targetRole: uploadRole || undefined });
      toast.success("Resume uploaded and stored to your account.");
      setUploadOpen(false);
      setFile(null);
      setUploadName("");
      setUploadRole("");
      await load();
    } catch (err) {
      setUploadError(toApiClientError(err).message);
    } finally {
      setUploading(false);
    }
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  async function handleRename() {
    if (!renaming) return;
    if (!renameValue.trim()) return;
    setSaving(true);
    try {
      await updateResume(renaming.id, { name: renameValue.trim(), targetRole: renameRole || null });
      toast.success("Resume updated.");
      setRenaming(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteResume(deleting.id);
      toast.success(`Deleted "${deleting.name}". Its analyses were kept in your history.`);
      setDeleting(null);
      if (detail?.resume.id === deleting.id) setDetail(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      setDetail(await getResume(id));
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleDownload(r: ResumeListItem) {
    try {
      await downloadResume(r.id, r.originalFileName);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (!ready) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList rows={3} /></div>;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-6">
        <EmptyState
          icon={LogIn}
          title="Sign in to manage your resumes"
          description="Stored resumes live in your account so you can re-analyse them against different jobs, from any device."
          action={{ label: "Sign in", href: "/auth/login?next=/dashboard/my-resumes", icon: LogIn }}
        />
        {demoCount > 0 && (
          <p className="text-center text-sm text-gray-500">
            You have {demoCount} demo {demoCount === 1 ? "analysis" : "analyses"} in this browser — see{" "}
            <Link href="/dashboard/analysis-history" className="text-blue-600 hover:underline">Analysis History</Link>.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Resumes</h1>
          <p className="text-gray-500 mt-1">{total} stored {total === 1 ? "resume" : "resumes"} · saved to your account</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/analysis-history" className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <History className="w-4 h-4" /> Analysis history
          </Link>
          <Button onClick={() => setUploadOpen(true)}><Upload className="w-4 h-4" /> Upload resume</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or file…" aria-label="Search resumes" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by target role" className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white">
          <option value="">All target roles</option>
          {TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as ResumeSort)} aria-label="Sort" className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="role">Target role</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q || role ? "No resumes match" : "No resumes yet"}
          description={q || role ? "Try a different search or clear the filters." : "Upload a PDF or DOCX. We extract the text so you can analyse it against any job description."}
          action={q || role ? { label: "Clear filters", onClick: () => { setQ(""); setRole(""); } } : { label: "Upload your first resume", onClick: () => setUploadOpen(true), icon: Upload }}
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id} hover>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => openDetail(r.id)} className="font-semibold text-gray-900 hover:text-blue-700 truncate text-left">{r.name}</button>
                      <Badge variant="neutral">{getFileTypeLabel(r.fileType)}</Badge>
                      {r.targetRole && <Badge variant="info">{r.targetRole}</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {r.originalFileName} · {formatFileSize(r.fileSize)} · {r.charCount.toLocaleString()} chars · uploaded {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.latestAnalysis ? (
                      <Link href={`/dashboard/resume-analysis/${r.latestAnalysis.id}`} className="block">
                        <span className={cn("text-xl font-bold tabular-nums", getScoreColor(r.latestAnalysis.matchScore))}>{r.latestAnalysis.matchScore}%</span>
                        <span className="block text-[11px] text-gray-400">latest of {r.analysisCount} · {r.latestAnalysis.analysisMode === "ai" ? "AI" : "demo"}</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No analyses yet</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button size="sm" onClick={() => router.push(`/dashboard/resume-analyzer?resumeId=${r.id}`)} title="Analyze against a job"><Sparkles className="w-4 h-4" /> Analyze</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRenaming(r); setRenameValue(r.name); setRenameRole(r.targetRole ?? ""); }} aria-label="Rename"><Pencil className="w-4 h-4" /></Button>
                    {r.hasStoredFile && <Button size="sm" variant="ghost" onClick={() => handleDownload(r)} aria-label="Download original"><Download className="w-4 h-4" /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(r)} aria-label="Delete" className="text-red-500 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        The extracted text is kept so resumes can be re-analysed; it is only ever shown to you. Original files are {items.some((i) => i.hasStoredFile) ? "retained by this server" : "not retained by this server (storage driver: none)"}.
      </p>

      {/* Upload modal */}
      <Modal
        open={uploadOpen}
        onClose={() => !uploading && setUploadOpen(false)}
        title="Upload a resume"
        description="PDF or DOCX, up to 5 MB. Text is extracted on the server."
        footer={<><Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button><Button onClick={handleUpload} loading={uploading} disabled={!file}>Upload</Button></>}
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0] ?? null); }}
            className={cn("w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors", file ? "border-green-300 bg-green-50" : "border-gray-300 hover:border-blue-400 bg-gray-50")}
          >
            <Upload className={cn("w-6 h-6 mx-auto mb-2", file ? "text-green-600" : "text-gray-400")} />
            {file ? <p className="text-sm font-medium text-gray-900">{file.name} <span className="text-gray-500">({formatFileSize(file.size)})</span></p> : <p className="text-sm text-gray-600">Drop a file here or <span className="text-blue-600 font-medium">browse</span></p>}
          </button>
          <input ref={fileInput} type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">Display name
              <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} maxLength={120} placeholder="e.g. Frontend CV 2026" className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="text-sm text-gray-700">Target role <span className="text-gray-400 font-normal">(optional)</span>
              <select value={uploadRole} onChange={(e) => setUploadRole(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Not set</option>
                {TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          {uploadError && <p role="alert" className="text-sm text-red-600">{uploadError}</p>}
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Edit resume" size="sm" footer={<><Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={handleRename} loading={saving} disabled={!renameValue.trim()}><Check className="w-4 h-4" /> Save</Button></>}>
        <div className="space-y-3">
          <label className="text-sm text-gray-700 block">Name
            <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={120} className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="text-sm text-gray-700 block">Target role
            <select value={renameRole} onChange={(e) => setRenameRole(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 border border-gray-300 rounded-lg">
              <option value="">Not set</option>
              {TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete resume?"
        message={`"${deleting?.name}" will be removed from your account${deleting?.hasStoredFile ? " and its stored file deleted" : ""}. Analyses already run with it stay in your history but can no longer be regenerated.`}
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />

      {/* Detail drawer */}
      <Modal open={Boolean(detail) || detailLoading} onClose={() => setDetail(null)} title={detail?.resume.name ?? "Loading…"} size="lg" description={detail ? `${detail.resume.originalFileName} · ${formatFileSize(detail.resume.fileSize)} · ${detail.resume.charCount.toLocaleString()} characters` : undefined}>
        {detailLoading || !detail ? <SkeletonList rows={2} /> : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Text preview</p>
              <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{detail.resume.textPreview}{detail.resume.charCount > 600 ? "…" : ""}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Analysis history ({detail.analyses.length})</p>
                <Button size="sm" onClick={() => router.push(`/dashboard/resume-analyzer?resumeId=${detail.resume.id}`)}><Sparkles className="w-3.5 h-3.5" /> New analysis</Button>
              </div>
              {detail.analyses.length === 0 ? (
                <p className="text-sm text-gray-400 italic">This resume has not been analysed yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {detail.analyses.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      {a.analysisMode === "ai" ? <Briefcase className="w-4 h-4 text-indigo-500" /> : <FlaskConical className="w-4 h-4 text-amber-500" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{a.jobTitle}{a.companyName ? ` · ${a.companyName}` : ""}</p>
                        <p className="text-xs text-gray-400">{formatDate(a.createdAt)} · {a.skillCounts.matched} matched / {a.skillCounts.missing} missing or unverified</p>
                      </div>
                      <span className={cn("font-bold tabular-nums", getScoreColor(a.matchScore))}>{a.scoreAvailable ? `${a.matchScore}%` : "—"}</span>
                      <Link href={`/dashboard/resume-analysis/${a.id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
      <span className="hidden"><X /></span>
    </div>
  );
}
