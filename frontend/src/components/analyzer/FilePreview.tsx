"use client";

import { FileText, X, CheckCircle, AlertCircle } from "lucide-react";
import { formatFileSize, getFileTypeLabel } from "@/services/resumeParser";
import { cn } from "@/lib/utils";

interface FilePreviewProps {
  file: File;
  parsed: boolean;
  charCount?: number;
  parseError?: string | null;
  onRemove: () => void;
}

export default function FilePreview({
  file,
  parsed,
  charCount,
  parseError,
  onRemove,
}: FilePreviewProps) {
  const typeLabel = getFileTypeLabel(file.type);
  const sizeLabel = formatFileSize(file.size);

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 transition-colors",
        parseError
          ? "border-red-200 bg-red-50"
          : parsed
          ? "border-green-200 bg-green-50"
          : "border-blue-200 bg-blue-50"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            parseError
              ? "bg-red-100"
              : parsed
              ? "bg-green-100"
              : "bg-blue-100"
          )}
        >
          <FileText
            className={cn(
              "w-5 h-5",
              parseError
                ? "text-red-600"
                : parsed
                ? "text-green-600"
                : "text-blue-600"
            )}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{file.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs text-gray-500">{sizeLabel}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500">{typeLabel}</span>
            {parsed && charCount && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-green-700 font-medium">
                  {charCount.toLocaleString()} characters extracted
                </span>
              </>
            )}
          </div>

          {/* Status */}
          <div className="mt-2">
            {parseError ? (
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{parseError}</p>
              </div>
            ) : parsed ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <p className="text-xs text-green-700 font-medium">
                  Resume parsed successfully
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                <p className="text-xs text-blue-700">Extracting text…</p>
              </div>
            )}
          </div>
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-100 transition-colors flex-shrink-0"
          aria-label="Remove file"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
