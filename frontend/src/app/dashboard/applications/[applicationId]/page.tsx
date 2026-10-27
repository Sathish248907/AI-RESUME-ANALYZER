"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, AlertCircle, Lock } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import { updateApplication, type ApplicationStatus } from "@/services/jobApplicationService";
import ApplicationWorkspace from "@/components/applications/ApplicationWorkspace";
import ApplicationChecklist from "@/components/applications/ApplicationChecklist";
import CoverLetterEditor from "@/components/applications/CoverLetterEditor";
import ApplicationDocumentManager from "@/components/applications/ApplicationDocumentManager";
import ApplicationTimeline from "@/components/applications/ApplicationTimeline";
import ApplicationReminders from "@/components/applications/ApplicationReminders";
import ApplicationInterviewPlanner from "@/components/applications/ApplicationInterviewPlanner";
import ApplicationReadinessReview from "@/components/applications/ApplicationReadinessReview";
import {
  addActivity, addChecklistItem, addDocumentLink, createCoverLetter, createInterview, createReminder,
  deleteChecklistItem, deleteCoverLetter, deleteDocument, deleteInterview, deleteReminder,
  downloadDocument, exportCoverLetter, getWorkspace, listCoverLetters, regenerateParagraph,
  runReadinessReview, triggerDownload, updateChecklistItem, updateCoverLetter, updateInterview,
  updateReminder, uploadDocument,
  type ChecklistItem, type CoverLetter, type DocumentCategory, type ReadinessReview, type Workspace,
} from "@/services/applicationWorkspaceService";

/**
 * The application workspace: everything about one application in one place.
 *
 * Status changes go through the Phase 5 tracker endpoint (`updateApplication`),
 * not through a Phase 13 endpoint, so there is exactly one place an
 * application's status is written.
 */
