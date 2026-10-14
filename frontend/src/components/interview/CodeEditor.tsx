"use client";

import dynamic from "next/dynamic";
import { PROGRAMMING_LANGUAGES, type ProgrammingLanguage } from "@/services/interviewService";

// Monaco is loaded client-side only (it touches `window`); the textarea fallback keeps the page usable while it loads.
const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-72 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" aria-hidden />,
});

const MONACO_LANG: Record<ProgrammingLanguage, string> = {
  javascript: "javascript", typescript: "typescript", python: "python", java: "java", csharp: "csharp", cpp: "cpp", go: "go", rust: "rust", sql: "sql", other: "plaintext",
};

interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  language: ProgrammingLanguage;
  onLanguageChange: (l: ProgrammingLanguage) => void;
  disabled?: boolean;
  height?: number;
}

export default function CodeEditor({ value, onChange, language, onLanguageChange, disabled = false, height = 320 }: CodeEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs text-gray-600 flex items-center gap-2">
          Language
          <select value={language} onChange={(e) => onLanguageChange(e.target.value as ProgrammingLanguage)} disabled={disabled} className="text-sm px-2 py-1 border border-gray-300 rounded-lg bg-white">
            {PROGRAMMING_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <span className="text-[11px] text-gray-400">Code is evaluated as written text — it is not executed.</span>
      </div>
      <div className="rounded-lg border border-gray-300 overflow-hidden">
        <MonacoEditor
          height={height}
          language={MONACO_LANG[language]}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          theme="vs-light"
          options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", wordWrap: "on", readOnly: disabled, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, ariaLabel: "Code answer editor" }}
        />
      </div>
    </div>
  );
}
