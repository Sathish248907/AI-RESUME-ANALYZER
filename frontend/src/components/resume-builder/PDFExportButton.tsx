"use client";

import { useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import Button from "@/components/common/Button";
import { useToast } from "@/components/common/Toast";
import { toApiClientError } from "@/services/api";
import { exportPdf, triggerDownload } from "@/services/resumeBuilderService";

interface Props { versionId: string; disabled?: boolean; unsaved?: boolean; onBeforeExport?: () => Promise<void> | void; size?: "sm" | "md" | "lg"; variant?: "primary" | "secondary" | "outline" }

/** Downloads the server-rendered PDF (selectable text, A4). Flushes pending autosave first. */
export default function PDFExportButton({ versionId, disabled, unsaved, onBeforeExport, size = "md", variant = "primary" }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      await onBeforeExport?.();
      const { blob, fileName, pages } = await exportPdf(versionId);
      triggerDownload(blob, fileName);
      toast.success(`PDF ready: ${fileName} (${pages} page${pages === 1 ? "" : "s"}).`);
    } catch (err) {
      const e = toApiClientError(err);
      // Blob error bodies need decoding
      const msg = e.message || "Export failed.";
      setError(e.details?.length ? `${msg} Missing: ${e.details.map((d: { message?: string } | string) => (typeof d === "string" ? d : d.message)).join(", ")}.` : msg);
      toast.error(msg);
    } finally { setBusy(false); }
  }
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button size={size} variant={variant} onClick={run} loading={busy} disabled={disabled}><Download className="w-4 h-4 mr-1" /> Download PDF{unsaved ? " (saves first)" : ""}</Button>
      {error && <span role="alert" className="text-[11px] text-red-700 inline-flex items-center gap-1 max-w-xs text-right"><AlertCircle className="w-3 h-3" /> {error}</span>}
    </div>
  );
}