export default function ApplicationWorkspacePage() {
  const params = useParams<{ applicationId: string }>();
  const applicationId = (params?.applicationId as string) ?? "";
  const toast = useToast();
  const { user, ready } = useAuth();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [unusualPrompt, setUnusualPrompt] = useState<{ status: ApplicationStatus; message: string } | null>(null);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [addingActivity, setAddingActivity] = useState(false);
  const [addingReminder, setAddingReminder] = useState(false);
  const [addingInterview, setAddingInterview] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [letters, setLetters] = useState<CoverLetter[]>([]);
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [savingLetter, setSavingLetter] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastDraft, setLastDraft] = useState<Parameters<typeof CoverLetterEditor>[0]["lastDraft"]>(null);

  const [review, setReview] = useState<ReadinessReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [deletingItem, setDeletingItem] = useState<ChecklistItem | null>(null);

  const load = useCallback(async () => {
    if (!user || !applicationId) return;
    setLoading(true); setError(null);
    try {
      const [ws, health] = await Promise.all([getWorkspace(applicationId), getBackendHealth().catch(() => null)]);
      setWorkspace(ws);
      setAiConfigured(health ? Boolean(health.ai.configured) : null);
      const full = await listCoverLetters(applicationId);
      setLetters(full.coverLetters);
      setActiveLetterId((id) => id ?? full.coverLetters[0]?.id ?? null);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, applicationId]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  /** Refresh the workspace after any write, so derived state stays truthful. */
  const refresh = useCallback(async () => {
    try { setWorkspace(await getWorkspace(applicationId)); } catch { /* keep the current view */ }
  }, [applicationId]);

  // ── Status ──
  async function onChangeStatus(status: ApplicationStatus, opts: { note?: string; confirmUnusual?: boolean } = {}) {
    setChangingStatus(true);
    try {
      await updateApplication(applicationId, { status, statusNote: opts.note, confirmUnusual: opts.confirmUnusual });
      setUnusualPrompt(null);
      toast.success(`Moved to ${status}.`);
      await refresh();
    } catch (err) {
      const e = toApiClientError(err);
      if (e.code === "UNUSUAL_STATUS_TRANSITION") setUnusualPrompt({ status, message: e.message });
      else toast.error(e.message);
    } finally {
      setChangingStatus(false);
    }
  }

  async function onSetOutcome(outcome: "accepted" | "declined") {
    setChangingStatus(true);
    try {
      await updateApplication(applicationId, { outcome });
      toast.success(`Recorded as ${outcome}.`);
      await refresh();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setChangingStatus(false);
    }
  }

  // ── Checklist ──
  async function onToggleChecklist(item: ChecklistItem, completed: boolean, source: "in_app" | "external") {
    setBusyId(item.id);
    try {
      const res = await updateChecklistItem(applicationId, item.id, completed ? { completed: true, completionSource: source } : { completed: false });
      if (res.submissionPrompt) {
        toast.success(res.submissionPrompt.message);
      }
      await refresh();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onAddChecklist(input: { title: string; description?: string; category: DocumentCategory | string; isRequired: boolean }) {
    setAddingChecklist(true);
    try {
      await addChecklistItem(applicationId, input as never);
      await refresh();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setAddingChecklist(false);
    }
  }

  async function confirmDeleteChecklist() {
    if (!deletingItem) return;
    setBusyId(deletingItem.id);
    try {
      await deleteChecklistItem(applicationId, deletingItem.id);
      setDeletingItem(null);
      await refresh();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  // ── Cover letters ──
  const activeLetter = letters.find((l) => l.id === activeLetterId) ?? null;

  async function reloadLetters(selectId?: string) {
    const full = await listCoverLetters(applicationId);
    setLetters(full.coverLetters);
    if (selectId) setActiveLetterId(selectId);
  }

  async function onGenerate(input: Parameters<Parameters<typeof CoverLetterEditor>[0]["onGenerate"]>[0]) {
    setGenerating(true); setLastDraft(null);
    try {
      const res = await createCoverLetter(applicationId, input);
      setLastDraft({
        questions: res.questions ?? [],
        highlighted: res.highlighted ?? [],
        withheldParagraphs: res.withheldParagraphs ?? [],
        note: res.note ?? "",
      });
      await reloadLetters(res.coverLetter.id);
      await refresh();
      toast.success(res.note || "Draft ready — review it before you use it.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onWriteOwn(content: string) {
    setSavingLetter(true);
    try {
      const res = await createCoverLetter(applicationId, { content });
      await reloadLetters(res.coverLetter.id);
      await refresh();
      toast.success("Saved.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSavingLetter(false);
    }
  }

  async function onSaveLetter(content: string, title: string) {
    if (!activeLetter) return;
    setSavingLetter(true);
    try {
      await updateCoverLetter(activeLetter.id, { content, title });
      await reloadLetters(activeLetter.id);
      toast.success("Saved.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSavingLetter(false);
    }
  }

  async function onApproveLetter() {
    if (!activeLetter) return;
    setSavingLetter(true);
    try {
      await updateCoverLetter(activeLetter.id, { status: "approved" });
      await reloadLetters(activeLetter.id);
      await refresh();
      toast.success("Marked approved.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSavingLetter(false);
    }
  }

  async function onRegenerate(paragraph: string, instruction: string): Promise<string | null> {
    if (!activeLetter) return null;
    setRegenerating(true);
    try {
      const res = await regenerateParagraph(activeLetter.id, { paragraphText: paragraph, instruction: instruction || undefined });
      toast.success(res.note);
      return res.text;
    } catch (err) {
      toast.error(toApiClientError(err).message);
      return null;
    } finally {
      setRegenerating(false);
    }
  }

  async function onExportLetter() {
    if (!activeLetter) return;
    setExporting(true);
    try {
      const { blob, fileName } = await exportCoverLetter(activeLetter.id);
      triggerDownload(blob, fileName);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setExporting(false);
    }
  }

  async function onDeleteLetter(id: string) {
    setSavingLetter(true);
    try {
      await deleteCoverLetter(id);
      setActiveLetterId(null);
      await reloadLetters();
      await refresh();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSavingLetter(false);
    }
  }

  // ── Documents ──
  async function onUpload(file: File, category: DocumentCategory, note?: string) {
    setUploading(true);
    try {
      await uploadDocument(applicationId, file, { category, note });
      await refresh();
      toast.success("Attached.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setUploading(false);
    }
  }

  async function onAddLink(url: string, category: DocumentCategory, note?: string) {
    try {
      await addDocumentLink(applicationId, { url, category, note });
      await refresh();
      toast.success("Link added.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    }
  }

  // ── Misc writes ──
  const guard = async (setter: (v: boolean) => void, fn: () => Promise<void>, success?: string) => {
    setter(true);
    try { await fn(); await refresh(); if (success) toast.success(success); }
    catch (err) { toast.error(toApiClientError(err).message); }
    finally { setter(false); }
  };

  if (!ready || (user && loading)) {
    return <div className="max-w-5xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={6} /><SkeletonCard lines={8} /></div>;
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={Lock} title="Sign in to open this application" action={{ label: "Sign in", href: `/auth/login?next=/dashboard/applications/${applicationId}` }} />
      </div>
    );
  }
  if (error || !workspace) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={AlertCircle} title="Could not open this application" description={error ?? "Not found."} action={{ label: "Back to applications", href: "/dashboard/applications" }} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <Link href="/dashboard/applications" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> All applications
      </Link>

      <ApplicationWorkspace
        workspace={workspace}
        changingStatus={changingStatus}
        onChangeStatus={onChangeStatus}
        onSetOutcome={onSetOutcome}
        unusualPrompt={unusualPrompt}
        onDismissUnusual={() => setUnusualPrompt(null)}
      />

      <ApplicationReadinessReview
        review={review}
        busy={reviewing}
        onRun={() => guard(setReviewing, async () => { const r = await runReadinessReview(applicationId); setReview(r.review); })}
      />

      <ApplicationChecklist
        items={workspace.checklist.items}
        summary={workspace.checklist.summary}
        autoCompletions={workspace.checklist.autoCompletions}
        busyId={busyId}
        adding={addingChecklist}
        onToggle={onToggleChecklist}
        onAdd={onAddChecklist as never}
        onDelete={setDeletingItem}
      />

      <CoverLetterEditor
        letters={workspace.coverLetters}
        active={activeLetter}
        resumeVersions={workspace.resumeVersions}
        aiConfigured={aiConfigured}
        generating={generating}
        saving={savingLetter}
        regenerating={regenerating}
        exporting={exporting}
        lastDraft={lastDraft}
        onSelect={setActiveLetterId}
        onGenerate={onGenerate}
        onWriteOwn={onWriteOwn}
        onSave={onSaveLetter}
        onApprove={onApproveLetter}
        onRegenerate={onRegenerate}
        onExport={onExportLetter}
        onDelete={onDeleteLetter}
      />

      <ApplicationDocumentManager
        documents={workspace.documents}
        storage={workspace.storage}
        busyId={busyId}
        uploading={uploading}
        onUpload={onUpload}
        onAddLink={onAddLink}
        onDownload={(doc) => guard(() => {}, async () => { setBusyId(doc.id); await downloadDocument(doc.id, doc.fileName ?? "document"); setBusyId(null); })}
        onDelete={(doc) => guard(() => {}, async () => { setBusyId(doc.id); await deleteDocument(doc.id); setBusyId(null); }, "Removed.")}
      />

      <ApplicationInterviewPlanner
        interviews={workspace.interviews}
        mockSessions={workspace.mockSessions}
        busyId={busyId}
        adding={addingInterview}
        onAdd={(input) => guard(setAddingInterview, async () => { const r = await createInterview(applicationId, input); toast.success(r.note); })}
        onUpdate={(id, patch) => guard(() => {}, async () => { setBusyId(id); await updateInterview(id, patch); setBusyId(null); })}
        onDelete={(i) => guard(() => {}, async () => { setBusyId(i.id); await deleteInterview(i.id); setBusyId(null); }, "Removed.")}
      />

      <ApplicationReminders
        groups={workspace.reminders}
        scheduler={workspace.scheduler}
        applicationId={applicationId}
        busyId={busyId}
        adding={addingReminder}
        onAdd={(input) => guard(setAddingReminder, async () => {
          const r = await createReminder({ ...input, applicationId });
          if (!r.created) toast.success(r.note ?? "A matching reminder already exists.");
        })}
        onComplete={(r) => guard(() => {}, async () => { setBusyId(r.id); await updateReminder(r.id, { status: "done" }); setBusyId(null); }, "Done.")}
        onDelete={(r) => guard(() => {}, async () => { setBusyId(r.id); await deleteReminder(r.id); setBusyId(null); })}
      />

      <ApplicationTimeline
        activity={workspace.activity}
        note="Every entry was written when an operation actually succeeded."
        adding={addingActivity}
        onAdd={(input) => guard(setAddingActivity, async () => { await addActivity(applicationId, input); })}
      />

      <ConfirmDialog
        open={Boolean(deletingItem)}
        title={`Delete “${deletingItem?.title}”?`}
        message="This is one of your own checklist steps. Template steps cannot be deleted."
        confirmLabel="Delete step"
        busy={busyId === deletingItem?.id}
        onConfirm={confirmDeleteChecklist}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
}
