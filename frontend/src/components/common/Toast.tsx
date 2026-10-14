"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  notify: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastType, { cls: string; icon: typeof Info }> = {
  success: { cls: "bg-green-50 border-green-200 text-green-800", icon: CheckCircle2 },
  error: { cls: "bg-red-50 border-red-200 text-red-800", icon: AlertCircle },
  info: { cls: "bg-blue-50 border-blue-200 text-blue-800", icon: Info },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), type === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ notify, success: (m) => notify("success", m), error: (m) => notify("error", m), info: (m) => notify("info", m) }),
    [notify]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm">
        {toasts.map((t) => {
          const Icon = STYLES[t.type].icon;
          return (
            <div key={t.id} role="status" className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg animate-slide-up", STYLES[t.type].cls)}>
              <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Falls back to console + alert-free no-op outside the provider so components stay usable in isolation. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  const fallback = (type: ToastType, message: string) => {
    if (type === "error") console.error(message);
  };
  return { notify: fallback, success: (m) => fallback("success", m), error: (m) => fallback("error", m), info: (m) => fallback("info", m) };
}
