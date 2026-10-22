"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Send, Bot, User, Plus, Trash2, Loader2, Link2, MessageSquare, AlertCircle, Info } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { toApiClientError } from "@/services/api";
import { deleteConversation, getConversation, listConversations, sendMessage, startConversation, type CoachMessage, type Conversation } from "@/services/careerService";
import { cn } from "@/lib/utils";

const STARTERS = ["What should I improve before applying for a full-stack developer role?", "Which skills should I practise this week?", "What should I revise before my next interview?", "Which project should I highlight for my target role?", "What progress have I made over the past month?"];

export default function CareerCoachChat({ aiConfigured }: { aiConfigured: boolean | null }) {
  const toast = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [current, setCurrent] = useState<(Conversation & { messages: CoachMessage[] }) | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { listConversations().then(setConversations).catch(() => {}); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [current?.messages?.length, busy]);

  async function open(c: Conversation) { try { setCurrent(await getConversation(c.id)); setError(null); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setBusy(true); setError(null); setInput("");
    const optimistic: CoachMessage = { id: `tmp-${Date.now()}`, role: "user", content, factsUsed: null, suggestions: null, links: null, clarifying: false, createdAt: new Date().toISOString() };
    try {
      if (!current) {
        setCurrent({ id: "pending", title: "New conversation", createdAt: "", updatedAt: "", messages: [optimistic] });
        const r = await startConversation(content);
        const conv = await getConversation(r.conversationId);
        setCurrent(conv);
        setConversations(await listConversations());
      } else {
        setCurrent({ ...current, messages: [...current.messages, optimistic] });
        const r = await sendMessage(current.id, content);
        setCurrent((c) => (c ? { ...c, messages: [...c.messages.filter((m) => m.id !== optimistic.id), r.userMessage, { ...r.reply }] } : c));
        setConversations(await listConversations());
      }
    } catch (err) {
      const e = toApiClientError(err);
      setError(e.message + (e.retryable ? " You can try sending it again." : ""));
      if (current?.id && current.id !== "pending") { try { setCurrent(await getConversation(current.id)); } catch { /* ignore */ } } else setCurrent(null);
      setInput(content);
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    try { await deleteConversation(deleting.id); setConversations((c) => c.filter((x) => x.id !== deleting.id)); if (current?.id === deleting.id) setCurrent(null); toast.success("Conversation deleted."); } catch (err) { toast.error(toApiClientError(err).message); } finally { setDeleting(null); }
  }

  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-4 h-[calc(100vh-14rem)] min-h-[32rem]">
      <aside className="rounded-xl border border-gray-200 bg-white flex flex-col min-h-0">
        <div className="p-2 border-b border-gray-100"><Button size="sm" className="w-full" variant="outline" onClick={() => { setCurrent(null); setError(null); }}><Plus className="w-4 h-4 mr-1" /> New conversation</Button></div>
        <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 text-sm">
          {conversations.map((c) => (
            <li key={c.id} className={cn("flex items-center gap-1 px-2 py-2", current?.id === c.id && "bg-indigo-50")}>
              <button type="button" onClick={() => open(c)} className="flex-1 text-left min-w-0"><p className="truncate text-gray-900">{c.title}</p><p className="text-[11px] text-gray-400">{c.messageCount ?? 0} messages · {new Date(c.updatedAt).toLocaleDateString()}</p></button>
              <button type="button" aria-label="Delete conversation" onClick={() => setDeleting(c)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
          {conversations.length === 0 && <li className="px-3 py-4 text-xs text-gray-500">No conversations yet.</li>}
        </ul>
      </aside>
      <section className="rounded-xl border border-gray-200 bg-white flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!current && (
            <div className="text-sm text-gray-600 space-y-3">
              <p className="inline-flex items-center gap-2 font-medium text-gray-900"><Bot className="w-5 h-5 text-indigo-600" /> Ask the coach about your own records</p>
              <p className="text-xs">Answers use only your resumes, analyses, skill gaps, roadmap, interviews and applications. Recorded facts are listed separately from suggestions, and the coach asks when it needs more detail.</p>
              <div className="flex flex-wrap gap-2">{STARTERS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={busy || aiConfigured === false} className="text-xs rounded-full border border-gray-200 px-3 py-1.5 hover:bg-gray-50 text-left">{s}</button>)}</div>
            </div>
          )}
          {current?.messages.map((m) => (
            <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "assistant" && <Bot className="w-5 h-5 text-indigo-600 mt-1 shrink-0" />}
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900")}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "assistant" && (
                  <div className="mt-2 space-y-1.5 text-xs">
                    {m.clarifyingQuestion && <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 inline-flex items-start gap-1"><MessageSquare className="w-3 h-3 mt-0.5" /> {m.clarifyingQuestion}</p>}
                    {m.factsUsed && m.factsUsed.length > 0 && <details className="text-gray-600"><summary className="cursor-pointer">Recorded facts used ({m.factsUsed.length})</summary><ul className="list-disc pl-4 mt-1">{m.factsUsed.map((f, i) => <li key={i}>{f}</li>)}</ul></details>}
                    {m.suggestions && m.suggestions.length > 0 && <div className="text-indigo-900"><p className="font-medium inline-flex items-center gap-1"><Info className="w-3 h-3" /> Suggestions (AI-generated, not facts)</p><ul className="list-disc pl-4">{m.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
                    {m.links && m.links.length > 0 && <p className="flex flex-wrap gap-2">{m.links.map((l) => <Link key={l.path} href={l.path} className="inline-flex items-center gap-1 rounded-full bg-white border border-indigo-200 px-2 py-0.5 text-indigo-700"><Link2 className="w-3 h-3" /> {l.label}</Link>)}</p>}
                  </div>
                )}
              </div>
              {m.role === "user" && <User className="w-5 h-5 text-gray-400 mt-1 shrink-0" />}
            </div>
          ))}
          {busy && <p className="text-xs text-gray-500 inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> The coach is reading your records…</p>}
          {error && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-start gap-1"><AlertCircle className="w-3.5 h-3.5 mt-0.5" /> {error}</p>}
          <div ref={bottom} />
        </div>
        <form className="border-t border-gray-100 p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder={aiConfigured === false ? "AI provider not configured on the backend" : "Ask about your readiness, skills, interviews or applications…"} disabled={busy || aiConfigured === false} aria-label="Message" className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          <Button type="submit" loading={busy} disabled={!input.trim() || aiConfigured === false}><Send className="w-4 h-4" /></Button>
        </form>
      </section>
      <ConfirmDialog open={Boolean(deleting)} title="Delete this conversation?" message="All its messages are removed permanently." confirmLabel="Delete" onConfirm={remove} onCancel={() => setDeleting(null)} />
    </div>
  );
}
