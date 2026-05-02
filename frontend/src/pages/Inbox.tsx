import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { useConversations } from "../hooks/useConversations";
import { useAppStore, Message } from "../store/useAppStore";
import ConversationThread from "../components/ConversationThread";

export default function Inbox() {
  const { conversations, openConversation } = useConversations();
  const activePhone = useAppStore((s) => s.activePhone);
  const unread = useAppStore((s) => s.unreadPhones);
  const messagesByPhone = useAppStore((s) => s.messagesByPhone);
  const messages = activePhone ? messagesByPhone[activePhone] || [] : [];
  const markUnread = useAppStore((s) => s.markUnread);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastInboundToNumber = useMemo(() => {
    const inbound = (messages || []).slice().reverse().find((m) => m.direction === "INBOUND");
    return inbound?.toNumber || "";
  }, [messages]);

  const [fromNumber, setFromNumber] = useState("");
  useEffect(() => {
    setFromNumber(lastInboundToNumber);
  }, [lastInboundToNumber]);

  useEffect(() => {
    if (!activePhone && conversations.length) {
      void openConversation(conversations[0].phone);
    }
  }, [activePhone, conversations, openConversation]);

  async function sendReply() {
    if (!activePhone || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post("/messages/send", { to: activePhone, from: fromNumber, text });
      setText("");
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">Two-way</div>
            <div className="font-semibold">Inbox</div>
          </div>
          <div className="text-xs text-slate-500">{conversations.length} conversations</div>
        </div>
        <div className="divide-y divide-slate-800 max-h-[70vh] overflow-auto">
          {conversations.map((c) => (
            <button
              key={c.phone}
              onClick={() => {
                markUnread(c.phone, false);
                void openConversation(c.phone);
              }}
              className={clsx(
                "w-full text-left px-4 py-3 hover:bg-slate-900/40",
                activePhone === c.phone && "bg-accent-500/5"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={clsx("font-semibold", unread[c.phone] && "text-accent-400")}>
                  {c.name || c.phone}
                </div>
                {unread[c.phone] && <div className="h-2 w-2 rounded-full bg-accent-500" />}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-400 line-clamp-1">{c.body}</div>
            </button>
          ))}
          {!conversations.length && <div className="px-4 py-10 text-center text-slate-400">No conversations yet.</div>}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Conversation</div>
              <div className="font-semibold">{activePhone ? <span className="font-mono text-accent-400">{activePhone}</span> : "—"}</div>
            </div>
            <button
              onClick={async () => {
                if (!activePhone) return;
                const row = conversations.find((x) => x.phone === activePhone);
                if (!row) return;
                const { data } = await api.get("/messages", { params: { contactId: row.contactId, pageSize: 50, page: 1 } });
                const items: Message[] = (data?.items || []).slice().reverse();
                useAppStore.getState().setThread(activePhone, items);
              }}
              className="px-3 py-1.5 text-sm rounded-md bg-slate-900/60 ring-1 ring-slate-800 hover:bg-slate-900"
            >
              Refresh last 50
            </button>
          </div>
        </div>

        <ConversationThread messages={messages} />

        <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2">
            <input
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              placeholder="From number (must match inbound)"
              className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm font-mono"
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Type a reply…"
              className="rounded-md bg-slate-950/50 ring-1 ring-slate-800 px-3 py-2 text-sm font-mono"
            />
            <button
              disabled={sending || !activePhone || !text.trim()}
              onClick={sendReply}
              className="px-4 py-2 rounded-md text-sm bg-accent-500/15 ring-1 ring-accent-500/30 text-accent-400 hover:bg-accent-500/20 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <div className="mt-2 text-sm text-red-200">{error}</div>}
          <div className="mt-2 text-xs text-slate-500">
            Rule: replies should send <span className="text-slate-300">from</span> the number that received the inbound message (<span className="font-mono text-slate-300">{lastInboundToNumber || "unknown"}</span>).
          </div>
        </div>
      </div>
    </div>
  );
}

