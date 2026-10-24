"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PenSquare, LogIn, FileText, Plus, Sparkles, Upload, Clock, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { listResumes, type ResumeListItem } from "@/services/resumeService";
import { createVersion, getEditableResume, listVersions, type ResumeVersionSummary } from "@/services/resumeBuilderService";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import { formatDate } from "@/lib/utils";

const KIND: Record<string, "neutral" | "success" | "info" | "warning"> = { original: "neutral", improved: "success", tailored: "info", custom: "neutral", restored: "warning" };

export default function ResumeBuilderHubPage() {
  return <Suspense fallback={<div className="max-w-6xl mx-auto px-4 py-10"><SkeletonList /></div>}><HubInner /></Suspense>;
}

function HubInner() {
  const router = useRouter();
  const search = useSearchParams();
  const requestedResumeId = search?.get("resumeId") ?? null;
  const autoOpened = useRef(false);
  const toast = useToast();
  const { user, ready } = useAuth();
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [r, v, h] = await Promise.all([listResumes({ limit: 100 }), listVersions({ limit: 100 }), getBackendHealth()]);
      setResumes(r.resumes); setVersions(v.versions); setAiConfigured(Boolean(h?.ai.configured));
    } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);
  // Deep link from "My resumes": open (or create) the working copy for that upload.
  useEffect(() => {
    if (loading || !requestedResumeId || autoOpened.current) return;
    const r = resumes.find((x) => x.id === requestedResumeId);
    if (r) { autoOpened.current = true; openResume(r); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, requestedResumeId, resumes]);

  async function openResume(r: ResumeListItem, structure: "heuristic" | "ai" = "heuristic") {
    setBusy(`${r.id}-${structure}`);
    try {
      const ed = await getEditableResume(r.id);
      const working = ed.versions.find((v) => !v.isOriginal);
      if (working && structure === "heuristic") { router.push(`/dashboard/resume-builder/${working.id}`); return; }
      const created = await createVersion({ resumeId: r.id, structure, name: structure === "ai" ? `${r.name} — AI structured` : `${r.name} — Working copy` });
      toast.success(structure === "ai" ? `Structured with ${created.structuring.model ?? "the AI provider"}; original kept unchanged.` : "Working copy created from your upload. The original is kept read-only.");
      router.push(`/dashboard/resume-builder/${created.version.id}`);
    } catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(null); }
  }
  async function createBlank() {
    setBusy("blank");
    try { const { version } = await createVersion({ blank: true, name: "New resume" }); router.push(`/dashboard/resume-builder/${version.id}`); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setBusy(null); }
  }

  if (!ready || (user && loading)) return <div className="max-w-6xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to build and improve resumes" description="Versions, AI suggestions and templates are saved to your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/resume-builder", icon: LogIn }} /></div>;

  const byResume = new Map<string | null, ResumeVersionSummary[]>();
  for (const v of versions) byResume.set(v.resumeId, [...(byResume.get(v.resumeId) ?? []), v]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><PenSquare className="w-7 h-7 text-indigo-600" /> Resume builder</h1>
          <p className="text-gray-500 mt-1">Edit a structured copy of your resume, get grounded AI improvements, tailor it to a job and export a clean PDF. Uploads are never modified.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/my-resumes"><Button variant="outline"><Upload className="w-4 h-4 mr-1" /> Upload a resume</Button></Link>
          <Button onClick={createBlank} loading={busy === "blank"}><Plus className="w-4 h-4 mr-1" /> Start from scratch</Button>
        </div>
      </div>
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">{error} <button className="underline ml-2" onClick={load}>Retry</button></div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" /> Your uploaded resumes</CardTitle></CardHeader>
        <CardContent>
          {resumes.length === 0 ? <EmptyState compact icon={Upload} title="No uploads yet" description="Upload a PDF or DOCX to start from its content, or start from scratch." action={{ label: "Upload", href: "/dashboard/my-resumes" }} /> : (
            <ul className="divide-y divide-gray-100">
              {resumes.map((r) => {
                const vs = byResume.get(r.id) ?? [];
                return (
                  <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.originalFileName} · {r.charCount.toLocaleString()} chars · {vs.length} version{vs.length === 1 ? "" : "s"}</p>
                    </div>
                    <Button size="sm" onClick={() => openResume(r)} loading={busy === `${r.id}-heuristic`}><PenSquare className="w-4 h-4 mr-1" /> {vs.some((v) => !v.isOriginal) ? "Open editor" : "Edit a copy"}</Button>
                    <Button size="sm" variant="outline" onClick={() => openResume(r, "ai")} loading={busy === `${r.id}-ai`} disabled={aiConfigured === false} title="One AI call that copies your text into sections verbatim; rejected if it rephrases anything."><Wand2 className="w-4 h-4 mr-1" /> AI-structured copy</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-gray-500" /> All versions</CardTitle></CardHeader>
        <CardContent>
          {versions.length === 0 ? <p className="text-sm text-gray-500">No versions yet. Open an upload or start from scratch.</p> : (
            <ul className="divide-y divide-gray-100">
              {versions.map((v) => (
                <li key={v.id} className="py-2.5 flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/resume-builder/${v.id}`} className="font-medium text-gray-900 hover:underline flex-1 min-w-[12rem] truncate">{v.name}</Link>
                  <Badge variant={KIND[v.kind] ?? "neutral"}>{v.kind}</Badge>
                  {v.isOriginal && <Badge variant="neutral">read-only</Badge>}
                  <span className="text-xs text-gray-500">{v.resume ? v.resume.name : "from scratch"} · {v.templateId} · {v.jobDescription ? `for ${v.jobDescription.jobTitle}` : v.targetJobTitle ? `for ${v.targetJobTitle}` : "no target"} · {formatDate(v.updatedAt)}</span>
                  {typeof v.lastQualityScore === "number" && <span className="text-xs font-semibold text-gray-700 inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-indigo-500" /> {v.lastQualityScore}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
