"use client";

import { useEffect, useState } from "react";
import { HardDrive, FolderPlus, ExternalLink, Info, RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import { listVersions, type ResumeVersionSummary } from "@/services/resumeBuilderService";
import { exportToDrive, listDriveFolders, safeHref, type Integration } from "@/services/integrationService";

interface Props {
  integration: Integration;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

/**
 * Export one document, on request. There is no "sync my Drive" here on purpose:
 * the `drive.file` scope only lets this app touch files it created itself, and
 * every upload is a deliberate press of this button on a specific resume
 * version. Re-exporting the same version updates the file it made before rather
 * than scattering copies.
 */
export default function DriveExportPanel({ integration, onError, onSuccess }: Props) {
  const [versions, setVersions] = useState<ResumeVersionSummary[]>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [folderNote, setFolderNote] = useState("");
  const [versionId, setVersionId] = useState("");
  const [folderId, setFolderId] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ action: string; name: string; webViewLink: string | null; note?: string } | null>(null);

  const connected = integration.connection?.status === "connected";

  useEffect(() => {
    if (!connected) { setLoading(false); return; }
    let live = true;
    (async () => {
      try {
        const [vs, fs] = await Promise.all([listVersions({ limit: 50 }), listDriveFolders()]);
        if (!live) return;
        setVersions(vs.versions);
        setVersionId(vs.versions[0]?.id ?? "");
        setFolders(fs.folders);
        setFolderNote(fs.note);
      } catch (err) {
        if (live) onError(err instanceof Error ? err.message : "Could not load your documents and folders.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
    // onError is a stable callback from the page; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const runExport = async () => {
    if (!versionId) return;
    setExporting(true);
    setResult(null);
    try {
      const res = await exportToDrive({
        sourceKind: "resume_version",
        sourceId: versionId,
        ...(folderId ? { folderId } : {}),
        ...(!folderId && newFolder.trim() ? { folderName: newFolder.trim() } : {}),
      });
      setResult(res);
      onSuccess(res.action === "updated" ? "The existing file in your Drive was updated." : "Exported to your Drive.");
      if (!folderId && newFolder.trim()) {
        const refreshed = await listDriveFolders();
        setFolders(refreshed.folders);
        setNewFolder("");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  };

  const link = safeHref(result?.webViewLink);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-emerald-600" /> Export to Google Drive
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Files are created privately in your own Drive. Nothing is shared and no public link is made.
        </p>
      </div>

      {!connected ? (
        <p className="text-sm text-gray-500">Connect Google Drive to export documents.</p>
      ) : loading ? (
        <p className="text-sm text-gray-500 inline-flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading your documents…
        </p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-gray-500">
          You have no saved resume versions yet. Build one in the resume editor and it will appear here.
        </p>
      ) : (
        <>
          <label className="block text-xs text-gray-700">
            Document
            <select
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · v{v.versionNumber}
                  {v.targetJobTitle ? ` · ${v.targetJobTitle}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-gray-700">
            Folder
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">Drive root</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          {folderNote && <p className="text-[11px] text-gray-500 -mt-2">{folderNote}</p>}

          {!folderId && (
            <label className="block text-xs text-gray-700">
              …or create a folder
              <span className="mt-1 flex items-center gap-2">
                <FolderPlus className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Job applications"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </span>
            </label>
          )}

          <Button size="sm" loading={exporting} disabled={!versionId} onClick={runExport}>
            Export as PDF
          </Button>

          {result && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
              <p className="text-xs text-emerald-900">
                <strong>{result.name}</strong> was {result.action === "updated" ? "updated in place" : "created"} in your Drive.
              </p>
              {result.note && <p className="text-[11px] text-emerald-900/80 mt-0.5">{result.note}</p>}
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1 mt-1">
                  Open it in Drive <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Exporting the same version again replaces the file this app created, so your Drive does not fill with copies.
          </p>
        </>
      )}
    </section>
  );
}
