import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { api } from "../api/client";
import { useConversations } from "../hooks/useConversations";
import { useAppStore, Message } from "../store/useAppStore";
import ConversationThread from "../components/ConversationThread";

const PINNED_NUMBER = "+14374647338";

// ── Error Banner ────────────────────────────────────────────────────────────
function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-200 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
      <span className="mt-0.5 text-red-400 text-base leading-none">✕</span>
      <div className="flex-1">
        <div className="font-semibold text-red-300 mb-0.5">Failed to send</div>
        <div className="text-red-300/80">{message}</div>
      </div>
      <button onClick={onDismiss} className="text-red-400/60 hover:text-red-300 transition-colors text-lg leading-none ml-2">×</button>
    </div>
  );
}

// ── New Conversation Modal ───────────────────────────────────────────────────
function NewConversationModal({
  defaultFrom,
  onStart,
  onClose,
}: {
  defaultFrom: string;
  onStart: (to: string) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState(PINNED_NUMBER);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4">
          <div className="text-xs font-semibold text-accent-400 uppercase tracking-wider mb-1">New Conversation</div>
          <div className="text-xl font-bold text-white">Start a direct message</div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Sending from</label>
            <div className="rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-sm font-mono text-accent-400">
              {defaultFrom || "Not configured"}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Send to *</label>
            <input
              autoFocus
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+14374647338"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 focus:border-accent-500 px-3 py-2 text-sm font-mono text-white transition-colors"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => { if (to.trim()) onStart(to.trim()); }}
            disabled={!to.trim()}
            className="flex-1 rounded-lg bg-accent-600 hover:bg-accent-500 text-white font-semibold py-2.5 text-sm transition-colors disabled:opacity-40"
          >
            Open Conversation
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Inbox Component ─────────────────────────────────────────────────────
export default function Inbox() {
  const { conversations, openConversation, refreshConversations } = useConversations();
  const activePhone = useAppStore((s) => s.activePhone);
  const unread = useAppStore((s) => s.unreadPhones);
  const messagesByPhone = useAppStore((s) => s.messagesByPhone);
  const messages = activePhone ? messagesByPhone[activePhone] || [] : [];
  const markUnread = useAppStore((s) => s.markUnread);
  const defaultFromNumber = useAppStore((s) => s.defaultFromNumber);
  const setDefaultFromNumber = useAppStore((s) => s.setDefaultFromNumber);
  const upsertMessage = useAppStore((s) => s.upsertMessage);
  const setActivePhone = useAppStore((s) => s.setActivePhone);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [search, setSearch] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load the default from number once on mount
  useEffect(() => {
    api.get("/config").then(({ data }) => {
      if (data?.defaultFromNumber) setDefaultFromNumber(data.defaultFromNumber);
    }).catch(() => {});
  }, [setDefaultFromNumber]);

  // Auto-open pinned number if no active conversation
  useEffect(() => {
    if (!activePhone && conversations.length > 0) {
      const pinned = conversations.find((c) => c.phone === PINNED_NUMBER);
      void openConversation((pinned ?? conversations[0]).phone);
    }
  }, [activePhone, conversations, openConversation]);

  // Filtered sidebar conversations
  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.phone.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const handleSelectConversation = useCallback(async (phone: string) => {
    markUnread(phone, false);
    setActivePhone(phone);
    setThreadLoading(true);
    try {
      await openConversation(phone);
    } finally {
      setThreadLoading(false);
    }
    textareaRef.current?.focus();
  }, [markUnread, openConversation, setActivePhone]);

  const handleStartNewConvo = useCallback(async (to: string) => {
    setShowNewConvo(false);
    setActivePhone(to);
    // Open if already exists, else it will appear after first message
    const existing = conversations.find((c) => c.phone === to);
    if (existing) {
      await handleSelectConversation(to);
    }
    textareaRef.current?.focus();
  }, [conversations, handleSelectConversation, setActivePhone]);

  async function sendReply() {
    if (!activePhone || !text.trim() || sending) return;

    const from = defaultFromNumber;
    if (!from) {
      setError("No sending number configured. Set DEFAULT_FROM_NUMBER on the backend.");
      return;
    }

    const body = text.trim();
    setText("");
    setSending(true);
    setError(null);

    // Optimistic message
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      direction: "OUTBOUND",
      body,
      status: "queued",
      fromNumber: from,
      toNumber: activePhone,
      contactId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertMessage(activePhone, optimistic);

    try {
      const { data } = await api.post("/messages/send", { to: activePhone, from, text: body });
      // Replace optimistic with real message
      upsertMessage(activePhone, data.message);
      // Refresh conversations sidebar so it shows latest
      void refreshConversations();
    } catch (e: any) {
      // Remove optimistic on failure
      const state = useAppStore.getState();
      const cur = state.messagesByPhone[activePhone] || [];
      useAppStore.setState({
        messagesByPhone: {
          ...state.messagesByPhone,
          [activePhone]: cur.filter((m) => m.id !== tempId),
        },
      });
      const apiError =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        "Unknown error — check your Telnyx credentials and number";
      setError(apiError);
      // Restore text so user doesn't lose it
      setText(body);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  }

  const activeConvo = conversations.find((c) => c.phone === activePhone);

  return (
    <>
      {showNewConvo && (
        <NewConversationModal
          defaultFrom={defaultFromNumber || ""}
          onStart={handleStartNewConvo}
          onClose={() => setShowNewConvo(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-140px)] min-h-[600px]">
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="flex flex-col rounded-xl bg-slate-900/20 ring-1 ring-slate-800 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Two-way</div>
              <div className="font-bold text-white">Inbox</div>
            </div>
            <button
              onClick={() => setShowNewConvo(true)}
              title="New conversation"
              className="h-8 w-8 rounded-lg bg-accent-600/20 hover:bg-accent-600/40 text-accent-400 border border-accent-500/30 flex items-center justify-center text-lg font-bold transition-colors"
            >
              +
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-800 flex-shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-lg bg-slate-950 ring-1 ring-slate-800 focus:ring-accent-500 px-3 py-1.5 text-xs text-slate-300 transition-colors"
            />
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredConversations.map((c) => {
              const isActive = activePhone === c.phone;
              const isPinned = c.phone === PINNED_NUMBER;
              return (
                <button
                  key={c.phone}
                  onClick={() => void handleSelectConversation(c.phone)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors group",
                    isActive
                      ? "bg-accent-500/10 border-l-2 border-accent-500"
                      : "hover:bg-slate-900/60 border-l-2 border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className={clsx("font-semibold text-sm truncate", unread[c.phone] ? "text-accent-400" : isActive ? "text-white" : "text-slate-200")}>
                      {c.name || c.phone}
                      {isPinned && <span className="ml-1.5 text-[10px] font-bold text-accent-500/70 uppercase">pinned</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {unread[c.phone] && <div className="h-2 w-2 rounded-full bg-accent-500 flex-shrink-0" />}
                    </div>
                  </div>
                  {c.name && (
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{c.phone}</div>
                  )}
                  <div className="mt-1 text-xs text-slate-500 line-clamp-1 font-mono">
                    {c.direction === "OUTBOUND" ? "→ " : "← "}{c.body}
                  </div>
                </button>
              );
            })}
            {!filteredConversations.length && (
              <div className="px-4 py-10 text-center">
                <div className="text-2xl mb-2">💬</div>
                <div className="text-sm text-slate-400">
                  {search ? "No results found" : "No conversations yet"}
                </div>
                <button
                  onClick={() => setShowNewConvo(true)}
                  className="mt-3 text-xs text-accent-400 hover:text-accent-300 underline underline-offset-2"
                >
                  Start a new conversation
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Thread Panel ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Thread Header */}
          <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 px-4 py-3 flex-shrink-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Conversation</div>
                <div className="flex items-center gap-2 mt-0.5">
                  {activePhone ? (
                    <>
                      <span className="font-bold text-white font-mono">{activeConvo?.name || activePhone}</span>
                      {activeConvo?.name && (
                        <span className="text-xs text-slate-500 font-mono">{activePhone}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500">Select a conversation</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* From badge */}
                {defaultFromNumber ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    From: {defaultFromNumber}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-xs text-red-400">
                    ⚠ No from number set
                  </div>
                )}

                <button
                  onClick={async () => {
                    if (!activePhone) return;
                    setThreadLoading(true);
                    try { await openConversation(activePhone); } finally { setThreadLoading(false); }
                  }}
                  disabled={!activePhone}
                  className="px-3 py-1.5 text-xs rounded-lg bg-slate-900/60 ring-1 ring-slate-800 hover:bg-slate-900 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Thread */}
          <div className="flex-1 min-h-0">
            <ConversationThread messages={messages} loading={threadLoading} />
          </div>

          {/* Error */}
          {error && (
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          )}

          {/* Compose Box */}
          <div className="rounded-xl bg-slate-900/20 ring-1 ring-slate-800 p-4 flex-shrink-0">
            {!activePhone ? (
              <div className="text-center py-4 text-sm text-slate-500">
                Select a conversation on the left to start messaging
              </div>
            ) : (
              <div className="flex gap-3 items-end">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder={`Message ${activeConvo?.name || activePhone}… (Enter to send, Shift+Enter for new line)`}
                  disabled={sending}
                  className="flex-1 rounded-xl bg-slate-950/70 ring-1 ring-slate-800 focus:ring-accent-500 px-4 py-3 text-sm font-mono text-white placeholder:text-slate-600 resize-none transition-colors disabled:opacity-50"
                />
                <button
                  disabled={sending || !text.trim() || !defaultFromNumber}
                  onClick={() => void sendReply()}
                  className={clsx(
                    "h-[72px] w-16 rounded-xl font-bold text-sm flex flex-col items-center justify-center gap-1 transition-all",
                    sending
                      ? "bg-slate-800 text-slate-500 ring-1 ring-slate-700"
                      : text.trim() && defaultFromNumber
                      ? "bg-accent-600 hover:bg-accent-500 text-white shadow-lg shadow-accent-500/20 ring-1 ring-accent-500/50"
                      : "bg-slate-800/50 text-slate-600 ring-1 ring-slate-800 cursor-not-allowed"
                  )}
                >
                  {sending ? (
                    <span className="animate-spin text-lg">⟳</span>
                  ) : (
                    <>
                      <span className="text-lg">↑</span>
                      <span className="text-[10px] font-normal">Send</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
