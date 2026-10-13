"use client";

import { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Upload, FileText, X, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResumeDropzoneProps {
  onFileAccepted: (file: File) => void;
  onClear?: () => void;
  accepted?: File | null;
  loading?: boolean;
}

export default function ResumeDropzone({
  onFileAccepted,
  onClear,
  accepted,
  loading = false,
}: ResumeDropzoneProps) {
  const [dragError, setDragError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setDragError(null);
      if (rejectedFiles.length > 0) {
        setDragError("Only PDF or DOCX files are accepted (max 5MB).");
        return;
      }
      if (acceptedFiles[0]) {
        onFileAccepted(acceptedFiles[0]);
      }
    },
    [onFileAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
    disabled: loading,
  });

  if (accepted) {
    return (
      <div className="border-2 border-green-300 bg-green-50 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{accepted.name}</p>
              <p className="text-sm text-gray-500">
                {(accepted.size / 1024).toFixed(0)} KB · {accepted.type.includes("pdf") ? "PDF" : "DOCX"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            {onClear && (
              <button
                onClick={onClear}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200",
          isDragActive && !isDragReject && "border-blue-500 bg-blue-50",
          isDragReject && "border-red-400 bg-red-50",
          !isDragActive && !isDragReject && "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center",
              isDragActive ? "bg-blue-100" : "bg-gray-100"
            )}
          >
            <Upload
              className={cn(
                "w-6 h-6",
                isDragActive ? "text-blue-600" : "text-gray-400"
              )}
            />
          </div>
          <div>
            <p className="font-medium text-gray-700">
              {isDragActive ? "Drop your resume here" : "Drag & drop your resume"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or{" "}
              <span className="text-blue-600 underline underline-offset-2">
                click to browse
              </span>
            </p>
          </div>
          <p className="text-xs text-gray-400">PDF or DOCX · Max 5MB</p>
        </div>
      </div>
      {dragError && (
        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
          <X className="w-3 h-3" /> {dragError}
        </p>
      )}
    </div>
  );
}
