"use client";

import { useEffect, useState } from "react";
import { User, LogIn, Save, X, Plus, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError, type ApiClientError } from "@/services/api";
import { CAREER_LEVELS, CAREER_LEVEL_LABELS, WORK_MODES, getProfile, saveProfile, type CareerLevel, type ProfileInput, type WorkMode } from "@/services/careerService";
import CareerNav from "@/components/career/CareerNav";

const EMPTY: ProfileInput = { careerLevel: "fresher", targetRoles: [], industries: [], skills: [], locations: [], workMode: "any", salaryMin: null, salaryMax: null, salaryCurrency: null, goals: "", learningInterests: [] };

export default function CareerProfilePage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const [form, setForm] = useState<ProfileInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [customRole, setCustomRole] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    getProfile().then((p) => { if (p) { setForm({ ...EMPTY, ...p, goals: p.goals ?? "" }); setExists(true); } }).catch(() => {}).finally(() => setLoading(false));
  }, [ready, user]);

  async function save() {
    setErrors({});
    if (!form.targetRoles.length) { setErrors({ targetRoles: "Pick at least one target role." }); return; }
    setSaving(true);
    try { const p = await saveProfile({ ...form, goals: form.goals || null }); setForm({ ...EMPTY, ...p, goals: p.goals ?? "" }); setExists(true); toast.success("Profile saved. Recommendations were refreshed."); }
    catch (err) { const e = toApiClientError(err) as ApiClientError; if (e.details?.length) setErrors(Object.fromEntries(e.details.map((d) => [d.field.split(".")[0], d.message]))); toast.error(e.message); }
    finally { setSaving(false); }
  }
  const toggleRole = (r: string) => setForm((f) => ({ ...f, targetRoles: f.targetRoles.includes(r) ? f.targetRoles.filter((x) => x !== r) : f.targetRoles.length < 5 ? [...f.targetRoles, r] : f.targetRoles }));

  if (!ready || (user && loading)) return <div className="max-w-4xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to edit your career profile" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career/profile", icon: LogIn }} /></div>;

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><User className="w-7 h-7 text-indigo-600" /> Career profile</h1><p className="text-gray-500 mt-1">What you tell us about your goals. Nothing here is inferred, and you can change it any time.</p></div>
      <CareerNav current="/dashboard/career/profile" />
      <Card>
        <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <label className="block font-medium text-gray-700">Current career level</label>
            <div className="flex flex-wrap gap-2 mt-1">{CAREER_LEVELS.map((l) => <button key={l} type="button" onClick={() => setForm({ ...form, careerLevel: l })} className={`px-3 py-1.5 rounded-lg border text-sm ${form.careerLevel === l ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white"}`}>{CAREER_LEVEL_LABELS[l as CareerLevel]}</button>)}</div>
          </div>
          <div>
            <label className="block font-medium text-gray-700">Target roles (up to 5) *</label>
            <div className="flex flex-wrap gap-2 mt-1">{TARGET_ROLES.map((r) => <button key={r} type="button" onClick={() => toggleRole(r)} className={`px-3 py-1.5 rounded-lg border text-sm ${form.targetRoles.includes(r) ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white"}`}>{r}</button>)}</div>
            <div className="flex gap-2 mt-2"><input value={customRole} onChange={(e) => setCustomRole(e.target.value)} maxLength={80} placeholder="Other role…" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /><Button size="sm" variant="outline" onClick={() => { if (customRole.trim().length >= 2) { toggleRole(customRole.trim()); setCustomRole(""); } }}><Plus className="w-4 h-4" /></Button></div>
            {form.targetRoles.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{form.targetRoles.map((r) => <span key={r} className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs">{r}<button type="button" aria-label={`Remove ${r}`} onClick={() => toggleRole(r)}><X className="w-3 h-3" /></button></span>)}</div>}
            {errors.targetRoles && <p className="text-xs text-red-600 mt-1">{errors.targetRoles}</p>}
          </div>
          <ChipField label="Preferred industries" value={form.industries} onChange={(v) => setForm({ ...form, industries: v })} placeholder="Fintech, Healthcare…" max={8} />
          <label className="block"><span className="font-medium text-gray-700">Career goals & learning interests</span><textarea value={form.goals ?? ""} onChange={(e) => setForm({ ...form, goals: e.target.value })} rows={3} maxLength={2000} className={input} placeholder="e.g. Move from internships to a full-time frontend role at a product company within 6 months." /></label>
          <ChipField label="Learning interests" value={form.learningInterests} onChange={(v) => setForm({ ...form, learningInterests: v })} placeholder="System design, GraphQL…" max={15} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Skills & preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ChipField label="Technical and professional skills (self-reported)" value={form.skills} onChange={(v) => setForm({ ...form, skills: v })} placeholder="React, SQL, communication…" max={40} help="Shown as “self-reported” in assessments; evidence from analyses and interviews always ranks higher." />
          <ChipField label="Preferred locations" value={form.locations} onChange={(v) => setForm({ ...form, locations: v })} placeholder="Bangalore, Remote…" max={8} />
          <div>
            <label className="block font-medium text-gray-700">Work mode</label>
            <div className="flex flex-wrap gap-2 mt-1">{WORK_MODES.map((m) => <button key={m} type="button" onClick={() => setForm({ ...form, workMode: m as WorkMode })} className={`px-3 py-1.5 rounded-lg border text-sm capitalize ${form.workMode === m ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200 bg-white"}`}>{m === "onsite" ? "On-site" : m}</button>)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="font-medium text-gray-700">Expected salary min</span><input type="number" min={0} value={form.salaryMin ?? ""} onChange={(e) => setForm({ ...form, salaryMin: e.target.value ? Number(e.target.value) : null })} className={input} /></label>
            <label className="block"><span className="font-medium text-gray-700">max</span><input type="number" min={0} value={form.salaryMax ?? ""} onChange={(e) => setForm({ ...form, salaryMax: e.target.value ? Number(e.target.value) : null })} className={input} />{errors.salaryMax && <p className="text-xs text-red-600 mt-1">{errors.salaryMax}</p>}</label>
            <label className="block"><span className="font-medium text-gray-700">Currency</span><input value={form.salaryCurrency ?? ""} onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value.toUpperCase() || null })} maxLength={3} placeholder="INR" className={input} />{errors.salaryCurrency && <p className="text-xs text-red-600 mt-1">{errors.salaryCurrency}</p>}</label>
          </div>
          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5" /> Salary is optional and only shown back to you. No demographic data is collected or inferred.</p>
        </CardContent>
      </Card>
      <div className="flex justify-end"><Button onClick={save} loading={saving}><Save className="w-4 h-4 mr-1" /> {exists ? "Save changes" : "Create profile"}</Button></div>
    </div>
  );
}

function ChipField({ label, value, onChange, placeholder, max, help }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; max: number; help?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim().slice(0, 60); if (t.length >= 1 && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]); setDraft(""); };
  return (
    <div>
      <label className="block font-medium text-gray-700">{label}</label>
      {help && <p className="text-[11px] text-gray-500">{help}</p>}
      <div className="flex gap-2 mt-1"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} placeholder={placeholder} className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" /><Button size="sm" variant="outline" type="button" onClick={add}><Plus className="w-4 h-4" /></Button></div>
      {value.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{value.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-0.5 text-xs">{v}<button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}><X className="w-3 h-3" /></button></span>)}</div>}
    </div>
  );
}
