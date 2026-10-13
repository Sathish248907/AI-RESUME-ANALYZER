"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FileText, LogIn, UserPlus, AlertCircle, Server } from "lucide-react";
import Button from "@/components/common/Button";
import { login, register } from "@/services/authService";
import { toApiClientError } from "@/services/api";

type Mode = "login" | "register";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get("next") || "/dashboard/resume-analyzer";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [backendDown, setBackendDown] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBackendDown(false);
    const errs: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login({ email: email.trim(), password });
      else await register({ email: email.trim(), password, name: name.trim() || undefined });
      router.push(next);
    } catch (err) {
      const apiErr = toApiClientError(err);
      if (apiErr.network) setBackendDown(true);
      if (apiErr.details?.length) {
        setFieldErrors(Object.fromEntries(apiErr.details.map((d) => [d.field, d.message])));
      }
      setError(apiErr.message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{mode === "login" ? "Sign in for AI analysis" : "Create your account"}</h1>
          <p className="text-gray-500 mt-2 text-sm">
            AI-powered analyses are saved to your account so you can revisit, regenerate and delete them.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); setFieldErrors({}); }}
                className={`text-sm font-medium py-1.5 rounded-md transition-colors ${mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"}`}
              >
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">Name <span className="text-xs text-gray-400 font-normal">(optional)</span></label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${input} border-gray-300`} autoComplete="name" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} ${fieldErrors.email ? "border-red-400 bg-red-50" : "border-gray-300"}`} autoComplete="email" required />
            {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} ${fieldErrors.password ? "border-red-400 bg-red-50" : "border-gray-300"}`} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} />
            {fieldErrors.password ? <p className="mt-1 text-xs text-red-600">{fieldErrors.password}</p> : <p className="mt-1 text-xs text-gray-400">At least 8 characters.</p>}
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {backendDown ? <Server className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>
                {error}
                {backendDown && " Start the backend (npm run dev in backend/) or use demo mode without signing in."}
              </span>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {mode === "login" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            {mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          Prefer not to sign in?{" "}
          <Link href="/dashboard/resume-analyzer" className="text-blue-600 hover:underline">Use demo mode</Link>
          {" "}— results stay in this browser and are not AI-generated.
        </p>
      </div>
    </div>
  );
}
