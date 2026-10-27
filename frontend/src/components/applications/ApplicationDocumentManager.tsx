"use client";

import { useRef, useState } from "react";
import {
  Paperclip, Upload, Link2, Trash2, Download, ExternalLink, AlertTriangle, FileText, Image as ImageIcon,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, formatBytes, safeHref,
  type ApplicationDocument, type DocumentCategory,
} from "@/services/applicationWorkspaceService";

interface Props {
  documents: ApplicationDocument[];
  storage: { enabled: boolean; driver: string };
  limits?: { maxBytes: number; formats: string[] };
  busyId: string | null;
  uploading: boolean;
  onUpload: (file: File, category: DocumentCategory, note?: string) => void;
  onAddLink: (url: string, category: DocumentCategory, note?: string) => void;
  onDownload: (doc: ApplicationDocument) => void;
  onDelete: (doc: ApplicationDocument) => void;
}

/**
 * Documents attached to one application. Files are streamed through an
 * owner-checked endpoint, so no storage path or public URL is ever rendered;
 * when the server has no storage driver the upload control says so instead of
 * accepting a file that would be discarded.
 */
export default function ApplicationDocumentManager({
  documents, storage, limits, busyId, uploading, onUpload, onAddLink, onDownload, onDelete,
}: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<DocumentCategory>("certificate");
  const [note, setNote] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [url, setUrl] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file, category, note.trim() || undefined);
    setNote("");
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-gray-500" /> Documents
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Only you can open these. Files are served through an authenticated endpoint, never a public link.
        </p>
      </div>

      {!storage.enabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          File storage is not configured on the server (<code className="font-mono">STORAGE_DRIVER=none</code>), so an upload would be discarded.
          You can still attach links. Set <code className="font-mono">STORAGE_DRIVER=local</code> and restart the backend to enable uploads.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[10rem]">
          <span className="text-xs font-medium text-gray-700">Note <span className="text-gray-400">(optional)</span></span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </label>

        {linkMode ? (
          <>
            <label className="block flex-1 min-w-[12rem]">
              <span className="text-xs font-medium text-gray-700">Link</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <Button size="sm" disabled={!url.trim()} onClick={() => { onAddLink(url.trim(), category, note.trim() || undefined); setUrl(""); setNote(""); setLinkMode(false); }}>
              Add link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinkMode(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <input
              ref={fileInput}
              type="file"
              onChange={handleFile}
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
              className="hidden"
              aria-label="Choose a document"
            />
            <Button size="sm" variant="outline" loading={uploading} disabled={!storage.enabled} onClick={() => fileInput.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLinkMode(true)}>
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Add link
            </Button>
          </>
        )}
      </div>

      {limits && (
        <p className="text-[11px] text-gray-400">
          Up to {Math.round(limits.maxBytes / 1024 / 1024)} MB · {limits.formats.join(", ")} · the file's contents are checked, not just its name.
        </p>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing attached yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {documents.map((doc) => {
            const href = safeHref(doc.url);
            return (
              <li key={doc.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="shrink-0">
                  {doc.kind === "link"
                    ? <Link2 className="w-4 h-4 text-gray-400" />
                    : doc.mimeType?.startsWith("image/")
                      ? <ImageIcon className="w-4 h-4 text-gray-400" />
                      : <FileText className="w-4 h-4 text-gray-400" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900 truncate">
                    {doc.kind === "link" ? (href ?? "Invalid link") : doc.fileName}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    <Badge variant="neutral">{DOCUMENT_CATEGORY_LABELS[doc.category]}</Badge>
                    {doc.fileSize ? ` · ${formatBytes(doc.fileSize)}` : ""}
                    {` · added ${new Date(doc.createdAt).toLocaleDateString()}`}
                    {doc.note ? ` · ${doc.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {doc.kind === "link" && href && (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-sky-700 hover:underline inline-flex items-center gap-1">
                      Open <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {doc.kind === "file" && (
                    <Button size="sm" variant="ghost" loading={busyId === doc.id} onClick={() => onDownload(doc)}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className={cn("text-red-600 hover:bg-red-50")} loading={busyId === doc.id} onClick={() => onDelete(doc)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
