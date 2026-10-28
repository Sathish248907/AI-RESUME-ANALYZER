"use client";

import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Upload, FileText, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import FilePreview from "./FilePreview";
import { validateFile } from "@/services/resumeParser";

interface ResumeUploaderProps {
  onFileParsed: (file: File, text: string, charCount: number) => void;
  onParseError: (msg: string) => void;
  onClear: () => void;
  currentFile: File | null;
  parsed: boolean;
  charCount?: number;
  parseError?: string | null;
  loading?: boolean;
}

export default function ResumeUploader({
  onFileParsed,
  onParseError,
  onClear,
  currentFile,
  parsed,
  charCount,
  parseError,
  loading = false,
}: ResumeUploaderProps) {
  const [dragError, setDragError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setDragError(null);
      const err = validateFile(file);
      if (err) {
        onParseError(err.message);
        return;
      }

      try {
        const formData = new FormData();
        formData.append("resume", file);
        const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to parse resume.");
        onFileParsed(file, data.text, data.charCount);
      } catch (e) {
        onParseError(e instanceof Error ? e.message : "Failed to parse resume.");
      }
    },
    [onFileParsed, onParseError]
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setDragError(null);
      if (rejected.length > 0) {
        setDragError("Only PDF or DOCX files under 5 MB are accepted.");
        return;
      }
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: loading,
  });

  if (currentFile) {
    return (
      <div className="space-y-3">
        <FilePreview
          file={currentFile}
          parsed={parsed}
          charCount={charCount}
          parseError={parseError}
          onRemove={onClear}
        />
        {/* Replace option */}
        {(parsed || parseError) && (
          <button
            onClick={onClear}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Replace with a different file
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 select-none",
          isDragActive && !isDragReject && "border-blue-500 bg-blue-50 scale-[1.01]",
          isDragReject && "border-red-400 bg-red-50",
          !isDragActive && !isDragReject &&
            "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        {/* react-dropzone renders a bare file input; a screen reader
            announces it as "unlabelled" without this. */}
        <input {...getInputProps()} aria-label="Choose a resume file to upload" />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
              isDragActive ? "bg-blue-100" : "bg-gray-100"
            )}
          >
            {isDragActive ? (
              <FileText className="w-7 h-7 text-blue-600" />
            ) : (
              <Upload className="w-7 h-7 text-gray-400" />
            )}
          </div>

          <div>
            <p className="font-semibold text-gray-800 text-base">
              {isDragActive ? "Drop it here!" : "Drag & drop your resume"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or{" "}
              <span className="text-blue-600 underline underline-offset-2 font-medium">
                browse files
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-gray-200 text-xs text-gray-600 shadow-sm">
              <FileText className="w-3 h-3" /> PDF
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-gray-200 text-xs text-gray-600 shadow-sm">
              <FileText className="w-3 h-3" /> DOCX
            </span>
            <span className="text-xs text-gray-400">Max 5 MB</span>
          </div>
        </div>
      </div>

      {dragError && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
          {dragError}
        </p>
      )}
    </div>
  );
}
